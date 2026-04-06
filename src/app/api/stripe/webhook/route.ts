import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient, getStripeWebhookSecrets } from "@/lib/stripe";
import { writeProcessAuditEvent } from "@/lib/process-audit";
import { sendBillingNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSignature(request: Request) {
  return request.headers.get("stripe-signature") || "";
}

function mapStripeSubscriptionStatus(status: string) {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "suspended";
  }
}

async function applyEntitlementsForPhotographer(photographerId: string, subscriptionStatus: string) {
  const admin = createAdminClient();
  const enabled =
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "active" ||
    subscriptionStatus === "lifetime";

  await admin
    .from("tenant_entitlements")
    .upsert(
      {
        photographer_id: photographerId,
        can_accept_online_payments: enabled,
        can_use_custom_domain: enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "photographer_id" }
    );
}

async function applyPaymentToOrder(params: {
  orderId: string;
  paymentIntentId?: string | null;
  paidIncrementCents: number;
}) {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, total_cents, amount_paid_cents, stripe_payment_intent_id")
    .eq("id", params.orderId)
    .maybeSingle();

  if (!order) {
    return { ok: false, status: 404, message: "Order not found." };
  }

  const totalCents = order.total_cents ?? 0;
  const existingPaid = order.amount_paid_cents ?? 0;
  if (
    params.paymentIntentId &&
    order.stripe_payment_intent_id === params.paymentIntentId &&
    existingPaid > 0
  ) {
    return { ok: true };
  }

  const nextPaid = Math.min(totalCents, existingPaid + Math.max(0, params.paidIncrementCents));
  const nextDue = Math.max(totalCents - nextPaid, 0);
  const paymentStatus = nextDue === 0 ? "paid" : "partial";
  const nextStatus = nextDue === 0 && order.status === "pending" ? "paid" : order.status;

  const { error } = await admin
    .from("orders")
    .update({
      payment_status: paymentStatus,
      amount_paid_cents: nextPaid,
      amount_due_cents: nextDue,
      status: nextStatus,
      paid_at: nextDue === 0 ? new Date().toISOString() : null,
      stripe_payment_intent_id: params.paymentIntentId || null,
    })
    .eq("id", params.orderId);

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }

  return { ok: true };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    // Non-order checkout (es. subscription SaaS): ignore here, lifecycle handled by subscription/invoice events.
    return { ok: true, status: 200, message: "Ignored non-order checkout session." };
  }

  return applyPaymentToOrder({
    orderId,
    paymentIntentId: session.payment_intent ? String(session.payment_intent) : null,
    paidIncrementCents: session.amount_total ?? 0,
  });
}

async function handlePaymentIntentSucceeded(intent: Stripe.PaymentIntent) {
  const orderId = intent.metadata?.order_id;
  const paymentIntentId = intent.id;
  const paidIncrementCents = intent.amount_received ?? intent.amount ?? 0;

  if (orderId) {
    return applyPaymentToOrder({ orderId, paymentIntentId, paidIncrementCents });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (!order?.id) {
    return { ok: true };
  }

  return applyPaymentToOrder({ orderId: order.id, paymentIntentId, paidIncrementCents });
}

async function resolvePhotographerIdForSubscription(
  subscription: Stripe.Subscription
) {
  const fromMetadata = subscription.metadata?.photographer_id;
  if (fromMetadata) {
    return fromMetadata;
  }

  if (!subscription.customer) {
    return null;
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const admin = createAdminClient();
  const { data } = await admin
    .from("tenant_billing_accounts")
    .select("photographer_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return data?.photographer_id || null;
}

async function upsertTenantSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const photographerId = await resolvePhotographerIdForSubscription(subscription);
  if (!photographerId) {
    return { ok: true };
  }

  const stripeCustomerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  const status = mapStripeSubscriptionStatus(subscription.status);
  const periodStart = (subscription as unknown as { current_period_start?: number })
    .current_period_start;
  const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const nextPlanId = subscription.metadata?.subscription_plan_id || null;

  const admin = createAdminClient();
  const { data: previous } = await admin
    .from("tenant_subscriptions")
    .select("status, plan_id, cancel_at_period_end")
    .eq("photographer_id", photographerId)
    .maybeSingle();

  const { error } = await admin.from("tenant_subscriptions").upsert(
    {
      photographer_id: photographerId,
      plan_id: nextPlanId,
      status,
      provider: "stripe",
      stripe_subscription_id: subscription.id,
      stripe_customer_id: stripeCustomerId || null,
      current_period_start: periodStart
        ? new Date(periodStart * 1000).toISOString()
        : null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      collection_state:
        status === "past_due"
          ? "grace"
          : status === "canceled" || status === "suspended"
            ? "delinquent"
            : "current",
      is_lifetime: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photographer_id" }
  );

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }

  await applyEntitlementsForPhotographer(photographerId, status);

  const correlationId =
    typeof subscription.metadata?.correlation_id === "string" &&
    subscription.metadata.correlation_id.trim()
      ? subscription.metadata.correlation_id.trim()
      : subscription.id;

  if (status === "active" && previous?.status !== "active") {
    await sendBillingNotification({
      type: "subscription_activated",
      photographerId,
      correlationId,
      idempotencySuffix: subscription.id,
      context: {
        planName: subscription.metadata?.subscription_plan_code || undefined,
        periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
    });
  }

  if (previous?.plan_id && nextPlanId && previous.plan_id !== nextPlanId) {
    await sendBillingNotification({
      type: "plan_changed",
      photographerId,
      correlationId,
      idempotencySuffix: subscription.id,
      context: {
        planName: subscription.metadata?.subscription_plan_code || undefined,
      },
    });
  }

  if (subscription.cancel_at_period_end && !previous?.cancel_at_period_end) {
    await sendBillingNotification({
      type: "cancel_at_period_end_confirmed",
      photographerId,
      correlationId,
      idempotencySuffix: subscription.id,
      context: {
        periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
    });
  }

  return { ok: true };
}

async function handleInvoiceEvent(invoice: Stripe.Invoice, paid: boolean) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) {
    return { ok: true };
  }

  const admin = createAdminClient();
  const { data: billing } = await admin
    .from("tenant_billing_accounts")
    .select("photographer_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const photographerId = billing?.photographer_id;
  if (!photographerId) {
    return { ok: true };
  }

  const nextStatus = paid ? "active" : "past_due";
  const now = new Date();
  const graceEndsAt = paid
    ? null
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({
      status: nextStatus,
      latest_invoice_id: invoice.id || null,
      collection_state: paid ? "recovered" : "grace",
      last_payment_failed_at: paid ? null : now.toISOString(),
      grace_period_ends_at: graceEndsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("photographer_id", photographerId);

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }

  await applyEntitlementsForPhotographer(photographerId, nextStatus);

  const correlationId =
    typeof invoice.metadata?.correlation_id === "string" && invoice.metadata.correlation_id.trim()
      ? invoice.metadata.correlation_id.trim()
      : invoice.id;

  if (paid) {
    await sendBillingNotification({
      type: "payment_recovered_or_reactivated",
      photographerId,
      correlationId,
      idempotencySuffix: invoice.id,
      context: {
        amountCents: invoice.amount_paid ?? invoice.amount_due ?? null,
        currency: invoice.currency || null,
      },
    });
  } else {
    await sendBillingNotification({
      type: "renewal_payment_failed",
      photographerId,
      correlationId,
      idempotencySuffix: invoice.id,
      context: {
        amountCents: invoice.amount_due ?? invoice.total ?? null,
        currency: invoice.currency || null,
      },
    });
  }

  return { ok: true };
}

function parseEventWithKnownSecrets(
  stripe: Stripe,
  payload: string,
  signature: string
) {
  const { orderWebhookSecret, platformWebhookSecret } = getStripeWebhookSecrets();
  const candidates = [orderWebhookSecret, platformWebhookSecret].filter(Boolean);

  for (const secret of candidates) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      // try next
    }
  }

  throw new Error("Webhook signature verification failed.");
}

function isDuplicateKeyError(error: { code?: string | null; message?: string | null }) {
  const message = error.message || "";
  return error.code === "23505" || message.includes("duplicate key");
}

async function shouldProcessEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event
) {
  const { error } = await admin.from("billing_events").insert({
    event_id: event.id,
    source:
      event.type.startsWith("checkout.") || event.type.startsWith("payment_intent.")
        ? "stripe_order"
        : "stripe_platform",
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    processed_at: null,
  });

  if (!error) {
    return true;
  }

  if (!isDuplicateKeyError(error)) {
    throw new Error(error.message || "Errore registrazione evento webhook.");
  }

  const { data: existing, error: existingError } = await admin
    .from("billing_events")
    .select("processed_at")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Errore lettura stato evento webhook.");
  }

  return !existing?.processed_at;
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe non configurato." }, { status: 500 });
  }

  const signature = getSignature(request);
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const payload = await request.text();
    event = parseEventWithKnownSecrets(stripe, payload, signature);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook payload." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  try {
    const shouldProcess = await shouldProcessEvent(admin, event);
    if (!shouldProcess) {
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore gestione idempotenza webhook.",
      },
      { status: 500 }
    );
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const result = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  if (event.type === "payment_intent.succeeded") {
    const result = await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const result = await upsertTenantSubscriptionFromStripe(
      event.data.object as Stripe.Subscription
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  if (event.type === "invoice.paid") {
    const result = await handleInvoiceEvent(event.data.object as Stripe.Invoice, true);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  if (event.type === "invoice.payment_failed") {
    const result = await handleInvoiceEvent(event.data.object as Stripe.Invoice, false);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
  }

  await admin
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  const eventObject = event.data.object as unknown as Record<string, unknown>;
  const metadata =
    eventObject && typeof eventObject === "object" && "metadata" in eventObject
      ? ((eventObject as { metadata?: Record<string, unknown> }).metadata || {})
      : {};
  const correlationId =
    typeof metadata.correlation_id === "string" && metadata.correlation_id.trim()
      ? metadata.correlation_id.trim()
      : event.id;
  const tenantId =
    typeof metadata.photographer_id === "string" ? metadata.photographer_id : null;

  await writeProcessAuditEvent({
    eventId: `stripe:${event.id}`,
    actorType: "stripe_webhook",
    actorId: event.id,
    tenantId,
    processArea: "webhook",
    action: event.type,
    status: "succeeded",
    correlationId,
    idempotencyKey: event.id,
    source: "api.stripe.webhook",
    metadata: {
      livemode: event.livemode,
      apiVersion: event.api_version || null,
    },
  });

  return NextResponse.json({ received: true });
}

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient, getStripeWebhookSecrets } from "@/lib/stripe";
import { logBillingEvent } from "@/lib/tenant-billing";

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
    return { ok: false, status: 400, message: "Missing order_id metadata." };
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

  const admin = createAdminClient();
  const { error } = await admin.from("tenant_subscriptions").upsert(
    {
      photographer_id: photographerId,
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
      is_lifetime: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "photographer_id" }
  );

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }

  await applyEntitlementsForPhotographer(photographerId, status);
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
  const { error } = await admin
    .from("tenant_subscriptions")
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("photographer_id", photographerId);

  if (error) {
    return { ok: false, status: 500, message: error.message };
  }

  await applyEntitlementsForPhotographer(photographerId, nextStatus);
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

  const logged = await logBillingEvent({
    eventId: event.id,
    source:
      event.type.startsWith("checkout.") || event.type.startsWith("payment_intent.")
        ? "stripe_order"
        : "stripe_platform",
    eventType: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
    processedAt: null,
  });

  if (logged.error) {
    const message = logged.error.message || "";
    if (message.includes("duplicate key")) {
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: message }, { status: 500 });
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

  const admin = createAdminClient();
  await admin
    .from("billing_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("event_id", event.id);

  return NextResponse.json({ received: true });
}

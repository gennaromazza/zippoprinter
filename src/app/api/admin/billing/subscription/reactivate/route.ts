import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { getLatestTenantSubscription, reactivateStripeSubscription } from "@/lib/subscription-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCorrelationIdFromHeaders, writeProcessAuditEvent } from "@/lib/process-audit";
import { sendBillingNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const correlationId = getCorrelationIdFromHeaders(request.headers);
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida.", correlationId }, { status: 403 });
  }

  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user || !photographer) {
    return NextResponse.json({ error: "Non autorizzato.", correlationId }, { status: 401 });
  }

  const subscription = await getLatestTenantSubscription(photographer.id);
  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ error: "Subscription Stripe non trovata.", correlationId }, { status: 422 });
  }

  await writeProcessAuditEvent({
    actorType: "tenant",
    actorId: user.id,
    tenantId: photographer.id,
    processArea: "subscription",
    action: "subscription_reactivation_requested",
    status: "started",
    correlationId,
    source: "api.admin.billing.subscription.reactivate",
    metadata: {
      stripeSubscriptionId: subscription.stripe_subscription_id,
    },
  });

  try {
    const updated = await reactivateStripeSubscription(subscription.stripe_subscription_id);
    const periodEnd = (updated as unknown as { current_period_end?: number }).current_period_end;

    const admin = createAdminClient();
    await admin
      .from("tenant_subscriptions")
      .update({
        cancel_at_period_end: false,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("photographer_id", photographer.id);

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_reactivation_requested",
      status: "succeeded",
      correlationId,
      source: "api.admin.billing.subscription.reactivate",
      afterSnapshot: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
      metadata: {
        stripeSubscriptionId: subscription.stripe_subscription_id,
      },
    });

    await sendBillingNotification({
      type: "payment_recovered_or_reactivated",
      photographerId: photographer.id,
      correlationId,
      idempotencySuffix: `reactivate:${subscription.stripe_subscription_id}:${periodEnd || "none"}`,
      context: {
        periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
    });

    return NextResponse.json({
      correlationId,
      updated: true,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_reactivation_requested",
      status: "failed",
      correlationId,
      source: "api.admin.billing.subscription.reactivate",
      errorMessage: error instanceof Error ? error.message : "Reactivate subscription failed",
      metadata: {
        stripeSubscriptionId: subscription.stripe_subscription_id,
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Riattivazione subscription non riuscita.",
        correlationId,
      },
      { status: 500 }
    );
  }
}

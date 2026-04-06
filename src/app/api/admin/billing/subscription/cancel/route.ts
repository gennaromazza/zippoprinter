import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { cancelStripeSubscriptionAtPeriodEnd, getLatestTenantSubscription } from "@/lib/subscription-billing";
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
    action: "subscription_cancel_requested",
    status: "started",
    correlationId,
    source: "api.admin.billing.subscription.cancel",
    metadata: {
      stripeSubscriptionId: subscription.stripe_subscription_id,
    },
  });

  try {
    const updated = await cancelStripeSubscriptionAtPeriodEnd(subscription.stripe_subscription_id);
    const periodEnd = (updated as unknown as { current_period_end?: number }).current_period_end;

    const admin = createAdminClient();
    await admin
      .from("tenant_subscriptions")
      .update({
        cancel_at_period_end: true,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("photographer_id", photographer.id);

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_cancel_requested",
      status: "succeeded",
      correlationId,
      source: "api.admin.billing.subscription.cancel",
      afterSnapshot: {
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
      metadata: {
        stripeSubscriptionId: subscription.stripe_subscription_id,
      },
    });

    await sendBillingNotification({
      type: "cancel_at_period_end_confirmed",
      photographerId: photographer.id,
      correlationId,
      idempotencySuffix: `cancel:${subscription.stripe_subscription_id}:${periodEnd || "none"}`,
      context: {
        periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
    });

    return NextResponse.json({
      correlationId,
      updated: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_cancel_requested",
      status: "failed",
      correlationId,
      source: "api.admin.billing.subscription.cancel",
      errorMessage: error instanceof Error ? error.message : "Cancel subscription failed",
      metadata: {
        stripeSubscriptionId: subscription.stripe_subscription_id,
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Annullamento subscription non riuscito.",
        correlationId,
      },
      { status: 500 }
    );
  }
}

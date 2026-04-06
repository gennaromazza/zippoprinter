import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import {
  changeStripeSubscriptionPlan,
  getLatestTenantSubscription,
  getPlanById,
} from "@/lib/subscription-billing";
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

  const payload = (await request.json().catch(() => null)) as { planId?: string } | null;
  const planId = (payload?.planId || "").trim();
  if (!planId) {
    return NextResponse.json({ error: "planId obbligatorio.", correlationId }, { status: 422 });
  }

  const [plan, subscription] = await Promise.all([
    getPlanById(planId),
    getLatestTenantSubscription(photographer.id),
  ]);

  if (!plan) {
    return NextResponse.json({ error: "Piano non valido o non attivo.", correlationId }, { status: 404 });
  }

  if (!subscription?.stripe_subscription_id) {
    return NextResponse.json({ error: "Subscription Stripe non trovata.", correlationId }, { status: 422 });
  }

  await writeProcessAuditEvent({
    actorType: "tenant",
    actorId: user.id,
    tenantId: photographer.id,
    processArea: "subscription",
    action: "subscription_plan_changed",
    status: "started",
    correlationId,
    source: "api.admin.billing.subscription.change-plan",
    metadata: {
      nextPlanId: plan.id,
      nextPlanCode: plan.code,
      stripeSubscriptionId: subscription.stripe_subscription_id,
    },
  });

  try {
    const updated = await changeStripeSubscriptionPlan({
      stripeSubscriptionId: subscription.stripe_subscription_id,
      plan,
    });

    const admin = createAdminClient();
    await admin
      .from("tenant_subscriptions")
      .update({
        plan_id: plan.id,
        updated_at: new Date().toISOString(),
      })
      .eq("photographer_id", photographer.id);

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_plan_changed",
      status: "succeeded",
      correlationId,
      source: "api.admin.billing.subscription.change-plan",
      afterSnapshot: {
        stripeSubscriptionId: updated.id,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
      },
      metadata: {
        nextPlanId: plan.id,
        nextPlanCode: plan.code,
      },
    });

    await sendBillingNotification({
      type: "plan_changed",
      photographerId: photographer.id,
      correlationId,
      idempotencySuffix: `change_plan:${updated.id}:${plan.id}`,
      context: {
        planName: plan.name,
      },
    });

    return NextResponse.json({
      correlationId,
      updated: true,
      planId: plan.id,
      planCode: plan.code,
    });
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_plan_changed",
      status: "failed",
      correlationId,
      source: "api.admin.billing.subscription.change-plan",
      errorMessage: error instanceof Error ? error.message : "Change plan failed",
      metadata: {
        nextPlanId: plan.id,
      },
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Cambio piano non riuscito.",
        correlationId,
      },
      { status: 500 }
    );
  }
}

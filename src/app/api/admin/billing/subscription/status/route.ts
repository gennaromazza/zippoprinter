import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantBillingContext, isSubscriptionActive } from "@/lib/tenant-billing";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { photographer } = await getAuthenticatedPhotographerContext();
  if (!photographer) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const context = await getTenantBillingContext(photographer.id);
  const admin = createAdminClient();
  const { data: plansData } = await admin
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });

  const subscription = context.subscription;
  const nowMs = Date.now();
  const trialEndMs = subscription?.trial_end ? new Date(subscription.trial_end).getTime() : 0;
  const graceEndMs = subscription?.grace_period_ends_at
    ? new Date(subscription.grace_period_ends_at).getTime()
    : 0;
  const trialExpired = Boolean(
    subscription?.status === "trialing" && trialEndMs > 0 && trialEndMs < nowMs
  );
  const graceRemainingDays = graceEndMs > nowMs
    ? Math.ceil((graceEndMs - nowMs) / (24 * 60 * 60 * 1000))
    : 0;

  const canManageActiveStripe =
    Boolean(subscription?.stripe_subscription_id) &&
    (subscription?.status === "active" || subscription?.status === "past_due");
  const canStartCheckout = !isSubscriptionActive(subscription?.status) || trialExpired;
  const canChangePlan = canManageActiveStripe;
  const canCancel = canManageActiveStripe && !subscription?.cancel_at_period_end;
  const canReactivate = canManageActiveStripe && Boolean(subscription?.cancel_at_period_end);
  const correlationId = getCorrelationIdFromHeaders(request.headers);

  return NextResponse.json({
    correlationId,
    subscription,
    entitlements: context.entitlements,
    billingAccount: context.billingAccount,
    plans: plansData ?? [],
    subscriptionActive: isSubscriptionActive(subscription?.status),
    trialExpired,
    graceRemainingDays,
    collectionState: subscription?.collection_state || "current",
    allowedActions: {
      canStartCheckout,
      canChangePlan,
      canCancel,
      canReactivate,
    },
  });
}

import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { getTenantBillingContext, writeAuditLog } from "@/lib/tenant-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  const stripe = getStripeClient();
  const context = await getTenantBillingContext(photographer.id);
  const connectAccountId = context.billingAccount?.stripe_connect_account_id || null;

  if (stripe && connectAccountId) {
    const account = await stripe.accounts.retrieve(connectAccountId);
    const hasDisabledReason = Boolean(account.requirements?.disabled_reason);
    const connectStatus = hasDisabledReason
      ? "disabled"
      : account.charges_enabled && account.payouts_enabled
        ? "connected"
        : account.details_submitted
          ? "restricted"
          : "pending";

    const admin = createAdminClient();
    await admin
      .from("tenant_billing_accounts")
      .update({
        connect_status: connectStatus,
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        onboarding_completed_at: account.charges_enabled ? new Date().toISOString() : null,
      })
      .eq("photographer_id", photographer.id);

    await writeAuditLog({
      photographerId: photographer.id,
      actorUserId: user.id,
      action: "connect_status_synced",
      resourceType: "tenant_billing_accounts",
      resourceId: connectAccountId,
      details: {
        connectStatus,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
      },
    });
  }

  const refreshed = await getTenantBillingContext(photographer.id);
  return NextResponse.json({
    billingAccount: refreshed.billingAccount,
    subscription: refreshed.subscription,
    entitlements: refreshed.entitlements,
    connectReady:
      refreshed.billingAccount?.connect_status === "connected" &&
      Boolean(refreshed.entitlements?.can_accept_online_payments),
  });
}

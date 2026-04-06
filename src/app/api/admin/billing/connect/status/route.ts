import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import {
  getStripeConnectStatusCard,
  syncStripeConnectAccountForPhotographer,
} from "@/lib/stripe-connect";
import type { StripeConnectStatusCard } from "@/lib/types";
import { getTenantBillingContext, writeAuditLog } from "@/lib/tenant-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
    let statusCard: StripeConnectStatusCard = getStripeConnectStatusCard({
      stripeConnectAccountId: connectAccountId,
      detailsSubmitted: context.billingAccount?.details_submitted,
      chargesEnabled: context.billingAccount?.charges_enabled,
      payoutsEnabled: context.billingAccount?.payouts_enabled,
    });

    if (stripe && connectAccountId) {
      try {
        const account = await stripe.accounts.retrieve(connectAccountId);
        const syncResult = await syncStripeConnectAccountForPhotographer({
          photographerId: photographer.id,
          account,
          actorUserId: user.id,
        });

        statusCard = syncResult.statusCard;

        await writeAuditLog({
          photographerId: photographer.id,
          actorUserId: user.id,
          action: "connect_status_checked",
          resourceType: "tenant_billing_accounts",
          resourceId: connectAccountId,
          details: {
            tone: syncResult.statusCard.tone,
            requirementsCurrentlyDue: syncResult.requirementsCurrentlyDue,
          },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "resource_missing"
        ) {
          const admin = createAdminClient();
          await admin
            .from("tenant_billing_accounts")
            .update({
              stripe_connect_account_id: null,
              connect_status: "not_connected",
              charges_enabled: false,
              payouts_enabled: false,
              details_submitted: false,
              onboarding_completed_at: null,
            })
            .eq("photographer_id", photographer.id);

          statusCard = getStripeConnectStatusCard({});
        } else {
          throw error;
        }
      }
    }

    const refreshed = await getTenantBillingContext(photographer.id);
    return NextResponse.json({
      billingAccount: refreshed.billingAccount,
      subscription: refreshed.subscription,
      entitlements: refreshed.entitlements,
      statusCard,
      connectReady:
        refreshed.billingAccount?.connect_status === "connected" &&
        Boolean(refreshed.entitlements?.can_accept_online_payments),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossibile leggere lo stato Stripe.",
      },
      { status: 500 }
    );
  }
}

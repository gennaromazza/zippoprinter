import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectedStripeClientForTenant } from "@/lib/stripe";
import { canUseOnlinePayments, getTenantBillingContext } from "@/lib/tenant-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const photographerId = (searchParams.get("photographerId") || "").trim();

  if (!photographerId) {
    return NextResponse.json({ error: "photographerId mancante." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: photographer, error } = await admin
    .from("photographers")
    .select("id, payment_mode, deposit_type, deposit_value, updated_at")
    .eq("id", photographerId)
    .maybeSingle();

  if (error || !photographer) {
    return NextResponse.json({ error: "Studio non trovato." }, { status: 404 });
  }

  const billingContext = await getTenantBillingContext(photographerId);
  const connectClient = getConnectedStripeClientForTenant(
    billingContext.billingAccount || {
      stripe_connect_account_id: null,
      connect_status: "not_connected",
    }
  );

  const connectReady =
    Boolean(connectClient) &&
    billingContext.billingAccount?.connect_status === "connected" &&
    canUseOnlinePayments(billingContext);

  const legacyFallbackEnabled =
    process.env.ENABLE_LEGACY_STRIPE_FALLBACK === "true" &&
    (billingContext.billingAccount?.legacy_checkout_enabled ?? true);

  return NextResponse.json({
    paymentMode: photographer.payment_mode || "pay_in_store",
    depositType: photographer.deposit_type || null,
    depositValue: photographer.deposit_value ?? null,
    updatedAt: photographer.updated_at || null,
    stripeEnabled: connectReady || legacyFallbackEnabled,
  });
}

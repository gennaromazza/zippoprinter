import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantBillingContext, isSubscriptionActive } from "@/lib/tenant-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  return NextResponse.json({
    subscription: context.subscription,
    entitlements: context.entitlements,
    billingAccount: context.billingAccount,
    plans: plansData ?? [],
    subscriptionActive: isSubscriptionActive(context.subscription?.status),
  });
}

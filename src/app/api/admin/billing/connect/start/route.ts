import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/tenant-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOriginFromRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    return `${forwardedProto || "http"}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!(await isSameOriginRequest())) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 403 });
  }

  const { user, photographer } = await getAuthenticatedPhotographerContext();
  if (!user) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }
  if (!photographer) {
    return NextResponse.json({ error: "Profilo studio non trovato." }, { status: 404 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe piattaforma non configurato." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: billingData } = await admin
    .from("tenant_billing_accounts")
    .select("*")
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  let connectAccountId = billingData?.stripe_connect_account_id || null;
  if (!connectAccountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: photographer.email,
      business_profile: {
        name: photographer.name || undefined,
      },
      metadata: {
        photographer_id: photographer.id,
      },
    });
    connectAccountId = account.id;
  }

  const origin = getOriginFromRequest(request);
  const accountLink = await stripe.accountLinks.create({
    account: connectAccountId,
    refresh_url: `${origin}/admin/settings?connect=refresh`,
    return_url: `${origin}/admin/settings?connect=return`,
    type: "account_onboarding",
  });

  await admin
    .from("tenant_billing_accounts")
    .upsert(
      {
        photographer_id: photographer.id,
        stripe_connect_account_id: connectAccountId,
        connect_status: "pending",
      },
      { onConflict: "photographer_id" }
    );

  await writeAuditLog({
    photographerId: photographer.id,
    actorUserId: user.id,
    action: "connect_onboarding_started",
    resourceType: "tenant_billing_accounts",
    resourceId: connectAccountId,
    details: { provider: "stripe_connect_standard" },
  });

  return NextResponse.json({
    url: accountLink.url,
    connectAccountId,
    connectReady: false,
  });
}

import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/tenant-billing";
import { getCorrelationIdFromHeaders, writeProcessAuditEvent } from "@/lib/process-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getStripeConnectSetupUrl() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_test_")) {
    return "https://dashboard.stripe.com/test/connect";
  }
  return "https://dashboard.stripe.com/connect";
}

function getOriginFromRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (forwardedHost) {
    return `${forwardedProto || "http"}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const correlationId = getCorrelationIdFromHeaders(request.headers);
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

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "connect_onboarding_started",
      status: "started",
      correlationId,
      source: "api.admin.billing.connect.start",
    });

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

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "connect_onboarding_started",
      status: "succeeded",
      correlationId,
      source: "api.admin.billing.connect.start",
      afterSnapshot: {
        connectAccountId,
      },
    });

    return NextResponse.json({
      url: accountLink.url,
      setupUrl: getStripeConnectSetupUrl(),
      connectAccountId,
      connectReady: false,
      correlationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossibile avviare onboarding Stripe.",
        setupUrl: getStripeConnectSetupUrl(),
      },
      { status: 500 }
    );
  }
}

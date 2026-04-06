import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { syncStripeConnectAccountForPhotographer } from "@/lib/stripe-connect";
import { writeAuditLog } from "@/lib/tenant-billing";
import { getCorrelationIdFromHeaders, writeProcessAuditEvent } from "@/lib/process-audit";

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

function isPlatformSetupRequiredError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();

  return (
    message.includes("connect platform") ||
    message.includes("platform profile") ||
    message.includes("platform account")
  );
}

function formatConnectStartError(error: unknown) {
  if (isPlatformSetupRequiredError(error)) {
    return "La piattaforma Stripe Connect non e ancora completata dal superadmin. Appena il setup piattaforma e concluso, i fotografi vedranno solo l'onboarding Stripe Express.";
  }

  return error instanceof Error ? error.message : "Impossibile avviare onboarding Stripe.";
}

async function ensureExpressAccount(input: {
  stripe: Stripe;
  connectAccountId: string | null;
  photographerId: string;
  email: string;
  businessName: string | null;
}) {
  if (input.connectAccountId) {
    try {
      const existingAccount = await input.stripe.accounts.retrieve(input.connectAccountId);
      if (existingAccount.type === "express") {
        return existingAccount;
      }
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "resource_missing"
      ) {
        throw error;
      }
    }
  }

  return input.stripe.accounts.create({
    type: "express",
    email: input.email,
    business_profile: {
      name: input.businessName || undefined,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      photographer_id: input.photographerId,
    },
  });
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

    const connectAccount = await ensureExpressAccount({
      stripe,
      connectAccountId: billingData?.stripe_connect_account_id || null,
      photographerId: photographer.id,
      email: photographer.email,
      businessName: photographer.name,
    });
    const connectAccountId = connectAccount.id;

    const origin = getOriginFromRequest(request);
    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: `${origin}/admin/settings?connect=refresh`,
      return_url: `${origin}/admin/settings?connect=return`,
      type: "account_onboarding",
      collection_options: {
        fields: "eventually_due",
      },
    });

    const syncResult = await syncStripeConnectAccountForPhotographer({
      photographerId: photographer.id,
      account: connectAccount,
      actorUserId: user.id,
    });

    await writeAuditLog({
      photographerId: photographer.id,
      actorUserId: user.id,
      action: "connect_onboarding_started",
      resourceType: "tenant_billing_accounts",
      resourceId: connectAccountId,
      details: { provider: "stripe_connect_express" },
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
      connectAccountId,
      connectReady: syncResult.connectStatus === "connected",
      correlationId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: formatConnectStartError(error),
        platformSetupRequired: isPlatformSetupRequiredError(error),
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/tenant-billing";
import { getCorrelationIdFromHeaders, writeProcessAuditEvent } from "@/lib/process-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
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

  const admin = createAdminClient();
  const { data: existingBilling } = await admin
    .from("tenant_billing_accounts")
    .select("stripe_connect_account_id, connect_status, charges_enabled, payouts_enabled")
    .eq("photographer_id", photographer.id)
    .maybeSingle();

  const previousConnectAccountId = existingBilling?.stripe_connect_account_id || null;

  await writeProcessAuditEvent({
    actorType: "tenant",
    actorId: user.id,
    tenantId: photographer.id,
    processArea: "subscription",
    action: "connect_disconnected",
    status: "started",
    correlationId,
    source: "api.admin.billing.connect.disconnect",
    beforeSnapshot: {
      connectAccountId: previousConnectAccountId,
      connectStatus: existingBilling?.connect_status || null,
      chargesEnabled: Boolean(existingBilling?.charges_enabled),
      payoutsEnabled: Boolean(existingBilling?.payouts_enabled),
    },
  });

  const { error } = await admin
    .from("tenant_billing_accounts")
    .upsert(
      {
        photographer_id: photographer.id,
        stripe_connect_account_id: null,
        connect_status: "not_connected",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        onboarding_completed_at: null,
      },
      { onConflict: "photographer_id" }
    );

  if (error) {
    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "connect_disconnected",
      status: "failed",
      correlationId,
      source: "api.admin.billing.connect.disconnect",
      errorCode: error.code || null,
      errorMessage: error.message || "Impossibile dissociare account Stripe.",
    });

    return NextResponse.json(
      { error: "Impossibile dissociare account Stripe. Riprova tra qualche secondo." },
      { status: 500 }
    );
  }

  await writeAuditLog({
    photographerId: photographer.id,
    actorUserId: user.id,
    action: "connect_disconnected",
    resourceType: "tenant_billing_accounts",
    resourceId: previousConnectAccountId,
    details: {
      previousConnectAccountId,
      source: "admin_settings",
    },
  });

  await writeProcessAuditEvent({
    actorType: "tenant",
    actorId: user.id,
    tenantId: photographer.id,
    processArea: "subscription",
    action: "connect_disconnected",
    status: "succeeded",
    correlationId,
    source: "api.admin.billing.connect.disconnect",
    afterSnapshot: {
      connectAccountId: null,
      connectStatus: "not_connected",
      chargesEnabled: false,
      payoutsEnabled: false,
    },
  });

  return NextResponse.json({
    disconnected: true,
    previousConnectAccountId,
    correlationId,
  });
}
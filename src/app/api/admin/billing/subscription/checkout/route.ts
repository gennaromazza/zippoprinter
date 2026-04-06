import { NextResponse } from "next/server";
import { getAuthenticatedPhotographerContext } from "@/lib/admin-auth";
import { isSameOriginRequest } from "@/lib/request-security";
import { createCheckoutSessionForPlan, getPlanById } from "@/lib/subscription-billing";
import { getCorrelationIdFromHeaders, writeProcessAuditEvent } from "@/lib/process-audit";
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

  const plan = await getPlanById(planId);
  if (!plan) {
    return NextResponse.json({ error: "Piano non valido o non attivo.", correlationId }, { status: 404 });
  }

  await writeProcessAuditEvent({
    actorType: "tenant",
    actorId: user.id,
    tenantId: photographer.id,
    processArea: "subscription",
    action: "subscription_checkout_started",
    status: "started",
    correlationId,
    source: "api.admin.billing.subscription.checkout",
    metadata: {
      planId: plan.id,
      planCode: plan.code,
      billingMode: plan.billing_mode,
    },
  });

  try {
    const session = await createCheckoutSessionForPlan({
      photographer,
      plan,
      correlationId,
      origin: getOriginFromRequest(request),
    });

    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_checkout_started",
      status: "succeeded",
      correlationId,
      source: "api.admin.billing.subscription.checkout",
      afterSnapshot: {
        sessionId: session.sessionId,
        mode: session.mode,
      },
      metadata: {
        planId: plan.id,
        planCode: plan.code,
      },
    });

    await writeAuditLog({
      photographerId: photographer.id,
      actorUserId: user.id,
      action: "subscription_checkout_created",
      resourceType: "tenant_subscriptions",
      resourceId: plan.id,
      details: {
        planCode: plan.code,
        sessionId: session.sessionId,
        correlationId,
      },
    });

    return NextResponse.json({
      correlationId,
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      mode: session.mode,
    });
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "tenant",
      actorId: user.id,
      tenantId: photographer.id,
      processArea: "subscription",
      action: "subscription_checkout_started",
      status: "failed",
      correlationId,
      source: "api.admin.billing.subscription.checkout",
      errorMessage: error instanceof Error ? error.message : "Checkout creation failed",
      metadata: {
        planId: plan.id,
      },
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossibile avviare checkout abbonamento.",
        correlationId,
      },
      { status: 500 }
    );
  }
}

import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { resetTenantTrial } from "@/lib/owner-billing";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { notifyOwnerAction } from "@/lib/owner-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const reason = "reason" in payload
    ? String((payload as { reason?: unknown }).reason || "").trim()
    : "";
  const days = "days" in payload
    ? Number((payload as { days?: unknown }).days)
    : 14;
  const ticketId = "ticketId" in payload
    ? String((payload as { ticketId?: unknown }).ticketId || "").trim()
    : "";

  if (reason.length < 5 || reason.length > 300) {
    return null;
  }

  if (!Number.isFinite(days) || days < 1 || days > 30) {
    return null;
  }

  return { reason, days, ticketId: ticketId || undefined };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  const correlationId = getCorrelationIdFromHeaders(request.headers);

  if (!(await isSameOriginRequest())) {
    return platformApiError(requestId, 403, "Richiesta non valida.", undefined, correlationId);
  }

  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error, undefined, correlationId);
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    return platformApiError(requestId, 403, "Permessi insufficienti.", undefined, correlationId);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "Invalid tenant id.", undefined, correlationId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return platformApiError(requestId, 422, "Body JSON non valido.", undefined, correlationId);
  }

  const parsed = parsePayload(payload);
  if (!parsed) {
    return platformApiError(
      requestId,
      422,
      "Payload non valido. Motivazione (5-300 caratteri) e giorni (1-30) obbligatori.",
      undefined,
      correlationId
    );
  }

  try {
    const result = await resetTenantTrial({
      photographerId: id,
      actorUserId: auth.context.userId,
      reason: parsed.reason,
      ticketId: parsed.ticketId,
      correlationId,
      days: parsed.days,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/trial-reset",
      outcome: result.ok ? "ok" : "error",
      requestId,
      details: { tenantId: id, ok: result.ok, days: parsed.days },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message, undefined, correlationId);
    }

    void notifyOwnerAction({
      actionType: "trial_reset",
      actorEmail: auth.context.admin.email,
      actorUserId: auth.context.userId,
      correlationId,
      tenantId: id,
      details: { days: parsed.days, reason: parsed.reason },
    });

    return platformApiOk(
      requestId,
      { reset: true, trialEnd: result.trialEnd, message: `Trial resettato a ${parsed.days} giorni.` },
      correlationId
    );
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/trial-reset",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Reset trial non riuscito.", undefined, correlationId);
  }
}

import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { isStudioAccessStatus, updateStudioAccessStatus } from "@/lib/platform-support";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { getStepUpErrorMessage, requireOwnerStepUp } from "@/lib/owner-step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const nextStatus = "nextStatus" in payload
    ? String((payload as { nextStatus?: unknown }).nextStatus || "").trim()
    : "";
  const reason = "reason" in payload
    ? String((payload as { reason?: unknown }).reason || "").trim()
    : "";
  const ticketId = "ticketId" in payload
    ? String((payload as { ticketId?: unknown }).ticketId || "").trim()
    : "";

  if (!isStudioAccessStatus(nextStatus)) {
    return null;
  }

  if (reason.length < 5 || reason.length > 300) {
    return null;
  }

  return { nextStatus, reason, ticketId: ticketId || null };
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
    return platformApiError(requestId, 422, "Payload non valido. Inserisci stato e motivazione (5-300 caratteri).", undefined, correlationId);
  }

  if (parsed.nextStatus === "suspended" && !hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    return platformApiError(requestId, 403, "Solo owner_admin puo sospendere uno studio.", undefined, correlationId);
  }
  if (parsed.nextStatus === "suspended") {
    const stepUp = requireOwnerStepUp(request);
    if (!stepUp.ok) {
      return platformApiError(requestId, 403, getStepUpErrorMessage(stepUp.reason), undefined, correlationId);
    }
  }

  try {
    const result = await updateStudioAccessStatus({
      photographerId: id,
      actorUserId: auth.context.userId,
      nextStatus: parsed.nextStatus,
      reason: parsed.reason,
      correlationId,
      ticketId: parsed.ticketId || undefined,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/access-status",
      outcome: result.ok ? "ok" : "error",
      requestId,
      details: {
        tenantId: id,
        ok: result.ok,
        nextStatus: parsed.nextStatus,
        correlationId,
      },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message, undefined, correlationId);
    }

    return platformApiOk(requestId, {
      updated: true,
      status: result.currentStatus,
      message: result.message,
    }, correlationId);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/access-status",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        correlationId,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Aggiornamento stato accesso non riuscito.", undefined, correlationId);
  }
}

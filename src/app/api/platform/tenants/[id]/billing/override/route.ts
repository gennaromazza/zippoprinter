import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { updateStudioAccessStatus, isStudioAccessStatus } from "@/lib/platform-support";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { isSameOriginRequest } from "@/lib/request-security";
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId();
  const correlationId = getCorrelationIdFromHeaders(request.headers);

  if (!(await isSameOriginRequest())) {
    return platformApiError(requestId, 403, "Richiesta non valida.", undefined, correlationId);
  }

  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error, undefined, correlationId);
  }
  if (!hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    return platformApiError(requestId, 403, "Permessi insufficienti.", undefined, correlationId);
  }
  const stepUp = requireOwnerStepUp(request);
  if (!stepUp.ok) {
    return platformApiError(requestId, 403, getStepUpErrorMessage(stepUp.reason), undefined, correlationId);
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
    return platformApiError(requestId, 422, "Payload non valido.", undefined, correlationId);
  }

  const result = await updateStudioAccessStatus({
    photographerId: id,
    actorUserId: auth.context.userId,
    nextStatus: parsed.nextStatus,
    reason: parsed.reason,
    ticketId: parsed.ticketId || undefined,
    correlationId,
  });

  if (!result.ok) {
    return platformApiError(requestId, result.status, result.message, undefined, correlationId);
  }

  return platformApiOk(
    requestId,
    {
      updated: true,
      status: result.currentStatus,
    },
    correlationId
  );
}

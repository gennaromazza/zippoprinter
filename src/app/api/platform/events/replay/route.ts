import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { replayBillingWebhookEvent } from "@/lib/owner-billing";
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

  const eventId = "eventId" in payload
    ? String((payload as { eventId?: unknown }).eventId || "").trim()
    : "";

  if (!eventId || eventId.length < 5) {
    return null;
  }

  return { eventId };
}

export async function POST(request: Request) {
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return platformApiError(requestId, 422, "Body JSON non valido.", undefined, correlationId);
  }

  const parsed = parsePayload(payload);
  if (!parsed) {
    return platformApiError(requestId, 422, "eventId obbligatorio.", undefined, correlationId);
  }

  try {
    const result = await replayBillingWebhookEvent({
      eventId: parsed.eventId,
      actorUserId: auth.context.userId,
      correlationId,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/events/replay",
      outcome: result.ok ? "ok" : "error",
      requestId,
      details: { eventId: parsed.eventId, ok: result.ok },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message, undefined, correlationId);
    }

    void notifyOwnerAction({
      actionType: "webhook_replay",
      actorEmail: auth.context.admin.email,
      actorUserId: auth.context.userId,
      correlationId,
      details: { eventId: parsed.eventId },
    });

    return platformApiOk(
      requestId,
      { replayed: true, message: "Evento schedulato per re-processing." },
      correlationId
    );
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/events/replay",
      outcome: "error",
      requestId,
      details: {
        eventId: parsed.eventId,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Replay evento non riuscito.", undefined, correlationId);
  }
}

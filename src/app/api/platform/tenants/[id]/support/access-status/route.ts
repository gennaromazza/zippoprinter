import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { isStudioAccessStatus, updateStudioAccessStatus } from "@/lib/platform-support";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";

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

  if (!isStudioAccessStatus(nextStatus)) {
    return null;
  }

  if (reason.length < 5 || reason.length > 300) {
    return null;
  }

  return { nextStatus, reason };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  if (!(await isSameOriginRequest())) {
    return platformApiError(requestId, 403, "Richiesta non valida.");
  }

  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "Invalid tenant id.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return platformApiError(requestId, 422, "Body JSON non valido.");
  }

  const parsed = parsePayload(payload);
  if (!parsed) {
    return platformApiError(requestId, 422, "Payload non valido. Inserisci stato e motivazione (5-300 caratteri).");
  }

  try {
    const result = await updateStudioAccessStatus({
      photographerId: id,
      actorUserId: auth.context.userId,
      nextStatus: parsed.nextStatus,
      reason: parsed.reason,
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
      },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message);
    }

    return platformApiOk(requestId, {
      updated: true,
      status: result.currentStatus,
      message: result.message,
    });
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/access-status",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Aggiornamento stato accesso non riuscito.");
  }
}

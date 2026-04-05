import { getPlatformAdminContext } from "@/lib/platform-auth";
import { sendOwnerTriggeredPasswordReset } from "@/lib/platform-support";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseReason(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const reason = "reason" in payload ? String((payload as { reason?: unknown }).reason || "").trim() : "";
  if (reason.length < 5 || reason.length > 300) {
    return null;
  }

  return reason;
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

  const reason = parseReason(payload);
  if (!reason) {
    return platformApiError(requestId, 422, "Motivazione obbligatoria (5-300 caratteri).");
  }

  try {
    const result = await sendOwnerTriggeredPasswordReset({
      photographerId: id,
      actorUserId: auth.context.userId,
      reason,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/password-reset",
      outcome: result.ok ? "ok" : "error",
      requestId,
      details: { tenantId: id, ok: result.ok },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message);
    }

    return platformApiOk(requestId, { sent: true, message: result.message });
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/password-reset",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Invio reset password non riuscito.");
  }
}

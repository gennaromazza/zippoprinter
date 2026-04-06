import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { isSameOriginRequest } from "@/lib/request-security";
import { replayBillingWebhookEvent } from "@/lib/owner-billing";
import { getStepUpErrorMessage, requireOwnerStepUp } from "@/lib/owner-step-up";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    return platformApiError(requestId, 403, "Permessi insufficienti.", undefined, correlationId);
  }
  const stepUp = requireOwnerStepUp(request);
  if (!stepUp.ok) {
    return platformApiError(requestId, 403, getStepUpErrorMessage(stepUp.reason), undefined, correlationId);
  }

  const payload = (await request.json().catch(() => null)) as { eventId?: string } | null;
  const eventId = (payload?.eventId || "").trim();
  if (!eventId) {
    return platformApiError(requestId, 422, "eventId obbligatorio.", undefined, correlationId);
  }

  const result = await replayBillingWebhookEvent({
    eventId,
    actorUserId: auth.context.userId,
    correlationId,
  });

  if (!result.ok) {
    return platformApiError(requestId, result.status, result.message, undefined, correlationId);
  }

  return platformApiOk(requestId, { replayQueued: true, eventId }, correlationId);
}

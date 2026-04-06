import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { isSameOriginRequest } from "@/lib/request-security";
import { reconcileTenantSubscription } from "@/lib/owner-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    return platformApiError(requestId, 403, "Permessi insufficienti.", undefined, correlationId);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "Invalid tenant id.", undefined, correlationId);
  }

  const result = await reconcileTenantSubscription({
    photographerId: id,
    actorUserId: auth.context.userId,
    correlationId,
  });

  if (!result.ok) {
    return platformApiError(requestId, result.status, result.message, undefined, correlationId);
  }

  return platformApiOk(requestId, { reconciled: true, status: result.status }, correlationId);
}

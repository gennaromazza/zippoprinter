import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { reconcileTenantSubscription } from "@/lib/owner-billing";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { notifyOwnerAction } from "@/lib/owner-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const result = await reconcileTenantSubscription({
      photographerId: id,
      actorUserId: auth.context.userId,
      correlationId,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/reconcile",
      outcome: result.ok ? "ok" : "error",
      requestId,
      details: { tenantId: id, ok: result.ok },
    });

    if (!result.ok) {
      return platformApiError(requestId, result.status, result.message, undefined, correlationId);
    }

    void notifyOwnerAction({
      actionType: "subscription_reconcile",
      actorEmail: auth.context.admin.email,
      actorUserId: auth.context.userId,
      correlationId,
      tenantId: id,
    });

    return platformApiOk(
      requestId,
      { reconciled: true, status: result.status, message: "Subscription riconciliata con Stripe." },
      correlationId
    );
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id/support/reconcile",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Riconciliazione non riuscita.", undefined, correlationId);
  }
}

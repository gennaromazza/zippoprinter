import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess, getPlatformTenantDetail } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "Invalid tenant id.");
  }

  try {
    const detail = await getPlatformTenantDetail(id);
    if (!detail.tenant) {
      return platformApiError(requestId, 404, "Tenant not found.");
    }

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id",
      outcome: "ok",
      requestId,
      details: {
        tenantId: id,
      },
    });

    return platformApiOk(requestId, detail);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants/:id",
      outcome: "error",
      requestId,
      details: {
        tenantId: id,
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Failed to load tenant detail.");
  }
}

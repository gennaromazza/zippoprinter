import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess, getPlatformOverview } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";

export async function GET() {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  try {
    const overview = await getPlatformOverview();
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/overview",
      outcome: "ok",
      requestId,
    });
    return platformApiOk(requestId, overview);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/overview",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Failed to load platform overview.");
  }
}

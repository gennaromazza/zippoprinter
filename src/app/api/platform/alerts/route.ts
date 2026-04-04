import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess, listPlatformAlerts } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";

function parseLimit(value: string | null, fallback = 50) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 200) {
    return null;
  }

  return parsed;
}

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  if (limit === null) {
    return platformApiError(requestId, 422, "Invalid query params.", {
      field: "limit",
      expected: "integer between 1 and 200",
    });
  }

  const severity = (searchParams.get("severity") || "").trim() || undefined;
  const status = (searchParams.get("status") || "").trim() as
    | "open"
    | "acknowledged"
    | "";

  if (status && status !== "open" && status !== "acknowledged") {
    return platformApiError(requestId, 422, "Invalid query params.", {
      field: "status",
      expected: "open or acknowledged",
    });
  }

  try {
    const data = await listPlatformAlerts({
      severity,
      status: status || undefined,
      limit,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/alerts",
      outcome: "ok",
      requestId,
      details: {
        severity,
        status,
      },
    });

    return platformApiOk(requestId, data);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/alerts",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Failed to load alerts.");
  }
}

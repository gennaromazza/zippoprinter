import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess, listPlatformTenants } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";

function parseLimit(value: string | null, fallback = 25) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
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
      expected: "integer between 1 and 100",
    });
  }

  const filters = {
    q: (searchParams.get("q") || "").trim() || undefined,
    subscription: (searchParams.get("subscription") || "").trim() || undefined,
    connect: (searchParams.get("connect") || "").trim() || undefined,
    domain: (searchParams.get("domain") || "").trim() || undefined,
    cursor: (searchParams.get("cursor") || "").trim() || undefined,
    limit,
  };

  try {
    const rows = await listPlatformTenants(filters);
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants",
      outcome: "ok",
      requestId,
      details: {
        filters,
      },
    });

    return platformApiOk(requestId, rows);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/tenants",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Failed to load tenants.");
  }
}

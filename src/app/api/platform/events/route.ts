import { getPlatformAdminContext } from "@/lib/platform-auth";
import { auditPlatformApiAccess, listPlatformEvents } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";

function parseLimit(value: string | null, fallback = 100) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 250) {
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
      expected: "integer between 1 and 250",
    });
  }

  const source = (searchParams.get("source") || "").trim() || undefined;
  const type = (searchParams.get("type") || "").trim() || undefined;
  const photographerId = (searchParams.get("photographerId") || "").trim() || undefined;

  try {
    const data = await listPlatformEvents({
      source,
      type,
      photographerId,
      limit,
    });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/events",
      outcome: "ok",
      requestId,
      details: {
        source,
        type,
        photographerId,
      },
    });

    return platformApiOk(requestId, data);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/events",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Failed to load events.");
  }
}

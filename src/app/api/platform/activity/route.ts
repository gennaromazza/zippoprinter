import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const actorId = searchParams.get("actorId") || undefined;
  const processArea = searchParams.get("processArea") || undefined;

  try {
    const admin = createAdminClient();
    let query = admin
      .from("process_audit_events")
      .select("event_id, occurred_at, actor_type, actor_id, tenant_id, process_area, action, status, correlation_id, error_message, metadata, created_at")
      .eq("actor_type", "owner")
      .order("occurred_at", { ascending: false })
      .limit(100);

    if (actorId) {
      query = query.eq("actor_id", actorId);
    }
    if (processArea) {
      query = query.eq("process_area", processArea);
    }

    const { data } = await query;

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/activity",
      outcome: "ok",
      requestId,
    });

    return platformApiOk(requestId, { items: data || [] }, correlationId);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/activity",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Errore caricamento attivita.", undefined, correlationId);
  }
}

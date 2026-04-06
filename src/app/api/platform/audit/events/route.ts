import { getPlatformAdminContext } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { searchParams } = new URL(request.url);
  const tenantId = (searchParams.get("tenantId") || "").trim();
  const processArea = (searchParams.get("processArea") || "").trim();
  const status = (searchParams.get("status") || "").trim();
  const correlationId = (searchParams.get("correlationId") || "").trim();
  const from = (searchParams.get("from") || "").trim();
  const to = (searchParams.get("to") || "").trim();
  const limitRaw = Number(searchParams.get("limit") || "100");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 100, 1), 300);

  const admin = createAdminClient();
  let query = admin
    .from("process_audit_events")
    .select("event_id, occurred_at, actor_type, actor_id, tenant_id, process_area, action, status, correlation_id, source, metadata, error_code, error_message")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  if (processArea) {
    query = query.eq("process_area", processArea);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (correlationId) {
    query = query.eq("correlation_id", correlationId);
  }
  if (from) {
    query = query.gte("occurred_at", from);
  }
  if (to) {
    query = query.lte("occurred_at", to);
  }

  const { data, error } = await query;
  if (error) {
    return platformApiError(requestId, 500, "Failed to load audit events.", { cause: error.message });
  }

  return platformApiOk(requestId, {
    items: data || [],
  });
}

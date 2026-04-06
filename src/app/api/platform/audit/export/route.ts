import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { createRequestId, platformApiError } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }
  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    return platformApiError(requestId, 403, "Permessi insufficienti.");
  }

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get("format") || "json").trim().toLowerCase();
  const tenantId = (searchParams.get("tenantId") || "").trim();
  const processArea = (searchParams.get("processArea") || "").trim();
  const status = (searchParams.get("status") || "").trim();
  const correlationId = (searchParams.get("correlationId") || "").trim();
  const from = (searchParams.get("from") || "").trim();
  const to = (searchParams.get("to") || "").trim();
  const limitRaw = Number(searchParams.get("limit") || "500");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500, 1), 2000);

  const admin = createAdminClient();
  let query = admin
    .from("process_audit_events")
    .select("event_id, occurred_at, actor_type, actor_id, tenant_id, process_area, action, status, correlation_id, idempotency_key, source, before_snapshot, after_snapshot, metadata, error_code, error_message")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (tenantId) query = query.eq("tenant_id", tenantId);
  if (processArea) query = query.eq("process_area", processArea);
  if (status) query = query.eq("status", status);
  if (correlationId) query = query.eq("correlation_id", correlationId);
  if (from) query = query.gte("occurred_at", from);
  if (to) query = query.lte("occurred_at", to);

  const { data, error } = await query;
  if (error) {
    return platformApiError(requestId, 500, "Failed to export audit events.", { cause: error.message });
  }

  const items = data || [];

  if (format === "csv") {
    const headers = [
      "event_id",
      "occurred_at",
      "actor_type",
      "actor_id",
      "tenant_id",
      "process_area",
      "action",
      "status",
      "correlation_id",
      "idempotency_key",
      "source",
      "error_code",
      "error_message",
      "metadata_json",
    ];

    const lines = [
      headers.join(","),
      ...items.map((row) =>
        [
          row.event_id,
          row.occurred_at,
          row.actor_type,
          row.actor_id,
          row.tenant_id,
          row.process_area,
          row.action,
          row.status,
          row.correlation_id,
          row.idempotency_key,
          row.source,
          row.error_code,
          row.error_message,
          JSON.stringify(row.metadata || {}),
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename=process_audit_export_${Date.now()}.csv`,
        "x-request-id": requestId,
      },
    });
  }

  return new Response(
    JSON.stringify(
      {
        requestId,
        exportedAt: new Date().toISOString(),
        filters: {
          tenantId: tenantId || null,
          processArea: processArea || null,
          status: status || null,
          correlationId: correlationId || null,
          from: from || null,
          to: to || null,
          limit,
        },
        items,
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename=process_audit_export_${Date.now()}.json`,
        "x-request-id": requestId,
      },
    }
  );
}

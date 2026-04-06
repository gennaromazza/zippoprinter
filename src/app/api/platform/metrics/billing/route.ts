import { getPlatformAdminContext } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const admin = createAdminClient();
  const [
    { count: trialingCount },
    { count: activeCount },
    { count: pastDueCount },
    { count: suspendedCount },
    { count: failedAuditCount },
  ] = await Promise.all([
    admin.from("tenant_subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
    admin.from("tenant_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("tenant_subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
    admin.from("tenant_subscriptions").select("id", { count: "exact", head: true }).eq("status", "suspended"),
    admin
      .from("process_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("occurred_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return platformApiOk(requestId, {
    generatedAt: new Date().toISOString(),
    subscriptions: {
      trialing: trialingCount || 0,
      active: activeCount || 0,
      pastDue: pastDueCount || 0,
      suspended: suspendedCount || 0,
    },
    audit: {
      failedEventsLast24h: failedAuditCount || 0,
    },
  });
}

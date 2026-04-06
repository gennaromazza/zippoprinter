import { getPlatformAdminContext } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "Invalid correlation id.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("process_audit_events")
    .select("*")
    .eq("correlation_id", id)
    .order("occurred_at", { ascending: true })
    .limit(500);

  if (error) {
    return platformApiError(requestId, 500, "Failed to load correlation chain.", { cause: error.message });
  }

  return platformApiOk(requestId, {
    correlationId: id,
    items: data || [],
  });
}

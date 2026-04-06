import { getPlatformAdminContext } from "@/lib/platform-auth";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const requestId = createRequestId();
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error);
  }

  const { eventId } = await context.params;
  if (!eventId) {
    return platformApiError(requestId, 422, "Invalid event id.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("process_audit_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    return platformApiError(requestId, 500, "Failed to load audit event.", { cause: error.message });
  }
  if (!data) {
    return platformApiError(requestId, 404, "Audit event not found.");
  }

  return platformApiOk(requestId, data);
}

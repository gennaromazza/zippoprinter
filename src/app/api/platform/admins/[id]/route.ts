import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { notifyOwnerAction } from "@/lib/owner-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const action = "action" in payload
    ? String((payload as { action?: unknown }).action || "").trim()
    : "";

  if (action === "toggle_active" || action === "update_role") {
    const role = "role" in payload
      ? String((payload as { role?: unknown }).role || "").trim()
      : "";

    if (action === "update_role") {
      const validRoles = ["owner_readonly", "owner_support", "owner_admin"];
      if (!validRoles.includes(role)) {
        return null;
      }
      return { action: "update_role" as const, role: role as "owner_readonly" | "owner_support" | "owner_admin" };
    }

    return { action: "toggle_active" as const, role: undefined };
  }

  return null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = createRequestId();
  const correlationId = getCorrelationIdFromHeaders(request.headers);

  if (!(await isSameOriginRequest())) {
    return platformApiError(requestId, 403, "Richiesta non valida.", undefined, correlationId);
  }

  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    return platformApiError(requestId, auth.status, auth.error, undefined, correlationId);
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    return platformApiError(requestId, 403, "Solo owner_admin puo modificare amministratori.", undefined, correlationId);
  }

  const { id } = await context.params;
  if (!id) {
    return platformApiError(requestId, 422, "ID amministratore mancante.", undefined, correlationId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return platformApiError(requestId, 422, "Body JSON non valido.", undefined, correlationId);
  }

  const parsed = parsePayload(payload);
  if (!parsed) {
    return platformApiError(requestId, 422, "Azione non valida.", undefined, correlationId);
  }

  try {
    const admin = createAdminClient();

    if (parsed.action === "toggle_active") {
      const { data: current } = await admin
        .from("platform_admins")
        .select("id, is_active, auth_user_id")
        .eq("id", id)
        .maybeSingle();

      if (!current) {
        return platformApiError(requestId, 404, "Amministratore non trovato.", undefined, correlationId);
      }

      if (current.auth_user_id === auth.context.userId) {
        return platformApiError(requestId, 422, "Non puoi disattivare te stesso.", undefined, correlationId);
      }

      await admin
        .from("platform_admins")
        .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      await auditPlatformApiAccess({
        actorUserId: auth.context.userId,
        endpoint: `/api/platform/admins/${id}`,
        outcome: "ok",
        requestId,
        details: { action: "toggle_active", newState: !current.is_active },
      });

      void notifyOwnerAction({
        actionType: !current.is_active ? "admin_deactivated" : "admin_added",
        actorEmail: auth.context.admin.email,
        actorUserId: auth.context.userId,
        correlationId,
        details: { adminId: id, newState: !current.is_active },
      });

      return platformApiOk(requestId, { updated: true, is_active: !current.is_active }, correlationId);
    }

    if (parsed.action === "update_role" && parsed.role) {
      const { data: current } = await admin
        .from("platform_admins")
        .select("id, auth_user_id")
        .eq("id", id)
        .maybeSingle();

      if (!current) {
        return platformApiError(requestId, 404, "Amministratore non trovato.", undefined, correlationId);
      }

      if (current.auth_user_id === auth.context.userId) {
        return platformApiError(requestId, 422, "Non puoi cambiare il tuo ruolo.", undefined, correlationId);
      }

      await admin
        .from("platform_admins")
        .update({ role: parsed.role, updated_at: new Date().toISOString() })
        .eq("id", id);

      await auditPlatformApiAccess({
        actorUserId: auth.context.userId,
        endpoint: `/api/platform/admins/${id}`,
        outcome: "ok",
        requestId,
        details: { action: "update_role", role: parsed.role },
      });

      void notifyOwnerAction({
        actionType: "admin_role_change",
        actorEmail: auth.context.admin.email,
        actorUserId: auth.context.userId,
        correlationId,
        details: { adminId: id, newRole: parsed.role },
      });

      return platformApiOk(requestId, { updated: true, role: parsed.role }, correlationId);
    }

    return platformApiError(requestId, 422, "Azione non supportata.", undefined, correlationId);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: `/api/platform/admins/${id}`,
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Operazione non riuscita.", undefined, correlationId);
  }
}

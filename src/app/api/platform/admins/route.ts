import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { auditPlatformApiAccess } from "@/lib/platform-data";
import { createRequestId, platformApiError, platformApiOk } from "@/lib/platform-api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSameOriginRequest } from "@/lib/request-security";
import { getCorrelationIdFromHeaders } from "@/lib/process-audit";
import { notifyOwnerAction } from "@/lib/owner-notifications";

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

  if (!hasPlatformRole(auth.context.admin.role, "owner_admin")) {
    return platformApiError(requestId, 403, "Solo owner_admin puo gestire amministratori.", undefined, correlationId);
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_admins")
      .select("id, auth_user_id, email, role, is_active, created_at, updated_at")
      .order("created_at", { ascending: true });

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/admins",
      outcome: "ok",
      requestId,
    });

    return platformApiOk(requestId, { items: data || [] }, correlationId);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/admins",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Errore caricamento amministratori.", undefined, correlationId);
  }
}

function parsePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const email = "email" in payload
    ? String((payload as { email?: unknown }).email || "").trim().toLowerCase()
    : "";
  const role = "role" in payload
    ? String((payload as { role?: unknown }).role || "").trim()
    : "";

  if (!email || !email.includes("@")) {
    return null;
  }

  const validRoles = ["owner_readonly", "owner_support", "owner_admin"];
  if (!validRoles.includes(role)) {
    return null;
  }

  return { email, role: role as "owner_readonly" | "owner_support" | "owner_admin" };
}

export async function POST(request: Request) {
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
    return platformApiError(requestId, 403, "Solo owner_admin puo aggiungere amministratori.", undefined, correlationId);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return platformApiError(requestId, 422, "Body JSON non valido.", undefined, correlationId);
  }

  const parsed = parsePayload(payload);
  if (!parsed) {
    return platformApiError(requestId, 422, "Email valida e ruolo (owner_readonly, owner_support, owner_admin) obbligatori.", undefined, correlationId);
  }

  try {
    const admin = createAdminClient();

    const { data: existingUser } = await admin
      .from("platform_admins")
      .select("id")
      .eq("email", parsed.email)
      .maybeSingle();

    if (existingUser) {
      return platformApiError(requestId, 422, "Questo email e gia registrato come amministratore.", undefined, correlationId);
    }

    const { error } = await admin
      .from("platform_admins")
      .insert({
        email: parsed.email,
        role: parsed.role,
        is_active: true,
      });

    if (error) {
      return platformApiError(requestId, 500, "Inserimento non riuscito: " + error.message, undefined, correlationId);
    }

    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/admins",
      outcome: "ok",
      requestId,
      details: { action: "add", email: parsed.email, role: parsed.role },
    });

    void notifyOwnerAction({
      actionType: "admin_added",
      actorEmail: auth.context.admin.email,
      actorUserId: auth.context.userId,
      correlationId,
      details: { targetEmail: parsed.email, role: parsed.role },
    });

    return platformApiOk(requestId, { added: true, email: parsed.email, role: parsed.role }, correlationId);
  } catch (error) {
    await auditPlatformApiAccess({
      actorUserId: auth.context.userId,
      endpoint: "/api/platform/admins",
      outcome: "error",
      requestId,
      details: {
        error: error instanceof Error ? error.message : "Unknown",
      },
    });

    return platformApiError(requestId, 500, "Errore aggiunta amministratore.", undefined, correlationId);
  }
}

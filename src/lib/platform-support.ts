import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/tenant-billing";
import type { StudioAccessStatus } from "@/lib/types";
import { writeProcessAuditEvent } from "@/lib/process-audit";

const PASSWORD_RESET_COOLDOWN_SECONDS = Number.parseInt(
  process.env.PLATFORM_PASSWORD_RESET_COOLDOWN_SECONDS || "300",
  10
);
const PASSWORD_RESET_OWNER_HOURLY_LIMIT = Number.parseInt(
  process.env.PLATFORM_PASSWORD_RESET_OWNER_HOURLY_LIMIT || "20",
  10
);

function getSafePositiveInteger(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
}

function isAllowedStatusTransition(
  current: StudioAccessStatus,
  next: StudioAccessStatus
) {
  if (current === next) {
    return false;
  }

  if (current === "active" && next === "temporarily_blocked") {
    return true;
  }

  if (current === "temporarily_blocked" && next === "active") {
    return true;
  }

  if (current === "active" && next === "suspended") {
    return true;
  }

  if (current === "temporarily_blocked" && next === "suspended") {
    return true;
  }

  if (current === "suspended" && next === "active") {
    return true;
  }

  return false;
}

async function insertSupportAction(input: {
  photographerId: string;
  actorUserId: string;
  actionType: "password_reset_email" | "access_status_update";
  outcome: "success" | "rate_limited" | "invalid_state" | "failed";
  reason: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("platform_support_actions").insert({
    photographer_id: input.photographerId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    outcome: input.outcome,
    reason: input.reason,
    metadata: input.metadata || {},
  });
}

export function isStudioAccessStatus(value: string): value is StudioAccessStatus {
  return (
    value === "active" ||
    value === "temporarily_blocked" ||
    value === "suspended"
  );
}

export async function sendOwnerTriggeredPasswordReset(input: {
  photographerId: string;
  actorUserId: string;
  reason: string;
  correlationId?: string;
}) {
  const admin = createAdminClient();
  const cooldownSeconds = getSafePositiveInteger(
    PASSWORD_RESET_COOLDOWN_SECONDS,
    300
  );
  const ownerHourlyLimit = getSafePositiveInteger(
    PASSWORD_RESET_OWNER_HOURLY_LIMIT,
    20
  );

  const { data: photographer } = await admin
    .from("photographers")
    .select("id, email, auth_user_id")
    .eq("id", input.photographerId)
    .maybeSingle();

  if (!photographer?.id) {
    return { ok: false as const, status: 404 as const, message: "Studio non trovato." };
  }

  if (!photographer.email || !photographer.auth_user_id) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "password_reset_email",
      outcome: "failed",
      reason: input.reason,
      metadata: { error: "studio_without_auth_binding" },
    });
    return {
      ok: false as const,
      status: 422 as const,
      message: "Studio non abilitato al reset password (utente auth non collegato).",
    };
  }

  const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  const { data: recentForStudio } = await admin
    .from("platform_support_actions")
    .select("id")
    .eq("photographer_id", input.photographerId)
    .eq("action_type", "password_reset_email")
    .eq("outcome", "success")
    .gte("created_at", cooldownThreshold)
    .limit(1);

  if (recentForStudio && recentForStudio.length > 0) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "password_reset_email",
      outcome: "rate_limited",
      reason: input.reason,
      metadata: { scope: "studio", cooldownSeconds },
    });
    return {
      ok: false as const,
      status: 429 as const,
      message: "Reset gia inviato da poco a questo studio.",
    };
  }

  const ownerWindowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: ownerCount } = await admin
    .from("platform_support_actions")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", input.actorUserId)
    .eq("action_type", "password_reset_email")
    .gte("created_at", ownerWindowStart);

  if ((ownerCount || 0) >= ownerHourlyLimit) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "password_reset_email",
      outcome: "rate_limited",
      reason: input.reason,
      metadata: { scope: "owner", ownerHourlyLimit },
    });
    return {
      ok: false as const,
      status: 429 as const,
      message: "Limite orario reset raggiunto. Riprova piu tardi.",
    };
  }

  const siteUrl = getSiteUrl();
  const redirectTo = siteUrl ? `${siteUrl}/login?recovery=1` : undefined;
  const { error } = await admin.auth.resetPasswordForEmail(photographer.email, {
    ...(redirectTo ? { redirectTo } : {}),
  });

  if (error) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "password_reset_email",
      outcome: "failed",
      reason: input.reason,
      metadata: {
        error: error.message,
      },
    });
    return {
      ok: false as const,
      status: 500 as const,
      message: "Invio reset password non riuscito.",
    };
  }

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: input.photographerId,
    processArea: "access",
    action: "owner_password_reset_email_sent",
    status: "succeeded",
    correlationId: input.correlationId || crypto.randomUUID(),
    source: "lib.platform-support",
    metadata: {
      reason: input.reason,
    },
  });

  await insertSupportAction({
    photographerId: input.photographerId,
    actorUserId: input.actorUserId,
    actionType: "password_reset_email",
    outcome: "success",
    reason: input.reason,
    metadata: {
      emailMasked: photographer.email.replace(/(^.).*(@.*$)/, "$1***$2"),
    },
  });

  await writeAuditLog({
    photographerId: input.photographerId,
    actorUserId: input.actorUserId,
    action: "owner_password_reset_email_sent",
    resourceType: "platform_support_actions",
    resourceId: input.photographerId,
    details: {
      reason: input.reason,
    },
  });

  return {
    ok: true as const,
    message: "Email di reset inviata correttamente.",
  };
}

export async function updateStudioAccessStatus(input: {
  photographerId: string;
  actorUserId: string;
  nextStatus: StudioAccessStatus;
  reason: string;
  correlationId?: string;
  ticketId?: string;
}) {
  const admin = createAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("id")
    .eq("id", input.photographerId)
    .maybeSingle();

  if (!photographer?.id) {
    return { ok: false as const, status: 404 as const, message: "Studio non trovato." };
  }

  const { data: account } = await admin
    .from("tenant_billing_accounts")
    .select("access_status")
    .eq("photographer_id", input.photographerId)
    .maybeSingle();

  const currentStatus = (account?.access_status || "active") as StudioAccessStatus;
  if (!isAllowedStatusTransition(currentStatus, input.nextStatus)) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "access_status_update",
      outcome: "invalid_state",
      reason: input.reason,
      metadata: {
        from: currentStatus,
        to: input.nextStatus,
      },
    });
    return {
      ok: false as const,
      status: 422 as const,
      message:
        "Transizione stato accesso non consentita. Usa active <-> temporarily_blocked, active/temp_blocked -> suspended, suspended -> active.",
    };
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin.from("tenant_billing_accounts").upsert(
    {
      photographer_id: input.photographerId,
      access_status: input.nextStatus,
      access_status_reason: input.reason,
      access_status_updated_at: nowIso,
      access_status_updated_by: input.actorUserId,
      updated_at: nowIso,
    },
    { onConflict: "photographer_id" }
  );

  if (error) {
    await insertSupportAction({
      photographerId: input.photographerId,
      actorUserId: input.actorUserId,
      actionType: "access_status_update",
      outcome: "failed",
      reason: input.reason,
      metadata: {
        from: currentStatus,
        to: input.nextStatus,
        error: error.message,
      },
    });
    return {
      ok: false as const,
      status: 500 as const,
      message: "Aggiornamento stato accesso non riuscito.",
    };
  }

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: input.photographerId,
    processArea: input.nextStatus === "suspended" ? "override" : "access",
    action: "owner_access_status_updated",
    status: "succeeded",
    correlationId: input.correlationId || crypto.randomUUID(),
    source: "lib.platform-support",
    beforeSnapshot: {
      accessStatus: currentStatus,
    },
    afterSnapshot: {
      accessStatus: input.nextStatus,
    },
    metadata: {
      reason: input.reason,
      ticketId: input.ticketId || null,
    },
  });

  await insertSupportAction({
    photographerId: input.photographerId,
    actorUserId: input.actorUserId,
    actionType: "access_status_update",
    outcome: "success",
    reason: input.reason,
    metadata: {
      from: currentStatus,
      to: input.nextStatus,
    },
  });

  await writeAuditLog({
    photographerId: input.photographerId,
    actorUserId: input.actorUserId,
    action: "owner_access_status_updated",
    resourceType: "tenant_billing_accounts",
    resourceId: input.photographerId,
    details: {
      from: currentStatus,
      to: input.nextStatus,
      reason: input.reason,
    },
  });

  return {
    ok: true as const,
    currentStatus: input.nextStatus,
    message: "Stato accesso aggiornato.",
  };
}

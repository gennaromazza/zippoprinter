import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { writeProcessAuditEvent } from "@/lib/process-audit";

type OwnerActionType =
  | "trial_reset"
  | "subscription_reconcile"
  | "webhook_replay"
  | "access_status_change"
  | "admin_role_change"
  | "admin_deactivated"
  | "admin_added";

function escapeHtml(value: unknown): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface OwnerActionNotificationInput {
  actionType: OwnerActionType;
  actorEmail: string;
  actorUserId: string;
  correlationId: string;
  tenantId?: string | null;
  tenantName?: string | null;
  details?: Record<string, unknown>;
}

function renderOwnerNotification(input: OwnerActionNotificationInput) {
  const actor = escapeHtml(input.actorEmail);
  const tenant = escapeHtml(input.tenantName || input.tenantId || "-");

  const map: Record<OwnerActionType, { subject: string; body: string }> = {
    trial_reset: {
      subject: `[Platform] Trial reset eseguito da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha resettato il trial dello studio <strong>${tenant}</strong>.</p>${input.details?.days ? `<p>Durata: ${escapeHtml(input.details.days)} giorni.</p>` : ""}${input.details?.reason ? `<p>Motivazione: ${escapeHtml(input.details.reason)}</p>` : ""}`,
    },
    subscription_reconcile: {
      subject: `[Platform] Riconciliazione subscription da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha eseguito una riconciliazione della subscription per lo studio <strong>${tenant}</strong>.</p>`,
    },
    webhook_replay: {
      subject: `[Platform] Replay webhook da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha eseguito il replay di un evento webhook.</p>${input.details?.eventId ? `<p>Event ID: <code>${escapeHtml(input.details.eventId)}</code></p>` : ""}`,
    },
    access_status_change: {
      subject: `[Platform] Cambio stato accesso da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha modificato lo stato accesso dello studio <strong>${tenant}</strong>.</p>${input.details?.newStatus ? `<p>Nuovo stato: <strong>${escapeHtml(input.details.newStatus)}</strong></p>` : ""}${input.details?.reason ? `<p>Motivazione: ${escapeHtml(input.details.reason)}</p>` : ""}`,
    },
    admin_role_change: {
      subject: `[Platform] Modifica ruolo admin da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha modificato il ruolo di un amministratore.</p>${input.details?.targetEmail ? `<p>Admin: ${escapeHtml(input.details.targetEmail)}</p>` : ""}${input.details?.newRole ? `<p>Nuovo ruolo: <strong>${escapeHtml(input.details.newRole)}</strong></p>` : ""}`,
    },
    admin_deactivated: {
      subject: `[Platform] Admin disattivato da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha disattivato un amministratore.</p>${input.details?.targetEmail ? `<p>Admin: ${escapeHtml(input.details.targetEmail)}</p>` : ""}`,
    },
    admin_added: {
      subject: `[Platform] Nuovo admin aggiunto da ${input.actorEmail}`,
      body: `<p><strong>${actor}</strong> ha aggiunto un nuovo amministratore.</p>${input.details?.targetEmail ? `<p>Email: ${escapeHtml(input.details.targetEmail)}</p>` : ""}${input.details?.role ? `<p>Ruolo: <strong>${escapeHtml(input.details.role)}</strong></p>` : ""}`,
    },
  };

  return map[input.actionType] || {
    subject: `[Platform] Azione owner: ${input.actionType}`,
    body: `<p><strong>${actor}</strong> ha eseguito l'azione <strong>${input.actionType}</strong>.</p>`,
  };
}

export async function notifyOwnerAction(input: OwnerActionNotificationInput) {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();

  if (!apiKey || !fromEmail) {
    return { sent: false, reason: "resend_not_configured" as const };
  }

  const admin = createAdminClient();

  const { data: admins } = await admin
    .from("platform_admins")
    .select("email")
    .eq("is_active", true)
    .neq("email", input.actorEmail);

  const recipients = (admins || []).map((a) => a.email).filter(Boolean);

  if (recipients.length === 0) {
    return { sent: false, reason: "no_recipients" as const };
  }

  const template = renderOwnerNotification(input);

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="border-bottom:2px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px;">
        <strong style="font-size:14px;color:#6b7280;">Stampiss Platform</strong>
      </div>
      ${template.body}
      <p style="margin-top:20px;font-size:13px;color:#9ca3af;">
        Notifica automatica. Controlla la <a href="${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/platform/activity">pagina attivita</a> per i dettagli.
      </p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: template.subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend ${response.status}: ${errText}`);
    }

    await writeProcessAuditEvent({
      actorType: "system",
      actorId: input.actorUserId,
      tenantId: input.tenantId || undefined,
      processArea: "access",
      action: `owner_notification_${input.actionType}`,
      status: "succeeded",
      correlationId: input.correlationId,
      source: "lib.owner-notifications",
      metadata: {
        recipientCount: recipients.length,
        actionType: input.actionType,
      },
    });

    return { sent: true, recipientCount: recipients.length };
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "system",
      actorId: input.actorUserId,
      tenantId: input.tenantId || undefined,
      processArea: "access",
      action: `owner_notification_${input.actionType}`,
      status: "failed",
      correlationId: input.correlationId,
      source: "lib.owner-notifications",
      errorMessage: error instanceof Error ? error.message : "notification_failed",
    });

    return { sent: false, reason: "send_failed" as const };
  }
}

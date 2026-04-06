import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { writeProcessAuditEvent } from "@/lib/process-audit";

type NotificationType =
  | "trial_expiring_7d"
  | "trial_expiring_3d"
  | "trial_expiring_1d"
  | "trial_expired"
  | "subscription_activated"
  | "plan_changed"
  | "cancel_at_period_end_confirmed"
  | "period_end_reminder"
  | "renewal_payment_failed"
  | "payment_recovered_or_reactivated";

interface NotificationInput {
  type: NotificationType;
  photographerId: string;
  correlationId: string;
  idempotencySuffix?: string;
  context?: {
    planName?: string;
    periodEnd?: string | null;
    amountCents?: number | null;
    currency?: string | null;
  };
}

interface RenderedTemplate {
  processArea: "subscription" | "invoice";
  subject: string;
  html: string;
  text: string;
}

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
}

function formatDateIt(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatMoney(cents: number | null | undefined, currency: string | null | undefined) {
  if (!Number.isFinite(cents as number)) {
    return "-";
  }
  const code = (currency || "eur").toUpperCase();
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: code,
  }).format((cents as number) / 100);
}

function renderTemplate(
  type: NotificationType,
  studioName: string,
  dashboardUrl: string,
  context?: NotificationInput["context"]
): RenderedTemplate {
  const planName = context?.planName || "Piano attivo";
  const periodEnd = formatDateIt(context?.periodEnd);
  const amount = formatMoney(context?.amountCents, context?.currency);

  switch (type) {
    case "trial_expiring_7d":
      return {
        processArea: "subscription",
        subject: "Il tuo trial scade tra 7 giorni",
        html: `<p>Ciao ${studioName},</p><p>il trial scade tra 7 giorni. Attiva un piano per non interrompere i servizi.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Ciao ${studioName}, il trial scade tra 7 giorni. Vai al pannello: ${dashboardUrl}`,
      };
    case "trial_expiring_3d":
      return {
        processArea: "subscription",
        subject: "Il tuo trial scade tra 3 giorni",
        html: `<p>Ciao ${studioName},</p><p>mancano 3 giorni alla fine del trial. Attiva ora il piano.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Ciao ${studioName}, mancano 3 giorni al termine del trial. Vai al pannello: ${dashboardUrl}`,
      };
    case "trial_expiring_1d":
      return {
        processArea: "subscription",
        subject: "Il tuo trial scade domani",
        html: `<p>Ciao ${studioName},</p><p>il trial scade domani. Attiva il piano per evitare sospensioni.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Ciao ${studioName}, il trial scade domani. Vai al pannello: ${dashboardUrl}`,
      };
    case "trial_expired":
      return {
        processArea: "subscription",
        subject: "Trial scaduto: attiva un piano",
        html: `<p>Ciao ${studioName},</p><p>il trial e scaduto. Puoi riattivare lo studio scegliendo un piano dal pannello.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Ciao ${studioName}, il trial e scaduto. Riattiva dal pannello: ${dashboardUrl}`,
      };
    case "subscription_activated":
      return {
        processArea: "subscription",
        subject: "Abbonamento attivo",
        html: `<p>Ciao ${studioName},</p><p>abbonamento attivato con successo (${planName}).</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Abbonamento attivato (${planName}). Pannello: ${dashboardUrl}`,
      };
    case "plan_changed":
      return {
        processArea: "subscription",
        subject: "Piano abbonamento aggiornato",
        html: `<p>Ciao ${studioName},</p><p>il tuo piano e stato aggiornato a <strong>${planName}</strong>.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Il piano e stato aggiornato a ${planName}. Pannello: ${dashboardUrl}`,
      };
    case "cancel_at_period_end_confirmed":
      return {
        processArea: "subscription",
        subject: "Cancellazione confermata a fine periodo",
        html: `<p>Ciao ${studioName},</p><p>la cancellazione e confermata: il piano restera attivo fino al ${periodEnd}.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Cancellazione confermata, termine periodo: ${periodEnd}. Pannello: ${dashboardUrl}`,
      };
    case "period_end_reminder":
      return {
        processArea: "subscription",
        subject: "Promemoria scadenza periodo",
        html: `<p>Ciao ${studioName},</p><p>il periodo corrente termina il ${periodEnd}. Verifica metodo di pagamento e stato piano.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Promemoria: il periodo termina il ${periodEnd}. Pannello: ${dashboardUrl}`,
      };
    case "renewal_payment_failed":
      return {
        processArea: "invoice",
        subject: "Pagamento rinnovo non riuscito",
        html: `<p>Ciao ${studioName},</p><p>non siamo riusciti ad addebitare il rinnovo (${amount}). Aggiorna il metodo di pagamento.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Pagamento rinnovo non riuscito (${amount}). Aggiorna dal pannello: ${dashboardUrl}`,
      };
    case "payment_recovered_or_reactivated":
      return {
        processArea: "invoice",
        subject: "Pagamento confermato, account in regola",
        html: `<p>Ciao ${studioName},</p><p>pagamento confermato. Il tuo account e di nuovo in regola.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Pagamento confermato, account in regola. Pannello: ${dashboardUrl}`,
      };
    default:
      return {
        processArea: "subscription",
        subject: "Aggiornamento account",
        html: `<p>Ciao ${studioName},</p><p>abbiamo un aggiornamento sul tuo account.</p><p><a href="${dashboardUrl}">Vai al pannello</a></p>`,
        text: `Aggiornamento account. Pannello: ${dashboardUrl}`,
      };
  }
}

export async function sendBillingNotification(input: NotificationInput) {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail) {
    return { sent: false, skipped: true, reason: "resend_not_configured" as const };
  }

  const admin = createAdminClient();
  const { data: photographer } = await admin
    .from("photographers")
    .select("id, email, name")
    .eq("id", input.photographerId)
    .maybeSingle();

  if (!photographer?.email) {
    return { sent: false, skipped: true, reason: "missing_email" as const };
  }

  const dashboardUrl = `${getBaseUrl()}/admin/settings`;
  const template = renderTemplate(
    input.type,
    photographer.name || "studio",
    dashboardUrl,
    input.context
  );

  const dayKey = new Date().toISOString().slice(0, 10);
  const idempotencyKey = `mail:${input.type}:${input.photographerId}:${input.idempotencySuffix || dayKey}`;

  const { data: existing } = await admin
    .from("billing_jobs")
    .select("id")
    .eq("job_type", "dunning")
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "succeeded")
    .limit(1);

  if (existing && existing.length > 0) {
    return { sent: false, skipped: true, reason: "duplicate" as const };
  }

  const nowIso = new Date().toISOString();
  const { data: job } = await admin
    .from("billing_jobs")
    .insert({
      job_type: "dunning",
      scope_tenant_id: input.photographerId,
      status: "running",
      idempotency_key: idempotencyKey,
      correlation_id: input.correlationId,
      metadata: {
        notificationType: input.type,
        to: photographer.email,
      },
      started_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [photographer.email],
        subject: template.subject,
        html: template.html,
        text: template.text,
      }),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Resend error ${response.status}: ${payload}`);
    }

    const resendPayload = (await response.json().catch(() => ({}))) as { id?: string };

    if (job?.id) {
      await admin
        .from("billing_jobs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            notificationType: input.type,
            to: photographer.email,
            resendId: resendPayload.id || null,
          },
        })
        .eq("id", job.id);
    }

    await writeProcessAuditEvent({
      actorType: "system",
      tenantId: input.photographerId,
      processArea: template.processArea,
      action: `email_${input.type}`,
      status: "succeeded",
      correlationId: input.correlationId,
      idempotencyKey,
      source: "lib.email-notifications",
      metadata: {
        to: photographer.email,
        resendId: resendPayload.id || null,
      },
    });

    return { sent: true, skipped: false };
  } catch (error) {
    if (job?.id) {
      await admin
        .from("billing_jobs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "email_send_failed",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }

    await writeProcessAuditEvent({
      actorType: "system",
      tenantId: input.photographerId,
      processArea: template.processArea,
      action: `email_${input.type}`,
      status: "failed",
      correlationId: input.correlationId,
      idempotencyKey,
      source: "lib.email-notifications",
      errorMessage: error instanceof Error ? error.message : "email_send_failed",
      metadata: {
        to: photographer.email,
      },
    });

    return { sent: false, skipped: false, reason: "send_failed" as const };
  }
}

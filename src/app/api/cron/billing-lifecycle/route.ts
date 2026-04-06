import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeProcessAuditEvent } from "@/lib/process-audit";
import { sendBillingNotification } from "@/lib/email-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  if (cronHeader) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  const correlationId = crypto.randomUUID();
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const result = {
    trialExpiredSuspended: 0,
    graceExpiredSuspended: 0,
    trialRemindersSent: 0,
    periodEndRemindersSent: 0,
  };

  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();

  const { data: trialCandidates } = await admin
    .from("tenant_subscriptions")
    .select("photographer_id, trial_end")
    .eq("status", "trialing")
    .not("trial_end", "is", null)
    .gte("trial_end", nowIso)
    .lte("trial_end", new Date(now.getTime() + 8 * dayMs).toISOString())
    .limit(1000);

  for (const row of trialCandidates || []) {
    const trialEnd = row.trial_end ? new Date(row.trial_end) : null;
    if (!trialEnd || Number.isNaN(trialEnd.getTime())) {
      continue;
    }
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / dayMs);
    const notificationType =
      daysLeft === 7
        ? "trial_expiring_7d"
        : daysLeft === 3
          ? "trial_expiring_3d"
          : daysLeft === 1
            ? "trial_expiring_1d"
            : null;
    if (!notificationType) {
      continue;
    }

    const mail = await sendBillingNotification({
      type: notificationType,
      photographerId: row.photographer_id,
      correlationId,
      idempotencySuffix: `trial:${row.trial_end}:${daysLeft}`,
      context: {
        periodEnd: row.trial_end,
      },
    });
    if (mail.sent) {
      result.trialRemindersSent += 1;
    }
  }

  const { data: expiredTrials } = await admin
    .from("tenant_subscriptions")
    .select("photographer_id")
    .eq("status", "trialing")
    .lt("trial_end", nowIso)
    .limit(500);

  for (const row of expiredTrials || []) {
    await sendBillingNotification({
      type: "trial_expired",
      photographerId: row.photographer_id,
      correlationId,
      idempotencySuffix: `trial_expired:${nowIso.slice(0, 10)}`,
    });

    await admin
      .from("tenant_subscriptions")
      .update({
        status: "suspended",
        collection_state: "delinquent",
        updated_at: nowIso,
      })
      .eq("photographer_id", row.photographer_id);

    await writeProcessAuditEvent({
      actorType: "system",
      tenantId: row.photographer_id,
      processArea: "subscription",
      action: "trial_expired_auto_suspend",
      status: "succeeded",
      correlationId,
      source: "api.cron.billing-lifecycle",
      metadata: {
        reason: "trial_end_reached",
      },
    });

    result.trialExpiredSuspended += 1;
  }

  const { data: graceExpired } = await admin
    .from("tenant_subscriptions")
    .select("photographer_id")
    .eq("status", "past_due")
    .not("grace_period_ends_at", "is", null)
    .lt("grace_period_ends_at", nowIso)
    .limit(500);

  for (const row of graceExpired || []) {
    await admin
      .from("tenant_subscriptions")
      .update({
        status: "suspended",
        collection_state: "delinquent",
        updated_at: nowIso,
      })
      .eq("photographer_id", row.photographer_id);

    await writeProcessAuditEvent({
      actorType: "system",
      tenantId: row.photographer_id,
      processArea: "subscription",
      action: "grace_period_expired_auto_suspend",
      status: "succeeded",
      correlationId,
      source: "api.cron.billing-lifecycle",
      metadata: {
        reason: "grace_period_expired",
      },
    });

    result.graceExpiredSuspended += 1;
  }

  const { data: periodEndCandidates } = await admin
    .from("tenant_subscriptions")
    .select("photographer_id, current_period_end")
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .gte("current_period_end", nowIso)
    .lte("current_period_end", new Date(now.getTime() + 4 * dayMs).toISOString())
    .limit(1000);

  for (const row of periodEndCandidates || []) {
    const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
    if (!periodEnd || Number.isNaN(periodEnd.getTime())) {
      continue;
    }
    const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / dayMs);
    if (daysLeft !== 3) {
      continue;
    }

    const mail = await sendBillingNotification({
      type: "period_end_reminder",
      photographerId: row.photographer_id,
      correlationId,
      idempotencySuffix: `period_end:${row.current_period_end}`,
      context: {
        periodEnd: row.current_period_end,
      },
    });
    if (mail.sent) {
      result.periodEndRemindersSent += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    correlationId,
    ...result,
  });
}

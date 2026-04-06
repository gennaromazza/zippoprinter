import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe";
import { writeProcessAuditEvent } from "@/lib/process-audit";

function mapStripeStatus(status: string) {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "suspended";
  }
}

export async function resetTenantTrial(input: {
  photographerId: string;
  actorUserId: string;
  reason: string;
  ticketId?: string;
  correlationId: string;
  days?: number;
}) {
  const admin = createAdminClient();
  const days = Math.max(1, Math.min(input.days || 14, 30));
  const now = new Date();
  const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: input.photographerId,
    processArea: "override",
    action: "owner_trial_reset",
    status: "started",
    correlationId: input.correlationId,
    source: "lib.owner-billing",
    metadata: {
      reason: input.reason,
      ticketId: input.ticketId || null,
      days,
    },
  });

  const { data: existing } = await admin
    .from("tenant_subscriptions")
    .select("id, trial_end")
    .eq("photographer_id", input.photographerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existing) {
    await writeProcessAuditEvent({
      actorType: "owner",
      actorId: input.actorUserId,
      tenantId: input.photographerId,
      processArea: "override",
      action: "owner_trial_reset",
      status: "failed",
      correlationId: input.correlationId,
      source: "lib.owner-billing",
      errorMessage: "No subscription found",
      metadata: { reason: input.reason, ticketId: input.ticketId || null },
    });
    return { ok: false as const, status: 404 as const, message: "Nessuna subscription trovata per questo studio." };
  }

  const { error } = await admin
    .from("tenant_subscriptions")
    .update({
      status: "trialing",
      provider: "manual",
      trial_end: trialEnd,
      current_period_start: now.toISOString(),
      current_period_end: trialEnd,
      cancel_at_period_end: false,
      canceled_at: null,
      collection_state: "current",
      grace_period_ends_at: null,
      last_payment_failed_at: null,
      updated_at: now.toISOString(),
    })
    .eq("photographer_id", input.photographerId);

  if (error) {
    await writeProcessAuditEvent({
      actorType: "owner",
      actorId: input.actorUserId,
      tenantId: input.photographerId,
      processArea: "override",
      action: "owner_trial_reset",
      status: "failed",
      correlationId: input.correlationId,
      source: "lib.owner-billing",
      errorMessage: error.message,
      metadata: {
        reason: input.reason,
        ticketId: input.ticketId || null,
      },
    });
    return { ok: false as const, status: 500 as const, message: "Reset trial non riuscito." };
  }

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: input.photographerId,
    processArea: "override",
    action: "owner_trial_reset",
    status: "succeeded",
    correlationId: input.correlationId,
    source: "lib.owner-billing",
    beforeSnapshot: existing ? { trialEnd: existing.trial_end } : null,
    afterSnapshot: { status: "trialing", trialEnd },
    metadata: {
      reason: input.reason,
      ticketId: input.ticketId || null,
      days,
    },
  });

  return {
    ok: true as const,
    trialEnd,
  };
}

export async function reconcileTenantSubscription(input: {
  photographerId: string;
  actorUserId: string;
  correlationId: string;
}) {
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("tenant_subscriptions")
    .select("*")
    .eq("photographer_id", input.photographerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return {
      ok: false as const,
      status: 422 as const,
      message: "Nessuna subscription Stripe da riconciliare.",
    };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return {
      ok: false as const,
      status: 500 as const,
      message: "Stripe piattaforma non configurato.",
    };
  }

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: input.photographerId,
    processArea: "reconcile",
    action: "owner_reconcile_subscription",
    status: "started",
    correlationId: input.correlationId,
    source: "lib.owner-billing",
    beforeSnapshot: {
      status: sub.status,
      periodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    },
    metadata: {
      stripeSubscriptionId: sub.stripe_subscription_id,
    },
  });

  try {
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const status = mapStripeStatus(stripeSub.status);
    const periodStart = (stripeSub as unknown as { current_period_start?: number }).current_period_start;
    const periodEnd = (stripeSub as unknown as { current_period_end?: number }).current_period_end;

    await admin
      .from("tenant_subscriptions")
      .update({
        status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(stripeSub.cancel_at_period_end),
        trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("photographer_id", input.photographerId);

    await writeProcessAuditEvent({
      actorType: "owner",
      actorId: input.actorUserId,
      tenantId: input.photographerId,
      processArea: "reconcile",
      action: "owner_reconcile_subscription",
      status: "succeeded",
      correlationId: input.correlationId,
      source: "lib.owner-billing",
      afterSnapshot: {
        status,
        periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
      },
      metadata: {
        stripeSubscriptionId: sub.stripe_subscription_id,
      },
    });

    return {
      ok: true as const,
      status,
    };
  } catch (error) {
    await writeProcessAuditEvent({
      actorType: "owner",
      actorId: input.actorUserId,
      tenantId: input.photographerId,
      processArea: "reconcile",
      action: "owner_reconcile_subscription",
      status: "failed",
      correlationId: input.correlationId,
      source: "lib.owner-billing",
      errorMessage: error instanceof Error ? error.message : "Reconcile failed",
      metadata: {
        stripeSubscriptionId: sub.stripe_subscription_id,
      },
    });

    return {
      ok: false as const,
      status: 500 as const,
      message: "Riconciliazione non riuscita.",
    };
  }
}

export async function replayBillingWebhookEvent(input: {
  eventId: string;
  actorUserId: string;
  correlationId: string;
}) {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("billing_events")
    .select("event_id, photographer_id, event_type, processed_at")
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (!event?.event_id) {
    return { ok: false as const, status: 404 as const, message: "Evento non trovato." };
  }

  await admin
    .from("billing_events")
    .update({ processed_at: null })
    .eq("event_id", input.eventId);

  await writeProcessAuditEvent({
    actorType: "owner",
    actorId: input.actorUserId,
    tenantId: event.photographer_id || null,
    processArea: "webhook",
    action: "owner_webhook_replay_requested",
    status: "succeeded",
    correlationId: input.correlationId,
    source: "lib.owner-billing",
    metadata: {
      eventId: input.eventId,
      eventType: event.event_type,
      previousProcessedAt: event.processed_at,
    },
  });

  return { ok: true as const };
}

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type ProcessAuditActorType = "tenant" | "owner" | "system" | "stripe_webhook";
export type ProcessAuditArea =
  | "subscription"
  | "invoice"
  | "entitlement"
  | "access"
  | "webhook"
  | "reconcile"
  | "override";
export type ProcessAuditStatus = "started" | "succeeded" | "failed" | "rolled_back";

export interface ProcessAuditInput {
  eventId?: string;
  occurredAt?: string;
  actorType: ProcessAuditActorType;
  actorId?: string | null;
  tenantId?: string | null;
  processArea: ProcessAuditArea;
  action: string;
  status: ProcessAuditStatus;
  correlationId: string;
  idempotencyKey?: string | null;
  source: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export function createCorrelationId() {
  return crypto.randomUUID();
}

export function getCorrelationIdFromHeaders(headers: Headers) {
  const fromCorrelation = headers.get("x-correlation-id") || "";
  const fromRequestId = headers.get("x-request-id") || "";
  const value = (fromCorrelation || fromRequestId).trim();
  if (value.length >= 8 && value.length <= 128) {
    return value;
  }
  return createCorrelationId();
}

export async function writeProcessAuditEvent(input: ProcessAuditInput) {
  const admin = createAdminClient();
  const { error } = await admin.from("process_audit_events").insert({
    event_id: input.eventId || crypto.randomUUID(),
    occurred_at: input.occurredAt || new Date().toISOString(),
    actor_type: input.actorType,
    actor_id: input.actorId || null,
    tenant_id: input.tenantId || null,
    process_area: input.processArea,
    action: input.action,
    status: input.status,
    correlation_id: input.correlationId,
    idempotency_key: input.idempotencyKey || null,
    source: input.source,
    before_snapshot: input.beforeSnapshot || null,
    after_snapshot: input.afterSnapshot || null,
    metadata: input.metadata || {},
    error_code: input.errorCode || null,
    error_message: input.errorMessage || null,
  });

  return { error };
}

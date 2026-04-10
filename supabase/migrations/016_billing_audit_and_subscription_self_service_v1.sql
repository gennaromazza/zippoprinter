-- =============================================
-- STAMPISS - Billing self-service + Owner controls + Process Audit v1
-- =============================================

-- ---------------------------------------------
-- Platform admin roles (RBAC)
-- ---------------------------------------------

ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner_admin'
    CHECK (role IN ('owner_admin', 'owner_support', 'owner_readonly'));

CREATE INDEX IF NOT EXISTS platform_admins_role_idx
  ON platform_admins (role, is_active, created_at DESC);

-- ---------------------------------------------
-- Subscription lifecycle extensions
-- ---------------------------------------------

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS latest_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collection_state TEXT NOT NULL DEFAULT 'current'
    CHECK (collection_state IN ('current', 'grace', 'delinquent', 'recovered'));

CREATE INDEX IF NOT EXISTS tenant_subscriptions_collection_state_idx
  ON tenant_subscriptions (collection_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_grace_period_idx
  ON tenant_subscriptions (grace_period_ends_at, status);

-- ---------------------------------------------
-- Process audit stream (append-only)
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS process_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('tenant', 'owner', 'system', 'stripe_webhook')),
  actor_id TEXT,
  tenant_id UUID REFERENCES photographers(id) ON DELETE SET NULL,
  process_area TEXT NOT NULL
    CHECK (process_area IN ('subscription', 'invoice', 'entitlement', 'access', 'webhook', 'reconcile', 'override')),
  action TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('started', 'succeeded', 'failed', 'rolled_back')),
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT,
  source TEXT NOT NULL,
  before_snapshot JSONB,
  after_snapshot JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS process_audit_events_occurred_idx
  ON process_audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS process_audit_events_tenant_idx
  ON process_audit_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS process_audit_events_area_status_idx
  ON process_audit_events (process_area, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS process_audit_events_correlation_idx
  ON process_audit_events (correlation_id, occurred_at ASC);

ALTER TABLE process_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read process audit events" ON process_audit_events;
CREATE POLICY "Platform admins can read process audit events" ON process_audit_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS "Photographers can read own process audit events" ON process_audit_events;
CREATE POLICY "Photographers can read own process audit events" ON process_audit_events
  FOR SELECT USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM photographers p
      WHERE p.id = process_audit_events.tenant_id
        AND p.auth_user_id = auth.uid()
    )
  );

-- No UPDATE / DELETE policies: append-only for application users.

-- ---------------------------------------------
-- Plan metadata hardening for Stripe mapping
-- ---------------------------------------------

COMMENT ON COLUMN subscription_plans.metadata IS
  'Expected keys: stripe_price_id, stripe_tax_behavior, is_public, trial_days, allow_self_service';

-- ---------------------------------------------
-- Jobs for lifecycle/reconciliation bookkeeping
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS billing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type TEXT NOT NULL
    CHECK (job_type IN ('trial_expiry', 'dunning', 'reconcile', 'webhook_replay', 'audit_retention')),
  scope_tenant_id UUID REFERENCES photographers(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  idempotency_key TEXT,
  correlation_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_jobs_type_status_idx
  ON billing_jobs (job_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_jobs_tenant_idx
  ON billing_jobs (scope_tenant_id, created_at DESC);

DROP TRIGGER IF EXISTS billing_jobs_updated_at ON billing_jobs;
CREATE TRIGGER billing_jobs_updated_at
  BEFORE UPDATE ON billing_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE billing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read billing jobs" ON billing_jobs;
CREATE POLICY "Platform admins can read billing jobs" ON billing_jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

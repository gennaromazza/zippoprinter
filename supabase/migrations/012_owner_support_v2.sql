-- =============================================
-- ZIPPOPRINTER - Owner Support V2
-- Password recovery + studio access status controls
-- =============================================

ALTER TABLE tenant_billing_accounts
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active', 'temporarily_blocked', 'suspended')),
  ADD COLUMN IF NOT EXISTS access_status_reason TEXT,
  ADD COLUMN IF NOT EXISTS access_status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS access_status_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE tenant_billing_accounts
SET
  access_status = COALESCE(access_status, 'active'),
  access_status_updated_at = COALESCE(access_status_updated_at, NOW())
WHERE access_status IS NULL
   OR access_status_updated_at IS NULL;

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_access_status_idx
  ON tenant_billing_accounts (access_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_support_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('password_reset_email', 'access_status_update')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('success', 'rate_limited', 'invalid_state', 'failed')),
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_support_actions_photographer_idx
  ON platform_support_actions (photographer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_support_actions_actor_idx
  ON platform_support_actions (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_support_actions_type_idx
  ON platform_support_actions (action_type, outcome, created_at DESC);

ALTER TABLE platform_support_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can read support actions" ON platform_support_actions;
CREATE POLICY "Platform admins can read support actions" ON platform_support_actions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS "Platform admins can insert support actions" ON platform_support_actions;
CREATE POLICY "Platform admins can insert support actions" ON platform_support_actions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP TRIGGER IF EXISTS platform_support_actions_updated_at ON platform_support_actions;
CREATE TRIGGER platform_support_actions_updated_at
  BEFORE UPDATE ON platform_support_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE VIEW platform_tenant_overview AS
SELECT
  p.id AS photographer_id,
  p.name,
  p.email,
  p.created_at,
  COALESCE(s.status, 'trialing'::text) AS subscription_status,
  sp.code AS subscription_plan_code,
  s.current_period_end AS subscription_period_end,
  b.connect_status,
  COALESCE(b.connect_status = 'connected' AND b.charges_enabled = true AND b.payouts_enabled = true, false) AS connect_ready,
  COALESCE(b.access_status, 'active'::text) AS access_status,
  d.domain AS primary_domain,
  d.verification_status AS domain_verification_status,
  d.ssl_status AS domain_ssl_status,
  d.is_active AS domain_active,
  e.event_type AS last_event_type,
  e.created_at AS last_event_at
FROM photographers p
LEFT JOIN LATERAL (
  SELECT *
  FROM tenant_subscriptions ts
  WHERE ts.photographer_id = p.id
  ORDER BY ts.updated_at DESC, ts.created_at DESC
  LIMIT 1
) s ON true
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN tenant_billing_accounts b ON b.photographer_id = p.id
LEFT JOIN LATERAL (
  SELECT *
  FROM tenant_domains td
  WHERE td.photographer_id = p.id
  ORDER BY td.is_active DESC, td.updated_at DESC, td.created_at DESC
  LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT event_type, created_at
  FROM billing_events be
  WHERE be.photographer_id = p.id
  ORDER BY be.created_at DESC
  LIMIT 1
) e ON true;

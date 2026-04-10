-- =============================================
-- STAMPISS - Platform Owner Dashboard V1
-- =============================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_admins_active_idx
  ON platform_admins (is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_alert_ack (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_key TEXT NOT NULL UNIQUE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_alert_ack_acknowledged_idx
  ON platform_alert_ack (acknowledged_at DESC);

CREATE INDEX IF NOT EXISTS tenant_subscriptions_owner_status_idx
  ON tenant_subscriptions (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_accounts_owner_connect_idx
  ON tenant_billing_accounts (connect_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS tenant_domains_owner_status_idx
  ON tenant_domains (verification_status, ssl_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS billing_events_owner_event_idx
  ON billing_events (source, event_type, created_at DESC);

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

CREATE OR REPLACE VIEW platform_kpi_snapshot AS
SELECT
  NOW() AS generated_at,
  (SELECT COUNT(*) FROM photographers) AS tenants_total,
  (SELECT COUNT(*) FROM tenant_subscriptions WHERE status IN ('trialing', 'active', 'lifetime')) AS tenants_active,
  (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'trialing') AS tenants_trialing,
  (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'past_due') AS tenants_past_due,
  (SELECT COUNT(*) FROM tenant_subscriptions WHERE status = 'suspended') AS tenants_suspended,
  (SELECT COUNT(*) FROM tenant_billing_accounts WHERE connect_status = 'connected') AS connect_connected,
  (SELECT COUNT(*) FROM tenant_billing_accounts WHERE connect_status IN ('not_connected', 'pending')) AS connect_pending,
  (SELECT COUNT(*) FROM tenant_billing_accounts WHERE connect_status IN ('restricted', 'disabled')) AS connect_restricted,
  (SELECT COUNT(*) FROM tenant_domains WHERE is_active = true) AS domains_active,
  (SELECT COUNT(*) FROM tenant_domains WHERE verification_status = 'pending' OR ssl_status = 'pending') AS domains_pending,
  (SELECT COUNT(*) FROM tenant_domains WHERE verification_status = 'failed' OR ssl_status = 'failed') AS domains_failed,
  (
    SELECT COUNT(*)
    FROM billing_events
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  ) AS webhook_events_last_24h,
  (
    SELECT COUNT(*)
    FROM billing_events
    WHERE processed_at IS NULL
      AND created_at < NOW() - INTERVAL '10 minutes'
  ) AS webhook_unprocessed_over_10m;

CREATE OR REPLACE VIEW platform_alert_feed AS
SELECT
  'subscription:' || p.id::text || ':' || ts.status AS alert_key,
  p.id AS photographer_id,
  'critical'::text AS severity,
  'subscription_state'::text AS alert_type,
  CASE
    WHEN ts.status = 'past_due' THEN 'Tenant in past_due: online payments/domain should be reviewed.'
    ELSE 'Tenant suspended: service capabilities likely restricted.'
  END AS message,
  ts.updated_at AS created_at,
  '/docs/runbooks/billing-lifecycle.md'::text AS runbook_path
FROM tenant_subscriptions ts
JOIN photographers p ON p.id = ts.photographer_id
WHERE ts.status IN ('past_due', 'suspended')

UNION ALL

SELECT
  'connect:' || p.id::text AS alert_key,
  p.id AS photographer_id,
  'warning'::text AS severity,
  'connect_not_ready'::text AS alert_type,
  'Stripe Connect not ready while tenant has online payments entitlement.' AS message,
  COALESCE(b.updated_at, NOW()) AS created_at,
  '/docs/runbooks/billing-lifecycle.md'::text AS runbook_path
FROM photographers p
JOIN tenant_entitlements te ON te.photographer_id = p.id
LEFT JOIN tenant_billing_accounts b ON b.photographer_id = p.id
WHERE te.can_accept_online_payments = true
  AND (
    b.photographer_id IS NULL
    OR b.connect_status <> 'connected'
    OR b.charges_enabled = false
    OR b.payouts_enabled = false
  )

UNION ALL

SELECT
  'domain:' || td.id::text AS alert_key,
  td.photographer_id,
  CASE
    WHEN td.verification_status = 'failed' OR td.ssl_status = 'failed' THEN 'critical'
    ELSE 'warning'
  END AS severity,
  'domain_health'::text AS alert_type,
  CASE
    WHEN td.verification_status = 'failed' THEN 'Domain verification failed.'
    WHEN td.ssl_status = 'failed' THEN 'Domain SSL provisioning failed.'
    ELSE 'Domain pending too long: verification or SSL still not ready after 24h.'
  END AS message,
  td.updated_at AS created_at,
  '/docs/runbooks/domain-onboarding.md'::text AS runbook_path
FROM tenant_domains td
WHERE td.verification_status = 'failed'
   OR td.ssl_status = 'failed'
   OR (
      td.verification_status = 'verified'
      AND td.ssl_status = 'pending'
      AND td.created_at < NOW() - INTERVAL '24 hours'
   )

UNION ALL

SELECT
  'webhook:unprocessed'::text AS alert_key,
  NULL::uuid AS photographer_id,
  'warning'::text AS severity,
  'webhook_backlog'::text AS alert_type,
  'One or more webhook events are still unprocessed after 10 minutes.' AS message,
  MIN(be.created_at) AS created_at,
  '/docs/security/incident-playbook.md'::text AS runbook_path
FROM billing_events be
WHERE be.processed_at IS NULL
  AND be.created_at < NOW() - INTERVAL '10 minutes'
GROUP BY 1,2,3,4,5,7;

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_alert_ack ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admin can view own row" ON platform_admins;
CREATE POLICY "Platform admin can view own row" ON platform_admins
  FOR SELECT USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Platform admins can read alert acknowledgements" ON platform_alert_ack;
CREATE POLICY "Platform admins can read alert acknowledgements" ON platform_alert_ack
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM platform_admins pa
      WHERE pa.auth_user_id = auth.uid()
        AND pa.is_active = true
    )
  );

DROP TRIGGER IF EXISTS platform_admins_updated_at ON platform_admins;
CREATE TRIGGER platform_admins_updated_at
  BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS platform_alert_ack_updated_at ON platform_alert_ack;
CREATE TRIGGER platform_alert_ack_updated_at
  BEFORE UPDATE ON platform_alert_ack
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

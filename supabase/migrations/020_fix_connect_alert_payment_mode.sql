-- =============================================
-- STAMPISS - Fix connect_not_ready alert logic
-- Migration: 020_fix_connect_alert_payment_mode
-- =============================================
--
-- Problem: platform_alert_feed fired a "connect_not_ready" alert for every
-- photographer that had can_accept_online_payments = true but no Stripe Connect
-- account configured. Since can_accept_online_payments is set to true for ALL
-- trialing/active tenants, this meant EVERY new photographer triggered the
-- alert even if their payment_mode was 'pay_in_store' and they never intended
-- to use online payments.
--
-- Fix: the connect_not_ready alert now fires ONLY when the photographer has
-- explicitly configured a payment_mode that requires Stripe Connect
-- ('online_full' or 'deposit_plus_studio'). Photographers on 'pay_in_store'
-- (the default) are excluded.
-- =============================================

CREATE OR REPLACE VIEW platform_alert_feed AS

-- 1. Subscription state alerts (past_due / suspended)
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

-- 2. Stripe Connect not ready — only for photographers who actively use online payments.
--    Photographers on 'pay_in_store' (the default) do not need Stripe Connect and are excluded.
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
  -- Only alert when the photographer has chosen a mode that actually requires Connect.
  AND COALESCE(p.payment_mode, 'pay_in_store') IN ('online_full', 'deposit_plus_studio')
  AND (
    b.photographer_id IS NULL
    OR b.connect_status <> 'connected'
    OR b.charges_enabled = false
    OR b.payouts_enabled = false
  )

UNION ALL

-- 3. Domain health alerts
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

-- 4. Webhook backlog (re-include from original migration 010)
SELECT
  'webhook:unprocessed'::text AS alert_key,
  NULL::uuid AS photographer_id,
  'warning'::text AS severity,
  'webhook_backlog'::text AS alert_type,
  'Unprocessed webhook events older than 30 minutes detected.' AS message,
  MIN(be.created_at) AS created_at,
  '/docs/runbooks/billing-lifecycle.md'::text AS runbook_path
FROM billing_events be
WHERE be.processed_at IS NULL
  AND be.created_at < NOW() - INTERVAL '30 minutes'
HAVING COUNT(*) > 0;

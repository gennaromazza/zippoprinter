-- =============================================
-- ZIPPOPRINTER - SaaS multi-tenant foundation v2
-- Stripe Connect + Subscriptions + Custom Domains
-- =============================================

-- Orders payment snapshot for connected account context
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id TEXT;

-- ---------------------------------------------
-- Billing and subscription core
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_billing_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID NOT NULL UNIQUE REFERENCES photographers(id) ON DELETE CASCADE,
  stripe_connect_account_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  connect_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (connect_status IN ('not_connected', 'pending', 'connected', 'restricted', 'disabled')),
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  details_submitted BOOLEAN NOT NULL DEFAULT false,
  onboarding_completed_at TIMESTAMPTZ,
  legacy_checkout_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  billing_mode TEXT NOT NULL
    CHECK (billing_mode IN ('monthly', 'yearly', 'lifetime')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'eur',
  is_active BOOLEAN NOT NULL DEFAULT true,
  feature_caps JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'suspended', 'lifetime')),
  provider TEXT NOT NULL DEFAULT 'stripe'
    CHECK (provider IN ('stripe', 'manual')),
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  is_lifetime BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscriptions_photographer_active_unique
  ON tenant_subscriptions (photographer_id)
  WHERE status IN ('trialing', 'active', 'past_due', 'lifetime');

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  photographer_id UUID PRIMARY KEY REFERENCES photographers(id) ON DELETE CASCADE,
  can_accept_online_payments BOOLEAN NOT NULL DEFAULT false,
  can_use_custom_domain BOOLEAN NOT NULL DEFAULT false,
  max_monthly_orders INTEGER,
  max_storage_gb INTEGER,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL
    CHECK (source IN ('stripe_order', 'stripe_platform', 'domain', 'manual')),
  event_type TEXT NOT NULL,
  photographer_id UUID REFERENCES photographers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_events_photographer_idx
  ON billing_events (photographer_id, created_at DESC);

-- ---------------------------------------------
-- Custom domains
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'failed')),
  ssl_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending', 'ready', 'failed')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  dns_target TEXT,
  provider_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  verified_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_active_per_photographer_unique
  ON tenant_domains (photographer_id)
  WHERE is_active = true;

-- ---------------------------------------------
-- Auditing
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID REFERENCES photographers(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_photographer_idx
  ON audit_logs (photographer_id, created_at DESC);

-- ---------------------------------------------
-- Seed plans
-- ---------------------------------------------

INSERT INTO subscription_plans (code, name, billing_mode, price_cents, currency, feature_caps)
VALUES
  ('starter_monthly', 'Starter Mensile', 'monthly', 600, 'eur', '{"custom_domain": true, "online_payments": true}'::jsonb),
  ('starter_yearly', 'Starter Annuale', 'yearly', 5000, 'eur', '{"custom_domain": true, "online_payments": true}'::jsonb),
  ('lifetime_buyout', 'Licenza Lifetime', 'lifetime', 100000, 'eur', '{"custom_domain": true, "online_payments": true}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------
-- Backfill existing tenants
-- ---------------------------------------------

INSERT INTO tenant_billing_accounts (photographer_id, connect_status, legacy_checkout_enabled)
SELECT p.id, 'not_connected', true
FROM photographers p
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_billing_accounts t
  WHERE t.photographer_id = p.id
);

INSERT INTO tenant_entitlements (photographer_id, can_accept_online_payments, can_use_custom_domain, features)
SELECT p.id, false, false, '{}'::jsonb
FROM photographers p
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_entitlements e
  WHERE e.photographer_id = p.id
);

INSERT INTO tenant_subscriptions (
  photographer_id,
  plan_id,
  status,
  provider,
  trial_end,
  current_period_start,
  current_period_end,
  is_lifetime
)
SELECT
  p.id,
  sp.id,
  'trialing',
  'manual',
  NOW() + INTERVAL '14 days',
  NOW(),
  NOW() + INTERVAL '14 days',
  false
FROM photographers p
JOIN subscription_plans sp ON sp.code = 'starter_monthly'
WHERE NOT EXISTS (
  SELECT 1
  FROM tenant_subscriptions s
  WHERE s.photographer_id = p.id
);

-- ---------------------------------------------
-- RLS policies
-- ---------------------------------------------

ALTER TABLE tenant_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers can view own tenant billing account" ON tenant_billing_accounts;
CREATE POLICY "Photographers can view own tenant billing account" ON tenant_billing_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_billing_accounts.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can update own tenant billing account" ON tenant_billing_accounts;
CREATE POLICY "Photographers can update own tenant billing account" ON tenant_billing_accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_billing_accounts.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_billing_accounts.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated can read active plans" ON subscription_plans;
CREATE POLICY "Authenticated can read active plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Photographers can view own subscriptions" ON tenant_subscriptions;
CREATE POLICY "Photographers can view own subscriptions" ON tenant_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_subscriptions.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can view own entitlements" ON tenant_entitlements;
CREATE POLICY "Photographers can view own entitlements" ON tenant_entitlements
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_entitlements.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can view own domains" ON tenant_domains;
CREATE POLICY "Photographers can view own domains" ON tenant_domains
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_domains.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can insert own domains" ON tenant_domains;
CREATE POLICY "Photographers can insert own domains" ON tenant_domains
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_domains.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can update own domains" ON tenant_domains;
CREATE POLICY "Photographers can update own domains" ON tenant_domains
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_domains.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_domains.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can delete own domains" ON tenant_domains;
CREATE POLICY "Photographers can delete own domains" ON tenant_domains
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = tenant_domains.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can view own audit logs" ON audit_logs;
CREATE POLICY "Photographers can view own audit logs" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM photographers
      WHERE photographers.id = audit_logs.photographer_id
        AND photographers.auth_user_id = auth.uid()
    )
  );

-- ---------------------------------------------
-- Triggers
-- ---------------------------------------------

DROP TRIGGER IF EXISTS tenant_billing_accounts_updated_at ON tenant_billing_accounts;
CREATE TRIGGER tenant_billing_accounts_updated_at
  BEFORE UPDATE ON tenant_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tenant_subscriptions_updated_at ON tenant_subscriptions;
CREATE TRIGGER tenant_subscriptions_updated_at
  BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tenant_domains_updated_at ON tenant_domains;
CREATE TRIGGER tenant_domains_updated_at
  BEFORE UPDATE ON tenant_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

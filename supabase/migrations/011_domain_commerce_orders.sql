-- STAMPISS - Domain commerce orders (Openprovider phase 2)

CREATE TABLE IF NOT EXISTS domain_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photographer_id UUID NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openprovider',
  status TEXT NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('quoted', 'purchased', 'failed')),
  period_years INTEGER NOT NULL DEFAULT 1 CHECK (period_years >= 1 AND period_years <= 10),
  currency TEXT NOT NULL DEFAULT 'EUR',
  provider_cost_cents INTEGER NOT NULL DEFAULT 0,
  sale_price_cents INTEGER NOT NULL DEFAULT 0,
  margin_cents INTEGER NOT NULL DEFAULT 0,
  provider_order_id TEXT,
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_purchase_orders_photographer
  ON domain_purchase_orders (photographer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_purchase_orders_domain
  ON domain_purchase_orders (domain);

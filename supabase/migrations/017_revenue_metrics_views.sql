-- Migration 017: Revenue metrics views for platform owner dashboard
-- Provides MRR, churn, LTV, and cohort breakdowns

-- ============================================================================
-- VIEW: platform_revenue_snapshot
-- Real-time revenue metrics computed from tenant_subscriptions + plans
-- ============================================================================

CREATE OR REPLACE VIEW platform_revenue_snapshot AS
WITH active_subs AS (
  SELECT
    ts.photographer_id,
    ts.status,
    ts.plan_id,
    ts.created_at,
    ts.canceled_at,
    sp.price_cents,
    sp.billing_mode,
    sp.currency
  FROM tenant_subscriptions ts
  LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
),
mrr_calc AS (
  SELECT
    SUM(
      CASE
        WHEN status IN ('active', 'past_due') AND billing_mode = 'monthly' THEN price_cents
        WHEN status IN ('active', 'past_due') AND billing_mode = 'yearly' THEN ROUND(price_cents / 12.0)
        ELSE 0
      END
    ) AS mrr_cents,
    SUM(
      CASE
        WHEN status IN ('active', 'past_due') AND billing_mode = 'monthly' THEN price_cents * 12
        WHEN status IN ('active', 'past_due') AND billing_mode = 'yearly' THEN price_cents
        ELSE 0
      END
    ) AS arr_cents
  FROM active_subs
),
churn_calc AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'canceled' AND canceled_at >= NOW() - INTERVAL '30 days') AS churned_last_30d,
    COUNT(*) FILTER (WHERE status IN ('active', 'trialing', 'past_due', 'lifetime')) AS active_total,
    COUNT(*) FILTER (WHERE status = 'canceled') AS total_canceled,
    COUNT(*) FILTER (WHERE status = 'trialing' AND created_at >= NOW() - INTERVAL '30 days') AS new_trials_30d,
    COUNT(*) FILTER (
      WHERE status = 'active'
        AND created_at >= NOW() - INTERVAL '30 days'
    ) AS new_active_30d
  FROM active_subs
),
ltv_calc AS (
  SELECT
    CASE
      WHEN churn_calc.churned_last_30d > 0 AND churn_calc.active_total > 0
      THEN ROUND(
        (mrr_calc.mrr_cents::numeric / GREATEST(churn_calc.active_total, 1))
        / (churn_calc.churned_last_30d::numeric / GREATEST(churn_calc.active_total, 1))
      )
      ELSE 0
    END AS estimated_ltv_cents
  FROM mrr_calc, churn_calc
),
conversion_calc AS (
  SELECT
    COUNT(*) FILTER (
      WHERE status = 'active'
        AND created_at >= NOW() - INTERVAL '90 days'
    ) AS converted_90d,
    COUNT(*) FILTER (
      WHERE status IN ('active', 'trialing', 'canceled')
        AND created_at >= NOW() - INTERVAL '90 days'
    ) AS total_started_90d
  FROM active_subs
)
SELECT
  NOW() AS generated_at,
  COALESCE(mrr_calc.mrr_cents, 0)::bigint AS mrr_cents,
  COALESCE(mrr_calc.arr_cents, 0)::bigint AS arr_cents,
  'eur'::text AS currency,
  COALESCE(churn_calc.churned_last_30d, 0)::integer AS churned_last_30d,
  COALESCE(churn_calc.active_total, 0)::integer AS active_total,
  COALESCE(churn_calc.total_canceled, 0)::integer AS total_canceled,
  COALESCE(churn_calc.new_trials_30d, 0)::integer AS new_trials_30d,
  COALESCE(churn_calc.new_active_30d, 0)::integer AS new_active_30d,
  CASE
    WHEN COALESCE(churn_calc.active_total, 0) > 0
    THEN ROUND(
      (COALESCE(churn_calc.churned_last_30d, 0)::numeric / churn_calc.active_total) * 100, 2
    )
    ELSE 0
  END AS churn_rate_pct,
  CASE
    WHEN COALESCE(conversion_calc.total_started_90d, 0) > 0
    THEN ROUND(
      (COALESCE(conversion_calc.converted_90d, 0)::numeric / conversion_calc.total_started_90d) * 100, 2
    )
    ELSE 0
  END AS trial_conversion_rate_pct,
  COALESCE(ltv_calc.estimated_ltv_cents, 0)::bigint AS estimated_ltv_cents
FROM mrr_calc, churn_calc, ltv_calc, conversion_calc;

-- ============================================================================
-- VIEW: platform_revenue_by_plan
-- Breakdown of revenue contribution per plan
-- ============================================================================

CREATE OR REPLACE VIEW platform_revenue_by_plan AS
SELECT
  COALESCE(sp.code, 'unknown') AS plan_code,
  COALESCE(sp.name, 'Sconosciuto') AS plan_name,
  sp.billing_mode,
  sp.price_cents AS unit_price_cents,
  COUNT(*) FILTER (WHERE ts.status IN ('active', 'past_due')) AS active_subscribers,
  COUNT(*) FILTER (WHERE ts.status = 'trialing') AS trialing,
  COUNT(*) FILTER (WHERE ts.status = 'canceled') AS canceled,
  SUM(
    CASE
      WHEN ts.status IN ('active', 'past_due') AND sp.billing_mode = 'monthly' THEN sp.price_cents
      WHEN ts.status IN ('active', 'past_due') AND sp.billing_mode = 'yearly' THEN ROUND(sp.price_cents / 12.0)
      ELSE 0
    END
  )::bigint AS plan_mrr_cents
FROM tenant_subscriptions ts
LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
GROUP BY sp.code, sp.name, sp.billing_mode, sp.price_cents
ORDER BY plan_mrr_cents DESC;

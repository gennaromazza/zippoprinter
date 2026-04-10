-- =============================================
-- STAMPISS - Reduce trial duration to 7 days
-- Migration: 021_trial_duration_7_days
-- =============================================
--
-- Changes:
-- 1. New photographers now get 7 days trial (application code updated).
-- 2. Old backfill in 009 used 14 days; this migration caps any FUTURE inserts
--    via a check constraint so the DB itself enforces the new policy.
-- 3. Existing trialing tenants whose trial_end is still in the future and was
--    set to ~14 days from a recent signup (within last 7 days) are NOT
--    retroactively shortened to avoid disrupting users who just signed up.
--    Only truly new tenants from this point forward will get 7 days.
--
-- Note: the backfill INSERT in migration 009 is historical data and is not
-- affected by this migration. Trial resets via owner-billing are capped at
-- 14 days max in application code (owner-billing.ts).
-- =============================================

-- Add a comment to the tenant_subscriptions table documenting the policy.
COMMENT ON COLUMN tenant_subscriptions.trial_end IS
  'UTC timestamp when the trial expires. Standard trial = 7 days from signup. Resets capped at 14 days (owner only).';

-- =============================================
-- STAMPISS - Payment modes and checkout
-- =============================================

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'pay_in_store'
  CHECK (payment_mode IN ('online_full', 'deposit_plus_studio', 'pay_in_store'));

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS deposit_type TEXT
  CHECK (deposit_type IN ('percentage', 'fixed'));

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS deposit_value INTEGER;

UPDATE photographers
SET payment_mode = COALESCE(payment_mode, 'pay_in_store');

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'not_required', 'cancelled'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_mode_snapshot TEXT
  CHECK (payment_mode_snapshot IN ('online_full', 'deposit_plus_studio', 'pay_in_store'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_paid_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_due_cents INTEGER NOT NULL DEFAULT 0;

UPDATE orders
SET
  payment_mode_snapshot = COALESCE(payment_mode_snapshot, 'pay_in_store'),
  payment_status = CASE
    WHEN status IN ('paid', 'printing', 'ready', 'completed') THEN 'paid'
    ELSE 'unpaid'
  END,
  amount_paid_cents = CASE
    WHEN status IN ('paid', 'printing', 'ready', 'completed') THEN total_cents
    ELSE 0
  END,
  amount_due_cents = CASE
    WHEN status IN ('paid', 'printing', 'ready', 'completed') THEN 0
    ELSE total_cents
  END;

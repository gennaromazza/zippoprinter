-- Add idempotency key to orders to prevent duplicate submissions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Partial unique index: only enforce uniqueness for non-null keys
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

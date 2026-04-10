-- =============================================
-- STAMPISS - Coupons v1
-- =============================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  discount_mode TEXT NOT NULL CHECK (discount_mode IN ('fixed', 'percent')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  max_discount_cents INTEGER CHECK (max_discount_cents IS NULL OR max_discount_cents > 0),
  min_order_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemptions_count INTEGER NOT NULL DEFAULT 0 CHECK (redemptions_count >= 0),
  per_customer_limit INTEGER CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupons_valid_window_chk CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_photographer_code_unique
  ON public.coupons (photographer_id, upper(code));

CREATE INDEX IF NOT EXISTS coupons_photographer_status_idx
  ON public.coupons (photographer_id, status, valid_until);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  photographer_id UUID NOT NULL REFERENCES public.photographers(id) ON DELETE CASCADE,
  customer_email TEXT NOT NULL,
  discount_applied_cents INTEGER NOT NULL CHECK (discount_applied_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupon_redemptions_coupon_order_unique UNIQUE (coupon_id, order_id)
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx
  ON public.coupon_redemptions (coupon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS coupon_redemptions_customer_idx
  ON public.coupon_redemptions (coupon_id, customer_email);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (coupon_discount_cents >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_before_discount_cents INTEGER;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photographers can manage own coupons" ON public.coupons;
CREATE POLICY "Photographers can manage own coupons" ON public.coupons
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.photographers p
      WHERE p.id = coupons.photographer_id
        AND p.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Photographers can read own coupon redemptions" ON public.coupon_redemptions;
CREATE POLICY "Photographers can read own coupon redemptions" ON public.coupon_redemptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.photographers p
      WHERE p.id = coupon_redemptions.photographer_id
        AND p.auth_user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS coupons_updated_at ON public.coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ZIPPOPRINTER - Quantity pricing tiers for print formats
-- =============================================

ALTER TABLE print_formats
  ADD COLUMN IF NOT EXISTS quantity_price_tiers JSONB DEFAULT '[]'::jsonb;

UPDATE print_formats
SET quantity_price_tiers = '[]'::jsonb
WHERE quantity_price_tiers IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'print_formats_quantity_price_tiers_is_array'
  ) THEN
    ALTER TABLE print_formats
      ADD CONSTRAINT print_formats_quantity_price_tiers_is_array
      CHECK (jsonb_typeof(quantity_price_tiers) = 'array');
  END IF;
END $$;

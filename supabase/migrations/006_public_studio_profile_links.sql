-- =============================================
-- STAMPISS - Public studio profile links
-- =============================================

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS instagram_url TEXT;

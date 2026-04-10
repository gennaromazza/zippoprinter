-- =============================================
-- STAMPISS - Logo positioning controls
-- =============================================

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS logo_position_x SMALLINT DEFAULT 50;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS logo_position_y SMALLINT DEFAULT 50;

UPDATE photographers
SET
  logo_position_x = COALESCE(logo_position_x, 50),
  logo_position_y = COALESCE(logo_position_y, 50)
WHERE logo_position_x IS NULL
   OR logo_position_y IS NULL;

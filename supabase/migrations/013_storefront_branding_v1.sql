-- ZIPPOPRINTER - Storefront branding v1 (preset + background + theme)

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS storefront_theme_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_layout_preset TEXT NOT NULL DEFAULT 'classic'
    CHECK (storefront_layout_preset IN ('classic', 'hero_left', 'hero_center', 'hero_split')),
  ADD COLUMN IF NOT EXISTS storefront_bg_image_url TEXT,
  ADD COLUMN IF NOT EXISTS storefront_bg_scope TEXT NOT NULL DEFAULT 'header'
    CHECK (storefront_bg_scope IN ('header', 'page')),
  ADD COLUMN IF NOT EXISTS storefront_bg_overlay_opacity INTEGER NOT NULL DEFAULT 35
    CHECK (storefront_bg_overlay_opacity >= 0 AND storefront_bg_overlay_opacity <= 100),
  ADD COLUMN IF NOT EXISTS storefront_color_primary TEXT,
  ADD COLUMN IF NOT EXISTS storefront_color_secondary TEXT,
  ADD COLUMN IF NOT EXISTS storefront_color_text TEXT,
  ADD COLUMN IF NOT EXISTS storefront_cta_align TEXT NOT NULL DEFAULT 'left'
    CHECK (storefront_cta_align IN ('left', 'center', 'right'));

UPDATE photographers
SET storefront_layout_preset = COALESCE(storefront_layout_preset, 'classic'),
    storefront_bg_scope = COALESCE(storefront_bg_scope, 'header'),
    storefront_bg_overlay_opacity = COALESCE(storefront_bg_overlay_opacity, 35),
    storefront_cta_align = COALESCE(storefront_cta_align, 'left');

import type {
  Photographer,
  StorefrontBgScope,
  StorefrontCtaAlign,
  StorefrontLayoutPreset,
} from "@/lib/types";

const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const normalized = (value || "").trim();
  if (!HEX_COLOR_REGEX.test(normalized)) {
    return fallback;
  }
  return normalized.toUpperCase();
}

function hexToRgb(hex: string) {
  const safeHex = normalizeHexColor(hex, "#000000").slice(1);
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

function luminanceChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  const r = luminanceChannel(rgb.r);
  const g = luminanceChannel(rgb.g);
  const b = luminanceChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastTextColor(backgroundHex: string) {
  return getRelativeLuminance(backgroundHex) > 0.45 ? "#1A1A1A" : "#FFFFFF";
}

export function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

export interface ResolvedStorefrontTheme {
  enabled: boolean;
  layoutPreset: StorefrontLayoutPreset;
  bgScope: StorefrontBgScope;
  ctaAlign: StorefrontCtaAlign;
  bgImageUrl: string;
  overlayOpacity: number;
  primary: string;
  secondary: string;
  text: string;
  primaryContrast: string;
}

export function resolveStorefrontTheme(photographer: Photographer): ResolvedStorefrontTheme {
  const enabled = Boolean(photographer.storefront_theme_enabled);
  const layoutPreset = (
    photographer.storefront_layout_preset || "classic"
  ) as StorefrontLayoutPreset;
  const bgScope = (photographer.storefront_bg_scope || "header") as StorefrontBgScope;
  const ctaAlign = (photographer.storefront_cta_align || "left") as StorefrontCtaAlign;
  const bgImageUrl = (photographer.storefront_bg_image_url || "").trim();
  const overlayOpacity = clamp(
    Number.parseInt(String(photographer.storefront_bg_overlay_opacity ?? 35), 10) || 35,
    0,
    100
  );

  const primary = normalizeHexColor(
    photographer.storefront_color_primary || photographer.brand_color,
    "#D97942"
  );
  const secondary = normalizeHexColor(photographer.storefront_color_secondary, "#F3E4D7");
  const text = normalizeHexColor(photographer.storefront_color_text, "#2B211C");
  const primaryContrast = getContrastTextColor(primary);

  return {
    enabled,
    layoutPreset,
    bgScope,
    ctaAlign,
    bgImageUrl,
    overlayOpacity,
    primary,
    secondary,
    text,
    primaryContrast,
  };
}

export const LEGAL_DOCUMENT_VERSION = "2026-04-08";

export const LEGAL_LINKS = {
  privacyPolicy: "/legal/privacy",
  cookiePolicy: "/legal/cookie",
  termsOfService: "/legal/terms",
} as const;

export const COOKIE_CONSENT_STORAGE_KEY = "stampiss.cookie-consent.v1";
export const COOKIE_CONSENT_COOKIE_NAME = "zp_cookie_consent";

export const PRIVACY_CONSENT_SOURCES = [
  "cookie_banner",
  "signup",
  "public_order",
  "settings",
] as const;

export const PRIVACY_CONSENT_KEYS = [
  "cookie_preferences",
  "privacy_notice",
  "terms_of_service",
  "marketing_emails",
] as const;

export const PRIVACY_CONSENT_SUBJECT_TYPES = [
  "anonymous_visitor",
  "studio_user",
  "customer",
] as const;

export const PRIVACY_CONSENT_DECISIONS = [
  "accept_all",
  "reject_optional",
  "custom",
  "acknowledged",
] as const;

export type CookieConsentDecision = "accept_all" | "reject_optional" | "custom";

export interface CookieConsentPreferences {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decision: CookieConsentDecision;
  version: string;
  decidedAt: string;
}

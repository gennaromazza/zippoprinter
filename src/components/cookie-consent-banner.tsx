"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_LINKS,
  type CookieConsentDecision,
  type CookieConsentPreferences,
} from "@/lib/privacy-consent";

function readCookie(name: string) {
  const cookieParts = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const prefix = `${name}=`;
  const match = cookieParts.find((part) => part.startsWith(prefix));
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function parsePreferences(raw: string | null): CookieConsentPreferences | null {
  if (!raw) {
    return null;
  }

  try {
    const data = JSON.parse(raw) as Partial<CookieConsentPreferences>;
    if (
      data.necessary !== true ||
      typeof data.analytics !== "boolean" ||
      typeof data.marketing !== "boolean" ||
      (data.decision !== "accept_all" && data.decision !== "reject_optional" && data.decision !== "custom") ||
      typeof data.version !== "string" ||
      typeof data.decidedAt !== "string"
    ) {
      return null;
    }

    return {
      necessary: true,
      analytics: data.analytics,
      marketing: data.marketing,
      decision: data.decision,
      version: data.version,
      decidedAt: data.decidedAt,
    };
  } catch {
    return null;
  }
}

function readExistingPreferences() {
  const fromStorage = parsePreferences(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  if (fromStorage) {
    return fromStorage;
  }

  const fromCookie = parsePreferences(readCookie(COOKIE_CONSENT_COOKIE_NAME));
  if (fromCookie) {
    return fromCookie;
  }

  return null;
}

function persistPreferences(value: CookieConsentPreferences) {
  const serialized = JSON.stringify(value);
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, serialized);

  const maxAge = 60 * 60 * 24 * 365;
  let cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(serialized)}; path=/; max-age=${maxAge}; samesite=lax`;
  if (window.location.protocol === "https:") {
    cookie = `${cookie}; secure`;
  }
  document.cookie = cookie;
}

async function storeConsentOnServer(value: CookieConsentPreferences) {
  try {
    await fetch("/api/public/privacy-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "cookie_banner",
        consentKey: "cookie_preferences",
        consentGranted: value.analytics || value.marketing,
        decision: value.decision,
        consentVersion: value.version,
        subjectType: "anonymous_visitor",
        metadata: {
          analytics: value.analytics,
          marketing: value.marketing,
        },
      }),
    });
  } catch {
    // Keep UX responsive even if consent logging fails.
  }
}

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [canReopen, setCanReopen] = useState(false);

  useEffect(() => {
    const initTimer = window.setTimeout(() => {
      const existing = readExistingPreferences();
      if (existing) {
        setAnalytics(existing.analytics);
        setMarketing(existing.marketing);
        setVisible(false);
        setCanReopen(true);
      } else {
        setVisible(true);
        setCanReopen(false);
      }
    }, 0);

    const onOpenPreferences = () => {
      const latest = readExistingPreferences();
      if (latest) {
        setAnalytics(latest.analytics);
        setMarketing(latest.marketing);
      }
      setVisible(true);
      setExpanded(true);
      setCanReopen(true);
    };

    window.addEventListener("stampiss:open-cookie-preferences", onOpenPreferences);
    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener("stampiss:open-cookie-preferences", onOpenPreferences);
    };
  }, []);

  const savePreferences = (decision: CookieConsentDecision, nextAnalytics: boolean, nextMarketing: boolean) => {
    const value: CookieConsentPreferences = {
      necessary: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      decision,
      version: LEGAL_DOCUMENT_VERSION,
      decidedAt: new Date().toISOString(),
    };

    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    persistPreferences(value);
    setVisible(false);
    setExpanded(false);
    setCanReopen(true);

    window.dispatchEvent(
      new CustomEvent("stampiss:cookie-consent-updated", {
        detail: value,
      })
    );

    void storeConsentOnServer(value);
  };

  if (!visible && !canReopen) {
    return null;
  }

  if (!visible && canReopen) {
    return (
      <div className="fixed bottom-4 right-4 z-[89] md:bottom-5 md:right-5">
        <Button
          type="button"
          variant="outline"
          className="bg-white/95 backdrop-blur"
          onClick={() => {
            window.dispatchEvent(new Event("stampiss:open-cookie-preferences"));
          }}
        >
          Preferenze cookie
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-3 md:px-5 md:pb-5">
      <div className="mx-auto max-w-4xl rounded-3xl border border-[color:var(--border)] bg-white/95 p-5 shadow-[0_20px_48px_rgba(18,24,40,0.14)] backdrop-blur-lg md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-foreground">Preferenze privacy e cookie</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Utilizziamo cookie tecnici necessari al funzionamento della piattaforma. Puoi scegliere
              se abilitare anche categorie opzionali. Dettagli nelle nostre{" "}
              <Link href={LEGAL_LINKS.cookiePolicy} className="font-semibold text-primary hover:underline">
                Cookie Policy
              </Link>{" "}
              e{" "}
              <Link href={LEGAL_LINKS.privacyPolicy} className="font-semibold text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-primary hover:underline"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Nascondi personalizzazione" : "Personalizza preferenze"}
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <Button variant="outline" onClick={() => savePreferences("reject_optional", false, false)}>
              Solo necessari
            </Button>
            <Button onClick={() => savePreferences("accept_all", true, true)}>Accetta tutti</Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-5 grid gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-4">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input type="checkbox" checked readOnly disabled className="mt-1 h-4 w-4 rounded border-[color:var(--border-strong)]" />
              <span>
                <span className="font-semibold">Cookie necessari</span>
                <span className="mt-0.5 block text-muted-foreground">
                  Sempre attivi per autenticazione, sicurezza e funzioni essenziali.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[color:var(--border-strong)]"
              />
              <span>
                <span className="font-semibold">Analytics</span>
                <span className="mt-0.5 block text-muted-foreground">
                  Misure aggregate di utilizzo per migliorare il servizio.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(event) => setMarketing(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[color:var(--border-strong)]"
              />
              <span>
                <span className="font-semibold">Marketing</span>
                <span className="mt-0.5 block text-muted-foreground">
                  Comunicazioni promozionali e campagne future (se abilitate).
                </span>
              </span>
            </label>

            <div className="flex justify-end">
              <Button onClick={() => savePreferences("custom", analytics, marketing)}>
                Salva preferenze
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

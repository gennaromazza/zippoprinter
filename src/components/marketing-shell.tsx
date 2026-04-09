"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LEGAL_LINKS } from "@/lib/privacy-consent";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/60 bg-[rgba(250,248,245,0.82)] backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Stampiss" width={36} height={36} className="h-9 w-9" />
          <span className="text-lg font-bold tracking-tight">Stampiss</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/#funzionalita"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Funzionalità
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Prezzi
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href="/admin"
              className="hidden text-sm font-semibold text-foreground hover:text-primary md:block"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login?force=1"
              className="hidden text-sm font-semibold text-foreground hover:text-primary md:block"
            >
              Accedi
            </Link>
          )}
          <Link
            href="/signup?force=1"
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
          >
            Prova gratis
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/60 hover:text-foreground md:hidden"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-white/60 bg-[rgba(250,248,245,0.96)] px-4 pb-4 pt-3 md:hidden">
          <div className="flex flex-col gap-3">
            <Link
              href="/#funzionalita"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-white/70"
            >
              Funzionalità
            </Link>
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-white/70"
            >
              Prezzi
            </Link>
            {isLoggedIn ? (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-white/70"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login?force=1"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-white/70"
              >
                Accedi
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export function MarketingFooter() {
  const openCookiePreferences = () => {
    window.dispatchEvent(new Event("stampiss:open-cookie-preferences"));
  };

  return (
    <footer className="border-t border-white/60 bg-[rgba(250,248,245,0.6)]">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="Stampiss" width={36} height={36} className="h-9 w-9" />
              <span className="text-lg font-bold tracking-tight">Stampiss</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
              La piattaforma SaaS per studi fotografici che vogliono ricevere ordini di stampa online in modo professionale.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Prodotto
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/#funzionalita" className="text-sm text-foreground hover:text-primary">
                  Funzionalità
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-foreground hover:text-primary">
                  Prezzi e piani
                </Link>
              </li>
              <li>
                <Link href="/#come-funziona" className="text-sm text-foreground hover:text-primary">
                  Come funziona
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Accesso
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/login?force=1" className="text-sm text-foreground hover:text-primary">
                  Accedi al pannello
                </Link>
              </li>
              <li>
                <Link href="/signup?force=1" className="text-sm text-foreground hover:text-primary">
                  Registrati gratis
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Legale
            </h3>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href={LEGAL_LINKS.privacyPolicy} className="text-sm text-foreground hover:text-primary">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href={LEGAL_LINKS.cookiePolicy} className="text-sm text-foreground hover:text-primary">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link href={LEGAL_LINKS.termsOfService} className="text-sm text-foreground hover:text-primary">
                  Termini di servizio
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={openCookiePreferences}
                  className="text-sm text-foreground hover:text-primary"
                >
                  Preferenze cookie
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-white/60 pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Stampiss. Tutti i diritti riservati.
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

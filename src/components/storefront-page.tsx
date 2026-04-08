import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { AtSign, Globe, MessageCircle, Sparkles } from "lucide-react";
import { StorefrontUploadShell } from "@/components/storefront-upload-shell";
import { hexToRgba, resolveStorefrontTheme } from "@/lib/storefront-branding";
import type { Photographer, PrintFormat } from "@/lib/types";

interface StorefrontPageProps {
  photographer: Photographer;
  formats: PrintFormat[];
  stripeEnabled: boolean;
  showAdminCta?: boolean;
}

function toPublicUrl(raw: string | null | undefined) {
  const value = (raw || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function getCtaAlignClass(align: string) {
  if (align === "center") {
    return "items-center text-center";
  }
  if (align === "right") {
    return "items-end text-right";
  }
  return "items-start text-left";
}

function getHeroGridClass(preset: string) {
  if (preset === "hero_center") {
    return "flex flex-col items-center text-center gap-5";
  }
  if (preset === "hero_left") {
    return "flex flex-col gap-5";
  }
  return "flex flex-col gap-5 md:flex-row md:items-start md:justify-between";
}

export function StorefrontPage({ photographer, formats, stripeEnabled, showAdminCta = false }: StorefrontPageProps) {
  const studioName = photographer.name || "Il tuo studio fotografico";
  const logoPositionX = Number.isFinite(photographer.logo_position_x)
    ? Math.min(100, Math.max(0, Math.round(photographer.logo_position_x as number)))
    : 50;
  const logoPositionY = Number.isFinite(photographer.logo_position_y)
    ? Math.min(100, Math.max(0, Math.round(photographer.logo_position_y as number)))
    : 50;
  const welcomeText =
    photographer.custom_welcome_text ||
    "Compila i tuoi dati, carica le foto, scegli i formati e conferma l'ordine in pochi passaggi guidati.";
  const whatsappNumber = (photographer.whatsapp_number || "").replace(/\D/g, "");
  const whatsappHref = whatsappNumber ? `https://wa.me/${whatsappNumber}` : "";
  const websiteHref = toPublicUrl(photographer.website_url);
  const instagramHref = toPublicUrl(photographer.instagram_url);
  const hasPublicContacts = Boolean(photographer.phone || whatsappHref || websiteHref || instagramHref);
  const theme = resolveStorefrontTheme(photographer);

  const containerVars = theme.enabled
    ? ({
        "--primary": theme.primary,
        "--ring": hexToRgba(theme.primary, 0.28),
        "--accent": theme.secondary,
        "--secondary": theme.secondary,
        "--foreground": theme.text,
        "--muted": hexToRgba(theme.secondary, 0.72),
        "--border": hexToRgba(theme.text, 0.16),
      } as CSSProperties)
    : undefined;

  const pageBackgroundStyle: CSSProperties | undefined =
    theme.enabled && theme.bgScope === "page" && theme.bgImageUrl
      ? {
          backgroundImage: `linear-gradient(${hexToRgba(theme.secondary, theme.overlayOpacity / 100)}, ${hexToRgba(theme.secondary, theme.overlayOpacity / 100)}), url(${theme.bgImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : undefined;

  const headerBackgroundStyle: CSSProperties | undefined =
    theme.enabled && theme.bgScope === "header" && theme.bgImageUrl
      ? {
          backgroundImage: `linear-gradient(${hexToRgba(theme.secondary, theme.overlayOpacity / 100)}, ${hexToRgba(theme.secondary, theme.overlayOpacity / 100)}), url(${theme.bgImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5" style={{ ...containerVars, ...pageBackgroundStyle }}>
      <header
        className={`rounded-[2rem] border border-[color:var(--border)] px-5 py-5 shadow-[var(--shadow-sm)] md:px-7 ${
          theme.enabled ? "bg-white/86 backdrop-blur-[2px]" : "bg-white"
        }`}
        style={headerBackgroundStyle}
      >
        <div className={getHeroGridClass(theme.layoutPreset)}>
          <div className={`flex items-start gap-4 ${theme.layoutPreset === "hero_center" ? "justify-center" : ""}`}>
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/30">
              {photographer.logo_url ? (
                <Image
                  src={photographer.logo_url}
                  alt={`Logo ${studioName}`}
                  fill
                  unoptimized
                  className="object-cover"
                  style={{ objectPosition: `${logoPositionX}% ${logoPositionY}%` }}
                  sizes="64px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                  {studioName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className={`space-y-2 ${theme.layoutPreset === "hero_center" ? "text-center" : ""}`}>
              <p className="section-kicker">
                <Sparkles className="h-3.5 w-3.5" />
                {studioName}
              </p>
              <h1 className="text-xl font-semibold tracking-tight md:text-3xl">Ordina le tue stampe</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {welcomeText}
              </p>
            </div>
          </div>

          <div className={`grid gap-3 ${theme.layoutPreset === "hero_split" ? "md:w-[25rem]" : "w-full"} ${theme.layoutPreset === "hero_center" ? "max-w-2xl" : ""}`}>
            <div className={`rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/55 px-4 py-3 ${getCtaAlignClass(theme.ctaAlign)}`}>
              <p className="text-sm font-semibold text-foreground">Contatti studio</p>
              {hasPublicContacts ? (
                <div className={`mt-3 flex flex-wrap gap-2 ${theme.ctaAlign === "center" ? "justify-center" : theme.ctaAlign === "right" ? "justify-end" : ""}`}>
                  {whatsappHref && (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em]"
                      style={
                        theme.enabled
                          ? {
                              backgroundColor: theme.primary,
                              color: theme.primaryContrast,
                              borderColor: "transparent",
                            }
                          : undefined
                      }
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                  )}
                  {websiteHref && (
                    <a
                      href={websiteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      Sito web
                    </a>
                  )}
                  {instagramHref && (
                    <a
                      href={instagramHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
                    >
                      <AtSign className="h-3.5 w-3.5" />
                      Instagram
                    </a>
                  )}
                  {photographer.phone && (
                    <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                      Tel {photographer.phone}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Lo studio non ha ancora pubblicato i contatti.
                </p>
              )}
            </div>
            {showAdminCta && (
              <div className={`rounded-[1.4rem] border border-[color:var(--border)] bg-white px-4 py-3 ${getCtaAlignClass(theme.ctaAlign)}`}>
                <p className="text-sm font-semibold text-foreground">Sei il fotografo?</p>
                <div className={`mt-3 flex flex-wrap items-center gap-2 ${theme.ctaAlign === "center" ? "justify-center" : theme.ctaAlign === "right" ? "justify-end" : ""}`}>
                  <Link
                    href="/admin"
                    className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground hover:bg-[color:var(--muted)]"
                  >
                    Accedi al pannello admin
                  </Link>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Dopo l&apos;accesso salva <strong>/admin</strong> nei preferiti del browser.
                </p>
              </div>
            )}
            <p className={`section-kicker ${theme.ctaAlign === "center" ? "justify-center" : theme.ctaAlign === "right" ? "justify-end" : ""}`}>
              Percorso guidato: dati cliente, caricamento foto, formati, checkout.
            </p>
          </div>
        </div>
      </header>

      <StorefrontUploadShell
        formats={formats}
        photographer={photographer}
        stripeEnabled={stripeEnabled}
      />
    </div>
  );
}

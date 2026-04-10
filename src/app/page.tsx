import { headers } from "next/headers";
import { StorefrontPage } from "@/components/storefront-page";
import { LandingPage } from "@/components/landing-page";
import { MarketingShell } from "@/components/marketing-shell";
import { getStorefrontByPhotographerId } from "@/lib/photographers";
import { resolveTenantByHost } from "@/lib/tenant-domains";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stampiss | Ordini di stampa online per studi fotografici",
  description:
    "La piattaforma SaaS per studi fotografici: vetrina white-label, gestione ordini, pagamenti online, dominio personalizzato. Prova gratis 14 giorni.",
};

export default async function HomePage() {
  /* ── Custom-domain → storefront ──────────────────────────────── */
  const headerStore = await headers();
  const incomingHost =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const customDomainTenantId = incomingHost
    ? await resolveTenantByHost(incomingHost)
    : null;

  if (customDomainTenantId) {
    const storefront = await getStorefrontByPhotographerId(customDomainTenantId);
    if (storefront) {
      return (
        <main className="min-h-screen px-4 pb-12 pt-4 md:px-8 md:pb-16 md:pt-6">
          <StorefrontPage
            photographer={storefront.photographer}
            formats={storefront.formats}
            stripeEnabled={Boolean(process.env.STRIPE_SECRET_KEY)}
          />
        </main>
      );
    }
  }

  /* ── Main domain → landing page ──────────────────────────────── */
  return (
    <MarketingShell>
      <LandingPage />
    </MarketingShell>
  );
}

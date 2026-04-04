import Link from "next/link";
import { headers } from "next/headers";
import { Camera, Sparkles } from "lucide-react";
import { StorefrontPage } from "@/components/storefront-page";
import { getPublicStudios, getStorefrontByPhotographerId } from "@/lib/photographers";
import { getStudioHref } from "@/lib/studio-paths";
import { resolveTenantByHost } from "@/lib/tenant-domains";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const headerStore = await headers();
  const incomingHost = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  const customDomainTenantId = incomingHost ? await resolveTenantByHost(incomingHost) : null;
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

  const studios = await getPublicStudios();

  if (studios.length === 0) {
    return (
      <main className="min-h-screen px-4 pb-12 pt-4 md:px-8 md:pb-16 md:pt-6">
        <div className="mx-auto max-w-4xl">
          <div className="glass-panel rounded-[2rem] p-8 text-center md:p-12">
            <p className="section-kicker mx-auto mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              Nessuno studio configurato
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              ZippoPrinter è pronto, ma non ci sono ancora vetrine pubbliche attive.
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Configura almeno un fotografo con i suoi formati di stampa per pubblicare la pagina cliente.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (studios.length === 1) {
    const storefront = await getStorefrontByPhotographerId(studios[0].id);

    if (!storefront) {
      return null;
    }

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

  return (
    <main className="min-h-screen px-4 pb-12 pt-4 md:px-8 md:pb-16 md:pt-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="glass-panel rounded-[2rem] px-6 py-6 md:px-8">
          <p className="section-kicker mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Seleziona uno studio
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Sono disponibili più studi fotografici su questa installazione.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Scegli lo studio corretto per vedere branding, listino e caricamento ordini dedicati.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {studios.map((studio) => (
            <Link key={studio.id} href={getStudioHref(studio.id)}>
              <article className="glass-panel h-full rounded-[1.8rem] p-6 hover:-translate-y-0.5">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-primary text-primary-foreground">
                  <Camera className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {studio.name || "Studio fotografico"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Vetrina pubblica attiva
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                    {studio.active_format_count} formati attivi
                  </span>
                  {studio.brand_color && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: studio.brand_color }}
                      />
                      Branding dedicato
                    </span>
                  )}
                </div>
              </article>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}

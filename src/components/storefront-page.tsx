import { CreditCard, Sparkles, Store } from "lucide-react";
import { StorefrontUploadShell } from "@/components/storefront-upload-shell";
import { getCheckoutAmounts, getPaymentModeLabel } from "@/lib/payments";
import type { Photographer, PrintFormat } from "@/lib/types";

interface StorefrontPageProps {
  photographer: Photographer;
  formats: PrintFormat[];
  stripeEnabled: boolean;
}

export function StorefrontPage({ photographer, formats, stripeEnabled }: StorefrontPageProps) {
  const studioName = photographer.name || "Il tuo studio fotografico";
  const welcomeText =
    photographer.custom_welcome_text ||
    "Carica le tue foto, scegli il formato e completa l'ordine in pochi minuti.";
  const paymentPlan = getCheckoutAmounts(1000, photographer);

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-5">
      <header className="rounded-[2rem] border border-[color:var(--border)] bg-white px-5 py-5 shadow-[var(--shadow-sm)] md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="section-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              Servizio stampa foto
            </p>
            <h1 className="text-xl font-semibold tracking-tight md:text-3xl">{studioName}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {welcomeText}
            </p>
          </div>

          <div className="grid gap-3 md:w-[24rem]">
            <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/55 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="h-4 w-4 text-primary" />
                {getPaymentModeLabel(paymentPlan.mode)}
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {paymentPlan.description}
              </p>
            </div>
            {!stripeEnabled && paymentPlan.mode !== "pay_in_store" && (
              <div className="rounded-[1.4rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                Il pagamento online non e ancora configurato in questo ambiente. Lo studio puo
                comunque attivare la modalita &quot;Pagamento in studio&quot; dalle impostazioni admin.
              </div>
            )}
            <div className="flex flex-wrap gap-2 md:justify-end">
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--secondary)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                Wizard mobile-first
              </span>
              <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                Multi-tenant
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="rounded-[1.8rem] border border-[color:var(--border)] bg-white px-5 py-4 shadow-[var(--shadow-sm)] md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-semibold text-foreground">
            Dal tuo link dedicato puoi caricare le immagini, assegnare i formati e confermare
            l&apos;ordine senza cambiare pagina.
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Store className="h-4 w-4" />
            Ritiro e gestione direttamente con lo studio
          </div>
        </div>
      </div>

      <StorefrontUploadShell
        formats={formats}
        photographer={photographer}
        stripeEnabled={stripeEnabled}
      />
    </div>
  );
}

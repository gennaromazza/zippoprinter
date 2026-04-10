import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { MarketingShell } from "@/components/marketing-shell";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/privacy-consent";

export const metadata: Metadata = {
  title: "Cookie Policy | Stampiss",
  description: "Informativa sull'uso dei cookie nella piattaforma Stampiss.",
};

export default function CookiePolicyPage() {
  return (
    <MarketingShell>
      <LegalPageShell
        title="Cookie Policy"
        summary="Questa pagina spiega quali cookie usa la piattaforma e come puoi gestire le tue preferenze."
        lastUpdated={LEGAL_DOCUMENT_VERSION}
      >
        <section>
          <h2 className="text-lg font-semibold">1. Cosa sono i cookie</h2>
          <p className="mt-2 text-muted-foreground">
            I cookie sono piccoli file salvati sul browser per abilitare funzioni tecniche, sicurezza e,
            se autorizzato, misurazioni statistiche o finalita marketing.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Categorie usate su Stampiss</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Necessari: autenticazione, sicurezza, continuita della sessione.</li>
            <li>Analytics (opzionali): misurazioni aggregate per migliorare il prodotto.</li>
            <li>Marketing (opzionali): funzionalita promozionali future, solo con consenso.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Gestione preferenze</h2>
          <p className="mt-2 text-muted-foreground">
            Puoi impostare o aggiornare le preferenze cookie tramite il centro preferenze accessibile
            dal footer pubblico della piattaforma e tramite il pulsante persistente
            "Preferenze cookie" disponibile nell'interfaccia.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Durata</h2>
          <p className="mt-2 text-muted-foreground">
            Le preferenze cookie vengono memorizzate per un periodo massimo di 12 mesi, salvo modifica
            manuale da parte dell&apos;utente o cancellazione dal browser.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Cookie di terze parti</h2>
          <p className="mt-2 text-muted-foreground">
            L&apos;uso di strumenti terzi puo richiedere cookie addizionali. L&apos;elenco completo e la relativa
            base giuridica vanno mantenuti aggiornati nel registro sub-processor [DA COMPLETARE].
          </p>
        </section>
      </LegalPageShell>
    </MarketingShell>
  );
}

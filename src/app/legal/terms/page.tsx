import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { MarketingShell } from "@/components/marketing-shell";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/privacy-consent";

export const metadata: Metadata = {
  title: "Termini di Servizio | Stampiss",
  description: "Termini e condizioni di utilizzo della piattaforma Stampiss.",
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <LegalPageShell
        title="Termini di Servizio"
        summary="Questi termini disciplinano l'accesso e l'uso della piattaforma Stampiss da parte degli studi fotografici."
        lastUpdated={LEGAL_DOCUMENT_VERSION}
      >
        <section>
          <h2 className="text-lg font-semibold">1. Oggetto del servizio</h2>
          <p className="mt-2 text-muted-foreground">
            Stampiss fornisce strumenti software per raccolta ordini foto, gestione workflow, pagamenti
            e operazioni amministrative per studi fotografici.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Account e responsabilita</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>L&apos;utente e responsabile della sicurezza delle credenziali del proprio account.</li>
            <li>Lo studio e responsabile dei contenuti caricati e del loro trattamento verso i clienti finali.</li>
            <li>E vietato l&apos;uso della piattaforma per finalita illecite o in violazione di diritti di terzi.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Pagamenti e piani</h2>
          <p className="mt-2 text-muted-foreground">
            I piani e i relativi costi sono definiti nelle pagine commerciali del servizio. Eventuali modifiche
            contrattuali e politiche di rinnovo devono essere comunicate con congruo preavviso [DA COMPLETARE].
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Disponibilita e limitazioni</h2>
          <p className="mt-2 text-muted-foreground">
            Il servizio viene fornito con livelli di disponibilita ragionevoli ma non garantisce assenza totale
            di interruzioni. Manutenzioni e interventi di sicurezza possono richiedere sospensioni temporanee.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Recesso e cessazione</h2>
          <p className="mt-2 text-muted-foreground">
            Modalita di recesso, cessazione e gestione dati post-contratto devono essere definite nel contratto
            commerciale e nella policy retention [DA COMPLETARE].
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Legge applicabile</h2>
          <p className="mt-2 text-muted-foreground">
            Foro competente e legge applicabile: [DA COMPLETARE].
          </p>
        </section>
      </LegalPageShell>
    </MarketingShell>
  );
}

import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { MarketingShell } from "@/components/marketing-shell";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/privacy-consent";

export const metadata: Metadata = {
  title: "Privacy Policy | Stampiss",
  description: "Informativa privacy per la piattaforma Stampiss.",
};

export default function PrivacyPolicyPage() {
  return (
    <MarketingShell>
      <LegalPageShell
        title="Privacy Policy"
        summary="Questa informativa descrive quali dati personali vengono trattati da Stampiss, per quali finalita e con quali tempi di conservazione."
        lastUpdated={LEGAL_DOCUMENT_VERSION}
      >
        <section>
          <h2 className="text-lg font-semibold">1. Titolare del trattamento</h2>
          <p className="mt-2 text-muted-foreground">
            Titolare: Stampiss.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Dati personali trattati</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Dati account studio: email, credenziali, profilo e impostazioni operative.</li>
            <li>Dati cliente ordine: nome, cognome, email, telefono, dettaglio ordine.</li>
            <li>Dati tecnici: log applicativi, indirizzo IP, user agent, eventi di sicurezza.</li>
            <li>Dati di pagamento: metadati transazionali gestiti tramite Stripe.</li>
            <li>Contenuti caricati: file immagine associati agli ordini.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Finalita e basi giuridiche</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Esecuzione del servizio richiesto (art. 6.1.b GDPR).</li>
            <li>Obblighi legali, fiscali e contabili (art. 6.1.c GDPR).</li>
            <li>Sicurezza, prevenzione abusi e audit operativo (art. 6.1.f GDPR).</li>
            <li>Eventuale marketing solo previo consenso esplicito (art. 6.1.a GDPR).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Conservazione</h2>
          <p className="mt-2 text-muted-foreground">
            Le immagini ordine vengono eliminate automaticamente secondo retention configurata. I dati ordine e
            di fatturazione possono essere conservati piu a lungo per adempimenti legali. Le retention
            definitive vanno approvate e riportate in policy operativa interna.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Destinatari e responsabili esterni</h2>
          <p className="mt-2 text-muted-foreground">
            Il servizio si appoggia a fornitori terzi per componenti infrastrutturali e operative, tra cui:
            Supabase, Stripe, Vercel, Resend. Elenco completo e base contrattuale: [DA COMPLETARE].
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">6. Diritti dell&apos;interessato</h2>
          <p className="mt-2 text-muted-foreground">
            Puoi esercitare i diritti previsti dal GDPR: accesso, rettifica, cancellazione, limitazione,
            opposizione e portabilita. Per richieste formali usare il canale privacy ufficiale del titolare.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">7. Aggiornamenti della policy</h2>
          <p className="mt-2 text-muted-foreground">
            Questa policy puo essere aggiornata periodicamente. La versione attuale e identificata dalla data
            di ultimo aggiornamento riportata sopra.
          </p>
        </section>
      </LegalPageShell>
    </MarketingShell>
  );
}

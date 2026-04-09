import Link from "next/link";
import {
  Check,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Prezzi e Piani | Stampiss",
  description:
    "Scegli il piano Stampiss ideale per il tuo studio fotografico. A partire da €6/mese con 14 giorni di prova gratuita.",
};

const features = [
  "Vetrina white-label personalizzata",
  "Caricamento foto e ordini illimitati",
  "Gestione formati e pricing a scaglioni",
  "Dashboard backoffice completa",
  "Pagamenti online con Stripe",
  "Dominio personalizzato incluso",
  "Branding completo (colori, logo, layout)",
  "Export ordini in ZIP per formato",
  "Supporto deposito + saldo in studio",
  "Certificato SSL automatico",
];

const faqs = [
  {
    q: "Cosa include la prova gratuita di 14 giorni?",
    a: "Tutte le funzionalità della piattaforma sono disponibili durante il periodo di prova, senza limiti. Non è richiesta alcuna carta di credito per iniziare.",
  },
  {
    q: "Posso cambiare piano in qualsiasi momento?",
    a: "Sì, puoi passare dal piano mensile all'annuale o viceversa in qualsiasi momento dal tuo pannello di gestione.",
  },
  {
    q: "Come funzionano i pagamenti dei miei clienti?",
    a: "I pagamenti dei tuoi clienti vengono gestiti tramite il tuo account Stripe Connect. I fondi vanno direttamente a te, Stampiss non trattiene commissioni sugli ordini.",
  },
  {
    q: "Posso cancellare in qualsiasi momento?",
    a: "Sì, puoi cancellare la sottoscrizione quando vuoi. Il servizio rimarrà attivo fino alla fine del periodo pagato.",
  },
  {
    q: "Il dominio personalizzato ha costi aggiuntivi?",
    a: "L'uso di un dominio personalizzato è incluso in tutti i piani. Se vuoi acquistare un nuovo dominio tramite la piattaforma, il costo dipende dall'estensione scelta.",
  },
  {
    q: "Cosa succede ai miei dati se cancello l'abbonamento?",
    a: "I tuoi dati (ordini, clienti, configurazioni) restano archiviati. Se riattivi l'abbonamento, ritroverai tutto come lo avevi lasciato.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <section className="px-4 pb-8 pt-12 text-center md:px-8 md:pb-12 md:pt-20">
        <p className="section-kicker mx-auto mb-4">
          <ShieldCheck className="h-3.5 w-3.5" />
          Prezzi trasparenti
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Scegli il piano giusto per il tuo studio
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          Tutti i piani includono tutte le funzionalità. Inizia con 14 giorni
          di prova gratuita, nessuna carta richiesta.
        </p>
      </section>

      {/* ── Plan cards ─────────────────────────────────────────────── */}
      <section className="px-4 pb-16 md:px-8">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {/* Starter Mensile */}
          <PlanCard
            name="Starter Mensile"
            price="6"
            period="/mese"
            billing="Fatturato mensilmente"
            description="Ideale per iniziare senza impegno e valutare la piattaforma con calma."
            features={features}
            cta="Inizia la prova gratuita"
          />

          {/* Starter Annuale */}
          <PlanCard
            name="Starter Annuale"
            price="50"
            period="/anno"
            billing="Fatturato annualmente · Risparmi oltre il 30%"
            description="Il piano più conveniente per studi che vogliono un servizio stabile tutto l'anno."
            features={features}
            highlighted
            badge="Più popolare"
            cta="Inizia la prova gratuita"
          />

          {/* Lifetime */}
          <PlanCard
            name="Lifetime"
            price="1.000"
            period="una tantum"
            billing="Pagamento unico, accesso per sempre"
            description="Investimento una tantum per chi vuole la piattaforma a vita senza pensieri."
            features={features}
            cta="Acquista accesso a vita"
          />
        </div>
      </section>

      {/* ── Feature comparison ─────────────────────────────────────── */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="section-kicker mx-auto mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              Confronto piani
            </p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Tutte le funzionalità, in ogni piano
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Non ci sono limitazioni funzionali tra i piani. La differenza è
              solo nel tipo di fatturazione.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto rounded-[1.8rem] border border-white/70 bg-[rgba(255,255,255,0.9)]">
            <table className="w-full min-w-[540px] text-sm">
              <caption className="sr-only">Confronto funzionalità tra i piani Mensile, Annuale e Lifetime</caption>
              <thead>
                <tr className="border-b border-white/70 bg-[rgba(248,243,238,0.6)]">
                  <th className="px-6 py-4 text-left font-semibold">
                    Funzionalità
                  </th>
                  <th className="px-4 py-4 text-center font-semibold">
                    Mensile
                  </th>
                  <th className="px-4 py-4 text-center font-semibold">
                    Annuale
                  </th>
                  <th className="px-4 py-4 text-center font-semibold">
                    Lifetime
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map((f, i) => (
                  <tr
                    key={f}
                    className={
                      i < features.length - 1
                        ? "border-b border-white/60"
                        : ""
                    }
                  >
                    <td className="px-6 py-3.5 text-foreground">{f}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Check className="mx-auto h-4 w-4 text-[color:var(--success)]" aria-hidden="true" />
                      <span className="sr-only">Incluso</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Check className="mx-auto h-4 w-4 text-[color:var(--success)]" aria-hidden="true" />
                      <span className="sr-only">Incluso</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Check className="mx-auto h-4 w-4 text-[color:var(--success)]" aria-hidden="true" />
                      <span className="sr-only">Incluso</span>
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-white/70 bg-[rgba(248,243,238,0.4)]">
                  <td className="px-6 py-3.5 font-semibold">Prezzo</td>
                  <td className="px-4 py-3.5 text-center font-semibold">
                    €6/mese
                  </td>
                  <td className="px-4 py-3.5 text-center font-semibold">
                    €50/anno
                  </td>
                  <td className="px-4 py-3.5 text-center font-semibold">
                    €1.000
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="section-kicker mx-auto mb-4">
              <HelpCircle className="h-3.5 w-3.5" />
              Domande frequenti
            </p>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Hai domande?
            </h2>
          </div>

          <div className="mt-10 space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="glass-panel rounded-[1.4rem] px-6 py-5"
              >
                <h3 className="font-semibold text-foreground">{faq.q}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="px-4 pb-16 pt-4 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="glass-panel rounded-[2.4rem] p-8 text-center md:p-14">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Pronto a partire?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Crea il tuo account in 2 minuti e inizia a ricevere ordini di
              stampa dal tuo studio online.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
            >
              Inizia la prova gratuita
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/* ── Plan card component ─────────────────────────────────────────── */

function PlanCard({
  name,
  price,
  period,
  billing,
  description,
  features,
  highlighted,
  badge,
  cta,
}: {
  name: string;
  price: string;
  period: string;
  billing: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  cta: string;
}) {
  return (
    <div
      className={`glass-panel flex flex-col rounded-[1.8rem] p-7 ${
        highlighted
          ? "ring-2 ring-primary/30 shadow-[0_24px_64px_rgba(143,93,44,0.14)]"
          : ""
      }`}
    >
      {badge && (
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          {badge}
        </p>
      )}
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-3">
        <span className="text-5xl font-bold tracking-tight">€{price}</span>
        <span className="ml-1 text-sm text-muted-foreground">{period}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{billing}</p>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <Link
        href="/signup"
        className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold ${
          highlighted
            ? "bg-primary text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
            : "border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] text-foreground hover:bg-[color:var(--muted)]"
        }`}
      >
        {cta}
      </Link>

      <ul className="mt-6 flex-1 space-y-2.5 border-t border-white/60 pt-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success)]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

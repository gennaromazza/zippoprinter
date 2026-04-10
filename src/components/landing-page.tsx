import Image from "next/image";
import Link from "next/link";
import {
  Upload,
  Palette,
  CreditCard,
  Globe,
  LayoutDashboard,
  Camera,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  CheckCircle,
  BarChart3,
} from "lucide-react";

export function LandingPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-5xl text-center">
          <Image src="/logo.png" alt="Stampiss" width={72} height={72} className="mx-auto mb-8 h-[72px] w-[72px] drop-shadow-lg" />
          <p className="section-kicker mx-auto mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Per studi fotografici e laboratori di stampa
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight text-balance md:text-6xl lg:text-7xl">
            Ricevi ordini di stampa{" "}
            <span className="text-primary">online</span>, in modo semplice e
            professionale.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl">
            Stampiss è la piattaforma che ti permette di avere una vetrina
            personalizzata per raccogliere ordini di stampa fotografica dai tuoi
            clienti, con pagamenti integrati e gestione completa.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup?force=1"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
            >
              Prova gratis per 14 giorni
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] px-8 text-base font-semibold text-foreground hover:bg-[color:var(--muted)]"
            >
              Vedi i piani
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Nessuna carta di credito richiesta · Configurazione in 5 minuti
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────── */}
      <section id="funzionalita" className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="section-kicker mx-auto mb-4">
              <CheckCircle className="h-3.5 w-3.5" />
              Tutto incluso
            </p>
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
              Tutto ciò che serve al tuo studio
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Dalla vetrina cliente alla gestione ordini, dai pagamenti al
              branding: una piattaforma completa per il tuo laboratorio.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Upload className="h-6 w-6" />}
              title="Caricamento foto guidato"
              description="I tuoi clienti caricano le foto, scelgono formato e quantità con un wizard intuitivo in 5 passaggi."
            />
            <FeatureCard
              icon={<Palette className="h-6 w-6" />}
              title="Branding white-label"
              description="Logo, colori, testi di benvenuto, layout personalizzati. La tua vetrina con il tuo marchio, non il nostro."
            />
            <FeatureCard
              icon={<CreditCard className="h-6 w-6" />}
              title="Pagamenti online integrati"
              description="Accetta pagamenti con Stripe: deposito anticipato, pagamento completo o ritiro in studio. Tu scegli la modalità."
            />
            <FeatureCard
              icon={<Globe className="h-6 w-6" />}
              title="Dominio personalizzato"
              description="Usa il tuo dominio per la vetrina cliente. Configurazione automatica DNS e certificato SSL incluso."
            />
            <FeatureCard
              icon={<LayoutDashboard className="h-6 w-6" />}
              title="Dashboard backoffice"
              description="Gestisci ordini, monitora lo stato, scarica ZIP per formato. Tutto da un pannello amministrativo dedicato."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Pricing flessibile a scaglioni"
              description="Definisci prezzi per formato con sconti progressivi per quantità. Supporto per sconti fissi e percentuali."
            />
          </div>
        </div>
      </section>

      {/* ── Come funziona ──────────────────────────────────────────── */}
      <section id="come-funziona" className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="section-kicker mx-auto mb-4">
              <Camera className="h-3.5 w-3.5" />
              Semplice e veloce
            </p>
            <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
              Come funziona
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Tre passaggi per iniziare a ricevere ordini dal tuo studio online.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            <StepCard
              step="1"
              title="Registra il tuo studio"
              description="Crea un account, configura il nome dello studio, i contatti e il branding della tua vetrina."
            />
            <StepCard
              step="2"
              title="Configura formati e prezzi"
              description="Aggiungi i formati di stampa disponibili con i relativi prezzi e sconti progressivi per quantità."
            />
            <StepCard
              step="3"
              title="Ricevi ordini online"
              description="Condividi il link della vetrina con i clienti. Loro caricano le foto, tu gestisci tutto dal pannello."
            />
          </div>
        </div>
      </section>

      {/* ── Pricing preview ────────────────────────────────────────── */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <p className="section-kicker mx-auto mb-4">
            <ShieldCheck className="h-3.5 w-3.5" />
            Prezzi trasparenti
          </p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Un piano per ogni esigenza
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Inizia con 14 giorni di prova gratuita. Nessun vincolo, cancella quando vuoi.
          </p>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <PricingPreviewCard
              name="Starter Mensile"
              price="6"
              period="/mese"
              description="Ideale per iniziare e testare la piattaforma senza impegno."
            />
            <PricingPreviewCard
              name="Starter Annuale"
              price="50"
              period="/anno"
              description="Risparmia oltre il 30% con la sottoscrizione annuale."
              highlighted
            />
            <PricingPreviewCard
              name="Lifetime"
              price="1.000"
              period="una tantum"
              description="Pagamento unico, accesso a vita senza costi ricorrenti."
            />
          </div>

          <Link
            href="/pricing"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            Confronta i piani nel dettaglio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── CTA finale ─────────────────────────────────────────────── */}
      <section className="px-4 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="glass-panel rounded-[2.4rem] p-8 text-center md:p-14">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Pronto a digitalizzare il tuo studio?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Unisciti agli studi fotografici che già usano Stampiss per
              ricevere ordini di stampa online.
            </p>
            <Link
              href="/signup?force=1"
              className="mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
            >
              Inizia la prova gratuita
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              14 giorni gratis · Nessuna carta richiesta
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-panel rounded-[1.8rem] p-6">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function StepCard({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-panel rounded-[1.8rem] p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
        {step}
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function PricingPreviewCard({
  name,
  price,
  period,
  description,
  highlighted,
}: {
  name: string;
  price: string;
  period: string;
  description: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`glass-panel rounded-[1.8rem] p-6 text-center ${
        highlighted
          ? "ring-2 ring-primary/30 shadow-[0_24px_64px_rgba(143,93,44,0.14)]"
          : ""
      }`}
    >
      {highlighted && (
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Più popolare
        </p>
      )}
      <h3 className="text-base font-semibold">{name}</h3>
      <div className="mt-3">
        <span className="text-4xl font-bold tracking-tight">€{price}</span>
        <span className="ml-1 text-sm text-muted-foreground">{period}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <Link
        href="/signup?force=1"
        className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]"
      >
        Inizia gratis
      </Link>
    </div>
  );
}

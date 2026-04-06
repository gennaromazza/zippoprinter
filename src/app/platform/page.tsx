import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Server, ChevronDown } from "lucide-react";
import { getPlatformOverview, listPlatformAlerts } from "@/lib/platform-data";
import type { PlatformKPI } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { findRunbookForAlert } from "@/lib/runbook-steps";

export default async function PlatformOverviewPage() {
  const [overview, alerts] = await Promise.all([
    getPlatformOverview(),
    listPlatformAlerts({ limit: 8 }),
  ]);

  const kpi = overview.kpi;

  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Studi totali"
          tooltip="Numero totale di studi registrati sulla piattaforma. Ti serve per capire la base attiva da seguire."
          value={String(kpi?.tenants_total || 0)}
          text="Quanti studi stanno usando il servizio in questo momento."
        />
        <Metric
          title="Abbonamenti attivi"
          tooltip="Somma di studi in trial, attivi o lifetime: indica quante attivita stanno generando valore oggi."
          value={String(kpi?.tenants_active || 0)}
          text="Studi con accesso operativo valido al servizio SaaS."
        />
        <Metric
          title="Pagamenti online pronti"
          tooltip="Studi con Stripe Connect collegato e operativo (incassi cliente pronti)."
          value={String(kpi?.connect_connected || 0)}
          text="Studi pronti a vendere online senza blocchi di pagamento."
        />
        <Metric
          title="Eventi in attesa"
          tooltip="Eventi webhook non processati oltre 10 minuti: se cresce, va fatta verifica operativa."
          value={String(kpi?.webhook_unprocessed_over_10m || 0)}
          text="Controllo salute integrazioni pagamento e sincronizzazioni."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader>
            <CardDescription>Andamento ultimi 7 giorni</CardDescription>
            <CardTitle>Abbonamenti, pagamenti online, eventi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Questa vista ti aiuta a capire se la piattaforma sta crescendo in modo sano o se ci sono segnali di rallentamento.
            </p>
            <div className="space-y-3">
              {overview.trends7d.map((point) => (
                <div key={point.day} className="grid grid-cols-[120px_repeat(3,minmax(0,1fr))] items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm">
                  <span className="font-medium">{point.day}</span>
                  <span>Abbon.: <strong>{point.subscriptions}</strong></span>
                  <span>Online pronti: <strong>{point.connectReady}</strong></span>
                  <span>Eventi: <strong>{point.webhookEvents}</strong></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader>
            <CardDescription>Alert operativi</CardDescription>
            <CardTitle>Priorita del giorno</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Parti da qui: questi alert segnalano dove intervenire prima per evitare blocchi ai fotografi.
            </p>
            {alerts.items.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-5 text-sm text-muted-foreground">
                Nessun alert aperto: situazione stabile.
              </div>
            ) : (
              alerts.items.map((alert) => {
                const guide = findRunbookForAlert(alert.alert_type);
                return (
                  <div key={alert.alert_key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {alert.severity === "critical" ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                      <SeverityBadge severity={alert.severity} />
                      <InfoTip
                        label={`Severita ${alert.severity}`}
                        text={getSeverityTooltip(alert.severity)}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                    {guide ? (
                      <details className="mt-2">
                        <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                          <ChevronDown className="h-3 w-3" />
                          {guide.title} — {guide.steps.length} passi operativi
                        </summary>
                        <ol className="mt-2 space-y-1.5 border-l-2 border-blue-200 pl-3">
                          {guide.steps.map((step) => (
                            <li key={step.order} className="text-xs">
                              <span className="font-semibold text-blue-800">{step.order}.</span>{" "}
                              <span className="font-medium">{step.action}</span>
                              {step.detail ? <span className="text-muted-foreground"> — {step.detail}</span> : null}
                            </li>
                          ))}
                        </ol>
                        <a
                          href={guide.docPath}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-xs text-blue-600 hover:underline"
                        >
                          Runbook completo →
                        </a>
                      </details>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString("it-IT")}</p>
                      <AlertNextStep alert={alert} />
                    </div>
                  </div>
                );
              })
            )}
            <Link href="/platform/tenants"><Button variant="outline" className="w-full">Apri elenco studi<ArrowRight className="h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <StatusCard
          title="Studi a rischio abbonamento"
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          value={String(kpi?.tenants_past_due || 0)}
          text="Studio con pagamenti SaaS da verificare subito."
        />
        <StatusCard
          title="Attivazioni pagamenti incomplete"
          icon={<Clock3 className="h-4 w-4 text-amber-600" />}
          value={String(kpi?.connect_pending || 0)}
          text="Studio che deve completare configurazione Stripe Connect."
        />
        <StatusCard
          title="Domini con problemi"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          value={String(kpi?.domains_failed || 0)}
          text="Studio con dominio da sistemare (DNS/SSL)."
        />
      </section>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Check giornaliero rapido</CardDescription>
          <CardTitle>Azioni consigliate oggi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {buildRecommendedActions(kpi, overview.alertCounts).length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-900">
              Nessuna azione urgente: la piattaforma e stabile. Buon lavoro!
            </div>
          ) : (
            buildRecommendedActions(kpi, overview.alertCounts).map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-3 transition-colors hover:bg-[color:var(--muted)]/40">
                  <span className="text-lg">{action.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{action.title}</p>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <section className="grid gap-5 md:grid-cols-4">
        <Metric
          title="Studi in trial"
          tooltip="Studi attualmente nel periodo di prova. Monitorane la conversione."
          value={String(kpi?.tenants_trialing || 0)}
          text="Potenziali clienti paganti."
        />
        <Metric
          title="Studi sospesi"
          tooltip="Studi sospesi per violazione o morosita."
          value={String(kpi?.tenants_suspended || 0)}
          text="Studi da verificare o riattivare."
        />
        <Metric
          title="Domini attivi"
          tooltip="Domini personalizzati verificati e attivi."
          value={String(kpi?.domains_active || 0)}
          text="Studi con brand personalizzato."
        />
        <Metric
          title="Domini in attesa"
          tooltip="Domini in fase di verifica DNS/SSL."
          value={String(kpi?.domains_pending || 0)}
          text="Verifiche DNS/SSL in corso."
        />
      </section>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Guide rapide</CardDescription>
          <CardTitle>Cosa fare quando c&apos;e un problema</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <RunbookLink href="/platform/runbooks/billing-lifecycle" label="Gestione abbonamenti" />
          <RunbookLink href="/platform/runbooks/domain-onboarding" label="Gestione domini" />
          <RunbookLink href="/platform/runbooks/incident-playbook" label="Gestione incidenti" />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, tooltip, value, text }: { title: string; tooltip: string; value: string; text: string }) {
  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {title}
          <InfoTip label={title} text={tooltip} />
        </CardDescription>
        <CardTitle className="text-4xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{text}</p></CardContent>
    </Card>
  );
}

function StatusCard({ title, icon, value, text }: { title: string; icon: React.ReactNode; value: string; text: string }) {
  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">{icon}{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{text}</p></CardContent>
    </Card>
  );
}

function RunbookLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-3 text-sm font-medium hover:bg-[color:var(--muted)]/40">
      <div className="flex items-center gap-2"><Server className="h-4 w-4" />{label}</div>
    </Link>
  );
}

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "info" }) {
  const map = {
    critical: "Critico",
    warning: "Attenzione",
    info: "Informativo",
  } as const;

  return (
    <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.08em]">
      {map[severity]}
    </span>
  );
}

function getSeverityTooltip(severity: "critical" | "warning" | "info") {
  if (severity === "critical") {
    return "Rischio alto: impatta subito operativita o incassi. Intervenire oggi.";
  }
  if (severity === "warning") {
    return "Rischio medio: da monitorare e risolvere prima che blocchi gli studi.";
  }
  return "Segnale informativo: utile per controllo periodico e prevenzione.";
}

function AlertNextStep({ alert }: { alert: { alert_type: string; severity: string; photographer_id: string | null } }) {
  const action = getAlertAction(alert.alert_type, alert.photographer_id);
  if (!action) {
    return null;
  }
  return (
    <Link href={action.href} className="text-xs font-medium text-blue-700 hover:underline">
      {action.label} →
    </Link>
  );
}

function getAlertAction(alertType: string, photographerId: string | null) {
  if (photographerId) {
    if (alertType.includes("subscription") || alertType.includes("payment") || alertType.includes("past_due")) {
      return { href: `/platform/tenants/${photographerId}`, label: "Apri scheda studio" };
    }
    if (alertType.includes("domain") || alertType.includes("dns") || alertType.includes("ssl")) {
      return { href: `/platform/tenants/${photographerId}`, label: "Verifica dominio" };
    }
    if (alertType.includes("connect") || alertType.includes("stripe")) {
      return { href: `/platform/tenants/${photographerId}`, label: "Verifica Connect" };
    }
    if (alertType.includes("webhook") || alertType.includes("event")) {
      return { href: `/platform/events?photographerId=${photographerId}`, label: "Vedi eventi studio" };
    }
    return { href: `/platform/tenants/${photographerId}`, label: "Apri dettaglio" };
  }

  if (alertType.includes("webhook") || alertType.includes("event")) {
    return { href: "/platform/events", label: "Vedi eventi" };
  }

  return { href: "/platform/tenants", label: "Elenco studi" };
}

interface RecommendedAction {
  icon: string;
  title: string;
  description: string;
  href: string;
}

function buildRecommendedActions(
  kpi: PlatformKPI | null,
  alertCounts: { critical: number; warning: number; info: number }
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  if (alertCounts.critical > 0) {
    actions.push({
      icon: "🚨",
      title: `${alertCounts.critical} alert critici aperti`,
      description: "Verificare immediatamente: potenziale blocco operativo o di incasso.",
      href: "/platform/tenants",
    });
  }

  if (kpi?.tenants_past_due && kpi.tenants_past_due > 0) {
    actions.push({
      icon: "💳",
      title: `${kpi.tenants_past_due} studi con pagamento fallito`,
      description: "Contatta gli studi o verifica i dati di pagamento per sbloccare il servizio.",
      href: "/platform/tenants?subscription=past_due",
    });
  }

  if (kpi?.webhook_unprocessed_over_10m && kpi.webhook_unprocessed_over_10m > 0) {
    actions.push({
      icon: "⚡",
      title: `${kpi.webhook_unprocessed_over_10m} eventi webhook in attesa`,
      description: "Eventi non processati da oltre 10 minuti. Verifica integrazioni.",
      href: "/platform/events",
    });
  }

  if (kpi?.domains_failed && kpi.domains_failed > 0) {
    actions.push({
      icon: "🌐",
      title: `${kpi.domains_failed} domini con problemi`,
      description: "Domini con errori DNS/SSL da risolvere.",
      href: "/platform/tenants?domain=failed",
    });
  }

  if (kpi?.connect_pending && kpi.connect_pending > 0) {
    actions.push({
      icon: "🔗",
      title: `${kpi.connect_pending} attivazioni Connect incomplete`,
      description: "Studi che devono completare la configurazione Stripe Connect.",
      href: "/platform/tenants?connect=not_ready",
    });
  }

  if (alertCounts.warning > 0) {
    actions.push({
      icon: "⚠️",
      title: `${alertCounts.warning} avvisi da monitorare`,
      description: "Situazioni da risolvere a breve per evitare blocchi futuri.",
      href: "/platform/tenants",
    });
  }

  return actions;
}

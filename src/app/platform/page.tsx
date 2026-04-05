import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Server } from "lucide-react";
import { getPlatformOverview, listPlatformAlerts } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";

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
              alerts.items.map((alert) => (
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
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString("it-IT")}</p>
                </div>
              ))
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
          <CardDescription>Guide rapide</CardDescription>
          <CardTitle>Cosa fare quando c&apos;e un problema</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <RunbookLink href="/docs/runbooks/billing-lifecycle.md" label="Gestione abbonamenti" />
          <RunbookLink href="/docs/runbooks/domain-onboarding.md" label="Gestione domini" />
          <RunbookLink href="/docs/security/incident-playbook.md" label="Gestione incidenti" />
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
    <a href={href} target="_blank" rel="noreferrer" className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-3 text-sm font-medium hover:bg-[color:var(--muted)]/40">
      <div className="flex items-center gap-2"><Server className="h-4 w-4" />{label}</div>
    </a>
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

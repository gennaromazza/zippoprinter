import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Server } from "lucide-react";
import { getPlatformOverview, listPlatformAlerts } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function PlatformOverviewPage() {
  const [overview, alerts] = await Promise.all([
    getPlatformOverview(),
    listPlatformAlerts({ limit: 8 }),
  ]);

  const kpi = overview.kpi;

  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Tenants totali" value={String(kpi?.tenants_total || 0)} text="Studi registrati in piattaforma." />
        <Metric title="Abbonamenti attivi" value={String(kpi?.tenants_active || 0)} text="Trialing, active o lifetime." />
        <Metric title="Connect ready" value={String(kpi?.connect_connected || 0)} text="Account connessi e pronti all'incasso." />
        <Metric title="Webhook backlog" value={String(kpi?.webhook_unprocessed_over_10m || 0)} text="Eventi non processati oltre 10 minuti." />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader>
            <CardDescription>Trend ultimi 7 giorni</CardDescription>
            <CardTitle>Subscriptions / Connect / Webhook</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.trends7d.map((point) => (
                <div key={point.day} className="grid grid-cols-[120px_repeat(3,minmax(0,1fr))] items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm">
                  <span className="font-medium">{point.day}</span>
                  <span>Sub: <strong>{point.subscriptions}</strong></span>
                  <span>Connect: <strong>{point.connectReady}</strong></span>
                  <span>Webhook: <strong>{point.webhookEvents}</strong></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader>
            <CardDescription>Alert operativi</CardDescription>
            <CardTitle>Priorita</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.items.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-5 text-sm text-muted-foreground">
                Nessun alert aperto.
              </div>
            ) : (
              alerts.items.map((alert) => (
                <div key={alert.alert_key} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {alert.severity === "critical" ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                    {alert.alert_type}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                  <div className="mt-2 text-xs text-muted-foreground">{alert.created_at}</div>
                </div>
              ))
            )}
            <Link href="/platform/tenants"><Button variant="outline" className="w-full">Apri tenant board<ArrowRight className="h-4 w-4" /></Button></Link>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <StatusCard
          title="Subscription risk"
          icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          value={String(kpi?.tenants_past_due || 0)}
          text="Tenant in past_due"
        />
        <StatusCard
          title="Connect pending"
          icon={<Clock3 className="h-4 w-4 text-amber-600" />}
          value={String(kpi?.connect_pending || 0)}
          text="Tenant da completare"
        />
        <StatusCard
          title="Domain health"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          value={String(kpi?.domains_failed || 0)}
          text="Domini in errore"
        />
      </section>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Runbook rapidi</CardDescription>
          <CardTitle>Platform Operations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <RunbookLink href="/docs/runbooks/billing-lifecycle.md" label="Billing lifecycle" />
          <RunbookLink href="/docs/runbooks/domain-onboarding.md" label="Domain onboarding" />
          <RunbookLink href="/docs/security/incident-playbook.md" label="Incident playbook" />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
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

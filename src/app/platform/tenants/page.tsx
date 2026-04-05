import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { listPlatformTenants } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const subscription = typeof params.subscription === "string" ? params.subscription : "";
  const connect = typeof params.connect === "string" ? params.connect : "";
  const domain = typeof params.domain === "string" ? params.domain : "";
  const cursor = typeof params.cursor === "string" ? params.cursor : "";

  const data = await listPlatformTenants({
    q: q || undefined,
    subscription: subscription || undefined,
    connect: connect || undefined,
    domain: domain || undefined,
    cursor: cursor || undefined,
    limit: 25,
  });

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Studi in piattaforma</CardDescription>
        <CardTitle>Monitoraggio operativo SaaS</CardTitle>
        <p className="text-sm text-muted-foreground">
          Usa i filtri per trovare velocemente gli studi da seguire oggi: pagamenti, domini e stato abbonamento.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-5">
          <input name="q" defaultValue={q} placeholder="Cerca studio o email" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="subscription" defaultValue={subscription} placeholder="stato abbonamento" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="connect" defaultValue={connect} placeholder="pagamenti online" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="domain" defaultValue={domain} placeholder="stato dominio" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <Button type="submit" variant="outline">Applica filtri</Button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Studio</th>
                <th className="px-3 py-2">Stato operativo</th>
                <th className="px-3 py-2">Abbonamento</th>
                <th className="px-3 py-2">Accesso studio</th>
                <th className="px-3 py-2">Piano</th>
                <th className="px-3 py-2">Pagamenti online</th>
                <th className="px-3 py-2">Dominio</th>
                <th className="px-3 py-2">Ultimo evento</th>
                <th className="px-3 py-2">Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const health = getHealth(row.subscription_status, row.connect_ready, row.primary_domain, row.access_status);
                return (
                  <tr key={row.photographer_id} className="border-b border-[color:var(--border)]/60">
                    <td className="px-3 py-3">
                      <div className="font-semibold">{row.name || "Studio"}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </td>
                    <td className="px-3 py-3"><HealthBadge level={health.level} label={health.label} /></td>
                    <td className="px-3 py-3">{row.subscription_status}</td>
                    <td className="px-3 py-3">{row.access_status}</td>
                    <td className="px-3 py-3">{row.subscription_plan_code || "-"}</td>
                    <td className="px-3 py-3">{row.connect_ready ? "Pronti" : (row.connect_status || "Non collegato")}</td>
                    <td className="px-3 py-3">{row.primary_domain || "Nessuno"}</td>
                    <td className="px-3 py-3">{row.last_event_type || "-"}</td>
                    <td className="px-3 py-3">
                      <Link href={`/platform/tenants/${row.photographer_id}`}><Button variant="outline" size="sm">Apri</Button></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data.nextCursor ? (
          <div className="flex justify-end">
            <Link
              href={`/platform/tenants?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(subscription ? { subscription } : {}),
                ...(connect ? { connect } : {}),
                ...(domain ? { domain } : {}),
                cursor: data.nextCursor,
              }).toString()}`}
            >
              <Button variant="outline">Pagina successiva</Button>
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function getHealth(subscriptionStatus: string, connectReady: boolean, primaryDomain: string | null, accessStatus: string) {
  if (accessStatus === "temporarily_blocked" || accessStatus === "suspended") {
    return { level: "critical" as const, label: "Critico" };
  }

  if (subscriptionStatus === "past_due" || subscriptionStatus === "suspended") {
    return { level: "critical" as const, label: "Critico" };
  }

  if (!connectReady || !primaryDomain) {
    return { level: "warning" as const, label: "Attenzione" };
  }

  return { level: "ok" as const, label: "OK" };
}

function HealthBadge({ level, label }: { level: "ok" | "warning" | "critical"; label: string }) {
  if (level === "ok") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />{label}</span>;
  }

  if (level === "warning") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"><Clock3 className="h-3.5 w-3.5" />{label}</span>;
  }

  return <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800"><AlertTriangle className="h-3.5 w-3.5" />{label}</span>;
}

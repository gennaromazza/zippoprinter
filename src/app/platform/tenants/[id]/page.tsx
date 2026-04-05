import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPlatformTenantDetail } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPlatformTenantDetail(id);

  if (!detail.tenant) {
    notFound();
  }

  const tenant = detail.tenant;
  const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
    : "";
  const supabaseDashboardHref = supabaseRef
    ? `https://supabase.com/dashboard/project/${supabaseRef}/editor`
    : "https://supabase.com/dashboard";
  const vercelDashboardHref =
    process.env.VERCEL_PROJECT_ID && process.env.VERCEL_TEAM_ID
      ? `https://vercel.com/${process.env.VERCEL_TEAM_ID}/${process.env.VERCEL_PROJECT_ID}`
      : "https://vercel.com/dashboard";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-kicker mb-2">Scheda studio</p>
          <h2 className="text-3xl font-semibold">{tenant.name || "Studio"}</h2>
          <p className="text-sm text-muted-foreground">{tenant.email}</p>
        </div>
        <Link href="/platform/tenants"><Button variant="outline">Torna all&apos;elenco</Button></Link>
      </div>

      <section className="grid gap-5 md:grid-cols-3">
        <InfoCard title="Stato abbonamento" value={detail.subscription?.status || "-"} text={detail.subscription?.stripe_subscription_id || "Gestione manuale"} />
        <InfoCard title="Pagamenti online" value={detail.billingAccount?.connect_status || "-"} text={detail.billingAccount?.stripe_connect_account_id || "Stripe Connect non collegato"} />
        <InfoCard title="Capacità attive" value={detail.entitlements?.can_accept_online_payments ? "Online abilitato" : "Online limitato"} text={detail.entitlements?.can_use_custom_domain ? "Dominio personalizzato abilitato" : "Dominio personalizzato disabilitato"} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader><CardDescription>Domini studio</CardDescription><CardTitle>Stato dominio</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {detail.domains.length === 0 ? <p className="text-sm text-muted-foreground">Nessun dominio configurato.</p> : detail.domains.map((domain) => (
              <div key={domain.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm">
                <div className="font-medium">{domain.domain}</div>
                <div className="text-xs text-muted-foreground">Verifica: {domain.verification_status} · SSL: {domain.ssl_status} · Attivo: {String(domain.is_active)}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader><CardDescription>Link operativi</CardDescription><CardTitle>Accessi rapidi</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {detail.billingAccount?.stripe_connect_account_id ? (
              <a className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 font-medium" target="_blank" rel="noreferrer" href={`https://dashboard.stripe.com/connect/accounts/${detail.billingAccount.stripe_connect_account_id}`}>
                Stripe Connect<ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            <a className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 font-medium" target="_blank" rel="noreferrer" href={supabaseDashboardHref}>
              Progetto Supabase<ExternalLink className="h-4 w-4" />
            </a>
            <a className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 font-medium" target="_blank" rel="noreferrer" href={vercelDashboardHref}>
              Progetto Vercel<ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader><CardDescription>Eventi pagamento</CardDescription><CardTitle>Timeline operativa</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {detail.recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">Nessun evento.</p> : detail.recentEvents.map((event) => (
              <div key={event.event_id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm">
                <div className="font-medium">{event.event_type}</div>
                <div className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("it-IT")} · {event.source} · processato={event.processed_at ? "sì" : "no"}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-[color:var(--border)] bg-white">
          <CardHeader><CardDescription>Storico audit</CardDescription><CardTitle>Traccia modifiche</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {detail.recentAudit.length === 0 ? <p className="text-sm text-muted-foreground">Nessun audit.</p> : detail.recentAudit.map((entry, index) => (
              <div key={`${entry.created_at}-${index}`} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm">
                <div className="font-medium">{entry.action}</div>
                <div className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("it-IT")} · {entry.resource_type}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function InfoCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="break-all text-sm text-muted-foreground">{text}</p></CardContent>
    </Card>
  );
}

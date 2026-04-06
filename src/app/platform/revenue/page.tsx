import { redirect } from "next/navigation";
import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { getRevenueMetrics } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatEur(cents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export default async function PlatformRevenuePage() {
  const auth = await getPlatformAdminContext();

  if (auth.status !== 200) {
    redirect("/platform");
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    redirect("/platform");
  }

  const { snapshot, byPlan } = await getRevenueMetrics();

  return (
    <div className="space-y-6">
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="MRR (Monthly Recurring Revenue)"
          value={snapshot ? formatEur(snapshot.mrr_cents) : "-"}
          text="Ricavo mensile ricorrente da abbonamenti attivi."
        />
        <MetricCard
          title="ARR (Annual Recurring Revenue)"
          value={snapshot ? formatEur(snapshot.arr_cents) : "-"}
          text="Proiezione ricavo annuale basata sugli abbonamenti attivi."
        />
        <MetricCard
          title="LTV stimato"
          value={snapshot && snapshot.estimated_ltv_cents > 0 ? formatEur(snapshot.estimated_ltv_cents) : "-"}
          text="Lifetime value medio per cliente, basato su MRR e churn rate."
        />
        <MetricCard
          title="Churn rate (30gg)"
          value={snapshot ? `${snapshot.churn_rate_pct}%` : "-"}
          text={`${snapshot?.churned_last_30d || 0} studi cancellati su ${snapshot?.active_total || 0} attivi negli ultimi 30 giorni.`}
          alert={snapshot ? snapshot.churn_rate_pct > 10 : false}
        />
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Nuovi trial (30gg)"
          value={String(snapshot?.new_trials_30d || 0)}
          text="Nuovi studi in prova negli ultimi 30 giorni."
        />
        <MetricCard
          title="Nuove attivazioni (30gg)"
          value={String(snapshot?.new_active_30d || 0)}
          text="Studi passati ad abbonamento attivo negli ultimi 30 giorni."
        />
        <MetricCard
          title="Tasso conversione trial (90gg)"
          value={snapshot ? `${snapshot.trial_conversion_rate_pct}%` : "-"}
          text="Percentuale di trial convertiti in abbonamento pagante negli ultimi 90 giorni."
          alert={snapshot ? snapshot.trial_conversion_rate_pct < 20 : false}
        />
      </section>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Dettaglio per piano</CardDescription>
          <CardTitle>Revenue per piano abbonamento</CardTitle>
        </CardHeader>
        <CardContent>
          {byPlan.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun piano attivo o dati non disponibili.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                    <th className="px-3 py-2">Piano</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Prezzo unitario</th>
                    <th className="px-3 py-2">Attivi</th>
                    <th className="px-3 py-2">In trial</th>
                    <th className="px-3 py-2">Cancellati</th>
                    <th className="px-3 py-2">MRR contribuito</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlan.map((plan) => (
                    <tr key={plan.plan_code} className="border-b border-[color:var(--border)]/60">
                      <td className="px-3 py-3 font-semibold">{plan.plan_name}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-semibold">
                          {plan.billing_mode || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">{plan.unit_price_cents != null ? formatEur(plan.unit_price_cents) : "-"}</td>
                      <td className="px-3 py-3">{plan.active_subscribers}</td>
                      <td className="px-3 py-3">{plan.trialing}</td>
                      <td className="px-3 py-3">{plan.canceled}</td>
                      <td className="px-3 py-3 font-semibold">{formatEur(plan.plan_mrr_cents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[color:var(--border)]">
                    <td colSpan={6} className="px-3 py-3 font-semibold">Totale MRR</td>
                    <td className="px-3 py-3 font-bold text-lg">
                      {formatEur(byPlan.reduce((sum, p) => sum + p.plan_mrr_cents, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[color:var(--border)] bg-white">
        <CardHeader>
          <CardDescription>Interpretazione metriche</CardDescription>
          <CardTitle>Come leggere questi dati</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p><strong>MRR (Monthly Recurring Revenue):</strong> somma dei ricavi mensili da abbonamenti attivi. Per piani annuali, il valore e diviso per 12.</p>
          <p><strong>ARR (Annual Recurring Revenue):</strong> MRR × 12. Utile per proiezioni finanziarie a lungo termine.</p>
          <p><strong>Churn rate:</strong> percentuale di studi cancellati negli ultimi 30 giorni rispetto al totale attivi. Sotto il 5% e sano, sopra il 10% richiede indagine.</p>
          <p><strong>LTV (Lifetime Value):</strong> ricavo medio per cliente nell&apos;intero ciclo di vita. Calcolato come ARPU / churn rate mensile. Piu alto = cliente piu redditizio.</p>
          <p><strong>Tasso conversione trial:</strong> percentuale di trial che diventano paganti entro 90 giorni. Obiettivo &gt; 25%.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  text,
  alert,
}: {
  title: string;
  value: string;
  text: string;
  alert?: boolean;
}) {
  return (
    <Card className={`border-[color:var(--border)] bg-white ${alert ? "border-red-300" : ""}`}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm ${alert ? "text-red-700 font-medium" : "text-muted-foreground"}`}>{text}</p>
      </CardContent>
    </Card>
  );
}

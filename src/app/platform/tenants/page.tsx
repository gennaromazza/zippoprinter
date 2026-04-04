import Link from "next/link";
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
        <CardDescription>Tenants board</CardDescription>
        <CardTitle>Stato SaaS / Connect / Domain</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-5">
          <input name="q" defaultValue={q} placeholder="Cerca nome o email" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="subscription" defaultValue={subscription} placeholder="subscription" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="connect" defaultValue={connect} placeholder="connect" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="domain" defaultValue={domain} placeholder="domain" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <Button type="submit" variant="outline">Filtra</Button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Subscription</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Connect</th>
                <th className="px-3 py-2">Domain</th>
                <th className="px-3 py-2">Last event</th>
                <th className="px-3 py-2">Dettaglio</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.photographer_id} className="border-b border-[color:var(--border)]/60">
                  <td className="px-3 py-3">
                    <div className="font-semibold">{row.name || "Studio"}</div>
                    <div className="text-xs text-muted-foreground">{row.email}</div>
                  </td>
                  <td className="px-3 py-3">{row.subscription_status}</td>
                  <td className="px-3 py-3">{row.subscription_plan_code || "-"}</td>
                  <td className="px-3 py-3">{row.connect_ready ? "ready" : (row.connect_status || "not_connected")}</td>
                  <td className="px-3 py-3">{row.primary_domain || "-"}</td>
                  <td className="px-3 py-3">{row.last_event_type || "-"}</td>
                  <td className="px-3 py-3">
                    <Link href={`/platform/tenants/${row.photographer_id}`}><Button variant="outline" size="sm">Apri</Button></Link>
                  </td>
                </tr>
              ))}
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

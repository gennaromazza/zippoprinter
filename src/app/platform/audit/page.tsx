import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tenantId = typeof params.tenantId === "string" ? params.tenantId : "";
  const processArea = typeof params.processArea === "string" ? params.processArea : "";
  const status = typeof params.status === "string" ? params.status : "";
  const correlationId = typeof params.correlationId === "string" ? params.correlationId : "";

  const admin = createAdminClient();
  let query = admin
    .from("process_audit_events")
    .select("event_id, occurred_at, actor_type, tenant_id, process_area, action, status, correlation_id, source, error_message")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  if (processArea) {
    query = query.eq("process_area", processArea);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (correlationId) {
    query = query.eq("correlation_id", correlationId);
  }

  const { data } = await query;
  const rows = data || [];

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Audit processo end-to-end</CardDescription>
        <CardTitle>Timeline investigativa</CardTitle>
        <p className="text-sm text-muted-foreground">
          Traccia tutti i passaggi critici: subscription, webhook, override owner e riconciliazioni.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-5">
          <input name="tenantId" defaultValue={tenantId} placeholder="ID studio" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="processArea" defaultValue={processArea} placeholder="area (subscription/webhook...)" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="status" defaultValue={status} placeholder="status" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="correlationId" defaultValue={correlationId} placeholder="correlation id" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm font-medium">Filtra</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Azione</th>
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Attore</th>
                <th className="px-3 py-2">Studio</th>
                <th className="px-3 py-2">Correlation</th>
                <th className="px-3 py-2">Errore</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.event_id} className="border-b border-[color:var(--border)]/60">
                  <td className="px-3 py-3">{new Date(row.occurred_at).toLocaleString("it-IT")}</td>
                  <td className="px-3 py-3">{row.process_area}</td>
                  <td className="px-3 py-3">{row.action}</td>
                  <td className="px-3 py-3">{row.status}</td>
                  <td className="px-3 py-3">{row.actor_type}</td>
                  <td className="px-3 py-3">{row.tenant_id || "-"}</td>
                  <td className="px-3 py-3 break-all">{row.correlation_id}</td>
                  <td className="px-3 py-3">{row.error_message || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

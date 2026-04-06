import { redirect } from "next/navigation";
import { getPlatformAdminContext, hasPlatformRole } from "@/lib/platform-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await getPlatformAdminContext();
  if (auth.status !== 200) {
    redirect("/platform");
  }

  if (!hasPlatformRole(auth.context.admin.role, "owner_support")) {
    redirect("/platform");
  }

  const params = await searchParams;
  const processArea = typeof params.processArea === "string" ? params.processArea : "";

  const admin = createAdminClient();
  let query = admin
    .from("process_audit_events")
    .select("event_id, occurred_at, actor_type, actor_id, tenant_id, process_area, action, status, correlation_id, error_message, metadata, created_at")
    .eq("actor_type", "owner")
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (processArea) {
    query = query.eq("process_area", processArea);
  }

  const { data } = await query;
  const items = data || [];

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Storico operazioni owner</CardDescription>
        <CardTitle>Le mie azioni recenti</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tutte le operazioni eseguite dagli amministratori della piattaforma: reset trial, riconciliazioni, replay, modifiche accesso.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-3">
          <select
            name="processArea"
            defaultValue={processArea}
            className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Tutte le aree</option>
            <option value="override">Override (reset trial)</option>
            <option value="reconcile">Riconciliazione</option>
            <option value="webhook">Webhook (replay)</option>
            <option value="access">Accesso</option>
            <option value="subscription">Subscription</option>
          </select>
          <button type="submit" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm font-medium">
            Filtra
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Azione</th>
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Studio</th>
                <th className="px-3 py-2">Errore</th>
                <th className="px-3 py-2">Correlation ID</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Nessuna azione owner registrata.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.event_id} className="border-b border-[color:var(--border)]/60">
                    <td className="px-3 py-3">{new Date(item.occurred_at).toLocaleString("it-IT")}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-semibold">
                        {item.process_area}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium">{item.action}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-3 py-3 break-all text-xs">{item.tenant_id || "-"}</td>
                    <td className="px-3 py-3 text-xs text-red-700">{item.error_message || "-"}</td>
                    <td className="px-3 py-3 break-all text-xs text-muted-foreground">{item.correlation_id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "succeeded") {
    return (
      <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Successo
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
        Fallito
      </span>
    );
  }
  if (status === "started") {
    return (
      <span className="inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
        Avviato
      </span>
    );
  }
  if (status === "rolled_back") {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Rollback
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-[color:var(--border)] px-2 py-0.5 text-xs font-semibold">
      {status}
    </span>
  );
}

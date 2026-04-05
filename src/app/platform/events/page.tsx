import { listPlatformEvents } from "@/lib/platform-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PlatformEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const source = typeof params.source === "string" ? params.source : "";
  const type = typeof params.type === "string" ? params.type : "";
  const photographerId = typeof params.photographerId === "string" ? params.photographerId : "";

  const data = await listPlatformEvents({
    source: source || undefined,
    type: type || undefined,
    photographerId: photographerId || undefined,
    limit: 150,
  });

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Flusso eventi piattaforma</CardDescription>
        <CardTitle>Eventi pagamenti e sincronizzazione</CardTitle>
        <p className="text-sm text-muted-foreground">
          Qui controlli cosa sta succedendo in tempo reale: utile per troubleshooting rapido e verifica stabilita.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-3 md:grid-cols-4">
          <input name="source" defaultValue={source} placeholder="sorgente (es. stripe_platform)" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="type" defaultValue={type} placeholder="tipo evento" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <input name="photographerId" defaultValue={photographerId} placeholder="ID studio" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm" />
          <button type="submit" className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm font-medium">Filtra eventi</button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Sorgente</th>
                <th className="px-3 py-2">Studio</th>
                <th className="px-3 py-2">Processato</th>
                <th className="px-3 py-2">ID evento</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((event) => (
                <tr key={event.event_id} className="border-b border-[color:var(--border)]/60">
                  <td className="px-3 py-3">{new Date(event.created_at).toLocaleString("it-IT")}</td>
                  <td className="px-3 py-3">{event.event_type}</td>
                  <td className="px-3 py-3">{event.source}</td>
                  <td className="px-3 py-3">{event.photographer_id || "Piattaforma"}</td>
                  <td className="px-3 py-3">{event.processed_at ? "Si" : "No"}</td>
                  <td className="px-3 py-3 break-all">{event.event_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

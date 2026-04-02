import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import type { Order, Photographer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrdersBoard } from "./orders-board";

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) redirect("/admin");

  const { data: ordersData } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("photographer_id", photographer.id)
    .order("created_at", { ascending: false });

  const orders = (ordersData as Order[] | null) ?? [];
  const ordersWithPreview = await Promise.all(
    orders.map(async (order) => {
      const firstItem = order.order_items?.[0];
      if (!firstItem) return order;
      const { data } = await supabase.storage.from("photos").createSignedUrl(firstItem.storage_path, 3600);
      return { ...order, preview_url: data?.signedUrl };
    })
  );

  return (
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-[color:var(--border)] bg-white px-5 py-5 shadow-[var(--shadow-sm)] md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/admin"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
              <div>
                <p className="section-kicker mb-2">Archivio ordini</p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Console operativa ordini</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Filtra i lavori in ingresso, controlla il pagamento e apri subito il dettaglio delle immagini.</p>
              </div>
            </div>
            <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/45 px-4 py-2 text-sm font-semibold text-foreground">{orders.length} ordini totali</div>
          </div>
        </header>

        <main className="mt-6">
          <Card className="border-[color:var(--border)] bg-white">
            <CardHeader>
              <CardDescription>Ordini studio</CardDescription>
              <CardTitle>Vista operativa</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/25 p-10 text-center">
                  <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-semibold text-foreground">Nessun ordine disponibile</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Gli ordini confermati dai clienti compariranno qui con anteprima, stato e stato pagamento.</p>
                </div>
              ) : (
                <OrdersBoard orders={ordersWithPreview as Array<Order & { preview_url?: string }>} />
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

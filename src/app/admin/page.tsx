import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ExternalLink, ImageIcon, LogOut, Package, Palette, Sparkles, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import { formatCurrency, formatShortDate, getOrderCustomerDisplayName, orderStatusMeta } from "@/lib/orders";
import { getStudioHref } from "@/lib/studio-paths";
import { getPaymentModeLabel } from "@/lib/payments";
import type { Order, Photographer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const headerStore = await headers();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) redirect("/login");

  const [{ count: ordersCount }, { count: pendingCount }, { count: readyCount }, { data: recentOrdersData }] =
    await Promise.all([
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("photographer_id", photographer.id),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("photographer_id", photographer.id).in("status", ["pending", "paid", "printing"]),
      supabase.from("orders").select("*", { count: "exact", head: true }).eq("photographer_id", photographer.id).eq("status", "ready"),
      supabase.from("orders").select("*, order_items (*)").eq("photographer_id", photographer.id).order("created_at", { ascending: false }).limit(5),
    ]);

  const recentOrders = (recentOrdersData as Order[] | null) ?? [];
  const publicPath = getStudioHref(photographer.id);
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const origin = host ? `${forwardedProto || "http"}://${host}` : process.env.NEXT_PUBLIC_SITE_URL || "";
  const publicUrl = `${origin}${publicPath}`;

  const signOut = async () => {
    "use server";
    const serverSupabase = await createClient();
    await serverSupabase.auth.signOut();
    redirect("/login");
  };

  return (
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] border border-[color:var(--border)] bg-white px-5 py-5 shadow-[var(--shadow-sm)] md:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(217,121,66,0.2)]">
                <ImageIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="section-kicker mb-2"><Sparkles className="h-3.5 w-3.5" />Dashboard studio</p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{photographer.name || "Studio fotografico"}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Controlla i lavori in arrivo, il metodo di incasso attivo e la vetrina cliente dedicata al tuo studio.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/45 px-4 py-2 text-sm font-semibold text-foreground">{getPaymentModeLabel(photographer.payment_mode || "pay_in_store")}</span>
              <form action={signOut}><Button variant="outline" size="sm"><LogOut className="h-4 w-4" />Esci</Button></form>
            </div>
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard title="Ordini totali" value={String(ordersCount || 0)} text="Volume complessivo registrato per lo studio." />
          <MetricCard title="In lavorazione" value={String(pendingCount || 0)} text="Ordini nuovi, pagati o gia entrati in produzione." />
          <MetricCard title="Pronti al ritiro" value={String(readyCount || 0)} text="Lavori pronti da consegnare o notificare al cliente." />
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-5">
            <Link href="/admin/orders">
              <Card className="border-[color:var(--border)] bg-white hover:-translate-y-0.5">
                <CardHeader><CardDescription>Operativita</CardDescription><CardTitle>Gestisci ordini</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-6 text-muted-foreground">Apri la console ordini con filtri, preview e stato pagamento.</p></CardContent>
              </Card>
            </Link>
            <Link href="/admin/settings">
              <Card className="border-[color:var(--border)] bg-white hover:-translate-y-0.5">
                <CardHeader><CardDescription>White-label e checkout</CardDescription><CardTitle>Branding e modalita incasso</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm leading-6 text-muted-foreground">Aggiorna nome studio, colore, listini, pagamento online e acconto.</p>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/45 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground"><Palette className="h-3.5 w-3.5" />Checkout per-tenant</div>
                </CardContent>
              </Card>
            </Link>
            <Link href={publicPath} target="_blank">
              <Card className="border-[color:var(--border)] bg-white hover:-translate-y-0.5">
                <CardHeader><CardDescription>Pagina cliente</CardDescription><CardTitle>Apri vetrina pubblica</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">Questo e il link dedicato da condividere ai tuoi clienti.</p>
                  <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/35 px-4 py-3"><p className="break-all text-sm font-medium text-foreground">{publicUrl}</p></div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Store className="h-4 w-4" />Apri storefront<ExternalLink className="h-4 w-4" /></div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <Card className="border-[color:var(--border)] bg-white">
            <CardHeader><CardDescription>Ultimi ordini</CardDescription><CardTitle>Panoramica rapida</CardTitle></CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/25 p-8 text-center">
                  <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-semibold text-foreground">Nessun ordine ancora</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Quando un cliente inviera un ordine, comparira qui.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => {
                    const status = orderStatusMeta[order.status];
                    return (
                      <Link key={order.id} href={`/admin/orders/${order.id}`} className="flex flex-col gap-4 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/15 p-4 hover:bg-[color:var(--muted)]/35 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-base font-semibold text-foreground">{getOrderCustomerDisplayName(order)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{formatShortDate(order.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${status.className}`}><span className={`status-dot ${status.dotClassName}`} />{status.label}</span>
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(order.total_cents ?? 0)}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader><CardDescription>{title}</CardDescription><CardTitle className="text-5xl">{value}</CardTitle></CardHeader>
      <CardContent><p className="text-sm leading-6 text-muted-foreground">{text}</p></CardContent>
    </Card>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/orders";
import { getStorefrontByPhotographerId } from "@/lib/photographers";
import type { Order } from "@/lib/types";
export const dynamic = "force-dynamic";

export default async function CheckoutCancelledPage({
  params,
  searchParams,
}: {
  params: Promise<{ photographerId: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { photographerId } = await params;
  const { order: orderId } = await searchParams;
  const storefront = await getStorefrontByPhotographerId(photographerId);

  if (!storefront) {
    notFound();
  }

  let order: Order | null = null;

  if (orderId) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    order = (data as Order | null) ?? null;
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-[2rem] border border-[color:var(--border)] bg-white p-8 shadow-[var(--shadow-sm)] md:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertCircle className="h-10 w-10" />
          </div>
          <p className="section-kicker mx-auto mt-6">Pagamento interrotto</p>
          <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            Il checkout non è stato completato.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-muted-foreground">
            Nessun addebito confermato. Puoi tornare alla pagina dello studio e ripetere
            l&apos;operazione quando vuoi.
          </p>

          {order && (
            <div className="mt-8 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ordine salvato
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">{order.customer_email}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Totale previsto {formatCurrency(order.total_cents)}.
              </p>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Link href={`/studio/${photographerId}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground shadow-[0_14px_30px_rgba(143,93,44,0.28)] hover:bg-[#7e4f20]">
              <ArrowLeft className="h-4 w-4" />
              Torna allo studio
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

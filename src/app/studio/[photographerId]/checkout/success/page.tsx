import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CreditCard, Store } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency } from "@/lib/orders";
import { getOrderPaymentHeadline } from "@/lib/payments";
import { getStripeClient } from "@/lib/stripe";
import { getStorefrontByPhotographerId } from "@/lib/photographers";
import type { Order } from "@/lib/types";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ photographerId: string }>;
  searchParams: Promise<{ order?: string; session_id?: string }>;
}) {
  const { photographerId } = await params;
  const { order: orderId, session_id: sessionId } = await searchParams;
  const storefront = await getStorefrontByPhotographerId(photographerId);

  if (!storefront) {
    notFound();
  }

  const admin = createAdminClient();
  let order: Order | null = null;

  if (orderId) {
    const { data } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    order = (data as Order | null) ?? null;
  }

  if (order && sessionId) {
    const stripe = getStripeClient();

    if (stripe) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid") {
        const amountPaidCents = session.amount_total ?? order.amount_paid_cents;
        const amountDueCents = Math.max(order.total_cents - amountPaidCents, 0);

        const { data: updatedOrder } = await admin
          .from("orders")
          .update({
            status: "paid",
            payment_status: amountDueCents > 0 ? "partial" : "paid",
            amount_paid_cents: amountPaidCents,
            amount_due_cents: amountDueCents,
            paid_at: order.paid_at || new Date(session.created * 1000).toISOString(),
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
          })
          .eq("id", order.id)
          .select("*")
          .maybeSingle();

        order = (updatedOrder as Order | null) ?? order;
      }
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-[2rem] border border-[color:var(--border)] bg-white p-8 shadow-[var(--shadow-sm)] md:p-10">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <p className="section-kicker mx-auto mt-6">Checkout completato</p>
          <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight md:text-5xl">
            Ordine confermato per {storefront.photographer.name || "lo studio fotografico"}.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-muted-foreground">
            Lo studio ha ricevuto il tuo ordine con il riepilogo immagini. Trovi sotto il quadro
            del pagamento e delle prossime fasi.
          </p>

          {order && (
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Totale ordine
                </p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {formatCurrency(order.total_cents)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Incassato ora
                </p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {formatCurrency(order.amount_paid_cents)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Da saldare
                </p>
                <p className="mt-3 text-2xl font-semibold text-foreground">
                  {formatCurrency(order.amount_due_cents)}
                </p>
              </div>
            </div>
          )}

          {order && (
            <div className="mt-6 rounded-[1.6rem] border border-[color:var(--border)] bg-white p-5">
              <div className="flex items-start gap-3">
                {order.amount_due_cents > 0 ? (
                  <Store className="mt-1 h-5 w-5 text-primary" />
                ) : (
                  <CreditCard className="mt-1 h-5 w-5 text-primary" />
                )}
                <div>
                  <p className="font-semibold text-foreground">{getOrderPaymentHeadline(order)}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {order.amount_due_cents > 0
                      ? "Il saldo residuo verra completato direttamente in studio al ritiro o secondo le indicazioni del fotografo."
                      : "Il pagamento copre integralmente l'ordine. Lo studio puo avviare la produzione delle stampe."}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={`/studio/${photographerId}`}>
              <Button size="lg">Torna alla pagina studio</Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

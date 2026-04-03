import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, MessageCircle, Package, Play, ReceiptText, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPhotographerForUser } from "@/lib/photographers";
import {
  formatCurrency,
  formatDateTime,
  getOrderCustomerDisplayName,
  orderStatusMeta,
  paymentModeLabel,
  paymentStatusMeta,
} from "@/lib/orders";
import { getOrderPaymentHeadline } from "@/lib/payments";
import type { Order, OrderItem, Photographer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderExportPanel } from "./order-export-panel";
import { deleteOrderPhotos, recordOrderDeposit, recordOrderPayment, updateOrderStatus } from "./actions";

interface OrderItemWithUrl extends OrderItem {
  signedUrl?: string;
}

function buildWhatsAppHref(phone: string | null, text: string) {
  const normalized = (phone || "").replace(/\D/g, "");
  if (!normalized) {
    return "";
  }

  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const photographer = (await getCurrentPhotographerForUser(user)) as Photographer | null;
  if (!photographer) redirect("/admin");

  const { data: orderData } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("id", id)
    .eq("photographer_id", photographer.id)
    .single();

  if (!orderData) notFound();

  const order = orderData as Order;
  const orderItems = order.order_items || [];
  const itemsWithUrls: OrderItemWithUrl[] = await Promise.all(
    orderItems.map(async (item) => {
      const { data } = await supabase.storage.from("photos").createSignedUrl(item.storage_path, 3600);
      return { ...item, signedUrl: data?.signedUrl };
    })
  );

  const status = orderStatusMeta[order.status];
  const payment = paymentStatusMeta[order.payment_status || "unpaid"];
  const amountPaidCents = order.amount_paid_cents ?? 0;
  const amountDueCents = order.amount_due_cents ?? order.total_cents ?? 0;
  const paymentMode = order.payment_mode_snapshot || "pay_in_store";
  const canStartPrinting =
    paymentMode === "pay_in_store" ||
    order.payment_status === "paid" ||
    order.payment_status === "partial" ||
    order.payment_status === "not_required" ||
    amountPaidCents > 0;
  const customerLabel = getOrderCustomerDisplayName(order);
  const readyMessage = `Ciao ${customerLabel}, il tuo ordine ${order.id} e pronto per il ritiro in studio.`;
  const depositReceiptMessage = `Ciao ${customerLabel}, abbiamo registrato l'acconto per l'ordine ${order.id}. Totale ordine: ${formatCurrency(order.total_cents)}. Acconto ricevuto: ${formatCurrency(amountPaidCents)}. Saldo residuo: ${formatCurrency(amountDueCents)}.`;
  const saldoReminderMessage = `Ciao ${customerLabel}, per completare l'ordine ${order.id} resta da saldare ${formatCurrency(amountDueCents)}. Totale ordine: ${formatCurrency(order.total_cents)}.`;
  const paidReceiptMessage = `Ciao ${customerLabel}, confermiamo il saldo completo dell'ordine ${order.id}. Totale pagato: ${formatCurrency(order.total_cents)}. Grazie!`;
  const whatsappReadyUrl = buildWhatsAppHref(order.customer_phone, readyMessage);
  const whatsappDepositUrl = buildWhatsAppHref(order.customer_phone, depositReceiptMessage);
  const whatsappSaldoUrl = buildWhatsAppHref(order.customer_phone, saldoReminderMessage);
  const whatsappPaidUrl = buildWhatsAppHref(order.customer_phone, paidReceiptMessage);

  return (
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-[2rem] border border-[color:var(--border)] bg-white px-5 py-5 shadow-[var(--shadow-sm)] md:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/admin/orders">
                <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
              </Link>
              <div>
                <p className="section-kicker mb-2">Dettaglio ordine</p>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{customerLabel}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ricevuto il {formatDateTime(order.created_at)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${status.className}`}><span className={`status-dot ${status.dotClassName}`} />{status.label}</span>
              <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${payment.className}`}><span className={`status-dot ${payment.dotClassName}`} />{payment.label}</span>
            </div>
          </div>
        </header>

        <main className="mt-6 space-y-6">
          <OrderExportPanel orderId={order.id} />

          <section className="grid gap-5 lg:grid-cols-4">
            <Card className="border-[color:var(--border)] bg-white">
              <CardHeader><CardDescription>Cliente</CardDescription><CardTitle>Contatti</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm leading-6">
                <p><span className="font-semibold">Email:</span> {order.customer_email}</p>
                {order.customer_first_name && <p><span className="font-semibold">Nome:</span> {order.customer_first_name}</p>}
                {order.customer_last_name && <p><span className="font-semibold">Cognome:</span> {order.customer_last_name}</p>}
                {!order.customer_first_name && order.customer_name && <p><span className="font-semibold">Nome:</span> {order.customer_name}</p>}
                {order.customer_phone && <p><span className="font-semibold">Telefono:</span> {order.customer_phone}</p>}
                {whatsappReadyUrl && (
                  <a href={whatsappReadyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/35 px-4 py-3 text-sm font-semibold text-foreground hover:bg-[color:var(--muted)]">
                    <MessageCircle className="h-4 w-4" />
                    Messaggio ordine pronto
                  </a>
                )}
                {paymentMode === "deposit_plus_studio" && order.payment_status === "partial" && whatsappDepositUrl && (
                  <a href={whatsappDepositUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                    <ReceiptText className="h-4 w-4" />
                    Ricevuta acconto
                  </a>
                )}
                {amountDueCents > 0 && whatsappSaldoUrl && (
                  <a href={whatsappSaldoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[color:var(--border)] bg-white px-4 py-3 text-sm font-semibold text-foreground hover:bg-[color:var(--muted)]/35">
                    <CreditCard className="h-4 w-4" />
                    Richiesta saldo
                  </a>
                )}
                {amountDueCents === 0 && whatsappPaidUrl && (
                  <a href={whatsappPaidUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
                    <ReceiptText className="h-4 w-4" />
                    Ricevuta saldo completo
                  </a>
                )}
              </CardContent>
            </Card>

            <Card className="border-[color:var(--border)] bg-white">
              <CardHeader><CardDescription>Valore ordine</CardDescription><CardTitle>{formatCurrency(order.total_cents)}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm leading-6">
                <p><span className="font-semibold">Incassato:</span> {formatCurrency(amountPaidCents)}</p>
                <p><span className="font-semibold">Residuo:</span> {formatCurrency(amountDueCents)}</p>
                <p><span className="font-semibold">Modalita:</span> {paymentModeLabel(paymentMode)}</p>
              </CardContent>
            </Card>

            <Card className="border-[color:var(--border)] bg-white lg:col-span-2">
              <CardHeader><CardDescription>Operazioni rapide</CardDescription><CardTitle>{getOrderPaymentHeadline(order)}</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {paymentMode === "deposit_plus_studio" && order.payment_status === "unpaid" && amountDueCents > 0 && (
                  <form action={recordOrderDeposit.bind(null, order.id)}>
                    <Button variant="outline" className="w-full">
                      <ReceiptText className="h-4 w-4" />
                      Registra acconto
                    </Button>
                  </form>
                )}
                {(order.payment_status === "unpaid" || order.payment_status === "partial" || paymentMode === "pay_in_store" || !order.payment_status) && amountDueCents > 0 && (
                  <form action={recordOrderPayment.bind(null, order.id)}><Button className="w-full"><CreditCard className="h-4 w-4" />Registra pagamento</Button></form>
                )}
                {(order.status === "pending" || order.status === "paid") && canStartPrinting && (
                  <form action={updateOrderStatus.bind(null, order.id, "printing")}><Button variant="outline" className="w-full"><Play className="h-4 w-4" />Avvia stampa</Button></form>
                )}
                {order.status === "printing" && (
                  <form action={updateOrderStatus.bind(null, order.id, "ready")}><Button variant="outline" className="w-full"><CheckCircle2 className="h-4 w-4" />Segna pronto</Button></form>
                )}
                {order.status === "ready" && (
                  <form action={updateOrderStatus.bind(null, order.id, "completed")}><Button variant="outline" className="w-full"><Package className="h-4 w-4" />Completa ordine</Button></form>
                )}
                {itemsWithUrls.length > 0 && (
                  <form action={deleteOrderPhotos.bind(null, order.id, itemsWithUrls.map((item) => item.storage_path))}><Button variant="destructive" className="w-full"><Trash2 className="h-4 w-4" />Elimina foto archiviate</Button></form>
                )}
              </CardContent>
              {(order.status === "pending" || order.status === "paid") && !canStartPrinting && (
                <CardContent className="pt-0">
                  <p className="rounded-[1.2rem] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Non puoi avviare la stampa: ordine senza pagamento o acconto registrato.
                  </p>
                </CardContent>
              )}
            </Card>
          </section>

          <Card className="border-[color:var(--border)] bg-white">
            <CardHeader><CardDescription>Foto da stampare</CardDescription><CardTitle>Archivio ordine</CardTitle></CardHeader>
            <CardContent>
              {itemsWithUrls.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/25 p-10 text-center">
                  <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-semibold text-foreground">Nessuna foto presente</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Questo ordine non contiene immagini disponibili.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {itemsWithUrls.map((item) => (
                    <article key={item.id} className="overflow-hidden rounded-[1.6rem] border border-[color:var(--border)] bg-white">
                      <div className="relative aspect-square overflow-hidden">
                        {item.signedUrl ? (
                          <Image src={item.signedUrl} alt={item.original_filename || item.format_name} fill unoptimized className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[color:var(--muted)] text-sm text-muted-foreground">Anteprima non disponibile</div>
                        )}
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="text-sm font-semibold text-foreground">{item.format_name}</p>
                        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Quantita {item.quantity}</p>
                        <p className="text-sm text-muted-foreground">{item.original_filename || "Nome file non disponibile"}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

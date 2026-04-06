"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, MessageCircle } from "lucide-react";
import {
  formatCurrency,
  formatDateTime,
  getOrderCustomerDisplayName,
  orderStatusMeta,
  paymentStatusMeta,
} from "@/lib/orders";
import type { Order, OrderItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

type FilterValue = "all" | Order["status"];

interface OrderCard extends Order {
  preview_url?: string;
  order_items?: OrderItem[];
}

export function OrdersBoard({ orders }: { orders: OrderCard[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((order) => order.status === "pending" || order.status === "paid").length,
      printing: orders.filter((order) => order.status === "printing").length,
      ready: orders.filter((order) => order.status === "ready").length,
      completed: orders.filter((order) => order.status === "completed").length,
    }),
    [orders]
  );
  const filteredOrders =
    filter === "all"
      ? orders
      : filter === "pending"
        ? orders.filter((order) => order.status === "pending" || order.status === "paid")
        : orders.filter((order) => order.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: `Tutti (${counts.all})` },
          { key: "pending", label: `Da lavorare (${counts.pending})` },
          { key: "printing", label: `In stampa (${counts.printing})` },
          { key: "ready", label: `Pronti (${counts.ready})` },
          { key: "completed", label: `Completati (${counts.completed})` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key as FilterValue)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              filter === item.key ? "bg-primary text-primary-foreground" : "border border-[color:var(--border)] bg-white text-foreground hover:bg-[color:var(--muted)]/55"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const status = orderStatusMeta[order.status];
          const payment = paymentStatusMeta[order.payment_status || "unpaid"];
          const whatsappHref = order.customer_phone ? `https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent("Ciao! Ti aggiorniamo sul tuo ordine di stampa.")}` : null;
          const customerLabel = getOrderCustomerDisplayName(order);

          return (
            <article key={order.id} className="grid gap-4 rounded-[1.7rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] lg:grid-cols-[112px_1fr_auto]">
              <div className="relative aspect-square overflow-hidden rounded-[1.2rem] bg-[color:var(--muted)]/45">
                {order.preview_url ? (
                  <Image src={order.preview_url} alt={order.customer_email} fill className="object-cover" sizes="112px" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Nessuna preview</div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{customerLabel}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{formatDateTime(order.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${status.className}`}><span className={`status-dot ${status.dotClassName}`} />{status.label}</span>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${payment.className}`}><span className={`status-dot ${payment.dotClassName}`} />{payment.label}</span>
                  </div>
                </div>
                <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-4">
                  <p>{order.customer_email}</p>
                  <p>{order.customer_phone || "Telefono non inserito"}</p>
                  <p>{order.order_items?.length || 0} immagini</p>
                  <p className="font-semibold text-foreground">{formatCurrency(order.total_cents)}</p>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-3 lg:items-end">
                <Link href={`/admin/orders/${order.id}`}><Button variant="outline"><Eye className="h-4 w-4" />Apri ordine</Button></Link>
                {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer"><Button variant="ghost"><MessageCircle className="h-4 w-4" />Messaggio</Button></a>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

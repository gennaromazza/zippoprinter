import type { OrderPaymentStatus, OrderStatus, PaymentMode } from "./types";

export const orderStatusMeta: Record<
  OrderStatus,
  { label: string; className: string; dotClassName: string }
> = {
  pending: {
    label: "In attesa",
    className: "border-amber-300/70 bg-amber-100/80 text-amber-900",
    dotClassName: "bg-amber-500",
  },
  paid: {
    label: "Pagato",
    className: "border-sky-300/70 bg-sky-100/80 text-sky-900",
    dotClassName: "bg-sky-500",
  },
  printing: {
    label: "In stampa",
    className: "border-fuchsia-300/70 bg-fuchsia-100/80 text-fuchsia-900",
    dotClassName: "bg-fuchsia-500",
  },
  ready: {
    label: "Pronto",
    className: "border-emerald-300/70 bg-emerald-100/80 text-emerald-900",
    dotClassName: "bg-emerald-500",
  },
  completed: {
    label: "Completato",
    className: "border-stone-300/70 bg-stone-200/80 text-stone-900",
    dotClassName: "bg-stone-500",
  },
  cancelled: {
    label: "Annullato",
    className: "border-rose-300/70 bg-rose-100/80 text-rose-900",
    dotClassName: "bg-rose-500",
  },
};

export const paymentStatusMeta: Record<
  OrderPaymentStatus,
  { label: string; className: string; dotClassName: string }
> = {
  unpaid: {
    label: "Da incassare",
    className: "border-amber-300/70 bg-amber-100/80 text-amber-900",
    dotClassName: "bg-amber-500",
  },
  partial: {
    label: "Acconto ricevuto",
    className: "border-orange-300/70 bg-orange-100/80 text-orange-900",
    dotClassName: "bg-orange-500",
  },
  paid: {
    label: "Saldo coperto",
    className: "border-emerald-300/70 bg-emerald-100/80 text-emerald-900",
    dotClassName: "bg-emerald-500",
  },
  not_required: {
    label: "Pagamento in studio",
    className: "border-stone-300/70 bg-stone-200/80 text-stone-900",
    dotClassName: "bg-stone-500",
  },
  cancelled: {
    label: "Pagamento annullato",
    className: "border-rose-300/70 bg-rose-100/80 text-rose-900",
    dotClassName: "bg-rose-500",
  },
};

export function paymentModeLabel(mode: PaymentMode) {
  switch (mode) {
    case "online_full":
      return "Online completo";
    case "deposit_plus_studio":
      return "Acconto + saldo in studio";
    case "pay_in_store":
      return "Pagamento in studio";
    default:
      return "Pagamento in studio";
  }
}

export function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(valueCents / 100);
}

export function formatDateTime(value: string, withTime = true) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
        }
      : {}),
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

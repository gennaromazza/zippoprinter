import type { DepositType, Order, PaymentMode, Photographer } from "./types";

export const defaultPaymentMode: PaymentMode = "pay_in_store";

export function getPhotographerPaymentMode(photographer: Photographer | null | undefined): PaymentMode {
  return photographer?.payment_mode || defaultPaymentMode;
}

export function requiresOnlinePayment(mode: PaymentMode) {
  return mode === "online_full";
}

export function prefersOnlinePayment(mode: PaymentMode) {
  return mode === "deposit_plus_studio";
}

export function getPaymentModeLabel(mode: PaymentMode) {
  switch (mode) {
    case "online_full":
      return "Pagamento online completo";
    case "deposit_plus_studio":
      return "Acconto online + saldo in studio";
    case "pay_in_store":
      return "Pagamento in studio";
    default:
      return "Pagamento in studio";
  }
}

export function getDepositTypeLabel(type: DepositType) {
  return type === "fixed" ? "Importo fisso" : "Percentuale";
}

function clampAmount(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDepositAmountCents(
  totalCents: number,
  photographer:
    | Pick<Photographer, "deposit_type" | "deposit_value">
    | null
    | undefined
) {
  const type = photographer?.deposit_type || "percentage";
  const rawValue = photographer?.deposit_value ?? 30;

  if (type === "fixed") {
    return clampAmount(rawValue, 100, totalCents);
  }

  return clampAmount(Math.round((totalCents * rawValue) / 100), 100, totalCents);
}

export function getCheckoutAmounts(
  totalCents: number,
  photographer: Photographer | null | undefined,
  options?: { stripeAvailable?: boolean },
) {
  const mode = getPhotographerPaymentMode(photographer);
  const stripeAvailable = options?.stripeAvailable ?? true;

  if (mode === "pay_in_store") {
    return {
      mode,
      dueNowCents: 0,
      remainingCents: totalCents,
      title: "Pagamento in studio",
      description: "Invia l'ordine ora e completa il pagamento direttamente al ritiro o in negozio.",
    };
  }

  if (mode === "deposit_plus_studio") {
    const depositCents = getDepositAmountCents(totalCents, photographer);
    if (!stripeAvailable) {
      return {
        mode,
        dueNowCents: 0,
        remainingCents: totalCents,
        title: "Acconto in studio",
        description: `Invia l'ordine e versa l'acconto di ${formatCentsForDescription(depositCents)} direttamente in studio.`,
      };
    }
    return {
      mode,
      dueNowCents: depositCents,
      remainingCents: Math.max(totalCents - depositCents, 0),
      title: "Acconto online",
      description: "Blocca l'ordine con un acconto adesso e salda il resto direttamente in studio.",
    };
  }

  return {
    mode,
    dueNowCents: totalCents,
    remainingCents: 0,
    title: "Pagamento online completo",
    description: "Completa il pagamento adesso per confermare l'ordine allo studio.",
  };
}

function formatCentsForDescription(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",") + " \u20AC";
}

export function getOrderPaymentHeadline(order: Pick<Order, "payment_mode_snapshot" | "payment_status">) {
  const mode = order.payment_mode_snapshot || defaultPaymentMode;

  if (mode === "pay_in_store") {
    return "Pagamento in studio";
  }

  if (order.payment_status === "partial") {
    return "Acconto registrato";
  }

  return "Pagamento online";
}

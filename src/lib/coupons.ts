import type { PaymentMode } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CouponDiscountMode = "fixed" | "percent";
export type CouponStatus = "active" | "paused" | "expired";

export type CouponValidationErrorCode =
  | "INVALID_CODE"
  | "INACTIVE"
  | "EXPIRED"
  | "NOT_STARTED"
  | "MIN_ORDER_NOT_MET"
  | "MAX_REDEMPTIONS_REACHED"
  | "PER_CUSTOMER_LIMIT_REACHED"
  | "DISCOUNT_NOT_APPLICABLE"
  | "UNSUPPORTED_PAYMENT_MODE";

export interface CouponRecord {
  id: string;
  photographer_id: string;
  code: string;
  description: string | null;
  discount_mode: CouponDiscountMode;
  discount_value: number;
  max_discount_cents: number | null;
  min_order_cents: number;
  max_redemptions: number | null;
  redemptions_count: number;
  per_customer_limit: number | null;
  status: CouponStatus;
  valid_from: string | null;
  valid_until: string | null;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discountCents: number;
  message: string;
  errorCode?: CouponValidationErrorCode;
  coupon?: CouponRecord;
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeCouponCode(value: string) {
  return value.trim().toUpperCase();
}

export function calculateCouponDiscountCents(input: {
  orderTotalCents: number;
  discountMode: CouponDiscountMode;
  discountValue: number;
  maxDiscountCents?: number | null;
}) {
  const safeTotal = Math.max(0, Math.round(input.orderTotalCents));
  if (safeTotal <= 0) {
    return 0;
  }

  if (input.discountMode === "fixed") {
    const fixed = Math.max(0, Math.round(input.discountValue));
    return Math.min(fixed, safeTotal);
  }

  const percent = Math.max(0, Math.min(100, input.discountValue));
  const rawDiscount = Math.round((safeTotal * percent) / 100);
  const cappedDiscount =
    input.maxDiscountCents && input.maxDiscountCents > 0
      ? Math.min(rawDiscount, input.maxDiscountCents)
      : rawDiscount;

  return Math.min(Math.max(cappedDiscount, 0), safeTotal);
}

function validateCouponWindow(coupon: CouponRecord) {
  const now = nowIso();
  if (coupon.valid_from && coupon.valid_from > now) {
    return { ok: false, errorCode: "NOT_STARTED" as const, message: "Questo coupon non e ancora attivo." };
  }

  if (coupon.valid_until && coupon.valid_until < now) {
    return { ok: false, errorCode: "EXPIRED" as const, message: "Questo coupon e scaduto." };
  }

  return { ok: true as const };
}

async function countCustomerRedemptions(input: {
  admin: SupabaseClient;
  couponId: string;
  customerEmail: string;
}) {
  const { count, error } = await input.admin
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", input.couponId)
    .ilike("customer_email", input.customerEmail.trim().toLowerCase());

  if (error) {
    throw new Error(error.message || "Errore nel controllo utilizzo coupon.");
  }

  return count || 0;
}

export async function validateCoupon(input: {
  admin: SupabaseClient;
  photographerId: string;
  couponCode: string;
  orderTotalCents: number;
  customerEmail: string;
  paymentMode: PaymentMode;
}) : Promise<CouponValidationResult> {
  const normalizedCode = normalizeCouponCode(input.couponCode);
  if (!normalizedCode) {
    return {
      valid: false,
      code: "",
      discountCents: 0,
      errorCode: "INVALID_CODE",
      message: "Inserisci un codice coupon valido.",
    };
  }

  if (!["online_full", "deposit_plus_studio", "pay_in_store"].includes(input.paymentMode)) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "UNSUPPORTED_PAYMENT_MODE",
      message: "Modalita di pagamento non supportata per il coupon.",
    };
  }

  const { data, error } = await input.admin
    .from("coupons")
    .select(
      "id, photographer_id, code, description, discount_mode, discount_value, max_discount_cents, min_order_cents, max_redemptions, redemptions_count, per_customer_limit, status, valid_from, valid_until"
    )
    .eq("photographer_id", input.photographerId)
    .ilike("code", normalizedCode)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Errore durante la validazione coupon.");
  }

  if (!data) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "INVALID_CODE",
      message: "Coupon non valido.",
    };
  }

  const coupon = data as CouponRecord;

  if (coupon.status !== "active") {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "INACTIVE",
      message: "Questo coupon non e attivo.",
    };
  }

  const windowValidation = validateCouponWindow(coupon);
  if (!windowValidation.ok) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: windowValidation.errorCode,
      message: windowValidation.message,
    };
  }

  if (input.orderTotalCents < coupon.min_order_cents) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "MIN_ORDER_NOT_MET",
      message: `Coupon valido da ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(coupon.min_order_cents / 100)} in su.`,
    };
  }

  if (coupon.max_redemptions !== null && coupon.redemptions_count >= coupon.max_redemptions) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "MAX_REDEMPTIONS_REACHED",
      message: "Questo coupon ha raggiunto il limite di utilizzi.",
    };
  }

  if (coupon.per_customer_limit !== null && input.customerEmail.trim()) {
    const usageCount = await countCustomerRedemptions({
      admin: input.admin,
      couponId: coupon.id,
      customerEmail: input.customerEmail,
    });

    if (usageCount >= coupon.per_customer_limit) {
      return {
        valid: false,
        code: normalizedCode,
        discountCents: 0,
        errorCode: "PER_CUSTOMER_LIMIT_REACHED",
        message: "Hai gia usato questo coupon il numero massimo di volte consentito.",
      };
    }
  }

  const discountCents = calculateCouponDiscountCents({
    orderTotalCents: input.orderTotalCents,
    discountMode: coupon.discount_mode,
    discountValue: coupon.discount_value,
    maxDiscountCents: coupon.max_discount_cents,
  });

  if (discountCents <= 0) {
    return {
      valid: false,
      code: normalizedCode,
      discountCents: 0,
      errorCode: "DISCOUNT_NOT_APPLICABLE",
      message: "Il coupon non e applicabile a questo ordine.",
    };
  }

  return {
    valid: true,
    code: normalizedCode,
    discountCents,
    message: "Coupon applicato con successo.",
    coupon,
  };
}

export async function registerCouponRedemption(input: {
  admin: SupabaseClient;
  coupon: CouponRecord;
  orderId: string;
  photographerId: string;
  customerEmail: string;
  discountAppliedCents: number;
}) {
  if (input.discountAppliedCents <= 0) {
    return;
  }

  const { error: redemptionError } = await input.admin.from("coupon_redemptions").insert({
    coupon_id: input.coupon.id,
    order_id: input.orderId,
    photographer_id: input.photographerId,
    customer_email: input.customerEmail.trim().toLowerCase(),
    discount_applied_cents: input.discountAppliedCents,
  });

  if (redemptionError) {
    throw new Error(redemptionError.message || "Impossibile registrare il coupon sull'ordine.");
  }

  const nextCount = (input.coupon.redemptions_count || 0) + 1;
  const { error: couponUpdateError } = await input.admin
    .from("coupons")
    .update({ redemptions_count: nextCount })
    .eq("id", input.coupon.id)
    .eq("redemptions_count", input.coupon.redemptions_count);

  if (couponUpdateError) {
    throw new Error(couponUpdateError.message || "Impossibile aggiornare il conteggio coupon.");
  }
}

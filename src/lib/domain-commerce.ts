import "server-only";

const DEFAULT_MARKUP_PERCENT = 25;
const DEFAULT_MIN_MARGIN_CENTS = 300;

function toCents(amount: number) {
  return Math.round(amount * 100);
}

export function getDomainMarkupPercent() {
  const raw = Number.parseFloat(process.env.DOMAIN_MARKUP_PERCENT || "");
  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_MARKUP_PERCENT;
  }
  return raw;
}

export function getDomainMinMarginCents() {
  const raw = Number.parseFloat(process.env.DOMAIN_MIN_MARGIN_EUR || "");
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_MIN_MARGIN_CENTS;
  }
  return toCents(raw);
}

export function computeDomainSalePriceCents(params: { providerCost: number; currency: string }) {
  const providerCostCents = toCents(params.providerCost);
  const markupPercent = getDomainMarkupPercent();
  const minMarginCents = getDomainMinMarginCents();
  const percentMarginCents = Math.round(providerCostCents * (markupPercent / 100));
  const marginCents = Math.max(percentMarginCents, minMarginCents);
  const salePriceCents = providerCostCents + marginCents;

  return {
    currency: params.currency,
    providerCostCents,
    salePriceCents,
    marginCents,
    markupPercent,
    minMarginCents,
  };
}

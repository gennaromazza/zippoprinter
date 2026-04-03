import type { PrintFormat, QuantityPriceTier } from "./types";

function toPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

export function parseQuantityPriceTiers(raw: unknown): QuantityPriceTier[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Partial<QuantityPriceTier>;
      const minQuantity = toPositiveInteger(candidate.min_quantity);
      const unitPriceCents = toPositiveInteger(candidate.unit_price_cents);

      if (!minQuantity || !unitPriceCents) {
        return null;
      }

      return {
        min_quantity: minQuantity,
        unit_price_cents: unitPriceCents,
      };
    })
    .filter((item): item is QuantityPriceTier => Boolean(item))
    .sort((a, b) => a.min_quantity - b.min_quantity);
}

export function getUnitPriceForQuantity(
  format: Pick<PrintFormat, "price_cents" | "quantity_price_tiers">,
  quantity: number
) {
  const safeQuantity = Math.max(1, Math.round(quantity));
  const tiers = parseQuantityPriceTiers(format.quantity_price_tiers);
  let unitPrice = format.price_cents;

  for (const tier of tiers) {
    if (safeQuantity >= tier.min_quantity) {
      unitPrice = tier.unit_price_cents;
    }
  }

  return unitPrice;
}

export function parseTierInput(raw: string): QuantityPriceTier[] {
  const normalized = raw.trim();
  if (!normalized) {
    return [];
  }

  const tiers: QuantityPriceTier[] = [];
  const seen = new Set<number>();
  const chunks = normalized
    .split(/[|;\n]+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const [minRaw, priceRaw] = chunk.split(":").map((part) => part.trim());
    const minQuantity = toPositiveInteger(minRaw);
    const unitPrice = Number.parseFloat((priceRaw || "").replace(",", "."));

    if (!minQuantity || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(
        `Sconto quantita non valido: "${chunk}". Usa formato minQuantita:prezzo (es. 10:2.70).`
      );
    }

    if (seen.has(minQuantity)) {
      throw new Error(`Soglia duplicata: ${minQuantity}.`);
    }

    seen.add(minQuantity);
    tiers.push({
      min_quantity: minQuantity,
      unit_price_cents: Math.round(unitPrice * 100),
    });
  }

  return tiers.sort((a, b) => a.min_quantity - b.min_quantity);
}

export function formatTierInput(tiers: unknown) {
  const parsed = parseQuantityPriceTiers(tiers);
  return parsed
    .map((tier) => `${tier.min_quantity}:${(tier.unit_price_cents / 100).toFixed(2)}`)
    .join("; ");
}

export function formatTierSummary(tiers: unknown) {
  const parsed = parseQuantityPriceTiers(tiers);
  if (!parsed.length) {
    return "";
  }

  return parsed
    .map((tier) => `da ${tier.min_quantity} -> EUR ${(tier.unit_price_cents / 100).toFixed(2)}`)
    .join(" | ");
}

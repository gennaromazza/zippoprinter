import type { PrintFormat, QuantityPriceTier } from "./types";

export type DiscountMode = "fixed" | "percent";

export interface DiscountRuleDraft {
  min_quantity: number;
  mode: DiscountMode;
  value: number;
}

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
      const rawMode = candidate.discount_mode;
      const parsedMode = rawMode === "fixed" || rawMode === "percent" ? rawMode : undefined;
      const rawDiscountValue = Number(candidate.discount_value);
      const parsedDiscountValue =
        Number.isFinite(rawDiscountValue) && rawDiscountValue > 0 ? roundToTwo(rawDiscountValue) : undefined;

      if (!minQuantity || !unitPriceCents) {
        return null;
      }

      const parsedTier: QuantityPriceTier = {
        min_quantity: minQuantity,
        unit_price_cents: unitPriceCents,
      };

      if (parsedMode) {
        parsedTier.discount_mode = parsedMode;
      }
      if (parsedDiscountValue !== undefined) {
        parsedTier.discount_value = parsedDiscountValue;
      }

      return parsedTier;
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

/**
 * Aggregate total quantities per format id from an array of line items.
 * Used to determine the correct quantity-based pricing tier:
 * discount thresholds apply to the **total** copies of each format
 * across all photos, not per individual photo.
 */
export function computeFormatQuantityTotals(
  items: ReadonlyArray<{ formatId: string; quantity: number }>
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.formatId) continue;
    const current = totals.get(item.formatId) || 0;
    totals.set(item.formatId, current + Math.max(1, Math.round(item.quantity)));
  }
  return totals;
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

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function parsePositiveNumber(raw: string) {
  const parsed = Number.parseFloat((raw || "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function tiersToDiscountRules(
  tiers: unknown,
  basePriceCents: number
): DiscountRuleDraft[] {
  const parsed = parseQuantityPriceTiers(tiers);
  if (!parsed.length || !Number.isFinite(basePriceCents) || basePriceCents <= 0) {
    return [];
  }

  return parsed.map((tier) => {
    if (tier.discount_mode && Number.isFinite(tier.discount_value) && (tier.discount_value || 0) > 0) {
      return {
        min_quantity: tier.min_quantity,
        mode: tier.discount_mode,
        value: roundToTwo(Number(tier.discount_value)),
      };
    }

    const discountCents = Math.max(basePriceCents - tier.unit_price_cents, 0);
    return {
      min_quantity: tier.min_quantity,
      mode: "fixed" as const,
      value: roundToTwo(discountCents / 100),
    };
  });
}

export function discountRulesToTiers(
  basePriceCents: number,
  rules: DiscountRuleDraft[]
): QuantityPriceTier[] {
  if (!Number.isFinite(basePriceCents) || basePriceCents <= 0) {
    throw new Error("Prezzo base non valido.");
  }

  const seen = new Set<number>();
  const tiers: QuantityPriceTier[] = [];

  for (const rule of rules) {
    const minQuantity = Math.round(rule.min_quantity);
    const mode = rule.mode;
    const value = Number(rule.value);

    if (!Number.isFinite(minQuantity) || minQuantity <= 1) {
      throw new Error("Ogni regola deve avere quantita minima maggiore di 1.");
    }

    if (seen.has(minQuantity)) {
      throw new Error(`Soglia duplicata: ${minQuantity}.`);
    }
    seen.add(minQuantity);

    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Valore sconto non valido per soglia ${minQuantity}.`);
    }

    let finalUnitPriceCents: number;
    if (mode === "percent") {
      if (value >= 100) {
        throw new Error(`Percentuale non valida per soglia ${minQuantity}.`);
      }
      finalUnitPriceCents = Math.round(basePriceCents * (1 - value / 100));
    } else {
      finalUnitPriceCents = basePriceCents - Math.round(value * 100);
    }

    if (finalUnitPriceCents <= 0) {
      throw new Error(`Prezzo finale non valido per soglia ${minQuantity}.`);
    }

    if (finalUnitPriceCents > basePriceCents) {
      throw new Error(`La soglia ${minQuantity} genera un prezzo superiore al prezzo base.`);
    }

    tiers.push({
      min_quantity: minQuantity,
      unit_price_cents: finalUnitPriceCents,
      discount_mode: mode,
      discount_value: roundToTwo(value),
    });
  }

  return tiers.sort((a, b) => a.min_quantity - b.min_quantity);
}

export function parseDiscountRulesInput(raw: string): DiscountRuleDraft[] {
  const normalized = raw.trim();
  if (!normalized) {
    return [];
  }

  const chunks = normalized
    .split(/[|\n]+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const rules: DiscountRuleDraft[] = [];
  const seen = new Set<number>();

  for (const chunk of chunks) {
    const [minRaw, modeRaw, valueRaw] = chunk.split(":").map((part) => part.trim());
    const minQuantity = toPositiveInteger(minRaw);
    const mode = (modeRaw || "").toLowerCase();
    const value = parsePositiveNumber(valueRaw || "");

    if (!minQuantity || minQuantity <= 1) {
      throw new Error(`Soglia non valida: "${chunk}".`);
    }

    if (seen.has(minQuantity)) {
      throw new Error(`Soglia duplicata: ${minQuantity}.`);
    }
    seen.add(minQuantity);

    if ((mode !== "fixed" && mode !== "percent") || !value) {
      throw new Error(
        `Regola non valida: "${chunk}". Usa formato quantita:tipo:valore (es. 30:percent:10).`
      );
    }

    rules.push({
      min_quantity: minQuantity,
      mode: mode as DiscountMode,
      value,
    });
  }

  return rules.sort((a, b) => a.min_quantity - b.min_quantity);
}

export function formatDiscountRulesInput(rules: DiscountRuleDraft[]) {
  return rules
    .map((rule) => `${rule.min_quantity}:${rule.mode}:${roundToTwo(rule.value)}`)
    .join("|");
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

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Plus, Ticket, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isMissingCouponSchemaError } from "@/lib/schema-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CouponRow {
  id: string;
  code: string;
  status: "active" | "paused" | "expired";
  discount_mode: "fixed" | "percent";
  discount_value: number;
  min_order_cents: number;
  max_redemptions: number | null;
  redemptions_count: number;
  valid_until: string | null;
}

function formatDiscount(coupon: CouponRow) {
  if (coupon.discount_mode === "percent") {
    return `${coupon.discount_value}%`;
  }

  return `EUR ${(coupon.discount_value / 100).toFixed(2)}`;
}

function parsePositiveNumber(raw: string) {
  const parsed = Number.parseFloat(raw.replace(",", ".").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function CouponsManager({
  photographerId,
  initialCoupons,
  schemaMissing,
}: {
  photographerId: string;
  initialCoupons: CouponRow[];
  schemaMissing: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [discountMode, setDiscountMode] = useState<"fixed" | "percent">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderEur, setMinOrderEur] = useState("0");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  const sortedCoupons = useMemo(
    () => [...initialCoupons].sort((a, b) => a.code.localeCompare(b.code, "it")),
    [initialCoupons]
  );

  const resetForm = () => {
    setCode("");
    setDiscountMode("percent");
    setDiscountValue("");
    setMinOrderEur("0");
    setMaxRedemptions("");
  };

  const createCoupon = async () => {
    if (schemaMissing) {
      setMessage("Schema coupon non aggiornato. Applica la migration 019 prima di creare coupon.");
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setMessage("Inserisci un codice coupon.");
      return;
    }

    const parsedDiscount = parsePositiveNumber(discountValue);
    if (!parsedDiscount) {
      setMessage("Inserisci un valore sconto valido.");
      return;
    }

    const parsedMinOrder = Number.parseFloat(minOrderEur.replace(",", ".").trim());
    if (!Number.isFinite(parsedMinOrder) || parsedMinOrder < 0) {
      setMessage("Importo minimo ordine non valido.");
      return;
    }

    const parsedMaxRedemptions = maxRedemptions.trim()
      ? Number.parseInt(maxRedemptions.trim(), 10)
      : null;
    if (parsedMaxRedemptions !== null && (!Number.isFinite(parsedMaxRedemptions) || parsedMaxRedemptions <= 0)) {
      setMessage("Max utilizzi deve essere un intero maggiore di zero.");
      return;
    }

    if (discountMode === "percent" && parsedDiscount > 100) {
      setMessage("Per sconto percentuale, il valore massimo e 100.");
      return;
    }

    setCreating(true);
    setMessage("");

    const payload = {
      photographer_id: photographerId,
      code: normalizedCode,
      discount_mode: discountMode,
      discount_value: discountMode === "fixed" ? Math.round(parsedDiscount * 100) : Math.round(parsedDiscount),
      min_order_cents: Math.round(parsedMinOrder * 100),
      max_redemptions: parsedMaxRedemptions,
      status: "active",
    };

    const { error } = await supabase.from("coupons").insert(payload);

    setCreating(false);

    if (error) {
      if (isMissingCouponSchemaError(error.message)) {
        setMessage("Schema coupon non aggiornato. Applica la migration 019_coupons_v1.sql.");
        return;
      }
      setMessage(`Errore creazione coupon: ${error.message}`);
      return;
    }

    setMessage("Coupon creato con successo.");
    resetForm();
    router.refresh();
  };

  const setCouponStatus = async (coupon: CouponRow, status: "active" | "paused") => {
    setBusyId(coupon.id);
    setMessage("");
    const { error } = await supabase.from("coupons").update({ status }).eq("id", coupon.id);
    setBusyId(null);

    if (error) {
      setMessage(`Errore aggiornamento stato coupon: ${error.message}`);
      return;
    }

    setMessage(`Coupon ${coupon.code} aggiornato (${status}).`);
    router.refresh();
  };

  const deleteCoupon = async (coupon: CouponRow) => {
    setBusyId(coupon.id);
    setMessage("");
    const { error } = await supabase.from("coupons").delete().eq("id", coupon.id);
    setBusyId(null);

    if (error) {
      setMessage(`Errore eliminazione coupon: ${error.message}`);
      return;
    }

    setMessage(`Coupon ${coupon.code} eliminato.`);
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[1.3rem] border border-[color:var(--border)] bg-[color:var(--muted)]/20 p-4">
        <p className="text-sm font-semibold text-foreground">Crea nuovo coupon</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="coupon-code">Codice</Label>
            <Input
              id="coupon-code"
              placeholder="Es. BENVENUTO10"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon-mode">Tipo sconto</Label>
            <select
              id="coupon-mode"
              className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white px-3 text-sm"
              value={discountMode}
              onChange={(event) => setDiscountMode(event.target.value as "fixed" | "percent")}
            >
              <option value="percent">Percentuale</option>
              <option value="fixed">Importo fisso</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon-value">Valore sconto ({discountMode === "percent" ? "%" : "EUR"})</Label>
            <Input
              id="coupon-value"
              placeholder={discountMode === "percent" ? "10" : "5,00"}
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coupon-min-order">Ordine minimo (EUR)</Label>
            <Input
              id="coupon-min-order"
              placeholder="0"
              value={minOrderEur}
              onChange={(event) => setMinOrderEur(event.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="coupon-max-redemptions">Max utilizzi (opzionale)</Label>
            <Input
              id="coupon-max-redemptions"
              placeholder="Es. 100"
              value={maxRedemptions}
              onChange={(event) => setMaxRedemptions(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={createCoupon} disabled={creating || schemaMissing}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creazione...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Crea coupon
              </>
            )}
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-[color:var(--border)] bg-white px-3 py-2 text-sm font-medium text-foreground">
          {message}
        </p>
      ) : null}

      {sortedCoupons.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/25 p-6 text-sm text-muted-foreground">
          Nessun coupon presente per questo studio.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCoupons.map((coupon) => (
            <div
              key={coupon.id}
              className="flex flex-col gap-3 rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/20 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Ticket className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{coupon.code}</p>
                  <p className="text-xs text-muted-foreground">
                    Sconto: {formatDiscount(coupon)} • Min ordine: EUR {(coupon.min_order_cents / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 font-semibold uppercase tracking-[0.12em] text-foreground">
                  {coupon.status}
                </span>
                <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 font-semibold text-foreground">
                  Usi: {coupon.redemptions_count}
                  {coupon.max_redemptions !== null ? ` / ${coupon.max_redemptions}` : ""}
                </span>
                {coupon.status === "active" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === coupon.id}
                    onClick={() => void setCouponStatus(coupon, "paused")}
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pausa
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === coupon.id || coupon.status === "expired"}
                    onClick={() => void setCouponStatus(coupon, "active")}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Attiva
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === coupon.id}
                  onClick={() => void deleteCoupon(coupon)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Elimina
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

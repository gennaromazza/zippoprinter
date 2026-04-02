"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, CreditCard, Loader2, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isMissingPaymentSchemaError } from "@/lib/schema-compat";
import { getStudioHref } from "@/lib/studio-paths";
import { getPaymentModeLabel } from "@/lib/payments";
import type { Photographer } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function PhotographerSettings({ photographer }: { photographer: Photographer | null }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [brandColor, setBrandColor] = useState(photographer?.brand_color || "#8f5d2c");
  const [paymentMode, setPaymentMode] = useState(photographer?.payment_mode || "pay_in_store");
  const [depositType, setDepositType] = useState(photographer?.deposit_type || "percentage");
  const [depositValue, setDepositValue] = useState(() => {
    if (!photographer?.deposit_value) return "30";
    if (photographer.deposit_type === "fixed") {
      return (photographer.deposit_value / 100).toFixed(2);
    }
    return String(photographer.deposit_value);
  });
  const [origin] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }

    return process.env.NEXT_PUBLIC_SITE_URL || "";
  });
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const publicPath = photographer?.id ? getStudioHref(photographer.id) : "/studio";
  const publicUrl = origin ? `${origin}${publicPath}` : publicPath;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!photographer?.id) return;

    setLoading(true);
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const parsedDepositValue = Number.parseFloat((formData.get("deposit_value") as string) || "0");
    const normalizedDepositValue =
      paymentMode === "deposit_plus_studio"
        ? depositType === "fixed"
          ? Math.round(parsedDepositValue * 100)
          : Math.round(parsedDepositValue)
        : null;

    const basePayload = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      whatsapp_number: formData.get("whatsapp"),
      brand_color: formData.get("brand_color"),
      custom_welcome_text: formData.get("welcome_text"),
    };

    let { error } = await supabase
      .from("photographers")
      .update({
        ...basePayload,
        payment_mode: paymentMode,
        deposit_type: paymentMode === "deposit_plus_studio" ? depositType : null,
        deposit_value: normalizedDepositValue,
      })
      .eq("id", photographer.id);

    let paymentSchemaMissing = false;

    if (error && isMissingPaymentSchemaError(error.message)) {
      paymentSchemaMissing = true;
      const fallback = await supabase.from("photographers").update(basePayload).eq("id", photographer.id);
      error = fallback.error;
    }

    setLoading(false);

    if (error) {
      setMessage("Errore nel salvataggio delle impostazioni.");
    } else {
      setMessage(
        paymentSchemaMissing
          ? "Branding salvato. Le opzioni pagamento saranno disponibili dopo la migration 003."
          : "Impostazioni aggiornate correttamente."
      );
      router.refresh();
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardDescription>Brand studio</CardDescription>
        <CardTitle>Informazioni principali</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Pagina cliente dedicata</p>
            <p className="mt-1 break-all font-medium text-foreground">{publicUrl}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiato" : "Copia link"}
              </Button>
              <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Link pubblico da inviare ai clienti
              </span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="field-shell space-y-2">
              <Label htmlFor="name">Nome studio</Label>
              <Input
                id="name"
                name="name"
                defaultValue={photographer?.name || ""}
                placeholder="Studio Fotografico Zippo"
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={photographer?.phone || ""}
                placeholder="+39 333 1234567"
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="whatsapp">Numero WhatsApp</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={photographer?.whatsapp_number || ""}
                placeholder="393331234567"
              />
            </div>
            <div className="field-shell space-y-3">
              <Label htmlFor="brand_color">Colore brand</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="brand_color"
                  name="brand_color"
                  type="color"
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="h-12 w-16 cursor-pointer rounded-xl border border-[color:var(--border)] px-1"
                />
                <Input
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  className="font-mono uppercase"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--muted)]/45 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Modalita di pagamento cliente</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Ogni studio usa una sola modalita attiva per il checkout pubblico.
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                {getPaymentModeLabel(paymentMode)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setPaymentMode("online_full")}
                className={`rounded-[1.4rem] border px-4 py-4 text-left ${
                  paymentMode === "online_full"
                    ? "border-primary bg-white shadow-[0_10px_30px_rgba(217,121,66,0.12)]"
                    : "border-[color:var(--border)] bg-white/70"
                }`}
              >
                <CreditCard className="h-5 w-5 text-primary" />
                <p className="mt-3 font-semibold text-foreground">Online completo</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Il cliente paga tutto online prima della conferma finale.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode("deposit_plus_studio")}
                className={`rounded-[1.4rem] border px-4 py-4 text-left ${
                  paymentMode === "deposit_plus_studio"
                    ? "border-primary bg-white shadow-[0_10px_30px_rgba(217,121,66,0.12)]"
                    : "border-[color:var(--border)] bg-white/70"
                }`}
              >
                <CreditCard className="h-5 w-5 text-primary" />
                <p className="mt-3 font-semibold text-foreground">Acconto + saldo</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Blocca l&apos;ordine con un acconto online e salda il resto in studio.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode("pay_in_store")}
                className={`rounded-[1.4rem] border px-4 py-4 text-left ${
                  paymentMode === "pay_in_store"
                    ? "border-primary bg-white shadow-[0_10px_30px_rgba(217,121,66,0.12)]"
                    : "border-[color:var(--border)] bg-white/70"
                }`}
              >
                <Store className="h-5 w-5 text-primary" />
                <p className="mt-3 font-semibold text-foreground">Pagamento in studio</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Nessun incasso online: il cliente invia l&apos;ordine e paga al ritiro.
                </p>
              </button>
            </div>

            {paymentMode === "deposit_plus_studio" && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="field-shell space-y-2">
                  <Label htmlFor="deposit_type">Tipo acconto</Label>
                  <select
                    id="deposit_type"
                    name="deposit_type"
                    value={depositType}
                    onChange={(event) => setDepositType(event.target.value as "percentage" | "fixed")}
                    className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                  >
                    <option value="percentage">Percentuale</option>
                    <option value="fixed">Importo fisso in euro</option>
                  </select>
                </div>

                <div className="field-shell space-y-2">
                  <Label htmlFor="deposit_value">
                    {depositType === "fixed" ? "Importo acconto (EUR)" : "Percentuale acconto"}
                  </Label>
                  <Input
                    id="deposit_value"
                    name="deposit_value"
                    type="number"
                    step={depositType === "fixed" ? "0.01" : "1"}
                    min="1"
                    value={depositValue}
                    onChange={(event) => setDepositValue(event.target.value)}
                    placeholder={depositType === "fixed" ? "10.00" : "30"}
                    required
                  />
                </div>
              </div>
            )}
          </div>

          <div className="field-shell space-y-3">
            <Label htmlFor="welcome_text">Messaggio di benvenuto</Label>
            <textarea
              id="welcome_text"
              name="welcome_text"
              defaultValue={photographer?.custom_welcome_text || ""}
              placeholder="Carica le tue foto e scegli il formato di stampa che preferisci."
              className="min-h-[140px] w-full resize-none rounded-2xl bg-transparent text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/80"
            />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvataggio
                </>
              ) : (
                "Salva modifiche"
              )}
            </Button>
            {message && (
              <span
                className={
                  message.startsWith("Errore")
                    ? "text-sm font-medium text-red-700"
                    : "text-sm font-medium text-emerald-700"
                }
              >
                {message}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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

const LOGO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX_BYTES = 4 * 1024 * 1024;
const LOGO_MIN_WIDTH = 300;
const LOGO_MIN_HEIGHT = 300;
const LOGO_MAX_WIDTH = 4000;
const LOGO_MAX_HEIGHT = 4000;

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value as number)));
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Impossibile leggere le dimensioni del logo."));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

function isMissingPublicProfileSchemaError(message: string | undefined | null) {
  if (!message) {
    return false;
  }

  return (
    message.includes("website_url") ||
    message.includes("instagram_url") ||
    message.includes("logo_position_x") ||
    message.includes("logo_position_y")
  );
}

export function PhotographerSettings({ photographer }: { photographer: Photographer | null }) {
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [logoUrl, setLogoUrl] = useState(photographer?.logo_url || "");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [logoSizeInfo, setLogoSizeInfo] = useState<{ width: number; height: number; bytes: number } | null>(null);
  const [logoPositionX, setLogoPositionX] = useState(clampPercent(photographer?.logo_position_x));
  const [logoPositionY, setLogoPositionY] = useState(clampPercent(photographer?.logo_position_y));
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
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const publicPath = photographer?.id ? getStudioHref(photographer.id) : "/studio";
  const publicUrl = publicPath;

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    setLogoUrl(photographer?.logo_url || "");
    setLogoPositionX(clampPercent(photographer?.logo_position_x));
    setLogoPositionY(clampPercent(photographer?.logo_position_y));
    setLogoSizeInfo(null);
    setLogoMessage("");
  }, [photographer]);

  const handleCopyLink = async () => {
    try {
      const absoluteUrl =
        typeof window !== "undefined" ? `${window.location.origin}${publicPath}` : publicPath;
      await navigator.clipboard.writeText(absoluteUrl);
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
    const normalizedLogoUrl = logoUrl.trim();
    if (!normalizedLogoUrl) {
      setLoading(false);
      setMessage("Errore: il logo studio e obbligatorio per la pagina pubblica.");
      return;
    }

    const rawDepositValue = String(formData.get("deposit_value") || "").replace(",", ".");
    const parsedDepositValue = Number.parseFloat(rawDepositValue);
    let normalizedDepositValue: number | null = null;

    if (paymentMode === "deposit_plus_studio") {
      if (!Number.isFinite(parsedDepositValue) || parsedDepositValue <= 0) {
        setLoading(false);
        setMessage("Errore: inserisci un valore acconto valido.");
        return;
      }

      if (depositType === "fixed") {
        if (parsedDepositValue > 100000) {
          setLoading(false);
          setMessage("Errore: importo acconto troppo alto.");
          return;
        }
        normalizedDepositValue = Math.round(parsedDepositValue * 100);
      } else {
        if (parsedDepositValue < 1 || parsedDepositValue > 100) {
          setLoading(false);
          setMessage("Errore: la percentuale acconto deve essere tra 1 e 100.");
          return;
        }
        normalizedDepositValue = Math.round(parsedDepositValue);
      }
    }

    const basePayload = {
      name: formData.get("name"),
      logo_url: normalizedLogoUrl,
      logo_position_x: clampPercent(logoPositionX),
      logo_position_y: clampPercent(logoPositionY),
      phone: formData.get("phone"),
      whatsapp_number: formData.get("whatsapp"),
      website_url: String(formData.get("website_url") || "").trim() || null,
      instagram_url: String(formData.get("instagram_url") || "").trim() || null,
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
      if (isMissingPublicProfileSchemaError(error.message)) {
        setMessage(
          "Errore: schema non aggiornato. Esegui le migration 006_public_studio_profile_links.sql e 007_logo_positioning_controls.sql."
        );
      } else {
        setMessage("Errore nel salvataggio delle impostazioni.");
      }
    } else {
      setMessage(
        paymentSchemaMissing
          ? "Branding salvato. Le opzioni pagamento saranno disponibili dopo la migration 003."
          : "Impostazioni aggiornate correttamente."
      );
      router.refresh();
    }
  };

  const handleLogoFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setLogoMessage("");

    if (!LOGO_ALLOWED_TYPES.includes(file.type)) {
      setLogoMessage("Errore: formato non supportato. Usa JPG, PNG o WEBP.");
      return;
    }

    if (file.size > LOGO_MAX_BYTES) {
      setLogoMessage(`Errore: il file supera ${formatMegabytes(LOGO_MAX_BYTES)}.`);
      return;
    }

    let dimensions: { width: number; height: number };
    try {
      dimensions = await readImageDimensions(file);
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Errore lettura immagine.");
      return;
    }

    if (
      dimensions.width < LOGO_MIN_WIDTH ||
      dimensions.height < LOGO_MIN_HEIGHT ||
      dimensions.width > LOGO_MAX_WIDTH ||
      dimensions.height > LOGO_MAX_HEIGHT
    ) {
      setLogoMessage(
        `Errore: risoluzione non valida (${dimensions.width}x${dimensions.height}px). Usa un logo tra ${LOGO_MIN_WIDTH}x${LOGO_MIN_HEIGHT}px e ${LOGO_MAX_WIDTH}x${LOGO_MAX_HEIGHT}px.`
      );
      return;
    }

    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/settings/logo-upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Upload logo non riuscito.");
      }

      setLogoUrl(payload.url);
      setLogoSizeInfo({
        width: dimensions.width,
        height: dimensions.height,
        bytes: file.size,
      });
      setLogoMessage("Logo caricato con successo. Ora puoi regolare il posizionamento e salvare.");
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : "Errore durante l'upload logo.");
    } finally {
      setLogoUploading(false);
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
            <div className="rounded-[1.6rem] border border-[color:var(--border)] bg-white/70 p-4 md:col-span-2">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <Label htmlFor="logo-upload">Logo studio *</Label>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Formati ammessi JPG/PNG/WEBP. Peso max {formatMegabytes(LOGO_MAX_BYTES)}.
                    Risoluzione tra {LOGO_MIN_WIDTH}x{LOGO_MIN_HEIGHT}px e {LOGO_MAX_WIDTH}x{LOGO_MAX_HEIGHT}px.
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={logoFileInputRef}
                    id="logo-upload"
                    type="file"
                    accept={LOGO_ALLOWED_TYPES.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      void handleLogoFileSelect(event);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={logoUploading}
                    onClick={() => logoFileInputRef.current?.click()}
                  >
                    {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Carica logo"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[180px,1fr]">
                <div className="relative h-[180px] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/35">
                  {logoUrl ? (
                    <Image
                      src={logoUrl}
                      alt="Anteprima logo studio"
                      fill
                      unoptimized
                      className="object-cover"
                      style={{ objectPosition: `${logoPositionX}% ${logoPositionY}%` }}
                      sizes="180px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                      Nessun logo caricato
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="field-shell space-y-2">
                    <Label htmlFor="logo_url">URL logo</Label>
                    <Input
                      id="logo_url"
                      name="logo_url"
                      type="url"
                      value={logoUrl}
                      onChange={(event) => setLogoUrl(event.target.value)}
                      placeholder="https://.../logo.png"
                      required
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="field-shell space-y-2">
                      <Label htmlFor="logo-position-x">Riposizionamento orizzontale ({logoPositionX}%)</Label>
                      <input
                        id="logo-position-x"
                        type="range"
                        min={0}
                        max={100}
                        value={logoPositionX}
                        onChange={(event) => setLogoPositionX(clampPercent(Number.parseInt(event.target.value, 10)))}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="field-shell space-y-2">
                      <Label htmlFor="logo-position-y">Riposizionamento verticale ({logoPositionY}%)</Label>
                      <input
                        id="logo-position-y"
                        type="range"
                        min={0}
                        max={100}
                        value={logoPositionY}
                        onChange={(event) => setLogoPositionY(clampPercent(Number.parseInt(event.target.value, 10)))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setLogoPositionX(50);
                        setLogoPositionY(50);
                      }}
                    >
                      Centra logo
                    </Button>
                  </div>

                  {logoSizeInfo && (
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Ultimo file caricato: {logoSizeInfo.width}x{logoSizeInfo.height}px, {formatMegabytes(logoSizeInfo.bytes)}
                    </p>
                  )}
                </div>
              </div>

              {logoMessage && (
                <p
                  className={`mt-3 text-sm font-medium ${
                    logoMessage.startsWith("Errore") ? "text-red-700" : "text-emerald-700"
                  }`}
                >
                  {logoMessage}
                </p>
              )}
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
            <div className="field-shell space-y-2">
              <Label htmlFor="website_url">Sito web (pubblico)</Label>
              <Input
                id="website_url"
                name="website_url"
                type="url"
                defaultValue={photographer?.website_url || ""}
                placeholder="https://www.miosito.it"
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="instagram_url">Instagram (pubblico)</Label>
              <Input
                id="instagram_url"
                name="instagram_url"
                type="url"
                defaultValue={photographer?.instagram_url || ""}
                placeholder="https://instagram.com/mio_studio"
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
                    max={depositType === "fixed" ? "100000" : "100"}
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

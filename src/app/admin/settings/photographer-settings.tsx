"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Loader2, LogOut, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isMissingPaymentSchemaError } from "@/lib/schema-compat";
import { getStudioHref } from "@/lib/studio-paths";
import { getPaymentModeLabel } from "@/lib/payments";
import {
  getContrastTextColor,
  hexToRgba,
  normalizeHexColor,
} from "@/lib/storefront-branding";
import type {
  PaymentMode,
  Photographer,
  StorefrontBgScope,
  StorefrontCtaAlign,
  StorefrontLayoutPreset,
} from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StripeConnectCard } from "./stripe-connect-card";
import { SubscriptionStatusPanel } from "./subscription-status-panel";

const LOGO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_MAX_BYTES = 4 * 1024 * 1024;
const LOGO_MIN_WIDTH = 300;
const LOGO_MIN_HEIGHT = 300;
const LOGO_MAX_WIDTH = 4000;
const LOGO_MAX_HEIGHT = 4000;
const BG_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BG_MAX_BYTES = 6 * 1024 * 1024;
const BG_MIN_WIDTH = 1200;
const BG_MIN_HEIGHT = 600;
const BG_MAX_WIDTH = 7000;
const BG_MAX_HEIGHT = 7000;

function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 50;
  }

  return Math.min(100, Math.max(0, Math.round(value as number)));
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatInitialDepositValue(type: "percentage" | "fixed" | null | undefined, value: number | null | undefined) {
  if (!value) {
    return "30";
  }

  if (type === "fixed") {
    return (value / 100).toFixed(2);
  }

  return String(value);
}

function normalizeDepositValueForCompare(value: string) {
  const parsed = Number.parseFloat(value.replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
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
    message.includes("logo_position_y") ||
    message.includes("storefront_theme_enabled") ||
    message.includes("storefront_layout_preset") ||
    message.includes("storefront_bg_image_url") ||
    message.includes("storefront_bg_scope") ||
    message.includes("storefront_bg_overlay_opacity") ||
    message.includes("storefront_color_primary") ||
    message.includes("storefront_color_secondary") ||
    message.includes("storefront_color_text") ||
    message.includes("storefront_cta_align")
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
  const [storefrontBgUrl, setStorefrontBgUrl] = useState(
    photographer?.storefront_bg_image_url || ""
  );
  const [storefrontBgUploading, setStorefrontBgUploading] = useState(false);
  const [storefrontBgMessage, setStorefrontBgMessage] = useState("");
  const [storefrontBgSizeInfo, setStorefrontBgSizeInfo] = useState<{
    width: number;
    height: number;
    bytes: number;
  } | null>(null);
  const storefrontBgFileInputRef = useRef<HTMLInputElement>(null);
  const [logoPositionX, setLogoPositionX] = useState(clampPercent(photographer?.logo_position_x));
  const [logoPositionY, setLogoPositionY] = useState(clampPercent(photographer?.logo_position_y));
  const [brandColor, setBrandColor] = useState(photographer?.brand_color || "#8f5d2c");
  const [storefrontThemeEnabled, setStorefrontThemeEnabled] = useState(
    Boolean(photographer?.storefront_theme_enabled)
  );
  const [storefrontLayoutPreset, setStorefrontLayoutPreset] = useState<StorefrontLayoutPreset>(
    (photographer?.storefront_layout_preset as StorefrontLayoutPreset) || "classic"
  );
  const [storefrontBgScope, setStorefrontBgScope] = useState<StorefrontBgScope>(
    (photographer?.storefront_bg_scope as StorefrontBgScope) || "header"
  );
  const [storefrontBgOverlayOpacity, setStorefrontBgOverlayOpacity] = useState(
    Number.isFinite(photographer?.storefront_bg_overlay_opacity)
      ? Math.min(100, Math.max(0, Math.round(photographer?.storefront_bg_overlay_opacity as number)))
      : 35
  );
  const [storefrontColorPrimary, setStorefrontColorPrimary] = useState(
    normalizeHexColor(photographer?.storefront_color_primary || photographer?.brand_color, "#D97942")
  );
  const [storefrontColorSecondary, setStorefrontColorSecondary] = useState(
    normalizeHexColor(photographer?.storefront_color_secondary, "#F3E4D7")
  );
  const [storefrontColorText, setStorefrontColorText] = useState(
    normalizeHexColor(photographer?.storefront_color_text, "#2B211C")
  );
  const [storefrontCtaAlign, setStorefrontCtaAlign] = useState<StorefrontCtaAlign>(
    (photographer?.storefront_cta_align as StorefrontCtaAlign) || "left"
  );
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(
    (photographer?.payment_mode as PaymentMode) || "pay_in_store"
  );
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeEntryState, setStripeEntryState] = useState<"refresh" | "return" | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [depositType, setDepositType] = useState(photographer?.deposit_type || "percentage");
  const [depositValue, setDepositValue] = useState(
    formatInitialDepositValue(photographer?.deposit_type, photographer?.deposit_value)
  );
  const router = useRouter();
  const supabase = createClient();
  const publicUrl = photographer?.id ? getStudioHref(photographer.id) : "/studio";
  const savedPaymentMode = (photographer?.payment_mode as PaymentMode | null) || "pay_in_store";
  const savedDepositType = photographer?.deposit_type || "percentage";
  const savedDepositValue = formatInitialDepositValue(
    photographer?.deposit_type,
    photographer?.deposit_value
  );
  const currentDepositForCompare = normalizeDepositValueForCompare(depositValue);
  const savedDepositForCompare = normalizeDepositValueForCompare(savedDepositValue);
  const paymentConfigDirty =
    paymentMode !== savedPaymentMode ||
    (paymentMode === "deposit_plus_studio" &&
      (depositType !== savedDepositType ||
        currentDepositForCompare !== savedDepositForCompare));

  const persistPaymentMode = async (nextPaymentMode: PaymentMode) => {
    if (!photographer?.id) {
      return false;
    }

    let normalizedDepositValue: number | null = null;
    if (nextPaymentMode === "deposit_plus_studio") {
      const parsedDepositValue = Number.parseFloat(depositValue.replace(",", "."));
      if (!Number.isFinite(parsedDepositValue) || parsedDepositValue <= 0) {
        setMessage("Errore: inserisci un valore acconto valido.");
        return false;
      }

      if (depositType === "fixed") {
        if (parsedDepositValue > 100000) {
          setMessage("Errore: importo acconto troppo alto.");
          return false;
        }
        normalizedDepositValue = Math.round(parsedDepositValue * 100);
      } else {
        if (parsedDepositValue < 1 || parsedDepositValue > 100) {
          setMessage("Errore: la percentuale acconto deve essere tra 1 e 100.");
          return false;
        }
        normalizedDepositValue = Math.round(parsedDepositValue);
      }
    }

    setLoading(true);
    setMessage("");

    let { error } = await supabase
      .from("photographers")
      .update({
        payment_mode: nextPaymentMode,
        deposit_type: nextPaymentMode === "deposit_plus_studio" ? depositType : null,
        deposit_value: normalizedDepositValue,
      })
      .eq("id", photographer.id);

    let paymentSchemaMissing = false;
    if (error && isMissingPaymentSchemaError(error.message)) {
      paymentSchemaMissing = true;
      error = null;
    }

    setLoading(false);

    if (error) {
      setMessage("Errore nel salvataggio della modalita pagamento.");
      return false;
    }

    if (paymentSchemaMissing) {
      setMessage("Stripe collegato. Esegui la migration 003 per attivare le modalita pagamento.");
      return false;
    }

    if (nextPaymentMode === "online_full") {
      setMessage("Modalita checkout aggiornata: pagamento online completo attivo lato cliente.");
    } else if (nextPaymentMode === "deposit_plus_studio") {
      setMessage("Modalita checkout aggiornata: acconto online + saldo in studio attivo lato cliente.");
    } else {
      setMessage("Modalita checkout aggiornata: pagamento in studio attivo lato cliente.");
    }
    router.refresh();
    return true;
  };

  const checkStripeConnectReady = async () => {
    try {
      const response = await fetch("/api/admin/billing/connect/status", { method: "GET" });
      const payload = (await response.json()) as { connectReady?: boolean; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "Impossibile verificare lo stato Stripe.");
        return false;
      }

      return Boolean(payload.connectReady);
    } catch {
      setMessage("Errore verifica Stripe. Riprova tra qualche secondo.");
      return false;
    }
  };

  const handleStripeModalOpenChange = (open: boolean) => {
    setStripeModalOpen(open);

    if (!open) {
      setStripeEntryState(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const connectState = params.get("connect");
    if (connectState !== "return" && connectState !== "refresh") {
      return;
    }

    const openedByPopupFlow = Boolean(window.opener && window.opener !== window);
    if (openedByPopupFlow) {
      try {
        window.opener.postMessage(
          {
            type: "stripe-connect-onboarding",
            state: connectState,
          },
          window.location.origin
        );
      } catch {
        // noop: fallback to regular in-page flow below when cross-window messaging is blocked
      }

      window.close();
      return;
    }

    setPaymentMode("online_full");
    setStripeEntryState(connectState);
    setStripeModalOpen(true);

    params.delete("connect");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  useEffect(() => {
    setLogoUrl(photographer?.logo_url || "");
    setLogoPositionX(clampPercent(photographer?.logo_position_x));
    setLogoPositionY(clampPercent(photographer?.logo_position_y));
    setLogoSizeInfo(null);
    setLogoMessage("");
    setStorefrontBgUrl(photographer?.storefront_bg_image_url || "");
    setStorefrontBgSizeInfo(null);
    setStorefrontBgMessage("");
    setStorefrontThemeEnabled(Boolean(photographer?.storefront_theme_enabled));
    setStorefrontLayoutPreset(
      (photographer?.storefront_layout_preset as StorefrontLayoutPreset) || "classic"
    );
    setStorefrontBgScope((photographer?.storefront_bg_scope as StorefrontBgScope) || "header");
    setStorefrontBgOverlayOpacity(
      Number.isFinite(photographer?.storefront_bg_overlay_opacity)
        ? Math.min(100, Math.max(0, Math.round(photographer?.storefront_bg_overlay_opacity as number)))
        : 35
    );
    setStorefrontColorPrimary(
      normalizeHexColor(photographer?.storefront_color_primary || photographer?.brand_color, "#D97942")
    );
    setStorefrontColorSecondary(
      normalizeHexColor(photographer?.storefront_color_secondary, "#F3E4D7")
    );
    setStorefrontColorText(normalizeHexColor(photographer?.storefront_color_text, "#2B211C"));
    setStorefrontCtaAlign((photographer?.storefront_cta_align as StorefrontCtaAlign) || "left");
    setPaymentMode((photographer?.payment_mode as PaymentMode) || "pay_in_store");
    setDepositType(photographer?.deposit_type || "percentage");
    setDepositValue(formatInitialDepositValue(photographer?.deposit_type, photographer?.deposit_value));
  }, [photographer]);

  const storefrontPrimaryContrast = getContrastTextColor(storefrontColorPrimary);
  const logoPreviewPageStyle =
    storefrontThemeEnabled && storefrontBgScope === "page" && storefrontBgUrl
      ? {
          backgroundImage: `linear-gradient(${hexToRgba(storefrontColorSecondary, storefrontBgOverlayOpacity / 100)}, ${hexToRgba(storefrontColorSecondary, storefrontBgOverlayOpacity / 100)}), url(${storefrontBgUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : undefined;
  const logoPreviewHeaderStyle =
    storefrontThemeEnabled && storefrontBgScope === "header" && storefrontBgUrl
      ? {
          backgroundImage: `linear-gradient(${hexToRgba(storefrontColorSecondary, storefrontBgOverlayOpacity / 100)}, ${hexToRgba(storefrontColorSecondary, storefrontBgOverlayOpacity / 100)}), url(${storefrontBgUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : undefined;

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

    if (paymentMode === "online_full") {
      const connectReady = await checkStripeConnectReady();
      if (!connectReady) {
        setLoading(false);
        setStripeModalOpen(true);
        setMessage(
          "Stripe non e ancora pronto per gli incassi online. Completa onboarding/abilitazione, poi conferma di nuovo la modalita checkout."
        );
        return;
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
      storefront_theme_enabled: storefrontThemeEnabled,
      storefront_layout_preset: storefrontLayoutPreset,
      storefront_bg_image_url: storefrontBgUrl.trim() || null,
      storefront_bg_scope: storefrontBgScope,
      storefront_bg_overlay_opacity: Math.min(100, Math.max(0, storefrontBgOverlayOpacity)),
      storefront_color_primary: normalizeHexColor(storefrontColorPrimary, "#D97942"),
      storefront_color_secondary: normalizeHexColor(storefrontColorSecondary, "#F3E4D7"),
      storefront_color_text: normalizeHexColor(storefrontColorText, "#2B211C"),
      storefront_cta_align: storefrontCtaAlign,
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
          "Errore: schema non aggiornato. Esegui le migration 006_public_studio_profile_links.sql, 007_logo_positioning_controls.sql e 013_storefront_branding_v1.sql."
        );
      } else {
        setMessage("Errore nel salvataggio delle impostazioni.");
      }
    } else {
      setMessage(
        paymentSchemaMissing
          ? "Branding salvato. Le opzioni pagamento saranno disponibili dopo la migration 003."
          : `Impostazioni aggiornate correttamente. Modalita attiva cliente: ${getPaymentModeLabel(paymentMode)}.`
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

  const handleStorefrontBackgroundFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setStorefrontBgMessage("");

    if (!BG_ALLOWED_TYPES.includes(file.type)) {
      setStorefrontBgMessage("Errore: formato non supportato. Usa JPG, PNG o WEBP.");
      return;
    }

    if (file.size > BG_MAX_BYTES) {
      setStorefrontBgMessage(`Errore: il file supera ${formatMegabytes(BG_MAX_BYTES)}.`);
      return;
    }

    let dimensions: { width: number; height: number };
    try {
      dimensions = await readImageDimensions(file);
    } catch (error) {
      setStorefrontBgMessage(
        error instanceof Error ? error.message : "Errore lettura immagine sfondo."
      );
      return;
    }

    if (
      dimensions.width < BG_MIN_WIDTH ||
      dimensions.height < BG_MIN_HEIGHT ||
      dimensions.width > BG_MAX_WIDTH ||
      dimensions.height > BG_MAX_HEIGHT
    ) {
      setStorefrontBgMessage(
        `Errore: risoluzione non valida (${dimensions.width}x${dimensions.height}px). Usa uno sfondo tra ${BG_MIN_WIDTH}x${BG_MIN_HEIGHT}px e ${BG_MAX_WIDTH}x${BG_MAX_HEIGHT}px.`
      );
      return;
    }

    setStorefrontBgUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/settings/storefront-background-upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Upload sfondo non riuscito.");
      }

      setStorefrontBgUrl(payload.url);
      setStorefrontBgSizeInfo({
        width: dimensions.width,
        height: dimensions.height,
        bytes: file.size,
      });
      setStorefrontBgMessage(
        "Sfondo caricato con successo. Salva per applicarlo alla pagina cliente."
      );
    } catch (error) {
      setStorefrontBgMessage(
        error instanceof Error ? error.message : "Errore durante l'upload sfondo."
      );
    } finally {
      setStorefrontBgUploading(false);
    }
  };

  const handleSelectOnlineFull = () => {
    setPaymentMode("online_full");
    setMessage(
      "Online completo selezionato. Completa Stripe (se necessario) e conferma la modalita checkout cliente."
    );
    setStripeModalOpen(true);
  };

  const handleConfirmPaymentMode = async () => {
    if (paymentMode === "online_full") {
      const connectReady = await checkStripeConnectReady();
      if (!connectReady) {
        setStripeModalOpen(true);
        setMessage(
          "Stripe non e ancora pronto per gli incassi online. Completa onboarding/abilitazione, poi conferma di nuovo la modalita checkout."
        );
        return;
      }
    }

    await persistPaymentMode(paymentMode);
  };

  const handleOpenStripeSetup = () => {
    if (paymentMode !== "online_full") {
      setPaymentMode("online_full");
      setMessage(
        "Online completo selezionato. Completa Stripe e poi conferma la modalita checkout cliente."
      );
    }
    setStripeModalOpen(true);
  };

  const handlePhotographerLogout = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardDescription>Brand studio</CardDescription>
        <CardTitle>Informazioni principali</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
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

              <div className="mt-4 rounded-[1.4rem] border border-[color:var(--border)] bg-white/80 p-4" style={logoPreviewPageStyle}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Anteprima reale header cliente</p>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground"
                  >
                    Apri pagina cliente
                  </a>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Questa simulazione mostra il logo come apparira nella testata della pagina ordini.
                </p>

                <div
                  className={`mt-3 rounded-[1.6rem] border border-[color:var(--border)] px-4 py-4 ${
                    storefrontThemeEnabled ? "bg-white/86 backdrop-blur-[2px]" : "bg-white"
                  }`}
                  style={logoPreviewHeaderStyle}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--muted)]/30">
                      {logoUrl ? (
                        <Image
                          src={logoUrl}
                          alt="Anteprima reale logo su header cliente"
                          fill
                          unoptimized
                          className="object-cover"
                          style={{ objectPosition: `${logoPositionX}% ${logoPositionY}%` }}
                          sizes="64px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                          {(photographer?.name || "S").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {photographer?.name || "Il tuo studio fotografico"}
                      </p>
                      <p className="text-base font-semibold text-foreground">Ordina le tue stampe</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {photographer?.custom_welcome_text ||
                          "Compila i tuoi dati, carica le foto e conferma l'ordine in pochi passaggi."}
                      </p>
                    </div>
                  </div>
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

              <div className="mt-4 flex flex-col gap-3 rounded-[1.2rem] border border-[color:var(--border)] bg-white/85 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Hai finito con il logo?</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Salva subito per applicare logo e branding alla pagina ordini.
                  </p>
                </div>
                <Button type="submit" disabled={loading || logoUploading} className="md:shrink-0">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvataggio
                    </>
                  ) : (
                    "Salva logo e branding"
                  )}
                </Button>
              </div>
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
                type="text"
                inputMode="url"
                defaultValue={photographer?.website_url || ""}
                placeholder="https://www.miosito.it"
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="instagram_url">Instagram (pubblico)</Label>
              <Input
                id="instagram_url"
                name="instagram_url"
                type="text"
                inputMode="url"
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

          <div className="rounded-[1.6rem] border border-[color:var(--border)] bg-white/70 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Aspetto pagina cliente</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Personalizza hero, sfondo e palette della pagina ordine.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                <input
                  type="checkbox"
                  checked={storefrontThemeEnabled}
                  onChange={(event) => setStorefrontThemeEnabled(event.target.checked)}
                  aria-expanded={storefrontThemeEnabled}
                  aria-controls="storefront-branding-panel"
                />
                Attiva nuovo branding
              </label>
            </div>

            <div
              id="storefront-branding-panel"
              className={`grid overflow-hidden transition-all duration-300 ease-out ${
                storefrontThemeEnabled
                  ? "mt-4 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="min-h-0 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="field-shell space-y-2">
                    <Label htmlFor="storefront_layout_preset">Preset layout hero</Label>
                    <select
                      id="storefront_layout_preset"
                      name="storefront_layout_preset"
                      value={storefrontLayoutPreset}
                      onChange={(event) =>
                        setStorefrontLayoutPreset(event.target.value as StorefrontLayoutPreset)
                      }
                      className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                      disabled={!storefrontThemeEnabled}
                    >
                      <option value="classic">Classic</option>
                      <option value="hero_left">Hero sinistra</option>
                      <option value="hero_center">Hero centrato</option>
                      <option value="hero_split">Hero split</option>
                    </select>
                  </div>

                  <div className="field-shell space-y-2">
                    <Label htmlFor="storefront_cta_align">Allineamento CTA</Label>
                    <select
                      id="storefront_cta_align"
                      name="storefront_cta_align"
                      value={storefrontCtaAlign}
                      onChange={(event) =>
                        setStorefrontCtaAlign(event.target.value as StorefrontCtaAlign)
                      }
                      className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                      disabled={!storefrontThemeEnabled}
                    >
                      <option value="left">Sinistra</option>
                      <option value="center">Centro</option>
                      <option value="right">Destra</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/25 p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <Label htmlFor="storefront-bg-upload">Sfondo storefront</Label>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        JPG/PNG/WEBP fino a {formatMegabytes(BG_MAX_BYTES)}. Minimo {BG_MIN_WIDTH}x
                        {BG_MIN_HEIGHT}px.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={storefrontBgFileInputRef}
                        id="storefront-bg-upload"
                        type="file"
                        accept={BG_ALLOWED_TYPES.join(",")}
                        className="hidden"
                        onChange={(event) => {
                          void handleStorefrontBackgroundFileSelect(event);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={storefrontBgUploading || !storefrontThemeEnabled}
                        onClick={() => storefrontBgFileInputRef.current?.click()}
                      >
                        {storefrontBgUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Carica sfondo"
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="field-shell space-y-2">
                      <Label htmlFor="storefront_bg_image_url">URL sfondo</Label>
                      <Input
                        id="storefront_bg_image_url"
                        name="storefront_bg_image_url"
                        type="url"
                        value={storefrontBgUrl}
                        onChange={(event) => setStorefrontBgUrl(event.target.value)}
                        placeholder="https://.../background.jpg"
                        disabled={!storefrontThemeEnabled}
                      />
                    </div>

                    <div className="field-shell space-y-2">
                      <Label htmlFor="storefront_bg_scope">Dove applicare lo sfondo</Label>
                      <select
                        id="storefront_bg_scope"
                        name="storefront_bg_scope"
                        value={storefrontBgScope}
                        onChange={(event) => setStorefrontBgScope(event.target.value as StorefrontBgScope)}
                        className="w-full bg-transparent text-sm font-medium text-foreground outline-none"
                        disabled={!storefrontThemeEnabled}
                      >
                        <option value="header">Solo header hero</option>
                        <option value="page">Pagina intera</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 field-shell space-y-2">
                    <Label htmlFor="storefront_bg_overlay_opacity">
                      Overlay leggibilita ({storefrontBgOverlayOpacity}%)
                    </Label>
                    <input
                      id="storefront_bg_overlay_opacity"
                      name="storefront_bg_overlay_opacity"
                      type="range"
                      min={0}
                      max={100}
                      value={storefrontBgOverlayOpacity}
                      onChange={(event) =>
                        setStorefrontBgOverlayOpacity(
                          Math.min(100, Math.max(0, Number.parseInt(event.target.value, 10) || 0))
                        )
                      }
                      className="w-full accent-primary"
                      disabled={!storefrontThemeEnabled}
                    />
                  </div>

                  {storefrontBgSizeInfo ? (
                    <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Ultimo sfondo: {storefrontBgSizeInfo.width}x{storefrontBgSizeInfo.height}px,{" "}
                      {formatMegabytes(storefrontBgSizeInfo.bytes)}
                    </p>
                  ) : null}
                  {storefrontBgMessage ? (
                    <p
                      className={`mt-3 text-sm font-medium ${
                        storefrontBgMessage.startsWith("Errore")
                          ? "text-red-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {storefrontBgMessage}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="field-shell space-y-3">
                    <Label htmlFor="storefront_color_primary">Colore primario</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="storefront_color_primary"
                        name="storefront_color_primary"
                        type="color"
                        value={storefrontColorPrimary}
                        onChange={(event) => setStorefrontColorPrimary(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="h-12 w-16 cursor-pointer rounded-xl border border-[color:var(--border)] px-1"
                      />
                      <Input
                        value={storefrontColorPrimary}
                        onChange={(event) => setStorefrontColorPrimary(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="field-shell space-y-3">
                    <Label htmlFor="storefront_color_secondary">Colore secondario</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="storefront_color_secondary"
                        name="storefront_color_secondary"
                        type="color"
                        value={storefrontColorSecondary}
                        onChange={(event) => setStorefrontColorSecondary(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="h-12 w-16 cursor-pointer rounded-xl border border-[color:var(--border)] px-1"
                      />
                      <Input
                        value={storefrontColorSecondary}
                        onChange={(event) => setStorefrontColorSecondary(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="field-shell space-y-3">
                    <Label htmlFor="storefront_color_text">Colore testo</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="storefront_color_text"
                        name="storefront_color_text"
                        type="color"
                        value={storefrontColorText}
                        onChange={(event) => setStorefrontColorText(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="h-12 w-16 cursor-pointer rounded-xl border border-[color:var(--border)] px-1"
                      />
                      <Input
                        value={storefrontColorText}
                        onChange={(event) => setStorefrontColorText(event.target.value)}
                        disabled={!storefrontThemeEnabled}
                        className="font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[color:var(--border)] bg-white px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Anteprima contrasto CTA
                  </p>
                  <div
                    className="mt-2 inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: storefrontColorPrimary,
                      color: storefrontPrimaryContrast,
                    }}
                  >
                    Pulsante primario
                  </div>
                </div>
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
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Stato salvato lato cliente: {getPaymentModeLabel(savedPaymentMode)}
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                {getPaymentModeLabel(paymentMode)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={handleSelectOnlineFull}
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
              <>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Se Stripe non è configurato, l&apos;acconto verrà gestito manualmente in studio.
              </p>
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
              </>
            )}

            <div className="mt-4 rounded-[1.2rem] border border-[color:var(--border)] bg-white/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Conferma modalita checkout cliente</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {paymentConfigDirty
                      ? "Hai modifiche non salvate: conferma per pubblicare subito la modalita sul frontend cliente."
                      : "Frontend cliente gia allineato alla configurazione salvata."}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    void handleConfirmPaymentMode();
                  }}
                  disabled={loading || !paymentConfigDirty}
                  className="md:shrink-0"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Conferma in corso
                    </>
                  ) : (
                    "Conferma modalita cliente"
                  )}
                </Button>
              </div>
            </div>

            {message ? (
              <p
                className={`mt-3 rounded-xl border px-3 py-2 text-sm font-medium ${
                  message.startsWith("Errore")
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                }`}
              >
                {message}
              </p>
            ) : null}

            <div className="mt-4 rounded-[1.4rem] border border-primary/30 bg-primary/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Vuoi ricevere pagamenti online? Configura Stripe.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Collega Stripe Connect, chiudi la modale e poi conferma la modalita checkout cliente col pulsante dedicato.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button type="button" onClick={handleOpenStripeSetup} className="md:shrink-0">
                    Configura Stripe
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void handlePhotographerLogout();
                    }}
                    disabled={signingOut}
                    className="md:shrink-0"
                  >
                    {signingOut ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Logout
                      </>
                    ) : (
                      <>
                        <LogOut className="h-4 w-4" />
                        Logout fotografo
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <SubscriptionStatusPanel />

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

      <Dialog
        open={stripeModalOpen}
        onOpenChange={handleStripeModalOpenChange}
      >
        <DialogContent className="max-w-3xl p-0">
          <div className="p-6 md:p-8">
            <DialogHeader>
              <DialogTitle>Configura pagamenti online</DialogTitle>
              <DialogDescription>
                Collega Stripe Connect per attivare l&apos;incasso con Online completo.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 pb-3 md:px-8">
            <StripeConnectCard
              entryState={stripeEntryState}
              onEntryStateHandled={() => setStripeEntryState(null)}
            />
          </div>
          <DialogFooter className="px-6 pb-6 md:px-8">
            <Button type="button" variant="outline" onClick={() => setStripeModalOpen(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

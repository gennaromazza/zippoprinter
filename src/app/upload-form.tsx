"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  ImagePlus,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import { formatCurrency } from "@/lib/orders";
import { getCheckoutAmounts, getPaymentModeLabel } from "@/lib/payments";
import { computeFormatQuantityTotals, getUnitPriceForQuantity } from "@/lib/pricing";
import { LEGAL_DOCUMENT_VERSION, LEGAL_LINKS } from "@/lib/privacy-consent";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { DepositType, PaymentMode, Photographer, PrintFormat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WizardStep = "customer" | "upload" | "format" | "checkout" | "success";
type ActiveWizardStep = Exclude<WizardStep, "success">;

interface PhotoSelection {
  id: string;
  file: File;
  preview: string;
  formatId: string;
  quantity: number;
}

interface SignedUploadPayload {
  uploads?: Array<{
    clientId: string;
    storagePath: string;
    token: string;
  }>;
  error?: string;
}

interface OrderPayload {
  error?: string;
  orderId?: string;
  paymentRequired?: boolean;
  checkoutUrl?: string;
}

type UploadStage = "idle" | "preparing" | "uploading" | "creating-order";

interface UploadProgressState {
  stage: UploadStage;
  uploadedFiles: number;
  totalFiles: number;
  currentBatch: number;
  totalBatches: number;
}

interface SuccessOrderResult {
  orderId: string;
  checkoutUrl?: string;
  photoCount: number;
  copiesCount: number;
}

interface CouponValidationPayload {
  valid?: boolean;
  code?: string;
  discountCents?: number;
  message?: string;
  error?: string;
  errorCode?: string;
}

interface CheckoutConfigPayload {
  paymentMode?: PaymentMode;
  depositType?: DepositType | null;
  depositValue?: number | null;
  stripeEnabled?: boolean;
  updatedAt?: string | null;
  error?: string;
}

interface UploadFormProps {
  formats: PrintFormat[];
  photographer: Photographer | null;
  stripeEnabled: boolean;
}

const PHOTO_MAX_BYTES = 30 * 1024 * 1024;
const PHOTO_COMPRESS_TRIGGER_BYTES = 20 * 1024 * 1024;
const PHOTO_TARGET_BYTES = 18 * 1024 * 1024;
const PHOTO_MIN_WIDTH = 800;
const PHOTO_MIN_HEIGHT = 800;
const PHOTO_MAX_SOURCE_WIDTH = 12000;
const PHOTO_MAX_SOURCE_HEIGHT = 12000;
const PHOTO_MAX_OUTPUT_DIMENSION = 6000;
const MAX_PHOTOS_PER_ORDER = 300;
const MAX_ORDERS_PER_SUBMISSION = 2;
const MAX_PHOTOS_PER_SUBMISSION = MAX_PHOTOS_PER_ORDER * MAX_ORDERS_PER_SUBMISSION;
const UPLOAD_CONCURRENCY = 5;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\+?[\d\s\-().]{6,20}$/;

function isValidEmail(value: string) {
  return EMAIL_REGEX.test(value.trim());
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return PHONE_REGEX.test(value.trim()) && digits.length >= 6;
}

function formatMegabytes(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renameAsJpeg(filename: string) {
  const base = filename.replace(/\.[^.]+$/, "");
  return `${base || "photo"}.jpg`;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compressione immagine non riuscita."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

function readImageSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(objectUrl);
    };

    image.onerror = () => {
      reject(new Error("Impossibile leggere l'immagine selezionata."));
      URL.revokeObjectURL(objectUrl);
    };

    image.src = objectUrl;
  });
}

async function compressImageForUpload(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const image = new window.Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Impossibile comprimere questa immagine."));
    image.src = objectUrl;
  });

  const width = image.width;
  const height = image.height;
  const longestSide = Math.max(width, height);
  const scale = longestSide > PHOTO_MAX_OUTPUT_DIMENSION ? PHOTO_MAX_OUTPUT_DIMENSION / longestSide : 1;
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");

  if (!context) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Canvas non disponibile per la compressione.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  let quality = 0.9;
  let blob = await canvasToBlob(canvas, quality);
  let compressAttempts = 0;
  const MAX_COMPRESS_ATTEMPTS = 6;
  while (blob.size > PHOTO_TARGET_BYTES && quality > 0.45 && compressAttempts < MAX_COMPRESS_ATTEMPTS) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
    compressAttempts++;
  }

  URL.revokeObjectURL(objectUrl);
  return new File([blob], renameAsJpeg(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

function StepDot({
  number,
  active,
  complete,
  title,
  isLast = false,
}: {
  number: number;
  active: boolean;
  complete: boolean;
  title: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-center gap-0 flex-1 min-w-0">
      <div className="flex shrink-0 items-center gap-2.5">
        <div
          className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300 ${
            complete
              ? "border-primary bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(217,121,66,0.3)]"
              : active
                ? "border-primary bg-white text-primary shadow-[0_0_0_4px_rgba(217,121,66,0.12),0_4px_14px_rgba(217,121,66,0.15)]"
                : "border-[color:var(--border)] bg-[color:var(--muted)]/40 text-muted-foreground"
          }`}
        >
          {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : number}
          {active && (
            <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary opacity-20" />
          )}
        </div>
        <div className="min-w-0">
          <p className={`text-[0.68rem] font-bold uppercase tracking-[0.16em] transition-colors duration-200 ${
            active ? "text-primary" : "text-muted-foreground/70"
          }`}>
            Step {number}
          </p>
          <p className={`text-sm font-semibold transition-colors duration-200 ${
            active ? "text-foreground" : complete ? "text-foreground/70" : "text-muted-foreground"
          }`}>
            {title}
          </p>
        </div>
      </div>
      {!isLast && (
        <div className="mx-3 h-[2px] flex-1 rounded-full bg-[color:var(--border)] overflow-hidden">
          <div
            className={`h-full rounded-full bg-primary transition-all duration-500 ease-out ${
              complete ? "w-full" : "w-0"
            }`}
          />
        </div>
      )}
    </div>
  );
}

function computeTotal(photos: PhotoSelection[], formats: PrintFormat[]) {
  const formatTotals = computeFormatQuantityTotals(photos);

  return photos.reduce((sum, photo) => {
    const format = formats.find((item) => item.id === photo.formatId);
    if (!format) {
      return sum;
    }

    const aggregateQty = formatTotals.get(photo.formatId) || photo.quantity;
    const unitPriceCents = getUnitPriceForQuantity(format, aggregateQty);
    return sum + unitPriceCents * photo.quantity;
  }, 0);
}

function getCustomerFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getUploadStageLabel(stage: UploadStage) {
  switch (stage) {
    case "preparing":
      return "Preparazione upload";
    case "uploading":
      return "Caricamento immagini";
    case "creating-order":
      return "Creazione ordine";
    default:
      return "In attesa";
  }
}

async function parseApiPayload<T>(response: Response): Promise<T> {
  const rawText = await response.text();

  if (!rawText) {
    return {} as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(
      rawText.startsWith("Request Entity Too Large")
        ? "Le immagini sono troppo pesanti per essere inviate in questo formato. Riprova con meno foto oppure immagini piu leggere."
        : rawText
    );
  }
}

async function recordPublicOrderConsent(input: {
  photographerId: string;
  customerEmail: string;
}) {
  try {
    await fetch("/api/public/privacy-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "public_order",
        consentKey: "privacy_notice",
        consentGranted: true,
        consentVersion: LEGAL_DOCUMENT_VERSION,
        decision: "acknowledged",
        subjectType: "customer",
        subjectIdentifier: input.customerEmail.trim().toLowerCase(),
        tenantId: input.photographerId,
        metadata: {
          flow: "storefront_upload_wizard",
        },
      }),
    });
  } catch {
    // Never block checkout if consent logging endpoint is temporarily unavailable.
  }
}

export function UploadForm({ formats, photographer, stripeEnabled }: UploadFormProps) {
  const supabase = createSupabaseClient();
  const [photos, setPhotos] = useState<PhotoSelection[]>([]);
  const [activeFormatId, setActiveFormatId] = useState("");
  const [formatPhase, setFormatPhase] = useState<"assign" | "quantity">("assign");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [step, setStep] = useState<WizardStep>("customer");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [uploadWarningMessage, setUploadWarningMessage] = useState("");
  const [uploadInfoMessage, setUploadInfoMessage] = useState("");
  const [isPreparingFiles, setIsPreparingFiles] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState({ current: 0, total: 0 });
  const [successOrders, setSuccessOrders] = useState<SuccessOrderResult[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({
    stage: "idle",
    uploadedFiles: 0,
    totalFiles: 0,
    currentBatch: 0,
    totalBatches: 0,
  });
  const [livePaymentMode, setLivePaymentMode] = useState<PaymentMode | null>(null);
  const [liveDepositType, setLiveDepositType] = useState<DepositType | null>(null);
  const [liveDepositValue, setLiveDepositValue] = useState<number | null>(null);
  const [liveStripeEnabled, setLiveStripeEnabled] = useState<boolean | null>(null);
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponDiscountCents, setCouponDiscountCents] = useState(0);
  const [couponValidatedTotalCents, setCouponValidatedTotalCents] = useState<number | null>(null);
  const [couponMessage, setCouponMessage] = useState("");
  const [couponError, setCouponError] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoSelection[]>([]);

  const refreshCheckoutConfig = useCallback(async () => {
    if (!photographer?.id) {
      return;
    }

    try {
      const response = await fetch(
        `/api/public/checkout-config?photographerId=${encodeURIComponent(photographer.id)}`,
        { method: "GET", cache: "no-store" }
      );
      const payload = await parseApiPayload<CheckoutConfigPayload>(response);
      if (!response.ok) {
        return;
      }

      setLivePaymentMode(payload.paymentMode || null);
      setLiveDepositType(payload.depositType || null);
      setLiveDepositValue(
        Number.isFinite(payload.depositValue as number) ? (payload.depositValue as number) : null
      );
      setLiveStripeEnabled(typeof payload.stripeEnabled === "boolean" ? payload.stripeEnabled : null);
    } catch {
      // Keep current in-memory checkout state when sync fails.
    }
  }, [photographer?.id]);

  useEffect(() => {
    void refreshCheckoutConfig();
  }, [refreshCheckoutConfig]);

  useEffect(() => {
    if (step !== "checkout") {
      return;
    }

    void refreshCheckoutConfig();
  }, [refreshCheckoutConfig, step]);

  useEffect(() => {
    const onFocus = () => {
      void refreshCheckoutConfig();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshCheckoutConfig();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshCheckoutConfig]);

  const effectivePhotographer = useMemo(() => {
    if (!photographer) {
      return null;
    }

    return {
      ...photographer,
      payment_mode: livePaymentMode || photographer.payment_mode,
      deposit_type: liveDepositType || photographer.deposit_type,
      deposit_value:
        liveDepositValue !== null && liveDepositValue !== undefined
          ? liveDepositValue
          : photographer.deposit_value,
    };
  }, [liveDepositType, liveDepositValue, livePaymentMode, photographer]);

  const effectiveStripeEnabled = liveStripeEnabled ?? stripeEnabled;

  const customerFullName = useMemo(
    () => getCustomerFullName(customerFirstName, customerLastName),
    [customerFirstName, customerLastName]
  );
  const totalCents = useMemo(() => computeTotal(photos, formats), [photos, formats]);
  const discountedTotalCents = useMemo(
    () => Math.max(totalCents - couponDiscountCents, 0),
    [couponDiscountCents, totalCents]
  );
  const paymentPlan = useMemo(
    () =>
      getCheckoutAmounts(discountedTotalCents, effectivePhotographer, {
        stripeAvailable: effectiveStripeEnabled,
      }),
    [discountedTotalCents, effectivePhotographer, effectiveStripeEnabled]
  );
  const depositPolicyLabel = useMemo(() => {
    if (paymentPlan.mode !== "deposit_plus_studio") {
      return "";
    }

    const depositType = effectivePhotographer?.deposit_type || "percentage";
    const rawValue = effectivePhotographer?.deposit_value ?? 30;
    if (depositType === "fixed") {
      return `Acconto configurato dallo studio: ${formatCurrency(rawValue)} fissi.`;
    }

    return `Acconto configurato dallo studio: ${rawValue}% del totale.`;
  }, [effectivePhotographer, paymentPlan.mode]);
  const activeFormat = useMemo(
    () => formats.find((format) => format.id === activeFormatId) || null,
    [formats, activeFormatId]
  );
  const assignedFormatsCount = useMemo(
    () => photos.filter((photo) => Boolean(photo.formatId)).length,
    [photos]
  );
  const totalCopiesCount = useMemo(
    () => photos.reduce((sum, photo) => sum + Math.max(1, Math.round(photo.quantity)), 0),
    [photos]
  );
  const assignedCopiesCount = useMemo(
    () =>
      photos
        .filter((photo) => Boolean(photo.formatId))
        .reduce((sum, photo) => sum + Math.max(1, Math.round(photo.quantity)), 0),
    [photos]
  );
  const allFormatsAssigned = photos.length > 0 && assignedFormatsCount === photos.length;
  const unassignedCount = photos.length - assignedFormatsCount;
  const canMoveToUpload =
    Boolean(customerEmail.trim()) &&
    Boolean(customerFirstName.trim()) &&
    Boolean(customerLastName.trim()) &&
    Boolean(customerPhone.trim()) &&
    isValidEmail(customerEmail) &&
    isValidPhone(customerPhone) &&
    privacyAccepted;
  const canMoveToFormat = photos.length > 0 && formats.length > 0;
  const canCheckout = photos.length > 0 && allFormatsAssigned;
  const paymentBlocked = paymentPlan.mode === "online_full" && !effectiveStripeEnabled;
  const pricingInsights = useMemo(() => {
    const formatTotals = computeFormatQuantityTotals(photos);
    let baseTotalCents = 0;
    let quantityTotalCents = 0;
    const discountedFormatIds = new Set<string>();

    for (const photo of photos) {
      const format = formats.find((item) => item.id === photo.formatId);
      if (!format) {
        continue;
      }

      const quantity = Math.max(1, Math.round(photo.quantity));
      const aggregateQty = formatTotals.get(photo.formatId) || quantity;
      const baseUnitPriceCents = format.price_cents;
      const tierUnitPriceCents = getUnitPriceForQuantity(format, aggregateQty);

      baseTotalCents += baseUnitPriceCents * quantity;
      quantityTotalCents += tierUnitPriceCents * quantity;

      if (tierUnitPriceCents < baseUnitPriceCents) {
        discountedFormatIds.add(photo.formatId);
      }
    }

    const quantityDiscountCents = Math.max(baseTotalCents - quantityTotalCents, 0);
    const hasCouponPromo = Boolean(appliedCouponCode) && couponDiscountCents > 0;
    const hasQuantityPromo = quantityDiscountCents > 0;

    return {
      quantityDiscountCents,
      totalDiscountCents: quantityDiscountCents + couponDiscountCents,
      activePromotionsCount: (hasCouponPromo ? 1 : 0) + (hasQuantityPromo ? 1 : 0),
      hasCouponPromo,
      hasQuantityPromo,
      quantityPromoFormats: discountedFormatIds.size,
    };
  }, [appliedCouponCode, couponDiscountCents, formats, photos]);
  const stepOrder: ActiveWizardStep[] = ["customer", "upload", "format", "checkout"];
  const stepTitles: Record<ActiveWizardStep, string> = {
    customer: "Dati cliente",
    upload: "Caricamento foto",
    format: "Formati",
    checkout: "Checkout",
  };
  const currentStepIndex = Math.max(0, stepOrder.indexOf(step as ActiveWizardStep));
  const currentStepTitle = stepTitles[(step as ActiveWizardStep) || "customer"] || stepTitles.customer;
  const uploadProgressPercent =
    uploadProgress.totalFiles > 0
      ? Math.min(100, Math.round((uploadProgress.uploadedFiles / uploadProgress.totalFiles) * 100))
      : 0;
  const uploadProgressLabel = getUploadStageLabel(uploadProgress.stage);

  useEffect(() => {
    if (!appliedCouponCode) {
      return;
    }

    if (couponValidatedTotalCents === totalCents) {
      return;
    }

    setAppliedCouponCode("");
    setCouponDiscountCents(0);
    setCouponValidatedTotalCents(null);
    setCouponMessage("Il coupon e stato rimosso: totale ordine modificato.");
  }, [appliedCouponCode, couponValidatedTotalCents, totalCents]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    };
  }, []);

  useEffect(() => {
    if (!formats.length) {
      setActiveFormatId("");
      return;
    }

    if (!activeFormatId || !formats.some((format) => format.id === activeFormatId)) {
      setActiveFormatId(formats[0].id);
    }
  }, [formats, activeFormatId]);

  useEffect(() => {
    if (formatPhase === "quantity" && !allFormatsAssigned) {
      setFormatPhase("assign");
    }
  }, [formatPhase, allFormatsAssigned]);

  const cartItems = useMemo(
    () => {
      const formatTotals = computeFormatQuantityTotals(photos);
      return photos.map((photo) => {
        const format = formats.find((item) => item.id === photo.formatId);
        const aggregateQty = formatTotals.get(photo.formatId) || photo.quantity;
        const unitPriceCents = format ? getUnitPriceForQuantity(format, aggregateQty) : 0;
        return { ...photo, format, unitPriceCents, subtotal: unitPriceCents * photo.quantity };
      });
    },
    [photos, formats]
  );
  const formatCounts = useMemo(() => {
    const photoCounts = new Map<string, number>();
    const copyCounts = new Map<string, number>();
    for (const photo of photos) {
      const key = photo.formatId || "unassigned";
      const safeQuantity = Math.max(1, Math.round(photo.quantity));
      photoCounts.set(key, (photoCounts.get(key) || 0) + 1);
      copyCounts.set(key, (copyCounts.get(key) || 0) + safeQuantity);
    }
    return { photoCounts, copyCounts };
  }, [photos]);
  const filteredCartItems = useMemo(() => {
    if (formatFilter === "all") {
      return cartItems;
    }
    if (formatFilter === "unassigned") {
      return cartItems.filter((item) => !item.formatId);
    }
    return cartItems.filter((item) => item.formatId === formatFilter);
  }, [cartItems, formatFilter]);
  const selectedInCurrentViewCount = useMemo(
    () => filteredCartItems.filter((item) => selectedPhotoIds.includes(item.id)).length,
    [filteredCartItems, selectedPhotoIds]
  );

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const remainingSlots = MAX_PHOTOS_PER_SUBMISSION - photos.length;
    if (remainingSlots <= 0) {
      setUploadWarningMessage(
        `Hai raggiunto il limite massimo di ${MAX_PHOTOS_PER_SUBMISSION} foto per invio. Per altre immagini devi creare un nuovo ordine.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const filesToProcess = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setUploadWarningMessage(
        `Puoi aggiungere ancora ${remainingSlots} foto (limite invio: ${MAX_PHOTOS_PER_SUBMISSION}). ${files.length - remainingSlots} file ignorati.`
      );
    } else {
      setUploadWarningMessage("");
    }

    setErrorMessage("");
    setUploadInfoMessage("");
    setIsPreparingFiles(true);
    setPrepareProgress({ current: 0, total: filesToProcess.length });

    const rejectedMessages: string[] = [];
    const compressedMessages: string[] = [];
    const acceptedPhotos: PhotoSelection[] = [];
    try {
      for (const originalFile of filesToProcess) {
        if (!originalFile.type.startsWith("image/")) {
          rejectedMessages.push(`${originalFile.name}: formato non supportato.`);
          setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
          continue;
        }

        let imageSize: { width: number; height: number };
        try {
          imageSize = await readImageSize(originalFile);
        } catch {
          rejectedMessages.push(`${originalFile.name}: file non leggibile come immagine.`);
          setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
          continue;
        }

        if (imageSize.width < PHOTO_MIN_WIDTH || imageSize.height < PHOTO_MIN_HEIGHT) {
          rejectedMessages.push(
            `${originalFile.name}: risoluzione troppo bassa (${imageSize.width}x${imageSize.height}px). Minimo ${PHOTO_MIN_WIDTH}x${PHOTO_MIN_HEIGHT}px.`
          );
          setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
          continue;
        }

        if (imageSize.width > PHOTO_MAX_SOURCE_WIDTH || imageSize.height > PHOTO_MAX_SOURCE_HEIGHT) {
          rejectedMessages.push(
            `${originalFile.name}: risoluzione troppo alta (${imageSize.width}x${imageSize.height}px). Massimo ${PHOTO_MAX_SOURCE_WIDTH}x${PHOTO_MAX_SOURCE_HEIGHT}px.`
          );
          setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
          continue;
        }

        let fileToUpload = originalFile;
        const shouldCompress =
          originalFile.size > PHOTO_COMPRESS_TRIGGER_BYTES ||
          Math.max(imageSize.width, imageSize.height) > PHOTO_MAX_OUTPUT_DIMENSION;

        if (shouldCompress) {
          try {
            const compressedFile = await compressImageForUpload(originalFile);
            if (compressedFile.size < originalFile.size) {
              fileToUpload = compressedFile;
              compressedMessages.push(
                `${originalFile.name}: ${formatMegabytes(originalFile.size)} -> ${formatMegabytes(compressedFile.size)}`
              );
            }
          } catch {
            if (originalFile.size > PHOTO_MAX_BYTES) {
              rejectedMessages.push(
                `${originalFile.name}: troppo pesante e non comprimibile automaticamente.`
              );
              setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
              continue;
            }
          }
        }

        if (fileToUpload.size > PHOTO_MAX_BYTES) {
          rejectedMessages.push(
            `${originalFile.name}: supera il limite massimo ${formatMegabytes(PHOTO_MAX_BYTES)}.`
          );
          setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
          continue;
        }

        acceptedPhotos.push({
          id: crypto.randomUUID(),
          file: fileToUpload,
          preview: URL.createObjectURL(fileToUpload),
          formatId: "",
          quantity: 1,
        });
        setPrepareProgress((current) => ({ ...current, current: current.current + 1 }));
      }

      if (acceptedPhotos.length > 0) {
        setPhotos((current) => [...current, ...acceptedPhotos]);
      }

      if (compressedMessages.length > 0) {
        const maxExamples = 3;
        const examples = compressedMessages.slice(0, maxExamples);
        const extraCount = compressedMessages.length - examples.length;
        const extraSuffix = extraCount > 0 ? `\n+ altre ${extraCount} immagini ottimizzate.` : "";
        setUploadInfoMessage(
          `Ottimizzazione automatica completata su ${compressedMessages.length} immagini:\n- ${examples.join("\n- ")}${extraSuffix}`
        );
      }

      if (rejectedMessages.length > 0) {
        const maxExamples = 5;
        const examples = rejectedMessages.slice(0, maxExamples);
        const extraCount = rejectedMessages.length - examples.length;
        const extraSuffix = extraCount > 0 ? `\n+ altri ${extraCount} file non caricati.` : "";
        setUploadWarningMessage(
          `Alcuni file non rispettano i requisiti e non sono stati caricati:\n- ${examples.join("\n- ")}${extraSuffix}`
        );
      }
    } finally {
      setIsPreparingFiles(false);
      setPrepareProgress({ current: 0, total: 0 });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) {
        URL.revokeObjectURL(target.preview);
      }

      return current.filter((photo) => photo.id !== id);
    });
    setSelectedPhotoIds((current) => current.filter((photoId) => photoId !== id));
  };

  const updatePhoto = (id: string, updates: Partial<PhotoSelection>) => {
    setPhotos((current) =>
      current.map((photo) => (photo.id === id ? { ...photo, ...updates } : photo))
    );
  };

  const assignActiveFormatToPhoto = (id: string) => {
    if (!activeFormatId) {
      return;
    }

    updatePhoto(id, { formatId: activeFormatId });
  };

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds((current) =>
      current.includes(id) ? current.filter((photoId) => photoId !== id) : [...current, id]
    );
  };

  const clearPhotoSelection = () => {
    setSelectedPhotoIds([]);
  };

  const selectAllInCurrentView = () => {
    const visibleIds = filteredCartItems.map((item) => item.id);
    if (!visibleIds.length) {
      return;
    }
    setSelectedPhotoIds(visibleIds);
  };

  const applyActiveFormatToSelected = () => {
    if (!activeFormatId || selectedPhotoIds.length === 0) {
      return;
    }

    setPhotos((current) =>
      current.map((photo) =>
        selectedPhotoIds.includes(photo.id) ? { ...photo, formatId: activeFormatId } : photo
      )
    );
  };

  const clearFormatFromSelected = () => {
    if (selectedPhotoIds.length === 0) {
      return;
    }

    setPhotos((current) =>
      current.map((photo) =>
        selectedPhotoIds.includes(photo.id) ? { ...photo, formatId: "" } : photo
      )
    );
  };

  const applyActiveFormatToAll = () => {
    if (!activeFormatId) return;
    if (!window.confirm(`Stai per applicare il formato attivo a ${photos.length} foto. Confermi?`)) {
      return;
    }
    setPhotos((current) => current.map((photo) => ({ ...photo, formatId: activeFormatId })));
    clearPhotoSelection();
  };

  const applyActiveFormatToUnassigned = () => {
    if (!activeFormatId) return;
    const affectedCount = photos.filter((photo) => !photo.formatId).length;
    if (affectedCount === 0) {
      return;
    }
    if (!window.confirm(`Stai per applicare il formato attivo a ${affectedCount} foto non assegnate. Confermi?`)) {
      return;
    }
    setPhotos((current) =>
      current.map((photo) =>
        photo.formatId ? photo : { ...photo, formatId: activeFormatId }
      )
    );
    clearPhotoSelection();
  };

  const clearPhotoFormat = (id: string) => {
    updatePhoto(id, { formatId: "" });
  };

  const updatePhotoQuantity = (id: string, quantity: number) => {
    const safeQuantity = Math.min(10, Math.max(1, quantity));
    updatePhoto(id, { quantity: safeQuantity });
  };

  useEffect(() => {
    if (formatPhase !== "assign" && selectedPhotoIds.length > 0) {
      setSelectedPhotoIds([]);
    }
  }, [formatPhase, selectedPhotoIds.length]);

  useEffect(() => {
    setSelectedPhotoIds((current) => current.filter((id) => photos.some((photo) => photo.id === id)));
  }, [photos]);

  const clearCouponState = () => {
    setCouponCodeInput("");
    setAppliedCouponCode("");
    setCouponDiscountCents(0);
    setCouponValidatedTotalCents(null);
    setCouponError("");
    setCouponMessage("");
  };

  const applyCouponCode = async () => {
    if (!photographer?.id) {
      setCouponError("Studio non disponibile per validare il coupon.");
      return;
    }

    const code = couponCodeInput.trim();
    if (!code) {
      setCouponError("Inserisci un codice coupon.");
      return;
    }

    setCouponValidating(true);
    setCouponError("");
    setCouponMessage("");

    try {
      const response = await fetch("/api/public/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographerId: photographer.id,
          couponCode: code,
          orderTotalCents: totalCents,
          customerEmail: customerEmail.trim(),
        }),
      });

      const payload = await parseApiPayload<CouponValidationPayload>(response);

      if (!response.ok) {
        setCouponError(payload.error || payload.message || "Validazione coupon non riuscita.");
        return;
      }

      if (!payload.valid) {
        setCouponError(payload.message || "Coupon non valido.");
        return;
      }

      const normalizedCode = String(payload.code || code).trim().toUpperCase();
      const discount = Math.max(0, Math.round(Number(payload.discountCents || 0)));
      if (discount <= 0) {
        setCouponError("Il coupon non e applicabile a questo ordine.");
        return;
      }

      setAppliedCouponCode(normalizedCode);
      setCouponCodeInput(normalizedCode);
      setCouponDiscountCents(discount);
      setCouponValidatedTotalCents(totalCents);
      setCouponMessage(payload.message || "Coupon applicato con successo.");
      setCouponError("");
    } catch (error) {
      setCouponError(
        error instanceof Error ? error.message : "Errore durante la validazione coupon."
      );
    } finally {
      setCouponValidating(false);
    }
  };

  const submitOrder = async () => {
    if (!photographer?.id || !canCheckout || !canMoveToUpload || !privacyAccepted) {
      setErrorMessage("Conferma la privacy policy prima di inviare l'ordine.");
      return;
    }
    if (photos.length > MAX_PHOTOS_PER_SUBMISSION) {
      setErrorMessage(
        `Hai selezionato ${photos.length} immagini. Il limite per invio e ${MAX_PHOTOS_PER_SUBMISSION}: crea un nuovo ordine per le foto restanti.`
      );
      return;
    }

    const photoBatches = chunkArray(photos, MAX_PHOTOS_PER_ORDER);

    setLoading(true);
    setErrorMessage("");
    setSuccessOrders([]);
    setSuccessMessage("");
    setUploadProgress({
      stage: "preparing",
      uploadedFiles: 0,
      totalFiles: photos.length,
      currentBatch: 1,
      totalBatches: photoBatches.length,
    });

    void recordPublicOrderConsent({
      photographerId: photographer.id,
      customerEmail,
    });

    try {
      let uploadedFiles = 0;
      const createdOrders: SuccessOrderResult[] = [];

      for (let batchIndex = 0; batchIndex < photoBatches.length; batchIndex += 1) {
        const batch = photoBatches[batchIndex];

        setUploadProgress((current) => ({
          ...current,
          stage: "preparing",
          currentBatch: batchIndex + 1,
        }));

        const uploadResponse = await fetch("/api/public/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photographerId: photographer.id,
            files: batch.map((photo) => ({
              clientId: photo.id,
              originalFilename: photo.file.name,
            })),
          }),
        });

        const uploadPayload = await parseApiPayload<SignedUploadPayload>(uploadResponse);
        if (!uploadResponse.ok || !uploadPayload.uploads?.length) {
          throw new Error(
            uploadPayload.error || `Preparazione upload non riuscita per ordine ${batchIndex + 1}.`
          );
        }

        const uploadMap = new Map(uploadPayload.uploads.map((upload) => [upload.clientId, upload]));
        let queueIndex = 0;
        const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, batch.length) }, () =>
          (async () => {
            while (queueIndex < batch.length) {
              const nextIndex = queueIndex;
              queueIndex += 1;
              const photo = batch[nextIndex];
              const target = uploadMap.get(photo.id);

              if (!target) {
                throw new Error("Una o piu immagini non hanno ricevuto un URL di upload valido.");
              }

              setUploadProgress((current) => ({
                ...current,
                stage: "uploading",
              }));

              const { error: uploadError } = await supabase.storage
                .from("photos")
                .uploadToSignedUrl(target.storagePath, target.token, photo.file, {
                  contentType: photo.file.type || "application/octet-stream",
                  upsert: false,
                });

              if (uploadError) {
                throw new Error(
                  `Caricamento immagini non riuscito per ordine ${batchIndex + 1}. Riprova tra un attimo.`
                );
              }

              uploadedFiles += 1;
              setUploadProgress((current) => ({
                ...current,
                uploadedFiles,
              }));
            }
          })()
        );

        await Promise.all(workers);

        setUploadProgress((current) => ({
          ...current,
          stage: "creating-order",
          currentBatch: batchIndex + 1,
        }));

        const response = await fetch("/api/public/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photographerId: photographer.id,
            idempotencyKey:
              photoBatches.length === 1
                ? idempotencyKeyRef.current
                : `${idempotencyKeyRef.current}-part-${batchIndex + 1}`,
            customerEmail: customerEmail.trim(),
            customerFirstName: customerFirstName.trim(),
            customerLastName: customerLastName.trim(),
            customerPhone: customerPhone.trim(),
            privacyAccepted,
            privacyVersion: LEGAL_DOCUMENT_VERSION,
            couponCode: batchIndex === 0 ? appliedCouponCode || undefined : undefined,
            manifest: batch.map((photo) => ({
              clientId: photo.id,
              formatId: photo.formatId,
              quantity: photo.quantity,
              originalFilename: photo.file.name,
              storagePath: uploadMap.get(photo.id)?.storagePath,
            })),
          }),
        });

        const payload = await parseApiPayload<OrderPayload>(response);
        if (!response.ok) {
          throw new Error(payload.error || `Preparazione ordine ${batchIndex + 1} non riuscita.`);
        }

        createdOrders.push({
          orderId: payload.orderId || `Ordine ${batchIndex + 1}`,
          checkoutUrl: payload.checkoutUrl,
          photoCount: batch.length,
          copiesCount: batch.reduce(
            (sum, photo) => sum + Math.max(1, Math.round(photo.quantity)),
            0
          ),
        });
      }

      setSuccessOrders(createdOrders);
      setSuccessMessage(
        photoBatches.length > 1
          ? `Hai inviato ${photos.length} immagini in ${photoBatches.length} ordini separati (max ${MAX_PHOTOS_PER_ORDER} foto per ordine).`
          : "Il tuo ordine e stato registrato correttamente."
      );

      if (createdOrders.length === 1 && createdOrders[0].checkoutUrl) {
        window.location.href = createdOrders[0].checkoutUrl;
        return;
      }

      setStep("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Errore durante la preparazione dell'ordine."
      );
    } finally {
      setLoading(false);
      setUploadProgress({
        stage: "idle",
        uploadedFiles: 0,
        totalFiles: 0,
        currentBatch: 0,
        totalBatches: 0,
      });
    }
  };

  if (step === "success") {
    const sentPhotosCount =
      successOrders.reduce((sum, order) => sum + (order.photoCount || 0), 0) || photos.length;
    const sentCopiesCount =
      successOrders.reduce((sum, order) => sum + (order.copiesCount || 0), 0) || totalCopiesCount;

    return (
      <section className="rounded-[2rem] border border-[color:var(--border)] bg-white p-8 shadow-[var(--shadow-sm)] md:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-11 w-11" />
          </div>
          <p className="section-kicker mx-auto mt-6">Ordine inviato</p>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight text-balance">
            Il tuo ordine e stato registrato correttamente.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {successMessage ||
              "Lo studio ricevera immagini, formati e riepilogo economico. Ti contattera quando le stampe saranno pronte."}
          </p>
          <div className="mt-8 grid gap-4 rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-5 text-left md:grid-cols-4">
            <SummaryStat label="Foto inviate" value={String(sentPhotosCount)} />
            <SummaryStat label="Copie inviate" value={String(sentCopiesCount)} />
            <SummaryStat label="Totale ordine" value={formatCurrency(discountedTotalCents)} />
            <SummaryStat
              label={successOrders.length > 1 ? "Ordini creati" : "Riferimento"}
              value={successOrders.length > 1 ? String(successOrders.length) : successOrders[0]?.orderId || "Ordine creato"}
            />
          </div>
          {successOrders.length > 0 && (
            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--border)] bg-white p-5 text-left">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Riferimenti ordine
              </p>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                {successOrders.map((order, index) => (
                  <div key={`${order.orderId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2">
                    <span>
                      Ordine {index + 1}: <strong>{order.orderId}</strong> · {order.photoCount} foto · {order.copiesCount} copie
                    </span>
                    {order.checkoutUrl && (
                      <a
                        href={order.checkoutUrl}
                        className="font-semibold text-primary hover:underline"
                        rel="noreferrer"
                        target="_blank"
                      >
                        Completa pagamento
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 pb-6 md:pb-8">
      <div className="rounded-[1.8rem] border border-[color:var(--border)] bg-white/95 px-4 py-4 shadow-[var(--shadow-sm)] md:px-6">
        <div className="flex items-center justify-between md:hidden">
          <div className="flex-1">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
              Step {currentStepIndex + 1} di {stepOrder.length}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{currentStepTitle}</p>
          </div>
          <span className="text-xs font-bold tabular-nums text-primary">
            {Math.round(((currentStepIndex + 1) / stepOrder.length) * 100)}%
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--muted)]/60 md:hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-[#e8935a] transition-all duration-500 ease-out"
            style={{ width: `${((currentStepIndex + 1) / stepOrder.length) * 100}%` }}
          />
        </div>
        <div className="hidden gap-0 overflow-x-auto pb-1 md:flex">
          <StepDot number={1} title="Dati cliente" active={step === "customer"} complete={step !== "customer"} />
          <StepDot number={2} title="Caricamento foto" active={step === "upload"} complete={step === "format" || step === "checkout"} />
          <StepDot number={3} title="Formati" active={step === "format"} complete={step === "checkout"} />
          <StepDot number={4} title="Checkout" active={step === "checkout"} complete={false} />
          <StepDot number={5} title="Conferma" active={false} complete={false} isLast />
        </div>
      </div>

      <LivePricingRibbon
        totalCents={discountedTotalCents}
        promotionsCount={pricingInsights.activePromotionsCount}
        totalDiscountCents={pricingInsights.totalDiscountCents}
        hasCouponPromo={pricingInsights.hasCouponPromo}
        hasQuantityPromo={pricingInsights.hasQuantityPromo}
        quantityPromoFormats={pricingInsights.quantityPromoFormats}
      />

      {step === "customer" ? (
        <Panel
          title="Step 1"
          headline="Inserisci i tuoi dati"
          note="Email, nome, cognome e telefono sono richiesti per registrare correttamente l'anagrafica cliente dello studio."
          centered
        >
          <div className="mx-auto grid max-w-3xl gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field icon={<UserRound className="h-4 w-4 text-muted-foreground" />} label="Nome">
                <Input id="customer-first-name" value={customerFirstName} onChange={(event) => setCustomerFirstName(event.target.value)} placeholder="Mario" required />
              </Field>
              <Field icon={<UserRound className="h-4 w-4 text-muted-foreground" />} label="Cognome">
                <Input id="customer-last-name" value={customerLastName} onChange={(event) => setCustomerLastName(event.target.value)} placeholder="Rossi" required />
              </Field>
            </div>

            <Field icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email" error={emailError}>
              <Input
                id="customer-email"
                type="email"
                value={customerEmail}
                onChange={(event) => {
                  setCustomerEmail(event.target.value);
                  if (emailError) setEmailError("");
                }}
                onBlur={() => {
                  if (customerEmail.trim() && !isValidEmail(customerEmail)) {
                    setEmailError("Inserisci un indirizzo email valido.");
                  } else {
                    setEmailError("");
                  }
                }}
                placeholder="nome@email.com"
                required
              />
            </Field>

            <Field icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Telefono" error={phoneError}>
              <Input
                id="customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(event) => {
                  setCustomerPhone(event.target.value);
                  if (phoneError) setPhoneError("");
                }}
                onBlur={() => {
                  if (customerPhone.trim() && !isValidPhone(customerPhone)) {
                    setPhoneError("Numero non valido — usa il formato +39 333 1234567");
                  } else {
                    setPhoneError("");
                  }
                }}
                placeholder="+39 333 1234567"
                required
              />
            </Field>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-primary/15 bg-gradient-to-br from-[color:var(--accent)] to-white p-5">
              <div className="relative z-10 flex items-start gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ShieldCheck className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">I tuoi dati sono al sicuro</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Le informazioni raccolte restano associate esclusivamente allo studio e vengono utilizzate solo per gestire i tuoi ordini.
                  </p>
                </div>
              </div>
              <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-primary/[0.04]" />
              <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-primary/[0.03]" />
            </div>

            <div className="rounded-[1.3rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-4 py-3 text-sm">
              <label className="flex items-start gap-3 leading-6 text-foreground">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(event) => setPrivacyAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[color:var(--border-strong)]"
                />
                <span>
                  Confermo di aver letto la{" "}
                  <Link href={LEGAL_LINKS.privacyPolicy} className="font-semibold text-primary hover:underline">
                    Privacy Policy
                  </Link>{" "}
                  e i{" "}
                  <Link href={LEGAL_LINKS.termsOfService} className="font-semibold text-primary hover:underline">
                    Termini di servizio
                  </Link>
                  .
                </span>
              </label>
              <p className="mt-2 pl-7 text-xs text-muted-foreground">
                Versione informativa: {LEGAL_DOCUMENT_VERSION}
              </p>
            </div>

            {errorMessage && <ErrorBanner message={errorMessage} />}

            <div className="flex justify-end">
              <Button size="lg" disabled={!canMoveToUpload} onClick={() => setStep("upload")}>
                Prosegui
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Panel>
      ) : step === "upload" ? (
        <div className="space-y-4">
          <Panel
            title="Step 2"
            headline="Carica le foto da stampare"
            note="In questo passaggio ti concentri solo sul caricamento. I formati li assegni subito dopo in una schermata dedicata."
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{customerFullName}</p>
                <p className="text-sm text-muted-foreground">{customerEmail}</p>
              </div>
              <Button variant="outline" onClick={() => setStep("customer")}>
                <ArrowLeft className="h-4 w-4" />
                Modifica dati
              </Button>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" id="photo-upload" disabled={isPreparingFiles} />
            <label
              htmlFor="photo-upload"
              className={`group flex min-h-[280px] flex-col items-center justify-center rounded-[1.8rem] border-2 border-dashed px-6 py-8 text-center ${
                isPreparingFiles
                  ? "cursor-not-allowed border-primary/40 bg-[color:var(--secondary)]/35 opacity-80"
                  : "cursor-pointer border-[color:var(--border)] bg-[color:var(--muted)]/35 hover:border-primary hover:bg-[color:var(--secondary)]"
              }`}
            >
              <div className="mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-primary text-white shadow-[0_18px_44px_rgba(217,121,66,0.18)]">
                {isPreparingFiles ? <Loader2 className="h-8 w-8 animate-spin" /> : <ImagePlus className="h-8 w-8" />}
              </div>
              <h4 className="text-[1.85rem] font-semibold tracking-tight">
                {isPreparingFiles ? "Sto preparando le immagini..." : "Trascina o seleziona le tue immagini"}
              </h4>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {isPreparingFiles
                  ? `Analisi/compressione in corso (${prepareProgress.current}/${prepareProgress.total}).`
                  : "Carica piu foto in una sola volta. In questo step vedi solo anteprime e controllo dei file caricati."}
              </p>
              <span className="mt-5 inline-flex items-center rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold text-foreground">
                {isPreparingFiles ? "Caricamento in corso" : "Scegli file"}
              </span>
            </label>

            {isPreparingFiles && (
              <InfoBanner
                message={`Caricamento in corso: sto preparando ${prepareProgress.total} file (${prepareProgress.current}/${prepareProgress.total}). Attendi il completamento.`}
              />
            )}

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white px-4 py-3 text-sm leading-6 text-muted-foreground">
              Requisiti file: massimo {formatMegabytes(PHOTO_MAX_BYTES)} per immagine, risoluzione minima{" "}
              {PHOTO_MIN_WIDTH}x{PHOTO_MIN_HEIGHT}px. Le immagini molto pesanti vengono ottimizzate automaticamente. Ogni ordine accetta massimo {MAX_PHOTOS_PER_ORDER} foto: se ne invii di piu (fino a {MAX_PHOTOS_PER_SUBMISSION}) il sistema crea automaticamente 2 ordini.
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryBlock title="Foto caricate" value={String(photos.length)} text={photos.length === 1 ? "Hai 1 immagine pronta per lo step formati." : `${photos.length} immagini pronte per lo step formati.`} />
              <SummaryBlock title="Formati disponibili" value={String(formats.length)} text="Il catalogo dello studio verra applicato nello step successivo." />
              <SummaryBlock title="Pagamento" value={getPaymentModeLabel(paymentPlan.mode)} text={paymentPlan.description} />
            </div>

            {formats.length === 0 && <div className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Lo studio non ha ancora formati attivi: l&apos;ordine non puo essere completato finche il catalogo non viene configurato.</div>}
            {photos.length > MAX_PHOTOS_PER_ORDER && (
              <InfoBanner
                message={`Hai caricato ${photos.length} foto: al checkout verranno creati 2 ordini separati (max ${MAX_PHOTOS_PER_ORDER} foto per ordine).`}
              />
            )}
            {photos.length > 0 && <PhotoGrid photos={photos} onRemove={removePhoto} />}
            {uploadInfoMessage && <InfoBanner message={uploadInfoMessage} />}
            {uploadWarningMessage && <WarningBanner message={uploadWarningMessage} />}
            {errorMessage && <ErrorBanner message={errorMessage} />}
          </Panel>

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-foreground">{photos.length === 0 ? "Nessuna foto caricata" : `${photos.length} foto pronte`}</p>
              <p className="mt-1 text-sm text-muted-foreground">Prosegui quando hai terminato il caricamento.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={() => setStep("customer")}>
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <Button
                size="lg"
                disabled={!canMoveToFormat}
                onClick={() => {
                  setFormatPhase("assign");
                  setStep("format");
                }}
              >
                Prosegui ai formati
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </StickyActionBar>
        </div>
      ) : step === "format" ? (
        <div className="space-y-4">
          <Panel
            title="Step 3"
            headline="Assegna i formati"
            note="Scegli un formato attivo e tocca le foto per assegnarlo subito. Quando tutte hanno un formato passi alla fase quantita."
          >
            <div
              className="space-y-4 rounded-[1.7rem] border border-[color:var(--border)] bg-white/95 p-4 shadow-[var(--shadow-sm)] md:sticky md:z-10 md:backdrop-blur"
              style={{ top: "84px" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Foto con formato: {assignedFormatsCount} / {photos.length}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatPhase === "assign"
                      ? `Mancano ${unassignedCount} foto da assegnare.`
                      : `Tutte le foto hanno un formato. Copie totali: ${assignedCopiesCount}.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStep("upload")}>
                    <ArrowLeft className="h-4 w-4" />
                    Torna alle foto
                  </Button>
                  {formatPhase === "quantity" && (
                    <Button variant="outline" onClick={() => setFormatPhase("assign")}>
                      Torna ai formati
                    </Button>
                  )}
                </div>
              </div>

              {formatPhase === "assign" && (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Formato attivo
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {formats.map((format) => {
                        const isActive = format.id === activeFormatId;
                        return (
                          <button
                            key={format.id}
                            type="button"
                            onClick={() => setActiveFormatId(format.id)}
                            className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                              isActive
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-[color:var(--border)] bg-[color:var(--muted)]/45 text-foreground hover:bg-[color:var(--muted)]"
                            }`}
                          >
                            {format.name} - {formatCurrency(format.price_cents)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={applyActiveFormatToAll} disabled={!activeFormat}>
                      Applica formato attivo a tutte
                    </Button>
                    <Button
                      variant="outline"
                      onClick={applyActiveFormatToUnassigned}
                      disabled={!activeFormat || unassignedCount === 0}
                    >
                      Applica alle non assegnate
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Filtra foto
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFormatFilter("all")}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          formatFilter === "all"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-[color:var(--border)] bg-[color:var(--muted)]/45 text-foreground hover:bg-[color:var(--muted)]"
                        }`}
                      >
                        Tutte ({photos.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatFilter("unassigned")}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          formatFilter === "unassigned"
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-[color:var(--border)] bg-[color:var(--muted)]/45 text-foreground hover:bg-[color:var(--muted)]"
                        }`}
                      >
                        Non assegnate ({formatCounts.photoCounts.get("unassigned") || 0} foto)
                      </button>
                      {formats.map((format) => (
                        <button
                          key={`filter-${format.id}`}
                          type="button"
                          onClick={() => setFormatFilter(format.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            formatFilter === format.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-[color:var(--border)] bg-[color:var(--muted)]/45 text-foreground hover:bg-[color:var(--muted)]"
                          }`}
                        >
                          {format.name} ({formatCounts.photoCounts.get(format.id) || 0} foto · {formatCounts.copyCounts.get(format.id) || 0} copie)
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-3 py-2">
                    <span className="text-xs font-semibold text-foreground">
                      Selezionate: {selectedPhotoIds.length}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={selectAllInCurrentView}
                      disabled={!filteredCartItems.length}
                    >
                      Seleziona viste ({filteredCartItems.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={clearPhotoSelection}
                      disabled={selectedPhotoIds.length === 0}
                    >
                      Deseleziona tutto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={applyActiveFormatToSelected}
                      disabled={!activeFormat || selectedPhotoIds.length === 0}
                    >
                      Assegna formato a selezionate
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={clearFormatFromSelected}
                      disabled={selectedPhotoIds.length === 0}
                    >
                      Rimuovi formato da selezionate
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCartItems.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-[1.6rem] border border-[color:var(--border)] bg-white">
                  <div
                    className={`relative aspect-[4/3] overflow-hidden ${
                      formatPhase === "assign" ? "cursor-pointer" : ""
                    }`}
                    onClick={() => {
                      if (formatPhase === "assign") assignActiveFormatToPhoto(item.id);
                    }}
                  >
                    <Image src={item.preview} alt={item.file.name} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" />
                    <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                      {formatPhase === "assign" && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePhotoSelection(item.id);
                          }}
                          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold ${
                            selectedPhotoIds.includes(item.id)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/70 bg-black/65 text-white"
                          }`}
                          aria-label={`Seleziona ${item.file.name}`}
                        >
                          {selectedPhotoIds.includes(item.id) ? "OK" : "Sel"}
                        </button>
                      )}
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        item.format
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-black/70 text-white"
                      }`}>
                        {item.format ? item.format.name : "Senza formato"}
                      </span>
                      {item.format && formatPhase === "assign" && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            clearPhotoFormat(item.id);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black"
                          aria-label={`Rimuovi formato da ${item.file.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p>
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    {formatPhase === "quantity" ? (
                      <div className="flex items-center justify-between rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-3 py-2">
                        <span className="text-sm text-muted-foreground">Quantita</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-lg font-semibold"
                            onClick={() => updatePhotoQuantity(item.id, item.quantity - 1)}
                            aria-label={`Riduci quantita di ${item.file.name}`}
                          >
                            -
                          </button>
                          <span className="min-w-8 text-center text-sm font-semibold text-foreground">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-lg font-semibold"
                            onClick={() => updatePhotoQuantity(item.id, item.quantity + 1)}
                            aria-label={`Aumenta quantita di ${item.file.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Tocca la foto per applicare il formato attivo.
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {formatPhase === "assign" && filteredCartItems.length === 0 && (
              <InfoBanner message="Nessuna foto corrisponde al filtro selezionato." />
            )}

            {errorMessage && <ErrorBanner message={errorMessage} />}
          </Panel>

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {assignedFormatsCount} foto con formato su {photos.length} foto
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Totale aggiornato in tempo reale: {formatCurrency(discountedTotalCents)} · Copie totali: {totalCopiesCount}
                {formatPhase === "assign" ? ` · ${selectedInCurrentViewCount} selezionate nella vista corrente` : ""}
              </p>
            </div>
            {formatPhase === "assign" ? (
              <Button size="lg" disabled={!allFormatsAssigned} onClick={() => setFormatPhase("quantity")}>
                Continua alle quantita
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" disabled={!canCheckout} onClick={() => setStep("checkout")}>
                Vai al checkout
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </StickyActionBar>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Step 4" headline="Checkout e conferma" note="Controlla anagrafica cliente, importi, modalita di pagamento e riepilogo finale prima di inviare l'ordine.">
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFormatPhase("quantity");
                  setStep("format");
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Torna ai formati
              </Button>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-5">
              <div className="flex items-start gap-3">
                {paymentPlan.mode === "pay_in_store" ? <Store className="mt-1 h-5 w-5 text-primary" /> : <CreditCard className="mt-1 h-5 w-5 text-primary" />}
                <div>
                  <p className="font-semibold text-foreground">{getPaymentModeLabel(paymentPlan.mode)}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{paymentPlan.description}</p>
                  {paymentPlan.mode === "deposit_plus_studio" && (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{depositPolicyLabel}</p>
                  )}
                  {paymentPlan.mode === "online_full" && (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Questo studio richiede il pagamento anticipato dell&apos;intero importo.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-[color:var(--border)] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Coupon promozionale</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={couponCodeInput}
                  onChange={(event) => {
                    setCouponCodeInput(event.target.value.toUpperCase());
                    if (couponError) setCouponError("");
                  }}
                  placeholder="Es. BENVENUTO10"
                  disabled={couponValidating || loading}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCouponCode}
                    disabled={couponValidating || loading || !couponCodeInput.trim()}
                  >
                    {couponValidating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifica
                      </>
                    ) : (
                      "Applica"
                    )}
                  </Button>
                  {appliedCouponCode && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={clearCouponState}
                      disabled={couponValidating || loading}
                    >
                      Rimuovi
                    </Button>
                  )}
                </div>
              </div>
              {appliedCouponCode && (
                <p className="mt-2 text-sm text-emerald-700">
                  Coupon attivo: <span className="font-semibold">{appliedCouponCode}</span>
                </p>
              )}
              {couponMessage && <div className="mt-3"><InfoBanner message={couponMessage} /></div>}
              {couponError && <div className="mt-3"><WarningBanner message={couponError} /></div>}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SummaryCard label="Totale ordine" value={formatCurrency(discountedTotalCents)} />
              <SummaryCard label="Da pagare ora" value={formatCurrency(paymentPlan.dueNowCents)} />
              <SummaryCard label="Saldo in studio" value={formatCurrency(paymentPlan.remainingCents)} />
            </div>

            {pricingInsights.quantityDiscountCents > 0 && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryCard
                  label="Totale listino"
                  value={formatCurrency(totalCents + pricingInsights.quantityDiscountCents)}
                />
                <SummaryCard
                  label="Risparmio quantita"
                  value={`-${formatCurrency(pricingInsights.quantityDiscountCents)}`}
                />
              </div>
            )}

            {couponDiscountCents > 0 && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryCard label="Totale prima sconto" value={formatCurrency(totalCents)} />
                <SummaryCard label="Sconto coupon" value={`-${formatCurrency(couponDiscountCents)}`} />
              </div>
            )}

            <div className="mt-4 rounded-[1.5rem] border border-[color:var(--border)] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dati cliente</p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
                <p><span className="font-semibold">Email:</span> {customerEmail}</p>
                <p><span className="font-semibold">Nome:</span> {customerFirstName}</p>
                <p><span className="font-semibold">Cognome:</span> {customerLastName}</p>
                <p><span className="font-semibold">Telefono:</span> {customerPhone}</p>
                <p><span className="font-semibold">Studio:</span> {photographer?.name || "Studio fotografico"}</p>
              </div>
            </div>

            {paymentBlocked && <div className="mt-4 rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Questo studio richiede il checkout online, ma Stripe non e configurato in questo ambiente. L&apos;admin puo attivarlo oppure usare &quot;Pagamento in studio&quot;.</div>}
            {loading && uploadProgress.totalFiles > 0 && (
              <div className="mt-4">
                <UploadProgressPanel
                  stageLabel={uploadProgressLabel}
                  uploadedFiles={uploadProgress.uploadedFiles}
                  totalFiles={uploadProgress.totalFiles}
                  percent={uploadProgressPercent}
                  currentBatch={uploadProgress.currentBatch}
                  totalBatches={uploadProgress.totalBatches}
                />
              </div>
            )}
            {errorMessage && <div className="mt-4"><ErrorBanner message={errorMessage} /></div>}

            <div className="mt-5">
              <Button size="lg" className="w-full" disabled={loading || paymentBlocked || !canMoveToUpload} onClick={submitOrder}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploadProgressLabel}
                  </>
                ) : paymentPlan.mode === "online_full" ? (
                  "Vai al pagamento sicuro"
                ) : paymentPlan.mode === "deposit_plus_studio" && effectiveStripeEnabled ? (
                  "Paga l'acconto online"
                ) : paymentPlan.mode === "deposit_plus_studio" && !effectiveStripeEnabled ? (
                  "Invia ordine allo studio"
                ) : (
                  "Invia ordine allo studio"
                )}
              </Button>
            </div>
          </Panel>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[1.95rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] md:p-6">
              <p className="section-kicker mb-3">Riepilogo immagini</p>
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-4 py-3">
                    <div className="relative h-16 w-16 overflow-hidden rounded-[1rem]">
                      <Image src={item.preview} alt={item.file.name} fill unoptimized className="object-cover" sizes="64px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{item.format?.name || "Formato"} - {item.quantity} copia{item.quantity > 1 ? "e" : ""}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              {couponDiscountCents > 0 && (
                <div className="mt-4 rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-semibold">Coupon applicato: -{formatCurrency(couponDiscountCents)}</p>
                  <p className="mt-1">Totale finale: {formatCurrency(discountedTotalCents)}</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

function Panel({
  title,
  headline,
  note,
  children,
  centered = false,
}: {
  title: string;
  headline: string;
  note: string;
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-[1.9rem] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[color:var(--accent)]/35 to-transparent" />
      <div className="relative z-10 p-5 md:p-6">
        <div className={`mb-5 flex flex-col gap-2 ${centered ? "text-center" : "md:flex-row md:items-start md:justify-between"}`}>
          <div className={centered ? "mx-auto max-w-2xl" : ""}>
            <p className={`section-kicker mb-2 ${centered ? "justify-center" : ""}`}>{title}</p>
            <h2 className="text-2xl font-semibold tracking-tight md:text-[2rem]">{headline}</h2>
          </div>
          <p className={`text-sm leading-6 text-muted-foreground ${centered ? "mx-auto max-w-2xl" : "max-w-sm"}`}>{note}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
  error,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className={`field-shell space-y-2 transition-all duration-200 ${error ? "field-error" : ""}`}>
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {error ? <AlertCircle className="h-4 w-4 text-red-500 shrink-0" /> : icon}
        {children}
      </div>
      {error && (
        <p className="field-hint-enter flex items-center gap-1.5 text-[0.8rem] leading-snug text-red-600/90 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function PhotoGrid({
  photos,
  onRemove,
}: {
  photos: PhotoSelection[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {photos.map((photo) => (
        <article key={photo.id} className="overflow-hidden rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/25">
          <div className="relative aspect-square overflow-hidden">
            <Image src={photo.preview} alt={photo.file.name} fill unoptimized className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
            <button type="button" onClick={() => onRemove(photo.id)} className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black" aria-label={`Rimuovi ${photo.file.name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-semibold text-foreground">{photo.file.name}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{(photo.file.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SummaryBlock({
  title,
  value,
  text,
}: {
  title: string;
  value: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <p className="mt-3 text-lg font-semibold text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}

function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[1.8rem] border border-[color:var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-md)] md:sticky md:bottom-3 md:z-20 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">{children}</div>
    </div>
  );
}

function LivePricingRibbon({
  totalCents,
  promotionsCount,
  totalDiscountCents,
  hasCouponPromo,
  hasQuantityPromo,
  quantityPromoFormats,
}: {
  totalCents: number;
  promotionsCount: number;
  totalDiscountCents: number;
  hasCouponPromo: boolean;
  hasQuantityPromo: boolean;
  quantityPromoFormats: number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Costo in tempo reale
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatCurrency(totalCents)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/45 px-3 py-1 text-xs font-semibold text-foreground">
            Promo attive: {promotionsCount}
          </span>
          {totalDiscountCents > 0 && (
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Risparmi: -{formatCurrency(totalDiscountCents)}
            </span>
          )}
          {hasCouponPromo && (
            <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
              Coupon applicato
            </span>
          )}
          {hasQuantityPromo && (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Sconto quantita su {quantityPromoFormats} {quantityPromoFormats === 1 ? "formato" : "formati"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadProgressPanel({
  stageLabel,
  uploadedFiles,
  totalFiles,
  percent,
  currentBatch,
  totalBatches,
}: {
  stageLabel: string;
  uploadedFiles: number;
  totalFiles: number;
  percent: number;
  currentBatch: number;
  totalBatches: number;
}) {
  return (
    <div className="rounded-[1.5rem] border border-sky-300 bg-sky-50 px-4 py-4 text-sky-900">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span>{stageLabel}</span>
        <span>{percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
        <div
          className="h-full rounded-full bg-sky-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
        <span>
          File caricati: {uploadedFiles}/{totalFiles}
        </span>
        <span>
          Ordine {Math.max(currentBatch, 1)}/{Math.max(totalBatches, 1)}
        </span>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium whitespace-pre-line text-rose-900">
      {message}
    </div>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium whitespace-pre-line text-amber-900">
      {message}
    </div>
  );
}

function InfoBanner({ message }: { message: string }) {
  return (
    <div className="rounded-[1.5rem] border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium whitespace-pre-line text-sky-900">
      {message}
    </div>
  );
}

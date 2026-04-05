"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  ImagePlus,
  Loader2,
  Mail,
  Phone,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import { formatCurrency } from "@/lib/orders";
import { getCheckoutAmounts, getPaymentModeLabel } from "@/lib/payments";
import { getUnitPriceForQuantity } from "@/lib/pricing";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Photographer, PrintFormat } from "@/lib/types";
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

interface UploadFormProps {
  formats: PrintFormat[];
  photographer: Photographer | null;
  stripeEnabled: boolean;
}

const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
const PHOTO_COMPRESS_TRIGGER_BYTES = 8 * 1024 * 1024;
const PHOTO_TARGET_BYTES = 6 * 1024 * 1024;
const PHOTO_MIN_WIDTH = 800;
const PHOTO_MIN_HEIGHT = 800;
const PHOTO_MAX_SOURCE_WIDTH = 12000;
const PHOTO_MAX_SOURCE_HEIGHT = 12000;
const PHOTO_MAX_OUTPUT_DIMENSION = 4096;

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
  while (blob.size > PHOTO_TARGET_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
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
}: {
  number: number;
  active: boolean;
  complete: boolean;
  title: string;
}) {
  return (
    <div className="flex min-w-[10rem] items-center gap-3">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
          complete
            ? "border-primary bg-primary text-primary-foreground"
            : active
              ? "border-primary bg-white text-primary"
              : "border-[color:var(--border)] bg-[color:var(--muted)]/55 text-muted-foreground"
        }`}
      >
        {complete ? <Check className="h-4 w-4" /> : number}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Step {number}
        </p>
        <p className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
          {title}
        </p>
      </div>
    </div>
  );
}

function computeTotal(photos: PhotoSelection[], formats: PrintFormat[]) {
  return photos.reduce((sum, photo) => {
    const format = formats.find((item) => item.id === photo.formatId);
    if (!format) {
      return sum;
    }

    const unitPriceCents = getUnitPriceForQuantity(format, photo.quantity);
    return sum + unitPriceCents * photo.quantity;
  }, 0);
}

function getCustomerFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
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

export function UploadForm({ formats, photographer, stripeEnabled }: UploadFormProps) {
  const supabase = createSupabaseClient();
  const [photos, setPhotos] = useState<PhotoSelection[]>([]);
  const [activeFormatId, setActiveFormatId] = useState("");
  const [formatPhase, setFormatPhase] = useState<"assign" | "quantity">("assign");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [step, setStep] = useState<WizardStep>("customer");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadWarningMessage, setUploadWarningMessage] = useState("");
  const [uploadInfoMessage, setUploadInfoMessage] = useState("");
  const [successOrderId, setSuccessOrderId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoSelection[]>([]);

  const customerFullName = useMemo(
    () => getCustomerFullName(customerFirstName, customerLastName),
    [customerFirstName, customerLastName]
  );
  const totalCents = useMemo(() => computeTotal(photos, formats), [photos, formats]);
  const paymentPlan = useMemo(
    () => getCheckoutAmounts(totalCents, photographer),
    [totalCents, photographer]
  );
  const depositPolicyLabel = useMemo(() => {
    if (paymentPlan.mode !== "deposit_plus_studio") {
      return "";
    }

    const depositType = photographer?.deposit_type || "percentage";
    const rawValue = photographer?.deposit_value ?? 30;
    if (depositType === "fixed") {
      return `Acconto configurato dallo studio: ${formatCurrency(rawValue)} fissi.`;
    }

    return `Acconto configurato dallo studio: ${rawValue}% del totale.`;
  }, [paymentPlan.mode, photographer]);
  const activeFormat = useMemo(
    () => formats.find((format) => format.id === activeFormatId) || null,
    [formats, activeFormatId]
  );
  const assignedFormatsCount = useMemo(
    () => photos.filter((photo) => Boolean(photo.formatId)).length,
    [photos]
  );
  const allFormatsAssigned = photos.length > 0 && assignedFormatsCount === photos.length;
  const unassignedCount = photos.length - assignedFormatsCount;
  const canMoveToUpload =
    Boolean(customerEmail.trim()) &&
    Boolean(customerFirstName.trim()) &&
    Boolean(customerLastName.trim()) &&
    Boolean(customerPhone.trim());
  const canMoveToFormat = photos.length > 0 && formats.length > 0;
  const canCheckout = photos.length > 0 && allFormatsAssigned;
  const paymentBlocked = paymentPlan.mode !== "pay_in_store" && !stripeEnabled;
  const stepOrder: ActiveWizardStep[] = ["customer", "upload", "format", "checkout"];
  const stepTitles: Record<ActiveWizardStep, string> = {
    customer: "Dati cliente",
    upload: "Caricamento foto",
    format: "Formati",
    checkout: "Checkout",
  };
  const currentStepIndex = Math.max(0, stepOrder.indexOf(step as ActiveWizardStep));
  const currentStepTitle = stepTitles[(step as ActiveWizardStep) || "customer"] || stepTitles.customer;

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
    () =>
      photos.map((photo) => {
        const format = formats.find((item) => item.id === photo.formatId);
        const unitPriceCents = format ? getUnitPriceForQuantity(format, photo.quantity) : 0;
        return { ...photo, format, unitPriceCents, subtotal: unitPriceCents * photo.quantity };
      }),
    [photos, formats]
  );

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    setErrorMessage("");
    setUploadWarningMessage("");
    setUploadInfoMessage("");

    const rejectedMessages: string[] = [];
    const compressedMessages: string[] = [];
    const acceptedPhotos: PhotoSelection[] = [];

    for (const originalFile of files) {
      if (!originalFile.type.startsWith("image/")) {
        rejectedMessages.push(`${originalFile.name}: formato non supportato.`);
        continue;
      }

      let imageSize: { width: number; height: number };
      try {
        imageSize = await readImageSize(originalFile);
      } catch {
        rejectedMessages.push(`${originalFile.name}: file non leggibile come immagine.`);
        continue;
      }

      if (imageSize.width < PHOTO_MIN_WIDTH || imageSize.height < PHOTO_MIN_HEIGHT) {
        rejectedMessages.push(
          `${originalFile.name}: risoluzione troppo bassa (${imageSize.width}x${imageSize.height}px). Minimo ${PHOTO_MIN_WIDTH}x${PHOTO_MIN_HEIGHT}px.`
        );
        continue;
      }

      if (imageSize.width > PHOTO_MAX_SOURCE_WIDTH || imageSize.height > PHOTO_MAX_SOURCE_HEIGHT) {
        rejectedMessages.push(
          `${originalFile.name}: risoluzione troppo alta (${imageSize.width}x${imageSize.height}px). Massimo ${PHOTO_MAX_SOURCE_WIDTH}x${PHOTO_MAX_SOURCE_HEIGHT}px.`
        );
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
            continue;
          }
        }
      }

      if (fileToUpload.size > PHOTO_MAX_BYTES) {
        rejectedMessages.push(
          `${originalFile.name}: supera il limite massimo ${formatMegabytes(PHOTO_MAX_BYTES)}.`
        );
        continue;
      }

      acceptedPhotos.push({
        id: crypto.randomUUID(),
        file: fileToUpload,
        preview: URL.createObjectURL(fileToUpload),
        formatId: "",
        quantity: 1,
      });
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

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

  const applyActiveFormatToAll = () => {
    if (!activeFormatId) return;
    setPhotos((current) => current.map((photo) => ({ ...photo, formatId: activeFormatId })));
  };

  const applyActiveFormatToUnassigned = () => {
    if (!activeFormatId) return;
    setPhotos((current) =>
      current.map((photo) =>
        photo.formatId ? photo : { ...photo, formatId: activeFormatId }
      )
    );
  };

  const clearPhotoFormat = (id: string) => {
    updatePhoto(id, { formatId: "" });
  };

  const updatePhotoQuantity = (id: string, quantity: number) => {
    const safeQuantity = Math.min(10, Math.max(1, quantity));
    updatePhoto(id, { quantity: safeQuantity });
  };

  const submitOrder = async () => {
    if (!photographer?.id || !canCheckout || !canMoveToUpload) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const uploadResponse = await fetch("/api/public/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographerId: photographer.id,
          files: photos.map((photo) => ({
            clientId: photo.id,
            originalFilename: photo.file.name,
          })),
        }),
      });

      const uploadPayload = await parseApiPayload<SignedUploadPayload>(uploadResponse);
      if (!uploadResponse.ok || !uploadPayload.uploads?.length) {
        throw new Error(uploadPayload.error || "Preparazione upload non riuscita.");
      }

      const uploadMap = new Map(uploadPayload.uploads.map((upload) => [upload.clientId, upload]));
      for (const photo of photos) {
        const target = uploadMap.get(photo.id);
        if (!target) {
          throw new Error("Una o piu immagini non hanno ricevuto un URL di upload valido.");
        }

        const { error: uploadError } = await supabase.storage
          .from("photos")
          .uploadToSignedUrl(target.storagePath, target.token, photo.file, {
            contentType: photo.file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          throw new Error("Caricamento immagini non riuscito. Riprova tra un attimo.");
        }
      }

      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photographerId: photographer.id,
          customerEmail: customerEmail.trim(),
          customerFirstName: customerFirstName.trim(),
          customerLastName: customerLastName.trim(),
          customerPhone: customerPhone.trim(),
          manifest: photos.map((photo) => ({
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
        throw new Error(payload.error || "Preparazione ordine non riuscita.");
      }

      if (payload.paymentRequired && payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }

      setSuccessOrderId(payload.orderId || "");
      setStep("success");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Errore durante la preparazione dell'ordine."
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
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
            Lo studio ricevera immagini, formati e riepilogo economico. Ti contattera quando le
            stampe saranno pronte.
          </p>
          <div className="mt-8 grid gap-4 rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-5 text-left md:grid-cols-3">
            <SummaryStat label="Foto inviate" value={String(photos.length)} />
            <SummaryStat label="Totale ordine" value={formatCurrency(totalCents)} />
            <SummaryStat label="Riferimento" value={successOrderId || "Ordine creato"} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-6 md:pb-8">
      <div className="rounded-[1.8rem] border border-[color:var(--border)] bg-white/95 px-4 py-4 shadow-[var(--shadow-sm)] md:sticky md:top-4 md:z-20 md:backdrop-blur md:px-6">
        <div className="flex items-center justify-between md:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Step {currentStepIndex + 1} di {stepOrder.length}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{currentStepTitle}</p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {Math.round(((currentStepIndex + 1) / stepOrder.length) * 100)}%
          </span>
        </div>
        <div className="hidden gap-4 overflow-x-auto pb-1 md:flex">
          <StepDot number={1} title="Dati cliente" active={step === "customer"} complete={step !== "customer"} />
          <StepDot number={2} title="Caricamento foto" active={step === "upload"} complete={step === "format" || step === "checkout"} />
          <StepDot number={3} title="Formati" active={step === "format"} complete={step === "checkout"} />
          <StepDot number={4} title="Checkout" active={step === "checkout"} complete={false} />
          <StepDot number={5} title="Conferma" active={false} complete={false} />
        </div>
      </div>

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

            <Field icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email">
              <Input id="customer-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="nome@email.com" required />
            </Field>

            <Field icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Telefono">
              <Input
                id="customer-phone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="+39 333 1234567"
                required
              />
            </Field>

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/35 p-4">
              <p className="text-sm font-semibold text-foreground">Anagrafica cliente per lo studio</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                I dati raccolti restano associati allo studio corretto, cosi l&apos;admin puo consultare storico ordini e contatti del proprio tenant.
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

            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" id="photo-upload" />
            <label htmlFor="photo-upload" className="group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[1.8rem] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/35 px-6 py-8 text-center hover:border-primary hover:bg-[color:var(--secondary)]">
              <div className="mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-primary text-white shadow-[0_18px_44px_rgba(217,121,66,0.18)]">
                <ImagePlus className="h-8 w-8" />
              </div>
              <h4 className="text-[1.85rem] font-semibold tracking-tight">Trascina o seleziona le tue immagini</h4>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Carica piu foto in una sola volta. In questo step vedi solo anteprime e controllo dei file caricati.
              </p>
              <span className="mt-5 inline-flex items-center rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold text-foreground">Scegli file</span>
            </label>

            <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-white px-4 py-3 text-sm leading-6 text-muted-foreground">
              Requisiti file: massimo {formatMegabytes(PHOTO_MAX_BYTES)} per immagine, risoluzione minima{" "}
              {PHOTO_MIN_WIDTH}x{PHOTO_MIN_HEIGHT}px. Le immagini molto pesanti vengono ottimizzate automaticamente.
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryBlock title="Foto caricate" value={String(photos.length)} text={photos.length === 1 ? "Hai 1 immagine pronta per lo step formati." : `${photos.length} immagini pronte per lo step formati.`} />
              <SummaryBlock title="Formati disponibili" value={String(formats.length)} text="Il catalogo dello studio verra applicato nello step successivo." />
              <SummaryBlock title="Pagamento" value={getPaymentModeLabel(paymentPlan.mode)} text={paymentPlan.description} />
            </div>

            {formats.length === 0 && <div className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Lo studio non ha ancora formati attivi: l&apos;ordine non puo essere completato finche il catalogo non viene configurato.</div>}
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
            <div className="space-y-4 rounded-[1.7rem] border border-[color:var(--border)] bg-white/95 p-4 shadow-[var(--shadow-sm)] md:sticky md:top-[5.3rem] md:z-10 md:backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {assignedFormatsCount} / {photos.length} foto con formato
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatPhase === "assign"
                      ? `Mancano ${unassignedCount} foto da assegnare.`
                      : "Tutte le foto hanno un formato. Ora regola le quantita."}
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
                </>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cartItems.map((item) => (
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

            {errorMessage && <ErrorBanner message={errorMessage} />}
          </Panel>

          <StickyActionBar>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {assignedFormatsCount} formati assegnati su {photos.length} foto
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Totale aggiornato in tempo reale: {formatCurrency(totalCents)}
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

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SummaryCard label="Totale ordine" value={formatCurrency(totalCents)} />
              <SummaryCard label="Da pagare ora" value={formatCurrency(paymentPlan.dueNowCents)} />
              <SummaryCard label="Saldo in studio" value={formatCurrency(paymentPlan.remainingCents)} />
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-[color:var(--border)] bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Dati cliente</p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-foreground md:grid-cols-2">
                <p><span className="font-semibold">Email:</span> {customerEmail}</p>
                <p><span className="font-semibold">Nome:</span> {customerFirstName}</p>
                <p><span className="font-semibold">Cognome:</span> {customerLastName}</p>
                <p><span className="font-semibold">Telefono:</span> {customerPhone}</p>
                <p><span className="font-semibold">Studio:</span> {photographer?.name || "Studio fotografico"}</p>
              </div>

              <div className="mt-5 field-shell space-y-2 p-4">
                <Label htmlFor="customer-phone">Telefono obbligatorio</Label>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <Input id="customer-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+39 333 1234567" required />
                </div>
              </div>
            </div>

            {paymentBlocked && <div className="mt-4 rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Questo studio richiede il checkout online, ma Stripe non e configurato in questo ambiente. L&apos;admin puo attivarlo oppure usare &quot;Pagamento in studio&quot;.</div>}
            {errorMessage && <div className="mt-4"><ErrorBanner message={errorMessage} /></div>}

            <div className="mt-5">
              <Button size="lg" className="w-full" disabled={loading || paymentBlocked || !canMoveToUpload} onClick={submitOrder}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparazione ordine
                  </>
                ) : paymentPlan.mode === "online_full" ? (
                  "Vai al pagamento sicuro"
                ) : paymentPlan.mode === "deposit_plus_studio" ? (
                  "Paga l'acconto online"
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
    <section className="rounded-[1.9rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] md:p-6">
      <div className={`mb-5 flex flex-col gap-2 ${centered ? "text-center" : "md:flex-row md:items-start md:justify-between"}`}>
        <div className={centered ? "mx-auto max-w-2xl" : ""}>
          <p className={`section-kicker mb-2 ${centered ? "justify-center" : ""}`}>{title}</p>
          <h2 className="text-2xl font-semibold tracking-tight md:text-[2rem]">{headline}</h2>
        </div>
        <p className={`text-sm leading-6 text-muted-foreground ${centered ? "mx-auto max-w-2xl" : "max-w-sm"}`}>{note}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field-shell space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {icon}
        {children}
      </div>
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

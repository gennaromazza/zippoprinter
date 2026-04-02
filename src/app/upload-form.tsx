"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  CreditCard,
  ImagePlus,
  Loader2,
  Mail,
  Phone,
  Square,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import { formatCurrency } from "@/lib/orders";
import { getCheckoutAmounts, getPaymentModeLabel } from "@/lib/payments";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Photographer, PrintFormat } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WizardStep = "upload" | "format" | "checkout" | "success";

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

function StepDot({ number, active, complete, title }: { number: number; active: boolean; complete: boolean; title: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${complete ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary bg-white text-primary" : "border-[color:var(--border)] bg-[color:var(--muted)]/55 text-muted-foreground"}`}>
        {complete ? <Check className="h-4 w-4" /> : number}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {number}</p>
        <p className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{title}</p>
      </div>
    </div>
  );
}

function computeTotal(photos: PhotoSelection[], formats: PrintFormat[]) {
  return photos.reduce((sum, photo) => {
    const format = formats.find((item) => item.id === photo.formatId);
    return sum + (format?.price_cents || 0) * photo.quantity;
  }, 0);
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
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [bulkFormatId, setBulkFormatId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [step, setStep] = useState<WizardStep>("upload");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successOrderId, setSuccessOrderId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<PhotoSelection[]>([]);

  const totalCents = useMemo(() => computeTotal(photos, formats), [photos, formats]);
  const paymentPlan = useMemo(() => getCheckoutAmounts(totalCents, photographer), [totalCents, photographer]);
  const canMoveToFormat = Boolean(customerEmail.trim()) && photos.length > 0 && formats.length > 0;
  const canCheckout = canMoveToFormat && photos.every((photo) => Boolean(photo.formatId));
  const paymentBlocked = paymentPlan.mode !== "pay_in_store" && !stripeEnabled;

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview));
    };
  }, []);

  const cartItems = useMemo(
    () =>
      photos.map((photo) => {
        const format = formats.find((item) => item.id === photo.formatId);
        return { ...photo, format, subtotal: (format?.price_cents || 0) * photo.quantity };
      }),
    [photos, formats]
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPhotos((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        formatId: "",
        quantity: 1,
      })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setErrorMessage("");
  };

  const removePhoto = (id: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((photo) => photo.id !== id);
    });
    setSelectedPhotoIds((current) => current.filter((photoId) => photoId !== id));
  };

  const updatePhoto = (id: string, updates: Partial<PhotoSelection>) => {
    setPhotos((current) => current.map((photo) => (photo.id === id ? { ...photo, ...updates } : photo)));
  };

  const toggleSelection = (id: string) => {
    setSelectedPhotoIds((current) => (current.includes(id) ? current.filter((photoId) => photoId !== id) : [...current, id]));
  };

  const toggleAll = () => setSelectedPhotoIds((current) => (current.length === photos.length ? [] : photos.map((photo) => photo.id)));

  const applyBulkFormat = () => {
    if (!bulkFormatId || !selectedPhotoIds.length) return;
    setPhotos((current) => current.map((photo) => (selectedPhotoIds.includes(photo.id) ? { ...photo, formatId: bulkFormatId } : photo)));
    setSelectedPhotoIds([]);
    setBulkFormatId("");
  };

  const submitOrder = async () => {
    if (!photographer?.id || !canCheckout) return;
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
          customerName: customerName.trim(),
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

      if (!response.ok) throw new Error(payload.error || "Preparazione ordine non riuscita.");
      if (payload.paymentRequired && payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }

      setSuccessOrderId(payload.orderId || "");
      setStep("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Errore durante la preparazione dell'ordine.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <section className="rounded-[2rem] border border-[color:var(--border)] bg-white p-8 shadow-[var(--shadow-sm)] md:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-11 w-11" /></div>
          <p className="section-kicker mx-auto mt-6">Ordine inviato</p>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight text-balance">Il tuo ordine e stato registrato correttamente.</h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">Lo studio ricevera immagini, formati e riepilogo economico. Ti contattera quando le stampe saranno pronte.</p>
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
    <section className="space-y-4">
      <div className="sticky top-4 z-20 rounded-[1.8rem] border border-[color:var(--border)] bg-white/95 px-4 py-4 shadow-[var(--shadow-sm)] backdrop-blur md:px-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StepDot number={1} title="Dati e foto" active={step === "upload"} complete={step !== "upload"} />
          <StepDot number={2} title="Formati" active={step === "format"} complete={step === "checkout"} />
          <StepDot number={3} title="Checkout" active={step === "checkout"} complete={false} />
          <StepDot number={4} title="Conferma" active={false} complete={false} />
        </div>
      </div>

      {step === "upload" ? (
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <Panel title="Dati cliente" headline="Prepariamo il tuo ordine" note="Inserisci almeno l'email di riferimento e poi carica tutte le immagini da stampare.">
              <div className="grid gap-3 md:grid-cols-[1.15fr_0.95fr_0.95fr]">
                <Field icon={<Mail className="h-4 w-4 text-muted-foreground" />} label="Email"><Input id="email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="nome@email.com" required /></Field>
                <Field icon={<UserRound className="h-4 w-4 text-muted-foreground" />} label="Nome"><Input id="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Mario Rossi" /></Field>
                <Field icon={<Phone className="h-4 w-4 text-muted-foreground" />} label="Telefono"><Input id="phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+39 333 1234567" /></Field>
              </div>
            </Panel>

            <Panel title="Upload foto" headline="Carica i tuoi scatti" note="Supportati JPG e PNG. Formato e quantita vengono assegnati nello step successivo.">
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" id="photo-upload" />
              <label htmlFor="photo-upload" className="group flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-[1.8rem] border-2 border-dashed border-[color:var(--border)] bg-[color:var(--muted)]/35 px-6 py-8 text-center hover:border-primary hover:bg-[color:var(--secondary)]">
                <div className="mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-primary text-white shadow-[0_18px_44px_rgba(217,121,66,0.18)]"><ImagePlus className="h-8 w-8" /></div>
                <h4 className="text-[1.85rem] font-semibold tracking-tight">Trascina o seleziona le tue immagini</h4>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Carica piu foto in una sola volta. Le vedrai subito in anteprima prima di assegnare i formati.</p>
                <span className="mt-5 inline-flex items-center rounded-full border border-[color:var(--border)] bg-white px-4 py-2 text-sm font-semibold text-foreground">Scegli file</span>
              </label>
              {photos.length > 0 && <PhotoGrid photos={photos} onRemove={removePhoto} />}
            </Panel>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[1.95rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] md:p-6">
              <p className="section-kicker mb-3">Riepilogo live</p>
              <div className="space-y-4">
                <SummaryBlock title="Foto caricate" value={`${photos.length}`} text={`${photos.length === 1 ? "1 immagine pronta" : `${photos.length} immagini pronte`} per lo step successivo.`} />
                <SummaryBlock title="Modalita pagamento" value={getPaymentModeLabel(paymentPlan.mode)} text={paymentPlan.description} />
                <Button className="w-full" size="lg" disabled={!canMoveToFormat} onClick={() => setStep("format")}>Continua con i formati<ArrowRight className="h-4 w-4" /></Button>
                {formats.length === 0 && <p className="text-sm leading-6 text-amber-900">Lo studio non ha ancora formati attivi: l&apos;ordine non puo essere completato finche il catalogo non viene configurato.</p>}
              </div>
            </div>
          </aside>
        </div>
      ) : step === "format" ? (
        <div className="space-y-4">
          <Panel title="Step 2" headline="Assegna formati e quantita" note="Seleziona piu immagini per applicare un formato in blocco oppure modifica ogni card singolarmente.">
            <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStep("upload")}><ArrowLeft className="h-4 w-4" />Torna alle foto</Button><Button variant="outline" onClick={toggleAll}>{selectedPhotoIds.length === photos.length && photos.length > 0 ? "Deseleziona tutto" : "Seleziona tutto"}</Button></div>
            {selectedPhotoIds.length > 0 && (
              <div className="mt-5 grid gap-3 rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--secondary)] p-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="field-shell space-y-2">
                  <Label htmlFor="bulk-format">Formato in blocco</Label>
                  <select id="bulk-format" value={bulkFormatId} onChange={(event) => setBulkFormatId(event.target.value)} className="w-full bg-transparent text-sm font-medium text-foreground outline-none">
                    <option value="">Scegli formato</option>
                    {formats.map((format) => <option key={format.id} value={format.id}>{format.name} - {formatCurrency(format.price_cents)}</option>)}
                  </select>
                </div>
                <Button onClick={applyBulkFormat} disabled={!bulkFormatId}>Applica a {selectedPhotoIds.length} foto</Button>
              </div>
            )}
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cartItems.map((item) => (
                <article key={item.id} className={`overflow-hidden rounded-[1.6rem] border bg-white ${selectedPhotoIds.includes(item.id) ? "border-primary shadow-[0_14px_30px_rgba(217,121,66,0.16)]" : "border-[color:var(--border)]"}`}>
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image src={item.preview} alt={item.file.name} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw" />
                    <button type="button" onClick={() => toggleSelection(item.id)} className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm">
                      {selectedPhotoIds.includes(item.id) ? <CheckSquare className="h-5 w-5 text-primary" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                    </button>
                  </div>
                  <div className="space-y-4 p-4">
                    <div>
                      <p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectField id={`format-${item.id}`} label="Formato" value={item.formatId} onChange={(value) => updatePhoto(item.id, { formatId: value })}>
                        <option value="">Seleziona formato</option>
                        {formats.map((format) => <option key={format.id} value={format.id}>{format.name} - {formatCurrency(format.price_cents)}</option>)}
                      </SelectField>
                      <SelectField id={`quantity-${item.id}`} label="Quantita" value={String(item.quantity)} onChange={(value) => updatePhoto(item.id, { quantity: Number.parseInt(value, 10) })}>
                        {[1,2,3,4,5,6,7,8,9,10].map((quantity) => <option key={quantity} value={quantity}>{quantity} copia{quantity > 1 ? "e" : ""}</option>)}
                      </SelectField>
                    </div>
                    <div className="flex items-center justify-between rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/40 px-4 py-3">
                      <span className="text-sm text-muted-foreground">{item.format ? item.format.name : "Formato non assegnato"}</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(item.subtotal)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
          <div className="sticky bottom-3 z-20 rounded-[1.8rem] border border-[color:var(--border)] bg-white px-4 py-4 shadow-[var(--shadow-md)] md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div><p className="text-sm font-semibold text-foreground">{photos.length} foto totali, {photos.filter((photo) => photo.formatId).length} formati assegnati</p><p className="mt-1 text-sm text-muted-foreground">Totale aggiornato in tempo reale: {formatCurrency(totalCents)}</p></div>
              <Button size="lg" disabled={!canCheckout} onClick={() => setStep("checkout")}>Vai al checkout<ArrowRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Step 3" headline="Checkout e conferma" note="Controlla importi, modalita di pagamento e riepilogo finale prima di inviare l'ordine.">
            <div className="flex justify-end"><Button variant="outline" onClick={() => setStep("format")}><ArrowLeft className="h-4 w-4" />Torna ai formati</Button></div>
            <div className="mt-5 rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-5">
              <div className="flex items-start gap-3">{paymentPlan.mode === "pay_in_store" ? <Store className="mt-1 h-5 w-5 text-primary" /> : <CreditCard className="mt-1 h-5 w-5 text-primary" />}<div><p className="font-semibold text-foreground">{getPaymentModeLabel(paymentPlan.mode)}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{paymentPlan.description}</p></div></div>
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
                {customerName && <p><span className="font-semibold">Nome:</span> {customerName}</p>}
                {customerPhone && <p><span className="font-semibold">Telefono:</span> {customerPhone}</p>}
                <p><span className="font-semibold">Studio:</span> {photographer?.name || "Studio fotografico"}</p>
              </div>
            </div>
            {paymentBlocked && <div className="mt-4 rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Questo studio richiede il checkout online, ma Stripe non e configurato in questo ambiente. L&apos;admin puo attivarlo oppure usare &quot;Pagamento in studio&quot;.</div>}
            {errorMessage && <div className="mt-4 rounded-[1.5rem] border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">{errorMessage}</div>}
            <div className="mt-5"><Button size="lg" className="w-full" disabled={loading || paymentBlocked} onClick={submitOrder}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Preparazione ordine</> : paymentPlan.mode === "online_full" ? "Vai al pagamento sicuro" : paymentPlan.mode === "deposit_plus_studio" ? "Paga l'acconto online" : "Invia ordine allo studio"}</Button></div>
          </Panel>
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-[1.95rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] md:p-6">
              <p className="section-kicker mb-3">Riepilogo immagini</p>
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 px-4 py-3">
                    <div className="relative h-16 w-16 overflow-hidden rounded-[1rem]"><Image src={item.preview} alt={item.file.name} fill unoptimized className="object-cover" sizes="64px" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p><p className="truncate text-sm text-muted-foreground">{item.format?.name || "Formato"} · {item.quantity} copia{item.quantity > 1 ? "e" : ""}</p></div>
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

function Panel({ title, headline, note, children }: { title: string; headline: string; note: string; children: React.ReactNode }) {
  return <section className="rounded-[1.9rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)] md:p-6"><div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between"><div><p className="section-kicker mb-2">{title}</p><h2 className="text-2xl font-semibold tracking-tight md:text-[2rem]">{headline}</h2></div><p className="max-w-sm text-sm leading-6 text-muted-foreground">{note}</p></div>{children}</section>;
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="field-shell space-y-2"><Label>{label}</Label><div className="flex items-center gap-3">{icon}{children}</div></div>;
}

function SelectField({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <div className="field-shell space-y-2 p-4"><Label htmlFor={id}>{label}</Label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm font-medium text-foreground outline-none">{children}</select></div>;
}

function PhotoGrid({ photos, onRemove }: { photos: PhotoSelection[]; onRemove: (id: string) => void }) {
  return <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{photos.map((photo) => <article key={photo.id} className="overflow-hidden rounded-[1.4rem] border border-[color:var(--border)] bg-[color:var(--muted)]/25"><div className="relative aspect-square overflow-hidden"><Image src={photo.preview} alt={photo.file.name} fill unoptimized className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" /><button type="button" onClick={() => onRemove(photo.id)} className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black" aria-label={`Rimuovi ${photo.file.name}`}><Trash2 className="h-4 w-4" /></button></div><div className="p-3"><p className="truncate text-sm font-semibold text-foreground">{photo.file.name}</p><p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{(photo.file.size / (1024 * 1024)).toFixed(2)} MB</p></div></article>)}</div>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>;
}

function SummaryBlock({ title, value, text }: { title: string; value: string; text: string }) {
  return <div className="rounded-[1.6rem] border border-[color:var(--border)] bg-[color:var(--muted)]/40 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p><p className="mt-3 text-lg font-semibold text-foreground">{value}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}

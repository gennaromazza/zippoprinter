"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Phone,
  Store,
  Palette,
  Printer,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OnboardingStep = "studio" | "contacts" | "formats" | "done";

const PHONE_REGEX = /^\+?[\d\s\-().]{6,20}$/;

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return PHONE_REGEX.test(value.trim()) && digits.length >= 6;
}

const STEPS: { key: OnboardingStep; label: string; icon: React.ReactNode }[] = [
  { key: "studio", label: "Studio", icon: <Store className="h-4 w-4" /> },
  { key: "contacts", label: "Contatti", icon: <Phone className="h-4 w-4" /> },
  { key: "formats", label: "Formati", icon: <Printer className="h-4 w-4" /> },
  { key: "done", label: "Pronto", icon: <Check className="h-4 w-4" /> },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<OnboardingStep>("studio");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [photographerId, setPhotographerId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Form state
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [brandColor, setBrandColor] = useState("#D97942");

  // Format state
  const [formatName, setFormatName] = useState("");
  const [formatPrice, setFormatPrice] = useState("");
  const [formats, setFormats] = useState<
    Array<{ name: string; priceCents: number }>
  >([]);

  // Check auth on mount
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Check if studio name was passed from signup metadata
      const studioMeta = user.user_metadata?.studio_name;
      if (studioMeta) {
        setStudioName(studioMeta);
      }

      // Check if already onboarded
      const checkRes = await fetch("/api/auth/onboarding");
      if (checkRes.ok) {
        const result = await checkRes.json();
        if (result.exists) {
          setPhotographerId(result.photographerId);
          setStep("done");
        }
      }

      setLoading(false);
    }

    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProvisionStudio = useCallback(async () => {
    if (!studioName.trim()) {
      setError("Inserisci il nome del tuo studio.");
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setError("Numero di telefono non valido (es. +39 333 1234567).");
      return;
    }
    if (whatsapp && !isValidPhone(whatsapp)) {
      setError("Numero WhatsApp non valido (es. +39 333 1234567).");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studioName: studioName.trim(),
          phone: phone || null,
          whatsapp: whatsapp || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Errore durante la creazione dello studio.");
        return;
      }

      const result = await res.json();
      setPhotographerId(result.photographerId);
      setStep("contacts");
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }, [studioName, phone, whatsapp]);

  const handleSaveContacts = useCallback(async () => {
    if (!photographerId) return;
    setSubmitting(true);
    setError("");

    try {
      const { error: updateError } = await supabase
        .from("photographers")
        .update({
          website_url: website || null,
          instagram_url: instagram || null,
          brand_color: brandColor || null,
          phone: phone || null,
          whatsapp_number: whatsapp || null,
        })
        .eq("id", photographerId);

      if (updateError) {
        // Non-critical, continue anyway
      }

      setStep("formats");
    } catch {
      // Non-critical step, continue
      setStep("formats");
    } finally {
      setSubmitting(false);
    }
  }, [photographerId, supabase, website, instagram, brandColor, phone, whatsapp]);

  const handleAddFormat = useCallback(() => {
    if (!formatName.trim() || !formatPrice) return;

    const priceCents = Math.round(parseFloat(formatPrice) * 100);
    if (isNaN(priceCents) || priceCents <= 0) return;

    setFormats((prev) => [...prev, { name: formatName.trim(), priceCents }]);
    setFormatName("");
    setFormatPrice("");
  }, [formatName, formatPrice]);

  const handleSaveFormats = useCallback(async () => {
    if (!photographerId || formats.length === 0) {
      setStep("done");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const rows = formats.map((f, i) => ({
        photographer_id: photographerId,
        name: f.name,
        width_cm: 0,
        height_cm: 0,
        price_cents: f.priceCents,
        is_active: true,
        sort_order: i,
      }));

      const { error: insertError } = await supabase
        .from("print_formats")
        .insert(rows);

      if (insertError) {
        setError("Errore nel salvataggio dei formati. Puoi aggiungerli dopo dal pannello admin.");
      }

      setStep("done");
    } catch {
      setStep("done");
    } finally {
      setSubmitting(false);
    }
  }, [photographerId, formats, supabase]);

  const handleFinish = useCallback(() => {
    router.push("/admin");
    router.refresh();
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto max-w-2xl">
        {/* ── Progress bar ─────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    i < currentStepIndex
                      ? "bg-[color:var(--success)] text-white"
                      : i === currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "border border-[color:var(--border-strong)] bg-white text-muted-foreground"
                  }`}
                >
                  {i < currentStepIndex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    s.icon
                  )}
                </div>
                <span
                  className={`hidden text-sm font-medium md:block ${
                    i === currentStepIndex
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-2 hidden h-px w-8 md:block ${
                      i < currentStepIndex
                        ? "bg-[color:var(--success)]"
                        : "bg-[color:var(--border)]"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step: Studio ─────────────────────────────────────────── */}
        {step === "studio" && (
          <div className="glass-panel rounded-[2rem] p-8 md:p-10">
            <Image src="/logo.png" alt="ZippoPrinter" width={48} height={48} className="mb-2 h-12 w-12" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
              Configura il tuo studio
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Inserisci le informazioni base del tuo studio fotografico. Potrai
              modificarle in seguito dal pannello admin.
            </p>

            <div className="mt-8 space-y-4">
              <div className="field-shell space-y-2">
                <Label htmlFor="studioName">Nome dello studio *</Label>
                <Input
                  id="studioName"
                  placeholder="Es. Studio Fotografico Rossi"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  required
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="phone">Telefono</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+39 333 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  placeholder="+39 333 1234567"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
                {error}
              </p>
            )}

            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleProvisionStudio}
                size="lg"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creazione in corso
                  </>
                ) : (
                  <>
                    Continua
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Contacts & Branding ────────────────────────────── */}
        {step === "contacts" && (
          <div className="glass-panel rounded-[2rem] p-8 md:p-10">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary">
              <Palette className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
              Contatti e branding
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Queste informazioni saranno visibili nella tua vetrina per i
              clienti. Puoi saltare questo passaggio e completarlo dopo.
            </p>

            <div className="mt-8 space-y-4">
              <div className="field-shell space-y-2">
                <Label htmlFor="website">Sito web</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://www.tuostudio.it"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  placeholder="https://instagram.com/tuostudio"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="brandColor">Colore del brand</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="brandColor"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent"
                  />
                  <Input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="max-w-[140px] font-mono"
                    placeholder="#D97942"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep("studio")}
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("formats")}
                >
                  Salta
                </Button>
                <Button
                  onClick={handleSaveContacts}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continua
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Formats ────────────────────────────────────────── */}
        {step === "formats" && (
          <div className="glass-panel rounded-[2rem] p-8 md:p-10">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary">
              <Printer className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
              Formati di stampa
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Aggiungi almeno un formato di stampa per la tua vetrina. Potrai
              aggiungerne altri dal pannello admin in qualsiasi momento.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex gap-3">
                <div className="field-shell flex-1 space-y-2">
                  <Label htmlFor="formatName">Nome formato</Label>
                  <Input
                    id="formatName"
                    placeholder="Es. 10x15 cm"
                    value={formatName}
                    onChange={(e) => setFormatName(e.target.value)}
                  />
                </div>
                <div className="field-shell w-36 space-y-2">
                  <Label htmlFor="formatPrice">Prezzo (€)</Label>
                  <Input
                    id="formatPrice"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.30"
                    value={formatPrice}
                    onChange={(e) => setFormatPrice(e.target.value)}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <Button
                    type="button"
                    size="icon"
                    onClick={handleAddFormat}
                    disabled={!formatName.trim() || !formatPrice}
                  >
                    +
                  </Button>
                </div>
              </div>

              {formats.length > 0 && (
                <div className="space-y-2">
                  {formats.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl border border-white/60 bg-white/70 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium">{f.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          €{(f.priceCents / 100).toFixed(2)}
                        </span>
                        <button
                          onClick={() =>
                            setFormats((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="text-xs text-[color:var(--danger)] hover:underline"
                        >
                          Rimuovi
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setStep("contacts")}
              >
                <ArrowLeft className="h-4 w-4" />
                Indietro
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("done")}
                >
                  {formats.length === 0 ? "Salta" : "Continua senza salvare"}
                </Button>
                {formats.length > 0 && (
                  <Button onClick={handleSaveFormats} disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Salva e continua
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Done ───────────────────────────────────────────── */}
        {step === "done" && (
          <div className="glass-panel rounded-[2rem] p-8 text-center md:p-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-[color:var(--success)] text-white shadow-[0_16px_40px_rgba(47,122,72,0.24)]">
              <Check className="h-8 w-8" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">
              Il tuo studio è pronto!
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Hai 14 giorni di prova gratuita per esplorare tutte le
              funzionalità. Configura formati, branding e pagamenti dal pannello
              admin.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={handleFinish}>
                Vai al pannello admin
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Link
                href={
                  photographerId
                    ? `/studio/${photographerId}`
                    : "/"
                }
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] px-7 text-sm font-semibold text-foreground hover:bg-[color:var(--muted)]"
              >
                Vedi la tua vetrina
              </Link>
            </div>

            <div className="mx-auto mt-10 max-w-md space-y-3 text-left">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Prossimi passi consigliati
              </h3>
              <NextStepItem
                number="1"
                text="Aggiungi formati di stampa con i prezzi"
                done={formats.length > 0}
              />
              <NextStepItem
                number="2"
                text="Personalizza il branding della vetrina"
              />
              <NextStepItem
                number="3"
                text="Attiva i pagamenti online con Stripe"
              />
              <NextStepItem
                number="4"
                text="Condividi il link della vetrina con i clienti"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function NextStepItem({
  number,
  text,
  done,
}: {
  number: string;
  text: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/60 bg-white/70 px-4 py-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-[color:var(--success)] text-white"
            : "border border-[color:var(--border-strong)] text-muted-foreground"
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </div>
      <span
        className={`text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {text}
      </span>
    </div>
  );
}

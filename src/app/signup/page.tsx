"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ArrowRight, Sparkles, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LEGAL_DOCUMENT_VERSION, LEGAL_LINKS } from "@/lib/privacy-consent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function recordSignupLegalAcknowledgement(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const basePayload = {
    source: "signup",
    consentGranted: true,
    consentVersion: LEGAL_DOCUMENT_VERSION,
    decision: "acknowledged",
    subjectType: "studio_user",
    subjectIdentifier: normalizedEmail,
  };

  await Promise.allSettled([
    fetch("/api/public/privacy-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        consentKey: "privacy_notice",
      }),
    }),
    fetch("/api/public/privacy-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...basePayload,
        consentKey: "terms_of_service",
      }),
    }),
  ]);
}

export default function SignupPage() {
  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }

    if (!studioName.trim()) {
      setError("Inserisci il nome del tuo studio.");
      return;
    }

    setLoading(true);
    void recordSignupLegalAcknowledgement(email);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            studio_name: studioName.trim(),
          },
        },
      });

      if (authError) {
        if (authError.message.includes("already registered")) {
          setError(
            "Questa email è già registrata. Prova ad accedere dal pannello login."
          );
        } else {
          setError(
            "Si è verificato un errore durante la registrazione. Riprova."
          );
        }
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push("/onboarding");
        router.refresh();
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Si è verificato un errore. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10 md:px-8">
        <div className="mx-auto max-w-md">
          <Card className="glass-panel border-white/40 bg-[rgba(255,253,249,0.88)]">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-[color:var(--success)] text-white shadow-[0_16px_40px_rgba(47,122,72,0.24)]">
                <Check className="h-8 w-8" />
              </div>
              <CardTitle>Controlla la tua email</CardTitle>
              <CardDescription>
                Ti abbiamo inviato un link di conferma a{" "}
                <strong>{email}</strong>. Clicca sul link per attivare il tuo
                account e accedere al pannello.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link
                href="/login?force=1"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                Vai al login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 md:px-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left panel - value proposition */}
        <section className="glass-panel rounded-[2.4rem] p-8 md:p-10">
          <p className="section-kicker mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Prova gratuita 14 giorni
          </p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-balance md:text-5xl">
            Apri la tua vetrina di stampa online in pochi minuti.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Registrati, configura il tuo studio e inizia a ricevere ordini di
            stampa dai tuoi clienti. Nessuna carta di credito richiesta.
          </p>
          <div className="mt-8 space-y-3">
            <BenefitItem text="Vetrina personalizzata con il tuo brand" />
            <BenefitItem text="Pagamenti online integrati con Stripe" />
            <BenefitItem text="Gestione ordini e formati dal pannello" />
            <BenefitItem text="Dominio personalizzato incluso" />
            <BenefitItem text="Cancellazione in qualsiasi momento" />
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Hai già un account?{" "}
            <Link
              href="/login?force=1"
              className="font-semibold text-primary hover:underline"
            >
              Accedi qui
            </Link>
          </p>
        </section>

        {/* Right panel - signup form */}
        <Card className="glass-panel border-white/40 bg-[rgba(255,253,249,0.88)]">
          <CardHeader className="text-center">
            <Image src="/logo.png" alt="ZippoPrinter" width={64} height={64} className="mx-auto mb-4 h-16 w-16" />
            <CardTitle>Crea il tuo account</CardTitle>
            <CardDescription>
              Registra il tuo studio fotografico e inizia la prova gratuita.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="field-shell space-y-2">
                <Label htmlFor="studioName">Nome dello studio</Label>
                <Input
                  id="studioName"
                  type="text"
                  placeholder="Es. Studio Fotografico Rossi"
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  required
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="info@tuostudio.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 8 caratteri"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {error && (
                <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrazione in corso
                  </>
                ) : (
                  <>
                    Crea account e inizia gratis
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Registrandoti accetti i{" "}
                <Link href={LEGAL_LINKS.termsOfService} className="font-semibold text-primary hover:underline">
                  termini di servizio
                </Link>{" "}
                e dichiari di aver letto la{" "}
                <Link href={LEGAL_LINKS.privacyPolicy} className="font-semibold text-primary hover:underline">
                  privacy policy
                </Link>
                .
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function BenefitItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--success)] text-white">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={3}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>
      <span className="text-sm font-medium text-foreground">{text}</span>
    </div>
  );
}

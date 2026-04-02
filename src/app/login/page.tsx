"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Email o password non corretti.");
        setLoading(false);
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Si è verificato un errore durante l’accesso.");
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 md:px-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="glass-panel rounded-[2.4rem] p-8 md:p-10">
          <p className="section-kicker mb-5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Accesso amministratore
          </p>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-balance md:text-6xl">
            Gestisci ordini, formati e branding del tuo studio da un unico pannello.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Il backoffice è progettato per laboratori e studi fotografici che vogliono
            ricevere ordini in modo più ordinato, leggibile e professionale.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ordini</p>
              <p className="mt-3 text-lg font-semibold">Monitoraggio stato e dettaglio foto</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Brand</p>
              <p className="mt-3 text-lg font-semibold">Personalizzazione studio white-label</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/70 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Formati</p>
              <p className="mt-3 text-lg font-semibold">Prezzi, misure e attivazione rapida</p>
            </div>
          </div>
        </section>

        <Card className="glass-panel border-white/40 bg-[rgba(255,253,249,0.88)]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(143,93,44,0.24)]">
              <Camera className="h-8 w-8" />
            </div>
            <CardTitle>ZippoPrinter Admin</CardTitle>
            <CardDescription>Accedi al pannello di gestione dello studio fotografico.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="field-shell space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@studiofotografico.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="field-shell space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Accesso in corso
                  </>
                ) : (
                  "Accedi al pannello"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

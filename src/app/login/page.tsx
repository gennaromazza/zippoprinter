"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [blocked] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get("blocked") === "1";
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const isRecoveryQuery = params.get("recovery") === "1";
    const isRecoveryHash = hashParams.get("type") === "recovery";
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (isRecoveryQuery || isRecoveryHash) {
      setRecoveryMode(true);
      setInfoMessage("Inserisci una nuova password per completare il reset.");
    }

    if (isRecoveryHash && accessToken && refreshToken) {
      void supabase.auth
        .setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        .then(({ error: sessionError }) => {
          if (sessionError) {
            setError("Link di recupero non valido o scaduto.");
            return;
          }
          setRecoveryMode(true);
          setInfoMessage("Sessione di recupero verificata. Ora imposta la nuova password.");
          const cleanUrl = `${window.location.pathname}?recovery=1`;
          window.history.replaceState({}, "", cleanUrl);
        });
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setInfoMessage("Sessione di recupero verificata. Ora imposta la nuova password.");
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

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

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (newPassword.length < 8) {
      setError("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError("Impossibile aggiornare la password. Richiedi un nuovo link di recupero.");
        setLoading(false);
        return;
      }

      setInfoMessage("Password aggiornata con successo. Ora puoi accedere.");
      setRecoveryMode(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Si è verificato un errore durante il reset password.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setInfoMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Inserisci la tua email prima di richiedere il reset.");
      return;
    }

    setSendingReset(true);
    try {
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${origin}/login?recovery=1`,
      });

      if (resetError) {
        setError("Invio link reset non riuscito. Verifica l'email e riprova.");
        return;
      }

      setInfoMessage("Ti abbiamo inviato un link via email per reimpostare la password.");
    } catch {
      setError("Errore durante l'invio del link di reset.");
    } finally {
      setSendingReset(false);
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
            <Image src="/logo.png" alt="ZippoPrinter" width={64} height={64} className="mx-auto mb-4 h-16 w-16" />
            <CardTitle>ZippoPrinter Admin</CardTitle>
            <CardDescription>
              {recoveryMode
                ? "Imposta una nuova password per completare il recupero account."
                : "Accedi al pannello di gestione dello studio fotografico."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={recoveryMode ? handleResetPassword : handleLogin} className="space-y-4">
              {!recoveryMode && blocked ? (
                <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  Accesso studio temporaneamente limitato. Contatta il supporto piattaforma per lo sblocco.
                </p>
              ) : null}
              {recoveryMode ? (
                <>
                  <div className="field-shell space-y-2">
                    <Label htmlFor="new-password">Nuova password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="field-shell space-y-2">
                    <Label htmlFor="confirm-password">Conferma password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}
              {infoMessage ? (
                <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                  {infoMessage}
                </p>
              ) : null}
              {error && (
                <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {recoveryMode ? "Aggiornamento password" : "Accesso in corso"}
                  </>
                ) : (
                  recoveryMode ? "Aggiorna password" : "Accedi al pannello"
                )}
              </Button>
              {!recoveryMode ? (
                <button
                  type="button"
                  className="w-full text-center text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleForgotPassword()}
                  disabled={sendingReset || loading}
                >
                  {sendingReset ? "Invio link reset..." : "Password dimenticata?"}
                </button>
              ) : null}
              {!recoveryMode ? (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Non hai un account?{" "}
                  <Link
                    href="/signup"
                    className="font-semibold text-primary hover:underline"
                  >
                    Registrati gratis
                  </Link>
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

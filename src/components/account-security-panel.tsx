"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AccountSecurityContext = "studio" | "platform";

interface AccountSecurityPanelProps {
  initialEmail: string;
  context: AccountSecurityContext;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function AccountSecurityPanel({ initialEmail, context }: AccountSecurityPanelProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState(initialEmail);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordInfo, setPasswordInfo] = useState("");

  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [nextEmail, setNextEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailInfo, setEmailInfo] = useState("");

  const [loadingAction, setLoadingAction] = useState<"password" | "email" | null>(null);

  useEffect(() => {
    const loadAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        return;
      }

      setEmail(user.email || initialEmail);
      setEmailVerified(Boolean(user.email_confirmed_at));
      setPendingEmail((user as { new_email?: string | null }).new_email || null);
    };

    void loadAuthUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        return;
      }
      setEmail(user.email || initialEmail);
      setEmailVerified(Boolean(user.email_confirmed_at));
      setPendingEmail((user as { new_email?: string | null }).new_email || null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [initialEmail, supabase]);

  const panelTitle = context === "platform" ? "Account owner" : "Account admin";
  const panelDescription =
    context === "platform"
      ? "Gestisci credenziali e sicurezza del tuo accesso piattaforma."
      : "Gestisci credenziali e sicurezza dell'accesso studio.";

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordInfo("");

    if (!email) {
      setPasswordError("Email account non disponibile. Ricarica la pagina.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Le password non coincidono.");
      return;
    }

    setLoadingAction("password");

    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPasswordForPassword,
      });

      if (reauthError) {
        setPasswordError("Password corrente non valida.");
        setLoadingAction(null);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordError("Impossibile aggiornare la password. Riprova.");
        setLoadingAction(null);
        return;
      }

      setPasswordInfo("Password aggiornata. Reindirizzamento al login in corso...");
      await supabase.auth.signOut();
      router.push("/login?passwordChanged=1&force=1");
      router.refresh();
    } catch {
      setPasswordError("Errore durante l'aggiornamento della password.");
      setLoadingAction(null);
    }
  };

  const handleRequestEmailChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEmailError("");
    setEmailInfo("");

    const normalizedNextEmail = normalizeEmail(nextEmail);
    if (!normalizedNextEmail) {
      setEmailError("Inserisci una nuova email valida.");
      return;
    }

    if (!email) {
      setEmailError("Email account non disponibile. Ricarica la pagina.");
      return;
    }

    if (normalizeEmail(email) === normalizedNextEmail) {
      setEmailError("La nuova email deve essere diversa da quella attuale.");
      return;
    }

    setLoadingAction("email");

    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPasswordForEmail,
      });

      if (reauthError) {
        setEmailError("Password corrente non valida.");
        setLoadingAction(null);
        return;
      }

      const origin = window.location.origin;
      const { error: updateError } = await supabase.auth.updateUser(
        { email: normalizedNextEmail },
        { emailRedirectTo: `${origin}/login?emailChange=confirmed&force=1` }
      );

      if (updateError) {
        setEmailError("Richiesta cambio email non riuscita. Verifica l'indirizzo e riprova.");
        setLoadingAction(null);
        return;
      }

      setPendingEmail(normalizedNextEmail);
      setNextEmail("");
      setCurrentPasswordForEmail("");
      setEmailInfo(
        "Richiesta inviata. Conferma il cambio dalla mail ricevuta per completare l'aggiornamento."
      );
      setLoadingAction(null);
    } catch {
      setEmailError("Errore durante la richiesta cambio email.");
      setLoadingAction(null);
    }
  };

  return (
    <Card id="account-security" className="glass-panel">
      <CardHeader>
        <CardDescription>Account e sicurezza</CardDescription>
        <CardTitle>{panelTitle}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{panelDescription}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Stato credenziali
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Email attuale</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{email || "-"}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/35 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Verifica email</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {emailVerified ? "Confermata" : "In attesa di conferma"}
              </p>
            </div>
          </div>
          {pendingEmail ? (
            <p className="mt-3 text-sm text-amber-800">
              Cambio email in attesa di conferma: <strong>{pendingEmail}</strong>
            </p>
          ) : null}
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Lock className="h-4 w-4 text-primary" />
            Cambia password
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="field-shell space-y-2">
              <Label htmlFor={`${context}-current-password`}>Password corrente</Label>
              <Input
                id={`${context}-current-password`}
                type="password"
                value={currentPasswordForPassword}
                onChange={(event) => setCurrentPasswordForPassword(event.target.value)}
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor={`${context}-new-password`}>Nuova password</Label>
              <Input
                id={`${context}-new-password`}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor={`${context}-confirm-password`}>Conferma password</Label>
              <Input
                id={`${context}-confirm-password`}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={loadingAction !== null}>
              {loadingAction === "password" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aggiornamento password
                </>
              ) : (
                "Aggiorna password"
              )}
            </Button>
            {passwordError ? <p className="text-sm font-medium text-red-700">{passwordError}</p> : null}
            {passwordInfo ? <p className="text-sm font-medium text-emerald-700">{passwordInfo}</p> : null}
          </div>
        </form>

        <form onSubmit={handleRequestEmailChange} className="space-y-4 rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            Cambia email di accesso
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="field-shell space-y-2">
              <Label htmlFor={`${context}-email-password`}>Password corrente</Label>
              <Input
                id={`${context}-email-password`}
                type="password"
                value={currentPasswordForEmail}
                onChange={(event) => setCurrentPasswordForEmail(event.target.value)}
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor={`${context}-next-email`}>Nuova email</Label>
              <Input
                id={`${context}-next-email`}
                type="email"
                value={nextEmail}
                onChange={(event) => setNextEmail(event.target.value)}
                placeholder="nuova@email.com"
                required
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={loadingAction !== null}>
              {loadingAction === "email" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Invio richiesta
                </>
              ) : (
                "Richiedi cambio email"
              )}
            </Button>
            {emailError ? <p className="text-sm font-medium text-red-700">{emailError}</p> : null}
            {emailInfo ? <p className="text-sm font-medium text-emerald-700">{emailInfo}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

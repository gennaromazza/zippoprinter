"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { PlatformSupportAction, StudioAccessStatus, TenantSubscriptionStatus } from "@/lib/types";

interface SupportActionsCardProps {
  photographerId: string;
  currentAccessStatus: StudioAccessStatus;
  supportActions: PlatformSupportAction[];
  subscriptionStatus?: TenantSubscriptionStatus | null;
  hasStripeSubscription?: boolean;
}

type ActionState = {
  kind: "success" | "error";
  message: string;
};

function getNextStatus(current: StudioAccessStatus) {
  if (current === "active") {
    return "temporarily_blocked" as const;
  }
  return "active" as const;
}

function getToggleLabel(current: StudioAccessStatus) {
  if (current === "active") {
    return "Blocca accesso temporaneamente";
  }
  return "Sblocca accesso studio";
}

function formatAccessStatus(value: StudioAccessStatus) {
  if (value === "temporarily_blocked") {
    return "temporaneamente bloccato";
  }
  if (value === "suspended") {
    return "sospeso";
  }
  return "attivo";
}

export function SupportActionsCard({
  photographerId,
  currentAccessStatus,
  supportActions,
  subscriptionStatus,
  hasStripeSubscription,
}: SupportActionsCardProps) {
  const router = useRouter();
  const [resetReason, setResetReason] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [trialReason, setTrialReason] = useState("");
  const [trialDays, setTrialDays] = useState("14");
  const [busyAction, setBusyAction] = useState<"reset" | "status" | "trial" | "reconcile" | null>(null);
  const [state, setState] = useState<ActionState | null>(null);

  const nextStatus = useMemo(
    () => getNextStatus(currentAccessStatus),
    [currentAccessStatus]
  );
  const toggleLabel = useMemo(
    () => getToggleLabel(currentAccessStatus),
    [currentAccessStatus]
  );

  async function sendPasswordReset() {
    if (resetReason.trim().length < 5) {
      setState({ kind: "error", message: "Inserisci una motivazione di almeno 5 caratteri." });
      return;
    }

    setBusyAction("reset");
    setState(null);

    try {
      const response = await fetch(
        `/api/platform/tenants/${photographerId}/support/password-reset`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: resetReason.trim() }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error?.message || "Invio reset non riuscito.",
        });
        return;
      }

      setState({
        kind: "success",
        message: payload?.data?.message || "Email reset inviata.",
      });
      setResetReason("");
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Errore di rete durante l'invio reset." });
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleAccessStatus() {
    if (statusReason.trim().length < 5) {
      setState({ kind: "error", message: "Inserisci una motivazione di almeno 5 caratteri." });
      return;
    }

    const confirmed = window.confirm(
      `Confermi l'operazione? Lo stato passera da ${formatAccessStatus(currentAccessStatus)} a ${formatAccessStatus(nextStatus)}.`
    );
    if (!confirmed) {
      return;
    }

    setBusyAction("status");
    setState(null);

    try {
      const response = await fetch(
        `/api/platform/tenants/${photographerId}/support/access-status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nextStatus, reason: statusReason.trim() }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error?.message || "Aggiornamento stato accesso non riuscito.",
        });
        return;
      }

      setState({
        kind: "success",
        message: payload?.data?.message || "Stato accesso aggiornato.",
      });
      setStatusReason("");
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Errore di rete durante l'aggiornamento stato." });
    } finally {
      setBusyAction(null);
    }
  }

  async function resetTrial() {
    if (trialReason.trim().length < 5) {
      setState({ kind: "error", message: "Inserisci una motivazione di almeno 5 caratteri." });
      return;
    }

    const days = Number(trialDays);
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      setState({ kind: "error", message: "Inserisci un numero di giorni tra 1 e 30." });
      return;
    }

    const confirmed = window.confirm(
      `Confermi il reset trial a ${days} giorni per questo studio?`
    );
    if (!confirmed) {
      return;
    }

    setBusyAction("trial");
    setState(null);

    try {
      const response = await fetch(
        `/api/platform/tenants/${photographerId}/support/trial-reset`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: trialReason.trim(), days }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error?.message || "Reset trial non riuscito.",
        });
        return;
      }

      setState({
        kind: "success",
        message: payload?.data?.message || "Trial resettato con successo.",
      });
      setTrialReason("");
      setTrialDays("14");
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Errore di rete durante il reset trial." });
    } finally {
      setBusyAction(null);
    }
  }

  async function reconcileSubscription() {
    const confirmed = window.confirm(
      "Confermi la riconciliazione della subscription con Stripe? I dati locali verranno allineati."
    );
    if (!confirmed) {
      return;
    }

    setBusyAction("reconcile");
    setState(null);

    try {
      const response = await fetch(
        `/api/platform/tenants/${photographerId}/support/reconcile`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        setState({
          kind: "error",
          message: payload?.error?.message || "Riconciliazione non riuscita.",
        });
        return;
      }

      setState({
        kind: "success",
        message: payload?.data?.message || "Subscription riconciliata.",
      });
      router.refresh();
    } catch {
      setState({ kind: "error", message: "Errore di rete durante la riconciliazione." });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Supporto account studio</CardDescription>
        <CardTitle>Recupero accesso e sicurezza</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 p-3 text-sm">
          Stato attuale accesso:{" "}
          <strong className="font-semibold">{formatAccessStatus(currentAccessStatus)}</strong>
        </div>

        <section className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
          <Label htmlFor="reset-reason">Motivazione reset password</Label>
          <Input
            id="reset-reason"
            value={resetReason}
            onChange={(event) => setResetReason(event.target.value)}
            placeholder="Es. Studio bloccato dopo piu tentativi falliti"
          />
          <Button
            type="button"
            variant="outline"
            onClick={sendPasswordReset}
            disabled={busyAction !== null}
          >
            {busyAction === "reset" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Invio in corso
              </>
            ) : (
              "Invia reset password via email"
            )}
          </Button>
        </section>

        <section className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
          <Label htmlFor="status-reason">Motivazione cambio stato accesso</Label>
          <Input
            id="status-reason"
            value={statusReason}
            onChange={(event) => setStatusReason(event.target.value)}
            placeholder="Es. Sblocco dopo verifica identita studio"
          />
          <Button
            type="button"
            variant="outline"
            onClick={toggleAccessStatus}
            disabled={busyAction !== null}
          >
            {busyAction === "status" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aggiornamento in corso
              </>
            ) : (
              toggleLabel
            )}
          </Button>
          {currentAccessStatus === "active" ? null : (
            <p className="text-xs text-muted-foreground">
              In stato non attivo, questa azione riporta lo studio a operativo.
            </p>
          )}
        </section>

        {subscriptionStatus ? (
          <section className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
            <Label htmlFor="trial-reason">Reset/estensione trial</Label>
            <Input
              id="trial-reason"
              value={trialReason}
              onChange={(event) => setTrialReason(event.target.value)}
              placeholder="Es. Estensione trial per problema tecnico"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="trial-days" className="shrink-0 text-xs">Giorni (1-30):</Label>
              <Input
                id="trial-days"
                type="number"
                min={1}
                max={30}
                value={trialDays}
                onChange={(event) => setTrialDays(event.target.value)}
                className="w-20"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={resetTrial}
              disabled={busyAction !== null}
            >
              {busyAction === "trial" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reset in corso
                </>
              ) : (
                "Reset trial"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Resetta la subscription dello studio a stato trial per i giorni specificati. Stato attuale: {subscriptionStatus}
            </p>
          </section>
        ) : (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 p-3 text-sm text-muted-foreground">
            Nessuna subscription presente per questo studio. Il reset trial non e disponibile.
          </div>
        )}

        {hasStripeSubscription ? (
          <section className="space-y-2 rounded-xl border border-[color:var(--border)] p-3">
            <Label>Riconciliazione subscription</Label>
            <p className="text-xs text-muted-foreground">
              Sincronizza i dati locali con lo stato reale su Stripe. Utile se i dati sembrano disallineati.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={reconcileSubscription}
              disabled={busyAction !== null}
            >
              {busyAction === "reconcile" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Riconciliazione in corso
                </>
              ) : (
                "Riconcilia con Stripe"
              )}
            </Button>
          </section>
        ) : null}

        {state ? (
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              state.kind === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {state.message}
          </p>
        ) : null}

        <section className="space-y-2">
          <p className="text-sm font-semibold">Ultime azioni supporto</p>
          {supportActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna azione registrata.</p>
          ) : (
            <div className="space-y-2">
              {supportActions.slice(0, 8).map((action) => (
                <div
                  key={action.id}
                  className="rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/20 px-3 py-2 text-sm"
                >
                  <div className="font-medium">
                    {action.action_type === "password_reset_email"
                      ? "Reset password"
                      : "Cambio stato accesso"}{" "}
                    - {action.outcome}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(action.created_at).toLocaleString("it-IT")} - {action.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

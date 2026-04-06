"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw } from "lucide-react";
import type {
  ConnectStatus,
  StripeConnectStatusCard as StripeConnectStatusCardData,
  TenantBillingAccount,
} from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConnectStatusResponse {
  billingAccount: TenantBillingAccount | null;
  entitlements?: {
    can_accept_online_payments?: boolean;
  } | null;
  statusCard?: StripeConnectStatusCardData | null;
  connectReady: boolean;
  error?: string;
}

interface ConnectStartResponse {
  url?: string;
  platformSetupRequired?: boolean;
  error?: string;
}

interface StripeConnectCardProps {
  entryState?: "refresh" | "return" | null;
  onEntryStateHandled?: () => void;
}

const defaultStatusCard: StripeConnectStatusCardData = {
  tone: "red",
  title: "Pagamenti disattivati: clicca qui per configurare Stripe",
  message: "Completa Stripe Express per attivare i pagamenti online sul tuo studio.",
  actionLabel: "Configura Stripe",
  requirementsCurrentlyDue: 0,
  requirementsDisabledReason: null,
};

async function parseJsonSafe<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Risposta non valida dal server. Riprova tra qualche secondo.");
  }
}

function getConnectLabel(status: ConnectStatus | null | undefined) {
  switch (status) {
    case "connected":
      return "Connesso";
    case "pending":
      return "In attesa";
    case "restricted":
      return "Limitato";
    case "disabled":
      return "Disabilitato";
    default:
      return "Non connesso";
  }
}

function getStatusToneClasses(tone: StripeConnectStatusCardData["tone"]) {
  switch (tone) {
    case "green":
      return "border-emerald-300 bg-emerald-50 text-emerald-950";
    case "orange":
      return "border-amber-300 bg-amber-50 text-amber-950";
    default:
      return "border-red-300 bg-red-50 text-red-950";
  }
}

export function StripeConnectCard({
  entryState = null,
  onEntryStateHandled,
}: StripeConnectCardProps) {
  const handledEntryStateRef = useRef(false);
  const onboardingPopupRef = useRef<Window | null>(null);
  const popupMonitorTimerRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [billingAccount, setBillingAccount] = useState<TenantBillingAccount | null>(null);
  const [canAcceptOnlinePayments, setCanAcceptOnlinePayments] = useState(false);
  const [connectReady, setConnectReady] = useState(false);
  const [statusCard, setStatusCard] = useState<StripeConnectStatusCardData>(defaultStatusCard);
  const [showConnectGuide, setShowConnectGuide] = useState(false);

  const loadStatus = async (options?: { successMessage?: string }) => {
    setSyncing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/billing/connect/status", { method: "GET" });
      const payload = await parseJsonSafe<ConnectStatusResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Impossibile leggere lo stato Stripe.");
      }

      setBillingAccount(payload.billingAccount || null);
      setCanAcceptOnlinePayments(Boolean(payload.entitlements?.can_accept_online_payments));
      setConnectReady(Boolean(payload.connectReady));
      setStatusCard(payload.statusCard || defaultStatusCard);
      setMessage(options?.successMessage || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore sincronizzazione Stripe.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const loadStatusEffect = useEffectEvent(async (options?: { successMessage?: string }) => {
    await loadStatus(options);
  });

  const clearPopupMonitoring = () => {
    if (popupMonitorTimerRef.current !== null) {
      window.clearInterval(popupMonitorTimerRef.current);
      popupMonitorTimerRef.current = null;
    }
    onboardingPopupRef.current = null;
  };

  const startPopupMonitoring = () => {
    if (popupMonitorTimerRef.current !== null) {
      window.clearInterval(popupMonitorTimerRef.current);
    }

    popupMonitorTimerRef.current = window.setInterval(() => {
      if (!onboardingPopupRef.current || onboardingPopupRef.current.closed) {
        clearPopupMonitoring();
        void loadStatusEffect({
          successMessage:
            "Finestra Stripe chiusa. Stato aggiornato automaticamente.",
        });
      }
    }, 1500);
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/billing/connect/start", { method: "POST" });
      const payload = await parseJsonSafe<ConnectStartResponse>(response);
      if (!response.ok) {
        throw new Error(payload.error || "Impossibile avviare onboarding Stripe.");
      }

      if (payload.url) {
        const popup = window.open(payload.url, "stripe_connect_onboarding", "width=980,height=860");
        if (!popup) {
          window.location.href = payload.url;
          return;
        }

        onboardingPopupRef.current = popup;
        startPopupMonitoring();
        popup.focus();
        setMessage("Completa Stripe nella nuova finestra: aggiorniamo lo stato in automatico.");
        setConnecting(false);
        return;
      }

      throw new Error("Stripe non ha restituito un link di onboarding valido. Riprova tra qualche secondo.");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Errore connessione Stripe.");
      setConnecting(false);
    }
  };

  const handleConnectEffect = useEffectEvent(async () => {
    await handleConnect();
  });

  useEffect(() => {
    handledEntryStateRef.current = false;
    void loadStatusEffect({
      successMessage:
        entryState === "return" ? "Stato Stripe aggiornato dopo il ritorno da Stripe." : undefined,
    });
  }, [entryState]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (!event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as { type?: string; state?: "refresh" | "return" };
      if (data.type !== "stripe-connect-onboarding") {
        return;
      }

      clearPopupMonitoring();
      void loadStatusEffect({
        successMessage:
          data.state === "refresh"
            ? "Stripe ha richiesto un nuovo link: stato aggiornato."
            : "Onboarding Stripe completato. Stato aggiornato automaticamente.",
      });
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearPopupMonitoring();
    };
  }, []);

  useEffect(() => {
    if (entryState !== "refresh" || loading || connecting || handledEntryStateRef.current) {
      return;
    }

    handledEntryStateRef.current = true;
    onEntryStateHandled?.();
    void handleConnectEffect();
  }, [connecting, entryState, loading, onEntryStateHandled]);

  useEffect(() => {
    if (entryState !== "return" || handledEntryStateRef.current) {
      return;
    }

    handledEntryStateRef.current = true;
    onEntryStateHandled?.();
  }, [entryState, onEntryStateHandled]);

  const connectStatus = billingAccount?.connect_status || "not_connected";
  const StatusIcon = statusCard.tone === "green" ? CheckCircle2 : AlertTriangle;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardDescription>Pagamenti online</CardDescription>
        <CardTitle>Collega Stripe Express</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
            {getConnectLabel(connectStatus)}
          </span>
          {connectReady && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Pronto a incassare
            </span>
          )}
        </div>

        <div className={`rounded-[1.4rem] border px-4 py-4 ${getStatusToneClasses(statusCard.tone)}`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-white/80 p-2">
              <StatusIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.14em]">Stato Stripe</p>
              <h3 className="text-base font-semibold">{statusCard.title}</h3>
              <p className="text-sm leading-6">{statusCard.message}</p>
              {statusCard.requirementsCurrentlyDue > 0 && statusCard.tone === "orange" ? (
                <p className="text-sm font-medium">
                  Requisiti ancora richiesti: {statusCard.requirementsCurrentlyDue}
                </p>
              ) : null}
              {statusCard.requirementsDisabledReason ? (
                <p className="text-xs uppercase tracking-[0.12em] opacity-80">
                  Motivo Stripe: {statusCard.requirementsDisabledReason}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">Come funziona</p>
          <p className="mt-1">
            Stripe Express gestisce onboarding, verifiche e accrediti. Quando l&apos;account e verde,
            il checkout online puo ricevere pagamenti sul tuo studio.
          </p>
          {!canAcceptOnlinePayments && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              Il tuo piano non abilita ancora l&apos;incasso online oppure e in aggiornamento.
            </p>
          )}
        </div>

        {billingAccount?.stripe_connect_account_id ? (
          <p className="text-xs text-muted-foreground">
            Account Stripe: <span className="font-mono text-foreground">{billingAccount.stripe_connect_account_id}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {statusCard.tone !== "green" ? (
            <Button type="button" onClick={() => void handleConnect()} disabled={connecting || loading}>
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reindirizzamento
                </>
              ) : (
                statusCard.actionLabel || "Configura Stripe"
              )}
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void loadStatus({ successMessage: "Stato Stripe aggiornato." })} disabled={syncing || loading}>
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aggiornamento
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4" />
                Aggiorna stato
              </>
            )}
          </Button>
          {statusCard.tone !== "green" ? (
            <Button type="button" variant="outline" onClick={() => setShowConnectGuide(true)} disabled={connecting || loading}>
              Guida rapida
            </Button>
          ) : null}
        </div>

        {message ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        ) : null}
      </CardContent>

      <Dialog open={showConnectGuide} onOpenChange={setShowConnectGuide}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Guida rapida Stripe Express</DialogTitle>
            <DialogDescription>
              Segui questi passaggi durante l&apos;onboarding per completare tutto al primo colpo.
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">1. Verifica email e dati attivita</span>
              <p className="mt-1">
                Stripe precompila l&apos;email dello studio. Controlla che sia corretta e completa i dati richiesti.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">2. Inserisci titolare e documenti</span>
              <p className="mt-1">
                Tieni pronti documento di identita, codice fiscale o partita IVA e le informazioni del rappresentante legale.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">3. Collega il conto bancario</span>
              <p className="mt-1">
                Inserisci l&apos;IBAN corretto per ricevere gli accrediti degli ordini online.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">4. Al termine si aggiorna da solo</span>
              <p className="mt-1">
                Quando chiudi la finestra Stripe, la dashboard aggiorna automaticamente lo stato del tuo account.
              </p>
            </li>
          </ol>

          <DialogFooter className="gap-2 sm:justify-end sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setShowConnectGuide(false)} disabled={connecting}>
              Chiudi
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowConnectGuide(false);
                void handleConnect();
              }}
              disabled={connecting || loading}
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reindirizzamento
                </>
              ) : (
                "Continua su Stripe"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

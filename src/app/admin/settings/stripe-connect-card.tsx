"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCcw } from "lucide-react";
import type { ConnectStatus, TenantBillingAccount } from "@/lib/types";
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
  connectReady: boolean;
  error?: string;
}

interface ConnectStartResponse {
  url?: string;
  setupUrl?: string;
  error?: string;
}

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

function getConnectTone(status: ConnectStatus | null | undefined) {
  if (status === "connected") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (status === "restricted" || status === "disabled") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  return "border-amber-300 bg-amber-50 text-amber-900";
}

export function StripeConnectCard() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [billingAccount, setBillingAccount] = useState<TenantBillingAccount | null>(null);
  const [canAcceptOnlinePayments, setCanAcceptOnlinePayments] = useState(false);
  const [connectReady, setConnectReady] = useState(false);
  const [showConnectGuide, setShowConnectGuide] = useState(false);

  const loadStatus = async () => {
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
      setMessage("Stato Stripe aggiornato.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore sincronizzazione Stripe.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/billing/connect/start", { method: "POST" });
      const payload = await parseJsonSafe<ConnectStartResponse>(response);
      if (payload.url) {
        window.location.href = payload.url;
        return;
      }
      if (payload.setupUrl) {
        window.location.href = payload.setupUrl;
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || "Impossibile avviare onboarding Stripe.");
      }
      throw new Error("Impossibile avviare onboarding Stripe.");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Errore connessione Stripe.");
      setConnecting(false);
    }
  };

  const connectStatus = billingAccount?.connect_status || "not_connected";

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardDescription>Pagamenti online</CardDescription>
        <CardTitle>Collega Stripe Connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getConnectTone(connectStatus)}`}
          >
            {getConnectLabel(connectStatus)}
          </span>
          {connectReady && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Pronto a incassare
            </span>
          )}
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/70 px-4 py-3 text-sm leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">Come funziona</p>
          <p className="mt-1">
            Collega Stripe Connect per ricevere pagamenti online dai clienti. Fino al completamento, il checkout online
            non puo incassare sul tuo studio.
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
          <Button type="button" onClick={() => setShowConnectGuide(true)} disabled={connecting || loading}>
            {connecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reindirizzamento
              </>
            ) : (
              "Connetti Stripe"
            )}
          </Button>
          <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={syncing || loading}>
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
        </div>

        {message && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {error}
          </p>
        )}
      </CardContent>

      <Dialog open={showConnectGuide} onOpenChange={setShowConnectGuide}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Guida rapida collegamento Stripe</DialogTitle>
            <DialogDescription>
              Segui questi passaggi durante l&apos;onboarding per completare tutto al primo colpo.
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">1. Crea o accedi all&apos;account Stripe</span>
              <p className="mt-1">
                Usa email dello studio e tieni aperta la casella di posta per eventuali verifiche immediate.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">2. Inserisci dati attivita e titolare</span>
              <p className="mt-1">
                Compila ragione sociale, indirizzo, partita IVA/codice fiscale e dati del rappresentante legale.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">3. Verifica identita</span>
              <p className="mt-1">
                Tieni pronti documento valido e, se richiesto, prova indirizzo o documenti aziendali.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">4. Collega conto bancario</span>
              <p className="mt-1">
                Inserisci IBAN corretto per ricevere gli accrediti dei pagamenti online.
              </p>
            </li>
            <li className="rounded-xl border border-[color:var(--border)] bg-white/70 px-4 py-3">
              <span className="font-semibold text-foreground">5. Torna qui e aggiorna stato</span>
              <p className="mt-1">
                Dopo la procedura, usa &quot;Aggiorna stato&quot;: quando vedi &quot;Pronto a incassare&quot; il checkout e attivo.
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

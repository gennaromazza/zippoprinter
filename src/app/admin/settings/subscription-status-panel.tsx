"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { SubscriptionPlan, TenantBillingAccount, TenantSubscription, TenantSubscriptionStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubscriptionStatusResponse {
  subscription: TenantSubscription | null;
  plans: SubscriptionPlan[];
  billingAccount: TenantBillingAccount | null;
  subscriptionActive: boolean;
  error?: string;
}

function getStatusLabel(status: TenantSubscriptionStatus | null | undefined) {
  switch (status) {
    case "trialing":
      return "In prova";
    case "active":
      return "Attivo";
    case "past_due":
      return "Pagamento in ritardo";
    case "canceled":
      return "Cancellato";
    case "suspended":
      return "Sospeso";
    case "lifetime":
      return "Lifetime";
    default:
      return "Non attivo";
  }
}

function getStatusTone(status: TenantSubscriptionStatus | null | undefined) {
  if (status === "active" || status === "trialing" || status === "lifetime") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (status === "past_due" || status === "suspended") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  return "border-amber-300 bg-amber-50 text-amber-900";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Non disponibile";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Non disponibile";
  }
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getExpiryLabel(subscription: TenantSubscription | null) {
  if (!subscription) {
    return "Nessun abbonamento registrato";
  }
  if (subscription.status === "lifetime" || subscription.is_lifetime) {
    return "Nessuna scadenza (lifetime)";
  }
  if (subscription.status === "trialing" && subscription.trial_end) {
    return `Trial fino al ${formatDate(subscription.trial_end)}`;
  }
  if (subscription.cancel_at_period_end && subscription.current_period_end) {
    return `Termina il ${formatDate(subscription.current_period_end)}`;
  }
  if (subscription.current_period_end) {
    return `Prossimo rinnovo ${formatDate(subscription.current_period_end)}`;
  }
  return "Data scadenza non disponibile";
}

export function SubscriptionStatusPanel() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<SubscriptionStatusResponse | null>(null);

  const loadStatus = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/admin/billing/subscription/status", { method: "GET" });
      const data = (await response.json()) as SubscriptionStatusResponse;
      if (!response.ok) {
        throw new Error(data.error || "Impossibile leggere lo stato abbonamento.");
      }
      setPayload(data);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Errore durante il caricamento dello stato abbonamento."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const status = payload?.subscription?.status;
  const expiryLabel = useMemo(() => getExpiryLabel(payload?.subscription || null), [payload?.subscription]);
  const matchedPlan = useMemo(() => {
    if (!payload?.subscription?.plan_id) {
      return null;
    }
    return payload.plans.find((plan) => plan.id === payload.subscription?.plan_id) || null;
  }, [payload]);

  return (
    <div className="rounded-[1.4rem] border border-[color:var(--border)] bg-white/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Abbonamento studio</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Caricamento stato...</p>
          ) : (
            <p className="text-sm text-muted-foreground">{expiryLabel}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Lettura
            </span>
          ) : (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getStatusTone(status)}`}
            >
              {getStatusLabel(status)}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={loading}>
            Apri dettagli
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stato abbonamento e scadenza</DialogTitle>
            <DialogDescription>
              Panoramica dedicata del piano attivo, rinnovo e stato operativo del tuo studio.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[color:var(--border)] bg-white/75 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Stato abbonamento</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{getStatusLabel(status)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-white/75 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Scadenza / rinnovo</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{expiryLabel}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-white/75 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Piano</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {matchedPlan?.name || payload?.subscription?.plan_id || "Non assegnato"}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--border)] bg-white/75 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Checkout online</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {payload?.subscriptionActive ? "Abilitato" : "Non abilitato"}
              </p>
            </div>
          </div>

          {payload?.subscriptionActive ? (
            <p className="mt-3 inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Abbonamento in regola.
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadStatus({ silent: true })}
              disabled={refreshing}
            >
              {refreshing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aggiornamento
                </>
              ) : (
                "Aggiorna stato"
              )}
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

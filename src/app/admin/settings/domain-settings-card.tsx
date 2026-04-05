"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { TenantDomain } from "@/lib/types";
import { InfoTip } from "@/components/ui/info-tip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type DomainAction = "verify" | "sync" | "activate" | "deactivate";

interface DomainListResponse {
  domains: TenantDomain[];
}

interface SubscriptionStatusResponse {
  entitlements?: {
    can_use_custom_domain?: boolean;
  };
  error?: string;
}

interface DomainActionResponse {
  domain?: TenantDomain;
  error?: string;
}

interface DomainCreateResponse extends DomainActionResponse {
  instructions?: {
    type: string;
    host: string;
    value: string;
  };
}

function getDomainStatusTone(domain: TenantDomain) {
  if (domain.is_active && domain.verification_status === "verified" && domain.ssl_status === "ready") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (domain.verification_status === "failed" || domain.ssl_status === "failed") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  return "border-amber-300 bg-amber-50 text-amber-900";
}

function getStatusLabel(domain: TenantDomain) {
  if (domain.is_active && domain.verification_status === "verified" && domain.ssl_status === "ready") {
    return "Attivo";
  }
  if (domain.verification_status === "failed" || domain.ssl_status === "failed") {
    return "Da correggere";
  }
  return "In configurazione";
}

export function DomainSettingsCard() {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [canUseCustomDomain, setCanUseCustomDomain] = useState<boolean>(false);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [instructions, setInstructions] = useState<{ type: string; host: string; value: string } | null>(null);

  const purchasePrice = process.env.NEXT_PUBLIC_DOMAIN_PURCHASE_PRICE_EUR || "19.90";
  const renewalPrice = process.env.NEXT_PUBLIC_DOMAIN_RENEWAL_PRICE_EUR || "19.90";
  const platformSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";

  const platformHost = useMemo(() => {
    if (!platformSiteUrl) {
      return "dominio piattaforma";
    }
    try {
      return new URL(platformSiteUrl).host;
    } catch {
      return platformSiteUrl;
    }
  }, [platformSiteUrl]);

  const loadDomains = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/domains", { method: "GET" });
      const payload = (await response.json()) as DomainListResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Impossibile caricare i domini.");
      }
      setDomains(payload.domains || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Errore caricamento domini.");
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptionCapability = async () => {
    setSubscriptionLoading(true);
    try {
      const response = await fetch("/api/admin/billing/subscription/status", { method: "GET" });
      const payload = (await response.json()) as SubscriptionStatusResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Impossibile verificare il piano.");
      }
      setCanUseCustomDomain(Boolean(payload.entitlements?.can_use_custom_domain));
    } catch {
      setCanUseCustomDomain(false);
    } finally {
      setSubscriptionLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadDomains(), loadSubscriptionCapability()]);
  }, []);

  const handleCreateDomain = async () => {
    const domain = domainInput.trim();
    if (!domain) {
      setErrorMessage("Inserisci un dominio valido (es: www.tuostudio.it).");
      return;
    }

    setAdding(true);
    setErrorMessage("");
    setMessage("");
    setInstructions(null);

    try {
      const response = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = (await response.json()) as DomainCreateResponse;

      if (!response.ok || !payload.domain) {
        throw new Error(payload.error || "Configurazione dominio non riuscita.");
      }

      setDomainInput("");
      setDomains((previous) => [payload.domain!, ...previous.filter((item) => item.id !== payload.domain!.id)]);
      setInstructions(payload.instructions || null);
      setMessage("Dominio aggiunto. Completa DNS e verifica per attivarlo.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Errore configurazione dominio.");
    } finally {
      setAdding(false);
    }
  };

  const handleDomainAction = async (domainId: string, action: DomainAction) => {
    setBusyAction(`${domainId}:${action}`);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/domains/${domainId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as DomainActionResponse;
      if (!response.ok || !payload.domain) {
        throw new Error(payload.error || "Operazione dominio non riuscita.");
      }
      setDomains((previous) =>
        previous.map((item) => (item.id === payload.domain!.id ? payload.domain! : item))
      );
      setMessage("Operazione completata.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Errore operazione dominio.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    setBusyAction(`${domainId}:delete`);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/domains/${domainId}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Rimozione dominio non riuscita.");
      }
      setDomains((previous) => previous.filter((item) => item.id !== domainId));
      setMessage("Dominio rimosso.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Errore rimozione dominio.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardDescription>Dominio personalizzato</CardDescription>
        <CardTitle>Brand, fiducia e rinnovo trasparente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/65 p-4 text-sm leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">Perche acquistare un dominio personalizzato</p>
          <p className="mt-1">
            Un dominio dedicato rende il tuo studio piu professionale, aumenta la fiducia dei clienti e
            rende la pagina ordini piu facile da ricordare.
          </p>
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/65 p-4 text-sm leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">Condizioni economiche</p>
          <p className="mt-1">
            Prezzo acquisto dominio: <strong className="text-foreground">EUR {purchasePrice}</strong>.
            Rinnovo annuale: <strong className="text-foreground">EUR {renewalPrice}</strong>.
          </p>
          <p className="mt-1">
            Il dominio e un costo esterno al tuo abbonamento SaaS: viene gestito e fatturato come add-on separato.
          </p>
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/65 p-4 text-sm leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">Come funziona tecnicamente</p>
          <p className="mt-1">
            Dopo verifica e attivazione, la vetrina clienti viene collegata automaticamente al dominio.
            L&apos;area admin resta sul dominio piattaforma: <strong className="text-foreground">{platformHost}</strong>.
          </p>
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/30 p-4">
          <div className="text-sm leading-6 text-muted-foreground">
            <p className="font-semibold text-foreground">Acquisto dominio tramite piattaforma</p>
            <p className="mt-1">
              Se acquisti tramite noi, il collegamento alla vetrina clienti verra preparato automaticamente e il
              rinnovo restera gestibile in piattaforma come costo separato dal piano.
            </p>
          </div>
          <div className="mt-3 rounded-xl border border-dashed border-[color:var(--border)] bg-white/70 px-3 py-3 text-sm">
            <p className="font-semibold text-foreground">Presto in arrivo</p>
            <p className="mt-1 text-muted-foreground">
              L&apos;acquisto dominio direttamente dalla piattaforma e temporaneamente sospeso.
              Puoi continuare a collegare subito un dominio gia registrato (BYOD) qui sotto.
            </p>
            <Button type="button" className="mt-3" disabled>
              Acquisto dominio (presto in arrivo)
            </Button>
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-white/75 p-4">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">Configura un dominio che possiedi gia (BYOD)</p>
            <InfoTip
              label="BYOD"
              text="Puoi collegare un dominio gia registrato presso qualsiasi provider, seguendo i passaggi DNS."
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr,auto]">
            <div className="space-y-2">
              <Label htmlFor="tenant-domain">Dominio</Label>
              <Input
                id="tenant-domain"
                value={domainInput}
                onChange={(event) => setDomainInput(event.target.value)}
                placeholder="www.tuostudio.it"
                disabled={!canUseCustomDomain || adding || subscriptionLoading}
              />
            </div>
            <div className="md:self-end">
              <Button
                type="button"
                onClick={handleCreateDomain}
                disabled={!canUseCustomDomain || adding || subscriptionLoading}
              >
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Configurazione
                  </>
                ) : (
                  "Configura dominio"
                )}
              </Button>
            </div>
          </div>

          {!subscriptionLoading && !canUseCustomDomain && (
            <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Il tuo piano attuale non include i domini personalizzati.
            </p>
          )}

          {instructions && (
            <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--muted)]/25 px-3 py-3 text-sm leading-6 text-foreground">
              <p className="font-semibold">Istruzioni DNS</p>
              <p className="mt-1">
                Crea record <strong>{instructions.type.toUpperCase()}</strong> con host{" "}
                <strong>{instructions.host}</strong> e valore <strong>{instructions.value}</strong>.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Domini configurati</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadDomains()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiorna lista"}
            </Button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-3 text-sm text-muted-foreground">
              Caricamento domini...
            </div>
          ) : domains.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-white/70 px-3 py-3 text-sm text-muted-foreground">
              Nessun dominio configurato.
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map((domain) => (
                <div
                  key={domain.id}
                  className="rounded-xl border border-[color:var(--border)] bg-white/80 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">{domain.domain}</p>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${getDomainStatusTone(domain)}`}>
                      {getStatusLabel(domain)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Verifica: {domain.verification_status} | SSL: {domain.ssl_status} | Attivo:{" "}
                    {domain.is_active ? "si" : "no"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void handleDomainAction(domain.id, "verify")}
                    >
                      {busyAction === `${domain.id}:verify` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Verifica
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void handleDomainAction(domain.id, "sync")}
                    >
                      {busyAction === `${domain.id}:sync` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Sincronizza
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void handleDomainAction(domain.id, domain.is_active ? "deactivate" : "activate")
                      }
                    >
                      {busyAction === `${domain.id}:${domain.is_active ? "deactivate" : "activate"}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {domain.is_active ? "Disattiva" : "Attiva"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyAction !== null}
                      onClick={() => void handleDeleteDomain(domain.id)}
                    >
                      {busyAction === `${domain.id}:delete` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Rimuovi
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {message && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            {message}
          </p>
        )}
        {errorMessage && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {errorMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

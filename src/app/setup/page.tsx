"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Database, FolderOpen, Loader2, RefreshCw, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DiagnosticResult {
  connection: string | { error: string };
  tables: Record<string, { exists: boolean; count?: number; error?: string }>;
  storage: { exists: boolean; error?: string };
  auth: { configured: boolean; userCount?: number; error?: string };
}

interface SetupStep {
  step: string;
  success: boolean;
  error?: string;
  message?: string;
}

interface SetupResult {
  success: boolean;
  steps: SetupStep[];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Errore sconosciuto";
}

export default function SetupPage() {
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupResult, setSetupResult] = useState<SetupResult | null>(null);
  const [initSecret, setInitSecret] = useState("");
  const [secretError, setSecretError] = useState("");
  const setupEnabled = process.env.NEXT_PUBLIC_ENABLE_SETUP === "true";

  const runDiagnostic = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/setup", {
        headers: initSecret ? { "x-init-secret": initSecret } : undefined,
      });
      const data = (await response.json()) as DiagnosticResult & { error?: string };
      if (!response.ok) {
        setSecretError(data.error || "Segreto non valido.");
        setDiagnostic(null);
        return;
      }
      setDiagnostic(data);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setDiagnostic({
        connection: { error: message },
        tables: {},
        storage: { exists: false, error: message },
        auth: { configured: false, error: message },
      });
    } finally {
      setLoading(false);
    }
  }, [initSecret]);

  const runSetup = async () => {
    setSetupLoading(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: initSecret }),
      });
      const data = (await response.json()) as SetupResult;
      if (!response.ok) {
        setSecretError((data as { error?: string }).error || "Segreto non valido.");
        setSetupResult(null);
        return;
      }
      setSetupResult(data);
      if (data.success) {
        await runDiagnostic();
      }
    } catch (error: unknown) {
      setSetupResult({
        success: false,
        steps: [{ step: "setup", success: false, error: getErrorMessage(error) }],
      });
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!setupEnabled) {
      setLoading(false);
      return;
    }
    if (!initSecret) {
      setLoading(false);
      return;
    }
    void runDiagnostic();
  }, [initSecret, runDiagnostic, setupEnabled]);

  const allReady =
    diagnostic &&
    diagnostic.connection === "ok" &&
    Object.values(diagnostic.tables).every((table) => table.exists) &&
    diagnostic.storage.exists &&
    diagnostic.auth.configured;

  return (
    <div className="min-h-screen px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="glass-panel rounded-[2rem] px-6 py-6 md:px-8">
          <p className="section-kicker mb-3">Setup tecnico</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Configurazione ZippoPrinter</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Verifica database, bucket storage e utente amministratore. Questa pagina resta una
            utility tecnica e non fa parte del funnel prodotto.
          </p>
        </header>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Stato ambiente
            </CardTitle>
            <CardDescription>Controlla connessione, tabelle, storage e auth.</CardDescription>
          </CardHeader>
          <CardContent>
            {!setupEnabled && (
              <div className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                La pagina di setup e disabilitata in questo ambiente. Abilitala con
                `NEXT_PUBLIC_ENABLE_SETUP=true`.
              </div>
            )}
            {setupEnabled && (
            <div className="mb-5 rounded-[1.4rem] border border-[color:var(--border)] bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Segreto di inizializzazione</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Richiesto per leggere la diagnostica e avviare il setup.
              </p>
              <input
                type="password"
                value={initSecret}
                onChange={(event) => {
                  setSecretError("");
                  setInitSecret(event.target.value);
                }}
                placeholder="INIT_SECRET"
                className="mt-3 w-full rounded-2xl border border-[color:var(--border)] bg-transparent px-4 py-2 text-sm font-medium text-foreground outline-none"
              />
              {secretError && (
                <p className="mt-2 text-sm font-medium text-red-700">{secretError}</p>
              )}
            </div>
            )}
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento diagnostica
              </div>
            ) : diagnostic ? (
              <div className="space-y-5">
                <div className="flex items-center gap-2">
                  {diagnostic.connection === "ok" ? (
                    <Check className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <X className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-semibold text-foreground">
                    Connessione {diagnostic.connection === "ok" ? "OK" : "non disponibile"}
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-5">
                  {Object.entries(diagnostic.tables).map(([name, info]) => (
                    <div
                      key={name}
                      className={`rounded-[1.4rem] border p-4 ${
                        info.exists ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {info.exists ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <X className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-sm font-semibold text-foreground">{name}</span>
                      </div>
                      {info.count !== undefined && (
                        <p className="mt-2 text-xs text-muted-foreground">{info.count} record</p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3 md:flex-row">
                  <div
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                      diagnostic.storage.exists ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Storage photos
                  </div>
                  <div
                    className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                      diagnostic.auth.configured ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    <User className="h-4 w-4" />
                    Auth ({diagnostic.auth.userCount ?? 0} utenti)
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!initSecret.trim()) {
                      setSecretError("Inserisci INIT_SECRET per continuare.");
                      return;
                    }
                    void runDiagnostic();
                  }}
                  disabled={!setupEnabled}
                >
                  <RefreshCw className="h-4 w-4" />
                  Aggiorna
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Setup automatico</CardTitle>
            <CardDescription>Crea utente amministratore e bucket storage.</CardDescription>
          </CardHeader>
          <CardContent>
            {!allReady ? (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Usa il setup automatico per creare l&apos;utente admin e il bucket `photos`.
                </p>

                {setupResult && (
                  <div
                    className={`rounded-[1.5rem] border p-4 ${
                      setupResult.success ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                    }`}
                  >
                    <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Risultato setup
                    </h4>
                    <div className="space-y-2">
                      {setupResult.steps.map((step) => (
                        <div key={step.step} className="flex items-center gap-2 text-sm">
                          {step.success ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium text-foreground">{step.step}</span>
                          <span className="text-muted-foreground">
                            {step.error || step.message || "Completato"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={async () => {
                    if (!initSecret.trim()) {
                      setSecretError("Inserisci INIT_SECRET per continuare.");
                      return;
                    }
                    await runSetup();
                  }}
                  disabled={!setupEnabled || setupLoading || setupResult?.success}
                >
                  {setupLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Setup in corso
                    </>
                  ) : (
                    "Esegui setup"
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-foreground">Ambiente pronto</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    L&apos;applicazione risulta configurata correttamente.
                  </p>
                </div>
                <div className="mx-auto max-w-md rounded-[1.5rem] border border-[color:var(--border)] bg-white/75 p-4 text-left">
                  <p className="text-sm font-semibold text-foreground">Credenziali accesso</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Email e password sono quelle configurate in ambiente.
                  </p>
                </div>
                <div className="flex flex-col justify-center gap-3 sm:flex-row">
                  <Link href="/admin" className="inline-flex">
                    <Button>Vai al pannello admin</Button>
                  </Link>
                  <Link href="/" className="inline-flex">
                    <Button variant="outline">Vai alla pagina cliente</Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Setup manuale</CardTitle>
            <CardDescription>Istruzioni base per la configurazione da Supabase Dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <div>
              <h4 className="font-semibold text-foreground">1. Esegui la migrazione SQL</h4>
              <p>
                Esegui `supabase/migrations/001_initial_schema.sql` da Supabase SQL Editor.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">2. Crea il bucket photos</h4>
              <p>Bucket privato, nome `photos`.</p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">3. Configura le policy storage</h4>
              <pre className="overflow-x-auto rounded-[1.2rem] bg-[#1c1712] p-4 text-xs text-[#f4ecdf]">
{`CREATE POLICY "Anyone can upload photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'photos');

CREATE POLICY "Anyone can view photos with signed URL" ON storage.objects
  FOR SELECT USING (bucket_id = 'photos');

CREATE POLICY "Admin can delete photos" ON storage.objects
  FOR DELETE USING (bucket_id = 'photos');`}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ZippoPrinter] Unhandled error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="mx-auto max-w-lg text-center">
        <Image
          src="/logo.png"
          alt="ZippoPrinter"
          width={48}
          height={48}
          className="mx-auto mb-6"
        />
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Si è verificato un errore
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Qualcosa non ha funzionato come previsto. Riprova oppure torna alla
          pagina precedente. Se il problema persiste, contatta il supporto.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Codice errore: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Riprova
          </Button>
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] px-7 text-sm font-semibold text-foreground hover:bg-[color:var(--muted)]"
          >
            Torna alla home
          </a>
        </div>
      </div>
    </main>
  );
}

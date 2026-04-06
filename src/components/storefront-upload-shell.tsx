"use client";

import dynamic from "next/dynamic";
import type { Photographer, PrintFormat } from "@/lib/types";

const UploadForm = dynamic(
  () => import("@/app/upload-form").then((module) => module.UploadForm),
  {
    ssr: false,
    loading: () => (
      <section className="glass-panel rounded-[1.95rem] p-5 md:p-6">
        <div className="space-y-3">
          <p className="section-kicker">Caricamento modulo ordine</p>
          <div className="h-32 animate-pulse rounded-[1.5rem] bg-white/45" />
          <div className="h-56 animate-pulse rounded-[1.8rem] bg-white/45" />
        </div>
      </section>
    ),
  }
);

interface StorefrontUploadShellProps {
  formats: PrintFormat[];
  photographer: Photographer;
  stripeEnabled: boolean;
}

export function StorefrontUploadShell({
  formats,
  photographer,
  stripeEnabled,
}: StorefrontUploadShellProps) {
  if (formats.length === 0) {
    return (
      <section className="glass-panel rounded-[1.95rem] p-5 text-center md:p-8">
        <p className="section-kicker mx-auto mb-3 justify-center">Studio in configurazione</p>
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">
          Lo studio non ha ancora configurato i formati di stampa
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          Torna a trovarci tra poco: il fotografo sta completando la configurazione del catalogo.
        </p>
      </section>
    );
  }

  return <UploadForm formats={formats} photographer={photographer} stripeEnabled={stripeEnabled} />;
}

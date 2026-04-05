"use client";

import { useState } from "react";
import { Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DomainSettingsCard } from "./domain-settings-card";

export function DomainSettingsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-panel w-full rounded-[2rem] border border-[color:var(--border)] bg-white/75 px-5 py-5 text-left transition hover:bg-white md:px-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="section-kicker mb-2">Domini personalizzati</p>
            <p className="text-lg font-semibold text-foreground">Apri gestione domini</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Configura, verifica e attiva i tuoi domini in una vista dedicata.
            </p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--border)] bg-white text-foreground">
            <Globe className="h-5 w-5" />
          </span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl p-0">
          <div className="px-6 pt-6 md:px-8 md:pt-8">
            <DialogHeader>
              <DialogTitle>Gestione domini personalizzati</DialogTitle>
              <DialogDescription>
                Sezione dedicata per configurare DNS, verificare lo stato SSL e attivare il dominio cliente.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="max-h-[72vh] overflow-y-auto px-6 py-3 md:px-8">
            <DomainSettingsCard />
          </div>

          <DialogFooter className="px-6 pb-6 md:px-8">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              <ExternalLink className="h-4 w-4" />
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

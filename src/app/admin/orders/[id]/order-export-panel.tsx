"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function OrderExportPanel({ orderId }: { orderId: string }) {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [message, setMessage] = useState("");

  const downloadZipArchive = async () => {
    setDownloadingZip(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/exports/archive`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Download archivio ZIP non riuscito.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage("Archivio ZIP ordine scaricato.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Errore durante il download archivio ZIP."
      );
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="section-kicker mb-2">Archivio ordine</p>
          <h3 className="text-xl font-semibold text-foreground">Download foto in ZIP</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Scarica tutte le foto dell&apos;ordine in un unico file ZIP, gia organizzato per formato
            e quantita copie.
          </p>
        </div>
        <Button onClick={downloadZipArchive} disabled={downloadingZip}>
          {downloadingZip ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Scarica ordine ZIP
        </Button>
      </div>

      {message && <p className="mt-4 text-sm font-medium text-foreground">{message}</p>}
    </section>
  );
}

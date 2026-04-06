"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReplayEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function handleReplay() {
    const confirmed = window.confirm(
      "Confermi il replay di questo evento? Verra schedulato per re-processing."
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/platform/events/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setResult({
          kind: "error",
          message: payload?.error?.message || "Replay non riuscito.",
        });
        return;
      }

      setResult({
        kind: "success",
        message: payload?.data?.message || "Evento schedulato per replay.",
      });
      router.refresh();
    } catch {
      setResult({ kind: "error", message: "Errore di rete." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleReplay}
        disabled={busy}
        title="Replay evento"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RotateCcw className="h-3.5 w-3.5" />
        )}
      </Button>
      {result ? (
        <span
          className={`text-xs ${
            result.kind === "success" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {result.message}
        </span>
      ) : null}
    </div>
  );
}

import { Info } from "lucide-react";

export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <span
      role="note"
      tabIndex={0}
      title={text}
      aria-label={`${label}: ${text}`}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--muted)]/35 text-muted-foreground outline-none transition hover:text-foreground focus:ring-2 focus:ring-primary/35"
    >
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

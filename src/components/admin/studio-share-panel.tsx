"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, ExternalLink, QrCode, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface StudioSharePanelProps {
  publicPath: string;
  publicUrl: string;
}

export function StudioSharePanel({ publicPath, publicUrl }: StudioSharePanelProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    void QRCode.toDataURL(publicUrl, {
      width: 220,
      margin: 2,
      color: {
        dark: "#2B211C",
        light: "#0000",
      },
    })
      .then((value) => {
        if (!cancelled) {
          setQrDataUrl(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyLink = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      return true;
    } catch {
      return false;
    }
  };

  const handleShare = async () => {
    setShareFeedback("");

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Pagina cliente studio",
          text: "Ordina le stampe da questo link",
          url: publicUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    const copiedWithFallback = await copyLink();
    if (copiedWithFallback) {
      setShareFeedback("Condivisione non supportata: link copiato negli appunti.");
    } else {
      setShareFeedback("Condivisione non disponibile su questo dispositivo.");
    }
  };

  return (
    <Card className="border-[color:var(--border)] bg-white">
      <CardHeader>
        <CardDescription>Pagina cliente principale</CardDescription>
        <CardTitle>Condivisione rapida link cliente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
          <div className="space-y-4">
            <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/35 px-4 py-3">
              <p className="break-all text-sm font-medium text-foreground">{publicUrl}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">{publicPath}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => void copyLink()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiato" : "Copia link"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleShare()}>
                <Share2 className="h-4 w-4" />
                Condividi
              </Button>
              <Link
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "default" })}
              >
                Apri pagina cliente
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>

            {shareFeedback && (
              <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
                {shareFeedback}
              </p>
            )}
          </div>

          <div className="rounded-[1.2rem] border border-[color:var(--border)] bg-[color:var(--muted)]/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <QrCode className="h-3.5 w-3.5" />
              QR code
            </div>
            <div className="flex aspect-square items-center justify-center rounded-xl border border-[color:var(--border)] bg-white">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt="QR code della pagina cliente"
                  width={220}
                  height={220}
                  unoptimized
                  className="h-full w-full rounded-xl object-contain p-2"
                />
              ) : (
                <span className="px-3 text-center text-xs text-muted-foreground">
                  QR non disponibile
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

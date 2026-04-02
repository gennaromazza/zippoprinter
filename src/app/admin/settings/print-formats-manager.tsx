"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/orders";
import type { PrintFormat } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function PrintFormatsManager({
  formats,
  photographerId,
}: {
  formats: PrintFormat[];
  photographerId: string;
}) {
  const [editing, setEditing] = useState<PrintFormat | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const resetForm = () => {
    setEditing(null);
    setIsAdding(false);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const priceEuros = Number.parseFloat(formData.get("price") as string);
    const priceCents = Math.round(priceEuros * 100);

    if (editing) {
      await supabase
        .from("print_formats")
        .update({
          name: formData.get("name"),
          width_cm: Number.parseFloat(formData.get("width") as string),
          height_cm: Number.parseFloat(formData.get("height") as string),
          price_cents: priceCents,
        })
        .eq("id", editing.id);
    } else {
      await supabase.from("print_formats").insert({
        photographer_id: photographerId,
        name: formData.get("name"),
        width_cm: Number.parseFloat(formData.get("width") as string),
        height_cm: Number.parseFloat(formData.get("height") as string),
        price_cents: priceCents,
        sort_order: formats.length,
      });
    }

    setLoading(false);
    resetForm();
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo formato di stampa?")) return;

    await supabase.from("print_formats").delete().eq("id", id);
    router.refresh();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("print_formats").update({ is_active: !isActive }).eq("id", id);
    router.refresh();
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardDescription>Catalogo studio</CardDescription>
            <CardTitle>Formati di stampa</CardTitle>
          </div>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              Aggiungi formato
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(isAdding || editing) && (
          <form onSubmit={handleSave} className="grid gap-4 rounded-[1.8rem] border border-[color:var(--border)] bg-white/70 p-5 md:grid-cols-5">
            <div className="field-shell space-y-2 md:col-span-2">
              <Label htmlFor="name">Nome formato</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name || ""}
                placeholder="10x15 cm"
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="width">Larghezza</Label>
              <Input
                id="width"
                name="width"
                type="number"
                step="0.1"
                defaultValue={editing?.width_cm || ""}
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="height">Altezza</Label>
              <Input
                id="height"
                name="height"
                type="number"
                step="0.1"
                defaultValue={editing?.height_cm || ""}
                required
              />
            </div>
            <div className="field-shell space-y-2">
              <Label htmlFor="price">Prezzo</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                defaultValue={editing ? (editing.price_cents / 100).toFixed(2) : ""}
                placeholder="3.00"
                required
              />
            </div>
            <div className="flex flex-wrap gap-3 md:col-span-5">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvataggio
                  </>
                ) : editing ? (
                  "Aggiorna formato"
                ) : (
                  "Crea formato"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Annulla
              </Button>
            </div>
          </form>
        )}

        {formats.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-[color:var(--border-strong)] bg-white/40 p-10 text-center">
            <p className="text-lg font-semibold text-foreground">Nessun formato configurato</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Aggiungi il primo formato per iniziare a ricevere ordini dal front-end cliente.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {formats.map((format) => (
              <div
                key={format.id}
                className={`flex flex-col gap-4 rounded-[1.5rem] border border-white/70 bg-white/75 p-4 md:flex-row md:items-center md:justify-between ${
                  format.is_active === false ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={format.is_active ?? true}
                    onChange={() => handleToggleActive(format.id, format.is_active ?? true)}
                    className="mt-1 h-4 w-4 rounded border-[color:var(--border-strong)]"
                  />
                  <div>
                    <p className="text-base font-semibold text-foreground">{format.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {format.width_cm} x {format.height_cm} cm
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[rgba(47,106,102,0.08)] px-3 py-1 text-sm font-semibold text-[color:var(--accent)]">
                    {formatCurrency(format.price_cents)}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(format)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(format.id)}
                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

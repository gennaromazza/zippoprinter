"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface PrintFormat {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  price_cents: number;
  is_active: boolean;
}

export function PrintFormatsManager({ 
  formats, 
  photographerId 
}: { 
  formats: PrintFormat[]; 
  photographerId: string;
}) {
  const [editing, setEditing] = useState<PrintFormat | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const priceEuros = parseFloat(formData.get("price") as string);
    const priceCents = Math.round(priceEuros * 100);

    if (editing) {
      await supabase
        .from("print_formats")
        .update({
          name: formData.get("name"),
          width_cm: parseFloat(formData.get("width") as string),
          height_cm: parseFloat(formData.get("height") as string),
          price_cents: priceCents,
        })
        .eq("id", editing.id);
      setEditing(null);
    } else {
      await supabase
        .from("print_formats")
        .insert({
          photographer_id: photographerId,
          name: formData.get("name"),
          width_cm: parseFloat(formData.get("width") as string),
          height_cm: parseFloat(formData.get("height") as string),
          price_cents: priceCents,
          sort_order: formats.length,
        });
      setIsAdding(false);
    }

    setLoading(false);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo formato?")) return;
    
    await supabase.from("print_formats").delete().eq("id", id);
    router.refresh();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from("print_formats").update({ is_active: !isActive }).eq("id", id);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Formati di Stampa</CardTitle>
            <CardDescription>
              Definisci i formati disponibili e i relativi prezzi
            </CardDescription>
          </div>
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Formato
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add/Edit Form */}
        {(isAdding || editing) && (
          <form onSubmit={handleSave} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="col-span-2 md:col-span-1 space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editing?.name || ""}
                  placeholder="10x15 cm"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Larghezza (cm)</Label>
                <Input
                  id="width"
                  name="width"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.width_cm || ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Altezza (cm)</Label>
                <Input
                  id="height"
                  name="height"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.height_cm || ""}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Prezzo (€)</Label>
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
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? "Salva" : "Aggiungi"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setIsAdding(false);
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Formats List */}
        {formats.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            Nessun formato definito. Aggiungi il primo formato per iniziare.
          </p>
        ) : (
          <div className="space-y-2">
            {formats.map((format) => (
              <div
                key={format.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  !format.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={format.is_active}
                    onChange={() => handleToggleActive(format.id, format.is_active)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium">{format.name}</p>
                    <p className="text-sm text-gray-500">
                      {format.width_cm}x{format.height_cm} cm
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">
                    €{(format.price_cents / 100).toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(format)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(format.id)}
                    className="text-red-500 hover:text-red-700"
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

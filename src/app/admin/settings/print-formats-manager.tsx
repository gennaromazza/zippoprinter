"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/orders";
import {
  discountRulesToTiers,
  formatTierSummary,
  parseDiscountRulesInput,
  parseTierInput,
  tiersToDiscountRules,
  type DiscountRuleDraft,
} from "@/lib/pricing";
import { isMissingQuantityPricingSchemaError } from "@/lib/schema-compat";
import type { PrintFormat } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function parseCsvLine(line: string, delimiter: "," | ";") {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function detectCsvDelimiter(headerLine: string): "," | ";" {
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function downloadCsvTemplate() {
  const csv = [
    "name,width_cm,height_cm,price_eur,discount_rules,tier_prices",
    '"10x15 cm",10,15,3.00,"30:percent:10|50:fixed:0.40",""',
    '"13x18 cm",13,18,5.00,"20:fixed:0.50|40:percent:15",""',
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "template_formati.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function splitInChunks<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getDefaultRule(): DiscountRuleDraft {
  return { min_quantity: 10, mode: "percent", value: 10 };
}

function safeParsePriceToCents(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

function formatRulePreview(basePriceCents: number, rule: DiscountRuleDraft) {
  if (!Number.isFinite(basePriceCents) || basePriceCents <= 0) {
    return "-";
  }

  const baseEur = basePriceCents / 100;
  let finalEur = baseEur;
  if (rule.mode === "percent") {
    finalEur = baseEur * (1 - rule.value / 100);
  } else {
    finalEur = baseEur - rule.value;
  }

  return finalEur > 0 ? `${finalEur.toFixed(2)} EUR` : "non valido";
}

function parseCsvRules(input: {
  discountRulesRaw: string;
  tierPricesRaw: string;
  basePriceCents: number;
}) {
  if (input.discountRulesRaw.trim()) {
    const discountRules = parseDiscountRulesInput(input.discountRulesRaw);
    return discountRulesToTiers(input.basePriceCents, discountRules);
  }

  return parseTierInput(input.tierPricesRaw);
}

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
  const [csvLoading, setCsvLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [csvMessage, setCsvMessage] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [discountRules, setDiscountRules] = useState<DiscountRuleDraft[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const basePriceCents = useMemo(() => safeParsePriceToCents(priceInput), [priceInput]);
  const rulesValidationError = useMemo(() => {
    if (!discountRules.length) {
      return "";
    }

    if (!basePriceCents) {
      return "Inserisci prima un prezzo base valido.";
    }

    try {
      discountRulesToTiers(basePriceCents, discountRules);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Regole sconto non valide.";
    }
  }, [basePriceCents, discountRules]);

  const openCreateForm = () => {
    setEditing(null);
    setIsAdding(true);
    setPriceInput("");
    setDiscountRules([]);
    setMessage("");
  };

  const openEditForm = (format: PrintFormat) => {
    setEditing(format);
    setIsAdding(false);
    setPriceInput((format.price_cents / 100).toFixed(2));
    setDiscountRules(tiersToDiscountRules(format.quantity_price_tiers, format.price_cents));
    setMessage("");
  };

  const resetForm = () => {
    setEditing(null);
    setIsAdding(false);
    setPriceInput("");
    setDiscountRules([]);
  };

  const updateRule = (
    index: number,
    patch: Partial<DiscountRuleDraft>
  ) => {
    setDiscountRules((current) =>
      current.map((rule, ruleIndex) => {
        if (ruleIndex !== index) {
          return rule;
        }
        return { ...rule, ...patch };
      })
    );
  };

  const removeRule = (index: number) => {
    setDiscountRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const addRule = () => {
    setDiscountRules((current) => [...current, getDefaultRule()]);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData(event.currentTarget);
      const widthCm = Number.parseFloat(String(formData.get("width") || "").replace(",", "."));
      const heightCm = Number.parseFloat(String(formData.get("height") || "").replace(",", "."));

      if (!basePriceCents) {
        throw new Error("Prezzo non valido.");
      }

      if (!Number.isFinite(widthCm) || widthCm <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
        throw new Error("Larghezza/altezza non valide.");
      }

      const tiers = discountRulesToTiers(basePriceCents, discountRules);

      const payload = {
        name: String(formData.get("name") || "").trim(),
        width_cm: widthCm,
        height_cm: heightCm,
        price_cents: basePriceCents,
        quantity_price_tiers: tiers,
      };

      if (!payload.name) {
        throw new Error("Nome formato obbligatorio.");
      }

      const response = editing
        ? await supabase.from("print_formats").update(payload).eq("id", editing.id)
        : await supabase.from("print_formats").insert({
            photographer_id: photographerId,
            ...payload,
            sort_order: formats.length,
          });

      if (response.error) {
        if (isMissingQuantityPricingSchemaError(response.error.message)) {
          throw new Error(
            "Schema non aggiornato. Esegui la migration 008_print_format_quantity_pricing_and_csv.sql."
          );
        }
        throw new Error(response.error.message);
      }

      setMessage(editing ? "Formato aggiornato." : "Formato creato.");
      resetForm();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? `Errore: ${error.message}` : "Errore salvataggio formato.");
    } finally {
      setLoading(false);
    }
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

  const handleImportCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setCsvLoading(true);
    setCsvMessage("");

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error("CSV vuoto o senza righe dati.");
      }

      const delimiter = detectCsvDelimiter(lines[0]);
      const header = parseCsvLine(lines[0], delimiter).map((cell) =>
        cell.toLowerCase().replace(/\s+/g, "_")
      );
      const getIndex = (...aliases: string[]) =>
        header.findIndex((column) => aliases.includes(column));

      const nameIndex = getIndex("name", "nome");
      const widthIndex = getIndex("width_cm", "width", "larghezza");
      const heightIndex = getIndex("height_cm", "height", "altezza");
      const priceIndex = getIndex("price_eur", "price", "unit_price_eur", "prezzo");
      const discountRulesIndex = getIndex("discount_rules", "discounts", "regole_sconto");
      const tiersIndex = getIndex("tier_prices", "quantity_tiers", "prezzi_quantita");

      if (nameIndex < 0 || widthIndex < 0 || heightIndex < 0 || priceIndex < 0) {
        throw new Error(
          "CSV non valido. Colonne obbligatorie: name,width_cm,height_cm,price_eur."
        );
      }

      const rowErrors: string[] = [];
      const importPayload: Array<{
        photographer_id: string;
        name: string;
        width_cm: number;
        height_cm: number;
        price_cents: number;
        quantity_price_tiers: ReturnType<typeof parseTierInput>;
        sort_order: number;
      }> = [];

      for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const row = parseCsvLine(lines[lineIndex], delimiter);
        const lineNumber = lineIndex + 1;
        const name = (row[nameIndex] || "").trim();
        const widthCm = Number.parseFloat((row[widthIndex] || "").replace(",", "."));
        const heightCm = Number.parseFloat((row[heightIndex] || "").replace(",", "."));
        const priceEur = Number.parseFloat((row[priceIndex] || "").replace(",", "."));
        const discountRulesRaw = discountRulesIndex >= 0 ? row[discountRulesIndex] || "" : "";
        const tiersRaw = tiersIndex >= 0 ? row[tiersIndex] || "" : "";

        if (!name || !Number.isFinite(widthCm) || !Number.isFinite(heightCm) || !Number.isFinite(priceEur)) {
          rowErrors.push(`Riga ${lineNumber}: dati base non validi.`);
          continue;
        }

        let tiers = [] as ReturnType<typeof parseTierInput>;
        const basePriceCentsForRow = Math.round(priceEur * 100);
        try {
          tiers = parseCsvRules({
            discountRulesRaw,
            tierPricesRaw: tiersRaw,
            basePriceCents: basePriceCentsForRow,
          });
        } catch (error) {
          rowErrors.push(
            `Riga ${lineNumber}: ${
              error instanceof Error ? error.message : "sconti quantita non validi"
            }`
          );
          continue;
        }

        importPayload.push({
          photographer_id: photographerId,
          name,
          width_cm: widthCm,
          height_cm: heightCm,
          price_cents: basePriceCentsForRow,
          quantity_price_tiers: tiers,
          sort_order: formats.length + importPayload.length,
        });
      }

      if (rowErrors.length > 0) {
        const preview = rowErrors.slice(0, 5).join("\n");
        const extraCount = rowErrors.length - Math.min(rowErrors.length, 5);
        throw new Error(
          `${preview}${extraCount > 0 ? `\n... e altri ${extraCount} errori.` : ""}`
        );
      }

      if (!importPayload.length) {
        throw new Error("Nessuna riga valida da importare.");
      }

      const chunks = splitInChunks(importPayload, 100);
      for (const chunk of chunks) {
        const { error } = await supabase.from("print_formats").insert(chunk);
        if (error) {
          if (isMissingQuantityPricingSchemaError(error.message)) {
            throw new Error(
              "Schema non aggiornato. Esegui la migration 008_print_format_quantity_pricing_and_csv.sql."
            );
          }
          throw new Error(error.message);
        }
      }

      setCsvMessage(`Import CSV completato: ${importPayload.length} formati caricati.`);
      router.refresh();
    } catch (error) {
      setCsvMessage(error instanceof Error ? `Errore import CSV: ${error.message}` : "Errore import CSV.");
    } finally {
      setCsvLoading(false);
    }
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardDescription>Catalogo studio</CardDescription>
            <CardTitle>Formati di stampa</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isAdding && (
              <Button onClick={openCreateForm}>
                <Plus className="h-4 w-4" />
                Aggiungi formato
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                void handleImportCsv(event);
              }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={csvLoading}>
              {csvLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importa CSV
            </Button>
            <Button variant="outline" onClick={downloadCsvTemplate}>
              <Download className="h-4 w-4" />
              Template CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {(isAdding || editing) && (
          <form
            onSubmit={handleSave}
            className="grid gap-4 rounded-[1.8rem] border border-[color:var(--border)] bg-white/70 p-5 md:grid-cols-5"
          >
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
              <Label htmlFor="price">Prezzo unitario (EUR)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                step="0.01"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder="3.00"
                required
              />
            </div>

            <div className="md:col-span-5 space-y-3 rounded-[1.2rem] border border-[color:var(--border)] bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Sconti quantita (opzionale)</Label>
                  <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    Da quantita - tipo sconto - valore. Esempio: da 30 copie paghi meno.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addRule}>
                  <Plus className="h-4 w-4" />
                  Aggiungi soglia
                </Button>
              </div>

              {discountRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessuna soglia impostata: verra applicato sempre il prezzo base.
                </p>
              ) : (
                <div className="space-y-2">
                  {discountRules.map((rule, index) => (
                    <div key={`${index}-${rule.min_quantity}`} className="grid gap-2 rounded-xl border border-[color:var(--border)] p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <Input
                        type="number"
                        min={2}
                        step={1}
                        value={rule.min_quantity}
                        onChange={(event) =>
                          updateRule(index, { min_quantity: Number.parseInt(event.target.value || "0", 10) || 0 })
                        }
                        placeholder="Da quantita"
                      />
                      <select
                        value={rule.mode}
                        onChange={(event) => updateRule(index, { mode: event.target.value as DiscountRuleDraft["mode"] })}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="percent">Percentuale (%)</option>
                        <option value="fixed">Importo fisso (EUR)</option>
                      </select>
                      <Input
                        type="number"
                        min={rule.mode === "percent" ? 0.1 : 0.01}
                        max={rule.mode === "percent" ? 99.9 : undefined}
                        step={rule.mode === "percent" ? 0.1 : 0.01}
                        value={rule.value}
                        onChange={(event) =>
                          updateRule(index, { value: Number.parseFloat(event.target.value || "0") || 0 })
                        }
                        placeholder={rule.mode === "percent" ? "Es. 10" : "Es. 0.40"}
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRule(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      <p className="md:col-span-4 text-xs text-muted-foreground">
                        Da {rule.min_quantity} copie, prezzo finale per copia: {formatRulePreview(basePriceCents || 0, rule)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {rulesValidationError ? (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {rulesValidationError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3 md:col-span-5">
              <Button type="submit" disabled={loading || Boolean(rulesValidationError)}>
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

        {message && (
          <div
            className={`rounded-[1.4rem] border px-4 py-3 text-sm font-medium ${
              message.startsWith("Errore")
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }`}
          >
            {message}
          </div>
        )}
        {csvMessage && (
          <div
            className={`rounded-[1.4rem] border px-4 py-3 text-sm font-medium whitespace-pre-line ${
              csvMessage.startsWith("Errore")
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-sky-300 bg-sky-50 text-sky-900"
            }`}
          >
            {csvMessage}
          </div>
        )}

        {formats.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-[color:var(--border-strong)] bg-white/40 p-10 text-center">
            <p className="text-lg font-semibold text-foreground">Nessun formato configurato</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Aggiungi il primo formato o importa un CSV per iniziare a ricevere ordini.
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
                    {formatTierSummary(format.quantity_price_tiers) && (
                      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        {formatTierSummary(format.quantity_price_tiers)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[rgba(47,106,102,0.08)] px-3 py-1 text-sm font-semibold text-[color:var(--accent)]">
                    {formatCurrency(format.price_cents)}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => openEditForm(format)}>
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

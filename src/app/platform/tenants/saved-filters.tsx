"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilterPreset {
  name: string;
  q?: string;
  subscription?: string;
  connect?: string;
  domain?: string;
}

const STORAGE_KEY = "zippo_platform_tenant_filters";

function loadPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p: unknown) => p && typeof p === "object" && "name" in (p as Record<string, unknown>)
    ) as FilterPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* quota exceeded */
  }
}

export function SavedFilters({
  currentFilters,
}: {
  currentFilters: { q: string; subscription: string; connect: string; domain: string };
}) {
  const router = useRouter();
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const hasActiveFilters =
    currentFilters.q || currentFilters.subscription || currentFilters.connect || currentFilters.domain;

  function handleSave() {
    const name = newName.trim();
    if (!name || name.length > 50) return;

    const preset: FilterPreset = {
      name,
      ...(currentFilters.q ? { q: currentFilters.q } : {}),
      ...(currentFilters.subscription ? { subscription: currentFilters.subscription } : {}),
      ...(currentFilters.connect ? { connect: currentFilters.connect } : {}),
      ...(currentFilters.domain ? { domain: currentFilters.domain } : {}),
    };

    const updated = [...presets.filter((p) => p.name !== name), preset].slice(0, 20);
    setPresets(updated);
    savePresets(updated);
    setNewName("");
    setShowSave(false);
  }

  function handleApply(preset: FilterPreset) {
    const params = new URLSearchParams();
    if (preset.q) params.set("q", preset.q);
    if (preset.subscription) params.set("subscription", preset.subscription);
    if (preset.connect) params.set("connect", preset.connect);
    if (preset.domain) params.set("domain", preset.domain);
    router.push(`/platform/tenants?${params.toString()}`);
  }

  function handleDelete(name: string) {
    const updated = presets.filter((p) => p.name !== name);
    setPresets(updated);
    savePresets(updated);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">Filtri salvati:</span>

        {presets.map((preset) => (
          <div key={preset.name} className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleApply(preset)}
            >
              {preset.name}
            </Button>
            <button
              type="button"
              className="text-muted-foreground hover:text-red-600"
              onClick={() => handleDelete(preset.name)}
              title="Rimuovi filtro salvato"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}

        {presets.length === 0 && !showSave ? (
          <span className="text-xs text-muted-foreground">Nessun filtro salvato.</span>
        ) : null}

        {hasActiveFilters && !showSave ? (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowSave(true)}
          >
            <Plus className="h-3 w-3" />
            Salva filtri attuali
          </Button>
        ) : null}
      </div>

      {showSave ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome preset (es. Studi problematici)"
            maxLength={50}
            className="rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={!newName.trim()}>
            Salva
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSave(false)}>
            Annulla
          </Button>
        </div>
      ) : null}
    </div>
  );
}

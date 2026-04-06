"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Shield, ShieldCheck, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminsManagerProps {
  admins: AdminRow[];
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner_readonly: "Sola lettura",
  owner_support: "Supporto",
  owner_admin: "Amministratore",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner_readonly: <Eye className="h-3.5 w-3.5" />,
  owner_support: <Shield className="h-3.5 w-3.5" />,
  owner_admin: <ShieldCheck className="h-3.5 w-3.5" />,
};

export function AdminsManager({ admins, currentUserId }: AdminsManagerProps) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("owner_support");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function addAdmin() {
    if (!newEmail.includes("@")) {
      setFeedback({ kind: "error", message: "Inserisci un email valida." });
      return;
    }

    setAddBusy(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/platform/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setFeedback({ kind: "error", message: payload?.error?.message || "Aggiunta non riuscita." });
        return;
      }

      setFeedback({ kind: "success", message: `${newEmail} aggiunto come ${ROLE_LABELS[newRole]}.` });
      setNewEmail("");
      router.refresh();
    } catch {
      setFeedback({ kind: "error", message: "Errore di rete." });
    } finally {
      setAddBusy(false);
    }
  }

  async function toggleActive(adminId: string) {
    setBusyId(adminId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/platform/admins/${adminId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle_active" }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setFeedback({ kind: "error", message: payload?.error?.message || "Operazione non riuscita." });
        return;
      }

      router.refresh();
    } catch {
      setFeedback({ kind: "error", message: "Errore di rete." });
    } finally {
      setBusyId(null);
    }
  }

  async function updateRole(adminId: string, role: string) {
    setBusyId(adminId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/platform/admins/${adminId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update_role", role }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setFeedback({ kind: "error", message: payload?.error?.message || "Operazione non riuscita." });
        return;
      }

      setFeedback({ kind: "success", message: `Ruolo aggiornato a ${ROLE_LABELS[role]}.` });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", message: "Errore di rete." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-[color:var(--border)] p-4">
        <p className="text-sm font-semibold">Aggiungi amministratore</p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@esempio.it"
            />
          </div>
          <div>
            <Label htmlFor="admin-role">Ruolo</Label>
            <select
              id="admin-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm"
            >
              <option value="owner_readonly">Sola lettura</option>
              <option value="owner_support">Supporto</option>
              <option value="owner_admin">Amministratore</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={addAdmin} disabled={addBusy} variant="outline">
              {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aggiungi
            </Button>
          </div>
        </div>
      </section>

      {feedback ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            feedback.kind === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)] text-left text-muted-foreground">
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Ruolo</th>
              <th className="px-3 py-2">Stato</th>
              <th className="px-3 py-2">Data creazione</th>
              <th className="px-3 py-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const isSelf = admin.auth_user_id === currentUserId;
              return (
                <tr key={admin.id} className="border-b border-[color:var(--border)]/60">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {ROLE_ICONS[admin.role]}
                      <span className="font-medium">{admin.email}</span>
                      {isSelf ? <span className="text-xs text-muted-foreground">(tu)</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {isSelf ? (
                      <span>{ROLE_LABELS[admin.role] || admin.role}</span>
                    ) : (
                      <select
                        value={admin.role}
                        onChange={(e) => updateRole(admin.id, e.target.value)}
                        disabled={busyId === admin.id}
                        className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs"
                      >
                        <option value="owner_readonly">Sola lettura</option>
                        <option value="owner_support">Supporto</option>
                        <option value="owner_admin">Amministratore</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        admin.is_active
                          ? "border border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border border-red-300 bg-red-50 text-red-800"
                      }`}
                    >
                      {admin.is_active ? "Attivo" : "Disattivato"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {new Date(admin.created_at).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-3 py-3">
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground">-</span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(admin.id)}
                        disabled={busyId === admin.id}
                      >
                        {busyId === admin.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : admin.is_active ? (
                          "Disattiva"
                        ) : (
                          "Riattiva"
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

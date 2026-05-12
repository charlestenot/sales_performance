"use client";

import { useEffect, useState } from "react";
import DataTable, { type ColumnDef } from "@/components/DataTable";

type Team = {
  id: number;
  name: string;
  sortOrder: number;
  archived: boolean;
};

export default function TeamsSection() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/teams");
    const j = await r.json();
    setTeams(j.teams);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(id: number, data: { name?: string }) {
    setErr(null);
    const res = await fetch(`/api/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json();
      setErr(j.error ?? "Update failed");
    }
    await load();
  }

  async function addTeam() {
    const name = window.prompt("New team name:");
    if (!name?.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTeam(team: Team) {
    // Build a unique "(copy)" name to avoid the unique constraint on Team.name.
    const existingNames = new Set((teams ?? []).map((t) => t.name));
    let name = `${team.name} (copy)`;
    let n = 2;
    while (existingNames.has(name)) {
      name = `${team.name} (copy ${n})`;
      n++;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Failed to duplicate");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(team: Team) {
    if (!confirm(`Delete team "${team.name}"? Members will be unassigned (their team becomes empty).`)) return;
    await fetch(`/api/teams/${team.id}`, { method: "DELETE" });
    await load();
  }

  async function reorder(ids: (number | string)[]) {
    await fetch("/api/teams/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(Number) }),
    });
    await load();
  }

  const columns: ColumnDef<Team>[] = [
    {
      key: "name",
      header: "Name",
      editable: "text",
      getValue: (t) => t.name,
      onSave: (t, v) => patch(t.id, { name: typeof v === "string" ? v : v == null ? "" : String(v) }),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Teams</h2>
        <button
          onClick={addTeam}
          disabled={busy}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add Team
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {teams === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <DataTable
          rows={teams}
          columns={columns}
          rowId={(t) => t.id}
          storageKey="settings-teams"
          onReorder={reorder}
          rowActions={(t) => (
            <div className="inline-flex items-center gap-3 whitespace-nowrap">
              <button
                onClick={() => duplicateTeam(t)}
                disabled={busy}
                className="text-xs text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-50"
              >
                Duplicate
              </button>
              <button
                onClick={() => deleteTeam(t)}
                className="text-xs text-zinc-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          )}
          emptyMessage="No teams yet. Click Add Team to create one."
        />
      )}
    </section>
  );
}

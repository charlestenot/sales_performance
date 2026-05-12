"use client";

import { useEffect, useState } from "react";
import DataTable, { type ColumnDef } from "@/components/DataTable";

type Role = {
  id: number;
  name: string;
  baseQuota: number;
  rampPct: number[];
  sortOrder: number;
  archived: boolean;
};

type RampUnit = "pct" | "usd";

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function RampPreview({ arr, unit }: { arr: number[]; unit: RampUnit }) {
  if (arr.length === 0) {
    return <span className="text-xs text-zinc-400">no ramp · 100% from M1</span>;
  }
  return (
    <div className="inline-flex flex-nowrap gap-1.5">
      {arr.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] whitespace-nowrap"
        >
          <span className="text-zinc-500">M{i + 1}</span>
          <span className="font-mono">
            {unit === "usd" ? fmtMoney(v) : `${Math.round(v * 100)}%`}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function RolesSection() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [unit, setUnit] = useState<RampUnit>("pct");
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  async function loadAll() {
    const [r, s] = await Promise.all([
      fetch("/api/roles").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setRoles(r.roles);
    setUnit(s.rampUnit ?? "pct");
  }
  useEffect(() => {
    loadAll();
  }, []);

  async function setUnitAndSave(next: RampUnit) {
    setUnit(next);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rampUnit: next }),
    });
  }

  async function patch(id: number, data: { name?: string; baseQuota?: number }) {
    await fetch(`/api/roles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await loadAll();
  }

  async function duplicate(role: Role) {
    const existingNames = new Set((roles ?? []).map((r) => r.name));
    let name = `${role.name} (copy)`;
    let n = 2;
    while (existingNames.has(name)) {
      name = `${role.name} (copy ${n})`;
      n++;
    }
    await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, baseQuota: role.baseQuota, rampPct: role.rampPct }),
    });
    await loadAll();
  }

  async function deleteRole(role: Role) {
    if (!confirm(`Delete role "${role.name}"? Historical entries will keep their snapshot.`)) return;
    await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    await loadAll();
  }

  async function reorder(ids: (number | string)[]) {
    await fetch("/api/roles/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(Number) }),
    });
    await loadAll();
  }

  const columns: ColumnDef<Role>[] = [
    {
      key: "name",
      header: "Name",
      editable: "text",
      getValue: (r) => r.name,
      onSave: (r, v) => patch(r.id, { name: typeof v === "string" ? v : v == null ? "" : String(v) }),
    },
    {
      key: "baseQuota",
      header: "Base Quota",
      align: "right",
      className: "font-mono",
      editable: "number",
      getValue: (r) => r.baseQuota,
      format: (v) => fmtMoney(Number(v) || 0),
      onSave: (r, v) => patch(r.id, { baseQuota: v == null ? 0 : Number(v) }),
    },
    {
      key: "ramp",
      header: "Ramp",
      sortable: false,
      render: (r) => <RampPreview arr={r.rampPct} unit={unit} />,
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Roles & Ramp</h2>
        <button
          onClick={() => setEditing("new")}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add Role
        </button>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">Ramp expressed in:</span>
        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden">
          {(["pct", "usd"] as RampUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnitAndSave(u)}
              className={`px-3 py-1 text-sm font-medium transition ${
                unit === u
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              {u === "pct" ? "% of base quota" : "$ amount"}
            </button>
          ))}
        </div>
      </div>

      {!roles ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <DataTable
          rows={roles}
          columns={columns}
          rowId={(r) => r.id}
          storageKey="settings-roles"
          onReorder={reorder}
          rowActions={(role) => (
            <div className="inline-flex items-center gap-3 whitespace-nowrap">
              <button
                onClick={() => setEditing(role)}
                className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Edit ramp
              </button>
              <button
                onClick={() => duplicate(role)}
                className="text-xs text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Duplicate
              </button>
              <button
                onClick={() => deleteRole(role)}
                className="text-xs text-zinc-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          )}
          emptyMessage="No roles yet."
        />
      )}

      {editing && (
        <RoleModal
          role={editing === "new" ? null : editing}
          unit={unit}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadAll();
          }}
        />
      )}
    </section>
  );
}

function RoleModal({
  role,
  unit,
  onClose,
  onSaved,
}: {
  role: Role | null;
  unit: RampUnit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [baseQuota, setBaseQuota] = useState(role ? String(role.baseQuota) : "");

  const initialRampStrings = (() => {
    if (!role) return unit === "pct" ? ["0", "25", "50", "75", "100"] : ["", "", "", "", ""];
    return role.rampPct.map((v) => (unit === "pct" ? String(Math.round(v * 100)) : String(Math.round(v))));
  })();
  const [ramp, setRamp] = useState<string[]>(initialRampStrings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRampAt(i: number, v: string) {
    const next = [...ramp];
    next[i] = v;
    setRamp(next);
  }
  function addMonth() {
    setRamp([...ramp, unit === "pct" ? "100" : ""]);
  }
  function removeMonth() {
    if (ramp.length === 0) return;
    setRamp(ramp.slice(0, -1));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const rampPct = ramp.map((v) => {
        if (v === "") return 0;
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return unit === "pct" ? n / 100 : n;
      });
      const body = JSON.stringify({ name, baseQuota: Number(baseQuota) || 0, rampPct });
      const res = await fetch(role ? `/api/roles/${role.id}` : "/api/roles", {
        method: role ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Failed");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRole() {
    if (!role) return;
    if (!confirm(`Delete role "${role.name}"? Historical entries will keep their snapshot.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  const suffix = unit === "pct" ? "%" : "$";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold">{role ? `Edit role: ${role.name}` : "Add role"}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Base Quota ($)</div>
            <input
              type="number"
              value={baseQuota}
              onChange={(e) => setBaseQuota(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
            />
          </label>
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-zinc-500">
                Ramp curve ({unit === "pct" ? "% of base quota" : "$ per month"} from arrival)
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={removeMonth}
                  disabled={ramp.length === 0}
                  className="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
                >
                  − month
                </button>
                <button
                  type="button"
                  onClick={addMonth}
                  className="text-xs px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  + month
                </button>
              </div>
            </div>
            {ramp.length === 0 ? (
              <p className="text-xs text-zinc-500">No ramp — fully ramped (100%) from M1.</p>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {ramp.map((v, i) => (
                  <label key={i} className="block">
                    <div className="text-[10px] text-zinc-500 mb-0.5">M{i + 1}</div>
                    <div className="relative">
                      <input
                        type="number"
                        value={v}
                        onChange={(e) => setRampAt(i, e.target.value)}
                        className={`w-full ${unit === "pct" ? "pr-5 pl-1.5" : "pl-4 pr-1.5"} py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-xs`}
                      />
                      <span
                        className={`absolute ${unit === "pct" ? "right-1.5" : "left-1.5"} top-1 text-[10px] text-zinc-400`}
                      >
                        {suffix}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-2">
              After the ramp ends, the rep is fully ramped (100% of base quota).
            </p>
          </div>

          {err && <div className="text-red-600">{err}</div>}

          <div className="flex justify-between items-center pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <div>
              {role && (
                <button
                  onClick={deleteRole}
                  disabled={busy}
                  className="px-3 py-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 text-sm"
                >
                  Delete role
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy || !name}
                className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

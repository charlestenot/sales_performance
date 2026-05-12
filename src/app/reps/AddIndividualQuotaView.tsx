"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { seniorityMonths, suggestedFromRamp, type RampUnit } from "@/lib/ramp";

type User = {
  id: number;
  ownerId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  terminated: boolean;
  currentRoleId: number | null;
  currentRoleName: string | null;
  managerId: number | null;
  managerName: string | null;
  teamId: number | null;
  teamName: string | null;
};

type Role = { id: number; name: string; baseQuota: number; rampPct: number[] };
type Team = { id: number; name: string };

type ExistingEntry = {
  monthlyId: number;
  month: string;
  roleId: number | null;
  roleName: string | null;
  baseQuota: number | null;
  teamId: number | null;
  teamName: string | null;
  manager: string | null;
  quota: number | null;
  frupPct: number | null;
};

type Draft = {
  month: string; // YYYY-MM
  monthlyId: number | null; // existing entry id, null for new
  roleId: number | null;
  manager: string;
  teamId: number | null;
  quota: string; // editable as text so empty stays empty
  frup: string;
  // Suggested values (read-only, from ramp computation)
  suggestedQuota: number | null;
  suggestedFrupPct: number | null;
  // Local dirty flag — true if something differs from what's in the DB
  dirty: boolean;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymKey(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
function fmtMonthLong(s: string) {
  const [y, m] = s.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function UserPicker({
  users,
  value,
  onChange,
}: {
  users: User[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => users.find((u) => u.id === value) ?? null, [users, value]);

  // Reflect external value changes into the displayed query.
  useEffect(() => {
    setQuery(selected ? selected.name : "");
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && q === selected.name.toLowerCase())) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.ownerId.includes(q));
  }, [users, query, selected]);

  function pick(u: User) {
    onChange(u.id);
    setQuery(u.name);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-2">
      <span className="text-zinc-500">User:</span>
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const u = filtered[activeIdx];
              if (u) pick(u);
            }
          }}
          placeholder="search user…"
          className="px-2 py-1 pr-7 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm w-56 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery("");
              onChange(null);
              inputRef.current?.focus();
              setOpen(true);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm leading-none"
            title="Clear"
          >
            ×
          </button>
        )}
        {open && (
          <div className="absolute left-0 top-full mt-1 z-30 w-72 max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-zinc-400">No users match.</div>
            ) : (
              filtered.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(u);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`flex items-center justify-between w-full px-3 py-1.5 text-left ${
                    i === activeIdx ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  } ${u.id === value ? "font-medium" : ""}`}
                >
                  <span>
                    {u.name}
                    {u.terminated ? (
                      <span className="ml-2 text-[10px] text-zinc-400">terminated</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">{u.ownerId}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function buildMonthSequence(start: Date, today: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  while (cur <= end) {
    out.push(ymKey(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export default function AddIndividualQuotaView({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rampUnit, setRampUnit] = useState<RampUnit>("pct");
  const [selectedRepId, setSelectedRepId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/roles").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([u, r, t, s]) => {
      setUsers(u.users);
      setRoles(r.roles);
      setTeams(t.teams);
      setRampUnit(s.rampUnit ?? "pct");
    });
  }, []);

  const rep = useMemo(
    () => users.find((u) => u.id === selectedRepId) ?? null,
    [users, selectedRepId]
  );

  // Build the month grid every time the rep changes.
  useEffect(() => {
    if (!rep || !rep.startDate) {
      setDrafts([]);
      return;
    }
    (async () => {
      const start = new Date(rep.startDate!);
      const today = new Date();
      const months = buildMonthSequence(start, today);
      const histRes = await fetch(`/api/reps?repId=${rep.id}`);
      const histJ = await histRes.json();
      const existing: ExistingEntry[] = histJ.rows.map((r: ExistingEntry) => r);
      // Index existing entries by month — if a month has multiple entries,
      // pick the first (user can manage multi-entry months on the main grid).
      const byMonth = new Map<string, ExistingEntry>();
      for (const e of existing) {
        const k = e.month.slice(0, 7);
        if (!byMonth.has(k)) byMonth.set(k, e);
      }
      const next: Draft[] = months.map((m) => {
        const e = byMonth.get(m) ?? null;
        return {
          month: m,
          monthlyId: e?.monthlyId ?? null,
          roleId: e?.roleId ?? rep.currentRoleId ?? null,
          manager: e?.manager ?? rep.managerName ?? "",
          teamId: e?.teamId ?? rep.teamId ?? null,
          quota: e?.quota != null ? String(Math.round(e.quota)) : "",
          frup: e?.frupPct != null ? String(Math.round(e.frupPct * 100)) : "",
          suggestedQuota: null,
          suggestedFrupPct: null,
          dirty: false,
        };
      });
      setDrafts(next);
      setError(null);
    })();
  }, [rep]);

  function generate() {
    if (!rep) {
      setError("Pick a user first.");
      return;
    }
    if (!rep.startDate) {
      setError("This user has no Start Date set. Add it in Settings → Users.");
      return;
    }
    if (rep.currentRoleId == null) {
      setError("This user has no current Role assigned. Set it in Settings → Users.");
      return;
    }
    setError(null);
    const start = new Date(rep.startDate);
    setDrafts((prev) =>
      prev.map((d) => {
        // Use the row's role if it has one, fallback to current role.
        const roleId = d.roleId ?? rep.currentRoleId;
        const role = roles.find((r) => r.id === roleId);
        if (!role) return { ...d, suggestedQuota: null, suggestedFrupPct: null };
        const monthDate = new Date(Date.UTC(Number(d.month.slice(0, 4)), Number(d.month.slice(5, 7)) - 1, 1));
        const seniority = seniorityMonths(start, monthDate);
        const sug = suggestedFromRamp({
          baseQuota: role.baseQuota,
          ramp: role.rampPct,
          unit: rampUnit,
          seniority,
        });
        return {
          ...d,
          suggestedQuota: Math.round(sug.quota),
          suggestedFrupPct: sug.frupPct,
        };
      })
    );
  }

  function applySuggestion(idx: number) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== idx) return d;
        if (d.suggestedQuota == null) return d;
        return {
          ...d,
          quota: String(d.suggestedQuota),
          frup:
            d.suggestedFrupPct != null
              ? String(Math.round(d.suggestedFrupPct * 100))
              : d.frup,
          dirty: true,
        };
      })
    );
  }

  function applySuggestionToEmpty() {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.suggestedQuota == null) return d;
        if (d.quota !== "") return d; // safe path: skip rows that already have a value
        return {
          ...d,
          quota: String(d.suggestedQuota),
          frup:
            d.suggestedFrupPct != null
              ? String(Math.round(d.suggestedFrupPct * 100))
              : d.frup,
          dirty: true,
        };
      })
    );
  }

  function replaceAllWithSuggestion() {
    const replacing = drafts.filter(
      (d) => d.suggestedQuota != null && d.quota !== "" && d.quota !== String(d.suggestedQuota)
    ).length;
    if (
      replacing > 0 &&
      !confirm(
        `Overwrite ${replacing} existing value${replacing === 1 ? "" : "s"} with the suggested quota? Months where the recorded quota differs (e.g. role change) will be lost.`
      )
    )
      return;
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.suggestedQuota == null) return d;
        return {
          ...d,
          quota: String(d.suggestedQuota),
          frup:
            d.suggestedFrupPct != null
              ? String(Math.round(d.suggestedFrupPct * 100))
              : d.frup,
          dirty: true,
        };
      })
    );
  }

  function update(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch, dirty: true } : d))
    );
  }

  async function saveAll() {
    if (!rep) return;
    setSaving(true);
    setError(null);
    try {
      const dirty = drafts.filter((d) => d.dirty);
      for (const d of dirty) {
        const body: Record<string, unknown> = {
          month: d.month,
          roleId: d.roleId,
          teamId: d.teamId,
          manager: d.manager.trim() || null,
          quota: d.quota === "" ? null : Number(d.quota),
          frupPct: d.frup === "" ? null : Number(d.frup) / 100,
        };
        if (d.monthlyId) {
          await fetch(`/api/monthly/${d.monthlyId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } else {
          await fetch(`/api/reps/${rep.id}/monthly`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = drafts.filter((d) => d.dirty).length;
  const hasSuggestions = drafts.some((d) => d.suggestedQuota != null);
  const emptyCount = drafts.filter((d) => d.suggestedQuota != null && d.quota === "").length;

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Add Individual Quota</h1>
          <p className="text-sm text-zinc-500 mt-1">
            See and edit the full monthly history for one user, with role-based
            quota suggestions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="px-3 py-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving ? "Saving…" : `Save ${dirtyCount > 0 ? `(${dirtyCount})` : ""}`}
          </button>
        </div>
      </header>

      <section className="flex flex-wrap items-center gap-3 text-sm">
        <UserPicker
          users={users}
          value={selectedRepId}
          onChange={setSelectedRepId}
        />
        {rep && (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-500">
              Start:{" "}
              <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                {rep.startDate ? rep.startDate.slice(0, 10) : "—"}
              </span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-500">
              Current role:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {rep.currentRoleName ?? "—"}
              </span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-500">
              Team:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">
                {rep.teamName ?? "—"}
              </span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <button
              onClick={generate}
              className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Generate Quotas
            </button>
            {hasSuggestions && (
              <>
                <button
                  onClick={applySuggestionToEmpty}
                  disabled={emptyCount === 0}
                  title="Apply the suggestion only to months that don't have a quota recorded yet."
                  className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Fill empty months {emptyCount > 0 ? `(${emptyCount})` : ""}
                </button>
                <button
                  onClick={replaceAllWithSuggestion}
                  title="Overwrite every month with the suggested value, including months that already have a quota."
                  className="px-2.5 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Replace all…
                </button>
              </>
            )}
          </>
        )}
      </section>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!rep ? (
        <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
          Pick a user above to see their monthly history.
        </div>
      ) : !rep.startDate ? (
        <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
          This user has no Start Date — set one in Settings → Users to see their
          history.
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-sm text-zinc-500 py-12 text-center">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200/70 dark:border-zinc-800/70">
              <tr>
                <th className="text-left py-2 pr-4 font-medium">Month</th>
                <th className="text-left py-2 pr-4 font-medium">Role</th>
                <th className="text-left py-2 pr-4 font-medium">Manager</th>
                <th className="text-left py-2 pr-4 font-medium">Team</th>
                <th className="text-right py-2 pr-4 font-medium">Quota</th>
                <th className="text-right py-2 pr-4 font-medium">FRUP %</th>
                <th className="text-right py-2 pr-2 font-medium">Suggested</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d, i) => (
                <tr
                  key={d.month}
                  className={`border-b border-zinc-100/70 dark:border-zinc-800/40 last:border-0 ${
                    d.dirty ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                  }`}
                >
                  <td className="py-2 pr-4 whitespace-nowrap font-medium">
                    {fmtMonthLong(d.month)}
                    {d.monthlyId == null && (
                      <span className="ml-1.5 text-[10px] text-zinc-400 font-normal italic">new</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={d.roleId ?? ""}
                      onChange={(e) => update(i, { roleId: e.target.value === "" ? null : Number(e.target.value) })}
                      className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm w-full max-w-48"
                    >
                      <option value="">— none —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={d.manager}
                      onChange={(e) => update(i, { manager: e.target.value })}
                      className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-full max-w-40"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={d.teamId ?? ""}
                      onChange={(e) => update(i, { teamId: e.target.value === "" ? null : Number(e.target.value) })}
                      className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm w-full max-w-40"
                    >
                      <option value="">— none —</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      value={d.quota}
                      onChange={(e) => update(i, { quota: e.target.value })}
                      placeholder="—"
                      className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-28 text-right font-mono"
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      value={d.frup}
                      onChange={(e) => update(i, { frup: e.target.value })}
                      placeholder="—"
                      className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 w-20 text-right font-mono"
                    />
                  </td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">
                    {d.suggestedQuota != null ? (
                      <button
                        onClick={() => applySuggestion(i)}
                        title="Apply this suggested value"
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-mono text-xs"
                      >
                        {fmtMoney(d.suggestedQuota)}
                        <span aria-hidden>→</span>
                      </button>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

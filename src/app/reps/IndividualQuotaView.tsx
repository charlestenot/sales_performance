"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DataTable, { type ColumnDef } from "@/components/DataTable";
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

type DraftRow = {
  // Stable id for DataTable rowId — month is unique per row.
  month: string; // YYYY-MM
  monthlyId: number | null;
  roleId: number | null;
  teamId: number | null;
  manager: string;
  quota: number | null;
  frupPct: number | null; // stored as 0–1; rendered as 0–100
  suggestedQuota: number | null;
  suggestedFrupPct: number | null;
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
function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
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

export default function IndividualQuotaView() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rampUnit, setRampUnit] = useState<RampUnit>("pct");
  const [selectedRepId, setSelectedRepId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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

  // Build the month sequence whenever the rep changes.
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
      const existing: ExistingEntry[] = histJ.rows;
      const byMonth = new Map<string, ExistingEntry>();
      for (const e of existing) {
        const k = e.month.slice(0, 7);
        if (!byMonth.has(k)) byMonth.set(k, e);
      }
      const next: DraftRow[] = months.map((m) => {
        const e = byMonth.get(m) ?? null;
        return {
          month: m,
          monthlyId: e?.monthlyId ?? null,
          roleId: e?.roleId ?? rep.currentRoleId ?? null,
          teamId: e?.teamId ?? rep.teamId ?? null,
          manager: e?.manager?.trim() || rep.managerName || "",
          quota: e?.quota ?? null,
          frupPct: e?.frupPct ?? null,
          suggestedQuota: null,
          suggestedFrupPct: null,
          dirty: false,
        };
      });
      setDrafts(next);
      setError(null);
      setSavedAt(null);
    })();
  }, [rep]);

  function patchDraft(row: DraftRow, patch: Partial<DraftRow>) {
    setDrafts((prev) =>
      prev.map((d) => (d.month === row.month ? { ...d, ...patch, dirty: true } : d))
    );
  }

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
        const roleId = d.roleId ?? rep.currentRoleId;
        const role = roles.find((r) => r.id === roleId);
        if (!role) return { ...d, suggestedQuota: null, suggestedFrupPct: null };
        const monthDate = new Date(
          Date.UTC(Number(d.month.slice(0, 4)), Number(d.month.slice(5, 7)) - 1, 1)
        );
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

  function applyOne(row: DraftRow) {
    if (row.suggestedQuota == null) return;
    patchDraft(row, {
      quota: row.suggestedQuota,
      frupPct: row.suggestedFrupPct ?? row.frupPct,
    });
  }

  function fillEmpty() {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.suggestedQuota == null) return d;
        if (d.quota != null) return d;
        return {
          ...d,
          quota: d.suggestedQuota,
          frupPct: d.suggestedFrupPct ?? d.frupPct,
          dirty: true,
        };
      })
    );
  }
  function replaceAll() {
    const replacing = drafts.filter(
      (d) => d.suggestedQuota != null && d.quota != null && d.quota !== d.suggestedQuota
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
          quota: d.suggestedQuota,
          frupPct: d.suggestedFrupPct ?? d.frupPct,
          dirty: true,
        };
      })
    );
  }

  async function saveAll() {
    if (!rep) return;
    setSaving(true);
    setError(null);
    try {
      const dirty = drafts.filter((d) => d.dirty);
      for (const d of dirty) {
        const body = {
          month: d.month,
          roleId: d.roleId,
          teamId: d.teamId,
          manager: d.manager.trim() || null,
          quota: d.quota,
          frupPct: d.frupPct,
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
      setSavedAt(Date.now());
      // Re-pull to capture new monthlyIds + clear dirty flags.
      if (rep.startDate) {
        const start = new Date(rep.startDate);
        const today = new Date();
        const months = buildMonthSequence(start, today);
        const histRes = await fetch(`/api/reps?repId=${rep.id}`);
        const histJ = await histRes.json();
        const existing: ExistingEntry[] = histJ.rows;
        const byMonth = new Map<string, ExistingEntry>();
        for (const e of existing) {
          const k = e.month.slice(0, 7);
          if (!byMonth.has(k)) byMonth.set(k, e);
        }
        setDrafts((prev) =>
          months.map((m) => {
            const e = byMonth.get(m) ?? null;
            const old = prev.find((d) => d.month === m);
            return {
              month: m,
              monthlyId: e?.monthlyId ?? null,
              roleId: e?.roleId ?? rep.currentRoleId ?? null,
              teamId: e?.teamId ?? rep.teamId ?? null,
              manager: e?.manager?.trim() || rep.managerName || "",
              quota: e?.quota ?? null,
              frupPct: e?.frupPct ?? null,
              // Keep the previously computed suggestion visible after save.
              suggestedQuota: old?.suggestedQuota ?? null,
              suggestedFrupPct: old?.suggestedFrupPct ?? null,
              dirty: false,
            };
          })
        );
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = drafts.filter((d) => d.dirty).length;
  const hasSuggestions = drafts.some((d) => d.suggestedQuota != null);
  const emptyCount = drafts.filter((d) => d.suggestedQuota != null && d.quota == null).length;

  // ------ DataTable column definitions ------
  // Note: per-cell onSave updates local draft state (no API call). The user
  // commits the batch via the Save button at the top.
  const roleOptions = useMemo(
    () => roles.map((r) => ({ value: r.id, label: r.name })),
    [roles]
  );
  const teamOptions = useMemo(
    () => teams.map((t) => ({ value: t.id, label: t.name })),
    [teams]
  );
  // Manager picker options — every user (except the rep itself), label = name.
  const managerOptions = useMemo(
    () =>
      users
        .filter((u) => u.id !== selectedRepId)
        .map((u) => ({ value: u.id, label: u.name })),
    [users, selectedRepId]
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  // Reverse lookup: stored manager string (a name) → user id, so the Combobox
  // can highlight the current selection. Legacy free-text values that don't
  // match any user simply return null (cell still renders the raw string).
  const userIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of users) {
      const k = u.name.trim().toLowerCase();
      if (k && !m.has(k)) m.set(k, u.id);
    }
    return m;
  }, [users]);
  const roleNameOf = (id: number | null) =>
    id == null ? null : roles.find((r) => r.id === id)?.name ?? null;
  const teamNameOf = (id: number | null) =>
    id == null ? null : teams.find((t) => t.id === id)?.name ?? null;

  const columns: ColumnDef<DraftRow>[] = [
    {
      key: "month",
      header: "Month",
      sortable: false,
      getValue: (d) => d.month,
      render: (d) => (
        <span className="whitespace-nowrap">
          {fmtMonthLong(d.month)}
          {d.monthlyId == null && (
            <span className="ml-1.5 text-[10px] text-zinc-400 italic">new</span>
          )}
        </span>
      ),
    },
    {
      key: "roleId",
      header: "Role",
      editable: "select",
      selectOptions: roleOptions,
      getValue: (d) => (d.roleId == null ? null : d.roleId),
      onSave: (row, v) => patchDraft(row, { roleId: v == null || v === "" ? null : Number(v) }),
      render: (d) => roleNameOf(d.roleId) ?? <span className="text-zinc-400">—</span>,
    },
    {
      key: "teamId",
      header: "Team",
      editable: "select",
      selectOptions: teamOptions,
      getValue: (d) => (d.teamId == null ? null : d.teamId),
      onSave: (row, v) => patchDraft(row, { teamId: v == null || v === "" ? null : Number(v) }),
      render: (d) => teamNameOf(d.teamId) ?? <span className="text-zinc-400">—</span>,
    },
    {
      key: "manager",
      header: "Manager",
      editable: "select",
      selectOptions: managerOptions,
      // Map the stored name string to a user id so the picker highlights it.
      getValue: (d) => {
        if (!d.manager) return null;
        return userIdByName.get(d.manager.trim().toLowerCase()) ?? null;
      },
      // Always store the manager's name (snapshot) — the DB column is text.
      onSave: (row, v) => {
        if (v == null || v === "") {
          patchDraft(row, { manager: "" });
          return;
        }
        const u = userById.get(Number(v));
        patchDraft(row, { manager: u?.name ?? "" });
      },
      render: (d) =>
        d.manager ? (
          <span>{d.manager}</span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
      sortAccessor: (d) => d.manager.toLowerCase(),
    },
    {
      key: "quota",
      header: "Quota",
      align: "right",
      editable: "number",
      getValue: (d) => d.quota,
      format: (v) => fmtMoney(v as number | null),
      onSave: (row, v) =>
        patchDraft(row, { quota: v == null || v === "" ? null : Number(v) }),
    },
    {
      key: "frupPct",
      header: "FRUP %",
      align: "right",
      editable: "number",
      getValue: (d) => (d.frupPct == null ? null : Math.round(d.frupPct * 100)),
      format: (v) => (v == null ? "—" : `${v}%`),
      onSave: (row, v) =>
        patchDraft(row, {
          frupPct: v == null || v === "" ? null : Number(v) / 100,
        }),
    },
    {
      key: "suggested",
      header: "Suggested",
      align: "right",
      sortable: false,
      render: (d) => {
        if (d.suggestedQuota == null)
          return <span className="text-zinc-300 dark:text-zinc-700">—</span>;
        const same = d.quota === d.suggestedQuota;
        return (
          <button
            onClick={() => applyOne(d)}
            disabled={same}
            title={same ? "Already matches" : "Apply this suggestion to Quota"}
            className={`inline-flex items-center gap-1 font-mono text-xs ${
              same
                ? "text-zinc-300 dark:text-zinc-700 cursor-default"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {fmtMoney(d.suggestedQuota)}
            {!same && <span aria-hidden>→</span>}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <UserPicker users={users} value={selectedRepId} onChange={setSelectedRepId} />
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
              <span className="text-zinc-900 dark:text-zinc-100">{rep.currentRoleName ?? "—"}</span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <span className="text-zinc-500">
              Team:{" "}
              <span className="text-zinc-900 dark:text-zinc-100">{rep.teamName ?? "—"}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              {savedAt && dirtyCount === 0 && <span className="text-xs text-emerald-600">Saved</span>}
              <button
                onClick={generate}
                className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Generate Quotas
              </button>
              {hasSuggestions && (
                <>
                  <button
                    onClick={fillEmpty}
                    disabled={emptyCount === 0}
                    title="Apply the suggestion only to months that don't have a quota recorded yet."
                    className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Fill empty months {emptyCount > 0 ? `(${emptyCount})` : ""}
                  </button>
                  <button
                    onClick={replaceAll}
                    title="Overwrite every month with the suggested value."
                    className="px-2.5 py-1 rounded-md text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Replace all…
                  </button>
                </>
              )}
              <button
                onClick={saveAll}
                disabled={saving || dirtyCount === 0}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {saving ? "Saving…" : `Save${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {!rep ? (
        <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
          Pick a user above to see their monthly history.
        </div>
      ) : !rep.startDate ? (
        <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
          This user has no Start Date — set one in Settings → Users to see their history.
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-sm text-zinc-500 py-12 text-center">Loading…</div>
      ) : (
        <DataTable
          rows={drafts}
          columns={columns}
          rowId={(d) => d.month}
          rowClassName={(d) => (d.dirty ? "bg-amber-50/40 dark:bg-amber-950/20" : "")}
          storageKey={`indiv-quota-rep-${rep.id}`}
          emptyMessage="No months for this user."
        />
      )}
    </div>
  );
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
                    {u.terminated ? <span className="ml-2 text-[10px] text-zinc-400">terminated</span> : null}
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

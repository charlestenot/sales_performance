"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type Role = { id: number; name: string; baseQuota: number; rampPct: number[] };

type Draft = {
  repId: number;
  repName: string;
  ownerId: string;
  startDate: string | null;
  roleId: number | null;
  roleName: string | null;
  manager: string;
  quota: string;
  frup: string;
  /** Marked false means the user removed this row from the batch. */
  included: boolean;
  /** True when this row already has a saved RepMonthly entry for the month —
   * saving will UPDATE it rather than create a new row. */
  existing: boolean;
  /** Existing entry id (when existing=true) — informational only. */
  monthlyId: number | null;
};

function currentMonthInput() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthInputToDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}
function fmtMonth(s: string) {
  const [y, m] = s.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function lastDayOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function isActiveForMonth(u: User, month: Date): boolean {
  if (!u.startDate) return false;
  const start = new Date(u.startDate);
  const monthEnd = lastDayOfMonthUTC(month);
  if (start > monthEnd) return false;
  // Rep must be employed through the END of the month to get a full-month
  // quota row. Mid-month departures are excluded from the bulk flow — if you
  // really want a quota for a partial month, use "Add another rep" below.
  if (u.endDate) {
    const end = new Date(u.endDate);
    if (end < monthEnd) return false;
  }
  return true;
}

export default function AddMonthlyQuotasView({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [month, setMonth] = useState(currentMonthInput());
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rampUnit, setRampUnit] = useState<RampUnit>("pct");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [u, r, s] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/roles").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      setUsers(u.users);
      setRoles(r.roles);
      setRampUnit(s.rampUnit ?? "pct");
    })();
  }, []);

  const monthDate = useMemo(() => monthInputToDate(month), [month]);

  // (Re)build drafts whenever month / users / roles / unit change.
  // For each active rep, we either pre-fill from an EXISTING RepMonthly entry
  // (so re-opening this dialog for a month already populated shows the saved
  // values, not a fresh ramp guess) OR compute a suggestion from the role's
  // ramp curve. Save UPSERTs, so editing existing rows is non-destructive.
  useEffect(() => {
    if (!monthDate || users.length === 0) return;
    (async () => {
      let existingByRep = new Map<
        number,
        { monthlyId: number; roleId: number | null; manager: string | null; quota: number | null; frupPct: number | null }
      >();
      try {
        const res = await fetch(`/api/reps?month=${month}`);
        if (res.ok) {
          const j = await res.json();
          for (const r of j.rows ?? []) {
            if (!existingByRep.has(r.repId)) {
              existingByRep.set(r.repId, {
                monthlyId: r.monthlyId,
                roleId: r.roleId ?? null,
                manager: r.manager ?? null,
                quota: r.quota ?? null,
                frupPct: r.frupPct ?? null,
              });
            }
          }
        }
      } catch {
        existingByRep = new Map();
      }

      const eligible = users.filter((u) => isActiveForMonth(u, monthDate));
      const next: Draft[] = eligible.map((u) => {
        const ex = existingByRep.get(u.id) ?? null;
        const roleId = ex?.roleId ?? u.currentRoleId ?? null;
        const role = roles.find((r) => r.id === roleId) ?? null;
        const seniority = u.startDate ? seniorityMonths(new Date(u.startDate), monthDate) : -1;

        let quotaStr = "";
        let frupStr = "";
        if (ex) {
          // Use the saved values — they're the source of truth for this month.
          quotaStr = ex.quota == null ? "" : String(Math.round(ex.quota));
          frupStr = ex.frupPct == null ? "" : String(Math.round(ex.frupPct * 100));
        } else if (role) {
          // No saved entry yet — compute a fresh suggestion from the ramp.
          const sug = suggestedFromRamp({
            baseQuota: role.baseQuota,
            ramp: role.rampPct,
            unit: rampUnit,
            seniority,
          });
          quotaStr = String(Math.round(sug.quota));
          frupStr = String(Math.round(sug.frupPct * 100));
        }
        return {
          repId: u.id,
          repName: u.name,
          ownerId: u.ownerId,
          startDate: u.startDate,
          roleId,
          roleName: role?.name ?? u.currentRoleName ?? null,
          manager: ex?.manager ?? u.managerName ?? "",
          quota: quotaStr,
          frup: frupStr,
          included: true,
          existing: ex != null,
          monthlyId: ex?.monthlyId ?? null,
        };
      });
      setDrafts(next);
    })();
  }, [monthDate, month, users, roles, rampUnit]);

  function update(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function addRowForRep(repId: number) {
    const u = users.find((x) => x.id === repId);
    if (!u || !monthDate) return;
    if (drafts.some((d) => d.repId === repId && d.included)) return;
    const role = roles.find((r) => r.id === u.currentRoleId) ?? null;
    const seniority = u.startDate ? seniorityMonths(new Date(u.startDate), monthDate) : -1;
    let quotaStr = "";
    let frupStr = "";
    if (role) {
      const sug = suggestedFromRamp({
        baseQuota: role.baseQuota,
        ramp: role.rampPct,
        unit: rampUnit,
        seniority,
      });
      quotaStr = String(Math.round(sug.quota));
      frupStr = String(Math.round(sug.frupPct * 100));
    }
    setDrafts((prev) => [
      ...prev,
      {
        repId: u.id,
        repName: u.name,
        ownerId: u.ownerId,
        startDate: u.startDate,
        roleId: u.currentRoleId ?? null,
        roleName: u.currentRoleName ?? role?.name ?? null,
        manager: u.managerName ?? "",
        quota: quotaStr,
        frup: frupStr,
        included: true,
        existing: false,
        monthlyId: null,
      },
    ]);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const entries = drafts
        .filter((d) => d.included)
        .map((d) => ({
          repId: d.repId,
          roleId: d.roleId,
          manager: d.manager.trim() || null,
          quota: d.quota === "" ? null : Number(d.quota),
          frupPct: d.frup === "" ? null : Number(d.frup) / 100,
        }));
      if (entries.length === 0) {
        setErr("Nothing to save — all rows are removed or empty.");
        return;
      }
      const res = await fetch("/api/reps/monthly/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, entries }),
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

  const includedCount = drafts.filter((d) => d.included).length;
  const repsNotIncluded = useMemo(() => {
    const present = new Set(drafts.filter((d) => d.included).map((d) => d.repId));
    return users.filter((u) => !present.has(u.id) && !u.terminated);
  }, [users, drafts]);

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Add Monthly Quotas</h1>
          <p className="text-sm text-zinc-500 mt-1">
            One row per active rep for the selected month. Reps with an
            existing quota show their saved values (badged <em>existing</em>);
            the rest get a ramp-based suggestion. Save upserts — re-running for
            the same month is safe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || includedCount === 0}
            className="px-3 py-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Saving…" : `Save ${includedCount} ${includedCount === 1 ? "Quota" : "Quotas"}`}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <span className="text-zinc-500">Month:</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-900"
          />
          <span className="text-zinc-500">({fmtMonth(month)})</span>
        </label>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-500">{includedCount} included</span>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className="text-left py-2 pr-4 font-medium">Rep</th>
            <th className="text-left py-2 pr-4 font-medium">Role</th>
            <th className="text-left py-2 pr-4 font-medium">Manager</th>
            <th className="text-left py-2 pr-4 font-medium">Seniority</th>
            <th className="text-right py-2 pr-4 font-medium">Quota</th>
            <th className="text-right py-2 pr-4 font-medium">FRUP %</th>
            <th className="text-right py-2 font-medium w-20"></th>
          </tr>
        </thead>
        <tbody>
          {drafts.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-8 text-center text-zinc-500">
                No active reps for {fmtMonth(month)}. Add one below.
              </td>
            </tr>
          ) : (
            drafts.map((d, i) => {
              if (!d.included) return null;
              const sen = monthDate && d.startDate ? seniorityMonths(new Date(d.startDate), monthDate) : -1;
              return (
                <tr key={`${d.repId}-${i}`} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium flex items-center gap-1.5">
                      {d.repName}
                      {d.existing && (
                        <span
                          title="An entry already exists for this month — saving will update it."
                          className="text-[9.5px] uppercase tracking-wide px-1.5 py-px rounded bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        >
                          existing
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">{d.ownerId}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      value={d.roleId ?? ""}
                      onChange={(e) => {
                        const rid = e.target.value === "" ? null : Number(e.target.value);
                        const role = roles.find((r) => r.id === rid) ?? null;
                        let quota = d.quota;
                        let frup = d.frup;
                        if (role && monthDate && d.startDate) {
                          const sug = suggestedFromRamp({
                            baseQuota: role.baseQuota,
                            ramp: role.rampPct,
                            unit: rampUnit,
                            seniority: seniorityMonths(new Date(d.startDate), monthDate),
                          });
                          quota = String(Math.round(sug.quota));
                          frup = String(Math.round(sug.frupPct * 100));
                        }
                        update(i, { roleId: rid, roleName: role?.name ?? null, quota, frup });
                      }}
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    >
                      <option value="">— none —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={d.manager}
                      onChange={(e) => update(i, { manager: e.target.value })}
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-full"
                    />
                  </td>
                  <td className="py-2 pr-4 text-zinc-500">
                    {sen >= 0 ? `M${sen + 1}` : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      value={d.quota}
                      onChange={(e) => update(i, { quota: e.target.value })}
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-28 text-right font-mono"
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <input
                      type="number"
                      value={d.frup}
                      onChange={(e) => update(i, { frup: e.target.value })}
                      placeholder="0–100"
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 w-20 text-right font-mono"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => update(i, { included: false })}
                      className="text-xs text-zinc-500 hover:text-red-600"
                      title="Remove from this batch"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {repsNotIncluded.length > 0 && (
        <div className="pt-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Add another rep:</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value === "") return;
                addRowForRep(Number(e.target.value));
                e.target.value = "";
              }}
              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <option value="">— pick a rep —</option>
              {repsNotIncluded.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {!u.startDate ? " (no start date)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

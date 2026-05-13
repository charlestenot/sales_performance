"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MultiSelect from "@/components/MultiSelect";
import DateRangePicker, { defaultRange, type DateRange } from "@/components/DateRangePicker";
import DealsDrilldownModal, { type DrillDownContext } from "./DealsDrilldownModal";

type Month = {
  month: string;
  quota: number;
  actual: number;
  quotaCount: number;
  dealCount: number;
  yearlyActual: number;
  yearlyDealCount: number;
};
type UserMonth = { month: string; quota: number; actual: number };
type UserBreakdown = {
  id: number;
  name: string;
  ownerId: string;
  months: UserMonth[];
  totals: { quota: number; actual: number };
};
type DimensionBucketRow = {
  id: number | "__unassigned__";
  name: string;
  months: { month: string; actual: number; quota: number }[];
  totals: { actual: number; quota: number };
};
type DimensionBreakdown = {
  dimensionId: number;
  name: string;
  attribute: string;
  quotasAvailable: boolean;
  buckets: DimensionBucketRow[];
};
type DimensionLookup = { id: number; name: string; attribute: string };
type Resp = {
  months: Month[];
  totals: {
    quota: number;
    actual: number;
    quotaCount: number;
    dealCount: number;
    yearlyActual: number;
    yearlyDealCount: number;
  };
  byUser: UserBreakdown[];
  byDimension: DimensionBreakdown | null;
};
type Lookup = { id: number; name: string };
type ViewMode = "global" | "individual" | "team" | "custom";

function fmtMoneyFull(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtAge(ts: number, now: number) {
  const diff = Math.max(0, now - ts);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m}m ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h}h ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return `${d}d ago`;
}
function fmtPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}
function fmtMonthShort(s: string) {
  const [y, m] = s.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export default function PerformanceClient({ mode }: { mode: ViewMode }) {
  // `mode` is fixed by the route — tabs were replaced by sidebar nav entries
  // (one route per mode). The internal viewMode state is gone; the only
  // mode-specific UI left in this component is the dimension picker for
  // Custom, the chart for Global, etc.
  const viewMode = mode;
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [teams, setTeams] = useState<(string | number)[]>([]);
  const [roles, setRoles] = useState<(string | number)[]>([]);
  const [users, setUsers] = useState<(string | number)[]>([]);

  const [teamsList, setTeamsList] = useState<Lookup[]>([]);
  const [rolesList, setRolesList] = useState<Lookup[]>([]);
  const [usersList, setUsersList] = useState<Lookup[]>([]);

  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dimensionsList, setDimensionsList] = useState<DimensionLookup[]>([]);
  const [dimensionId, setDimensionId] = useState<number | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownContext | null>(null);

  // Tick once a minute so the "X ago" label stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/roles").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/dimensions").then((r) => r.json()),
    ]).then(([t, r, u, d]) => {
      setTeamsList(t.teams);
      setRolesList(r.roles);
      setUsersList(u.users);
      setDimensionsList(
        (d.dimensions ?? []).map((dim: { id: number; name: string; attribute: string }) => ({
          id: dim.id,
          name: dim.name,
          attribute: dim.attribute,
        }))
      );
      if ((d.dimensions ?? []).length > 0 && !dimensionId) {
        setDimensionId(d.dimensions[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the canonical cache key from the active filter state.
  const cacheKey = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    [...teams].sort().forEach((t) => p.append("teams", String(t)));
    [...roles].sort().forEach((r) => p.append("roles", String(r)));
    [...users].sort().forEach((u) => p.append("users", String(u)));
    // Team view uses a synthetic dimension token; Custom uses the saved id.
    const dimToken =
      viewMode === "team"
        ? "__team__"
        : viewMode === "custom" && dimensionId
        ? String(dimensionId)
        : null;
    if (dimToken) p.set("dimension", dimToken);
    // Bump this version any time the response shape changes OR you want to
    // force-invalidate every user's cache (e.g. after a bulk data alignment).
    return `perf:v3:${p.toString()}`;
  }, [range, teams, roles, users, viewMode, dimensionId]);

  const fetchData = useCallback(
    async (force: boolean) => {
      if (!force && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { data: Resp; fetchedAt: number };
            setData(parsed.data);
            setFetchedAt(parsed.fetchedAt);
            return;
          }
        } catch {}
      }
      const params = new URLSearchParams();
      params.set("from", range.from);
      params.set("to", range.to);
      teams.forEach((t) => params.append("teams", String(t)));
      roles.forEach((r) => params.append("roles", String(r)));
      users.forEach((u) => params.append("users", String(u)));
      const dimTokenFetch =
        viewMode === "team"
          ? "__team__"
          : viewMode === "custom" && dimensionId
          ? String(dimensionId)
          : null;
      if (dimTokenFetch) params.set("dimension", dimTokenFetch);
      setLoading(true);
      try {
        const res = await fetch(`/api/performance/quotas?${params}`);
        const j: Resp = await res.json();
        setData(j);
        const ts = Date.now();
        setFetchedAt(ts);
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify({ data: j, fetchedAt: ts }));
        } catch {}
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, range, teams, roles, users, viewMode, dimensionId]
  );

  // Hydrate from cache on cache-key change; auto-fetch if no cache yet.
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const teamOptions = useMemo(() => teamsList.map((t) => ({ value: t.id, label: t.name })), [teamsList]);
  const roleOptions = useMemo(() => rolesList.map((r) => ({ value: r.id, label: r.name })), [rolesList]);
  const userOptions = useMemo(() => usersList.map((u) => ({ value: u.id, label: u.name })), [usersList]);
  const anyFilter = teams.length || roles.length || users.length;

  const totalAttainment = data && data.totals.quota > 0 ? data.totals.actual / data.totals.quota : null;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {viewMode === "global"
              ? "Global Performance"
              : viewMode === "individual"
              ? "Individual Performance"
              : viewMode === "team"
              ? "Team Performance"
              : "Custom Performance"}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {viewMode === "global"
              ? "Monthly quotas vs. actuals (closed-won MRR by close date)."
              : viewMode === "individual"
              ? "One row per rep — quotas, actuals, and attainment per month."
              : viewMode === "team"
              ? "One row per team — quotas, actuals, and attainment per month."
              : "Pick a saved dimension to slice quotas and actuals."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {fetchedAt ? <>Last refreshed {fmtAge(fetchedAt, now)}</> : loading ? "Loading…" : "—"}
          </span>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <MultiSelect label="Team" options={teamOptions} selected={teams} onChange={setTeams} />
        <MultiSelect label="Role" options={roleOptions} selected={roles} onChange={setRoles} />
        <MultiSelect label="User" options={userOptions} selected={users} onChange={setUsers} />
        {anyFilter ? (
          <button
            onClick={() => {
              setTeams([]);
              setRoles([]);
              setUsers([]);
            }}
            className="ml-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {viewMode !== "individual" && (
        <section className="grid grid-cols-3 gap-4 max-w-2xl">
          <Card label="Total Quota" value={data ? fmtMoneyFull(data.totals.quota) : "—"} />
          <Card label="Total Actual" value={data ? fmtMoneyFull(data.totals.actual) : "—"} />
          <Card label="Attainment" value={data ? fmtPct(totalAttainment) : "—"} />
        </section>
      )}

      {viewMode === "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Dimension:</span>
          {dimensionsList.length > 0 ? (
            <select
              value={dimensionId ?? ""}
              onChange={(e) => setDimensionId(e.target.value ? Number(e.target.value) : null)}
              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {dimensionsList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.attribute})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-zinc-400">
              No dimensions yet — create one in Settings → Dimensions.
            </span>
          )}
        </div>
      )}

      <section>
        {loading && !data ? (
          <div className="text-sm text-zinc-500">Loading…</div>
        ) : data && data.months.length > 0 ? (
          viewMode === "global" ? (
            <div className="space-y-5">
              <QuotaActualChart
                months={data.months}
                onMonthClick={(month) =>
                  setDrillDown({ month, range, teams, roles, users })
                }
              />
              <PerfTable
                months={data.months}
                totalQuota={data.totals.quota}
                totalActual={data.totals.actual}
                totalDealCount={data.totals.dealCount}
                totalYearlyDealCount={data.totals.yearlyDealCount}
                totalYearlyActual={data.totals.yearlyActual}
                onDrillMonth={(month) =>
                  setDrillDown({
                    month,
                    range,
                    teams,
                    roles,
                    users,
                  })
                }
              />
            </div>
          ) : viewMode === "individual" ? (
            <ByUserTable
              months={data.months}
              byUser={data.byUser}
              onDrillMonth={(month, user) =>
                setDrillDown({
                  month,
                  range,
                  teams,
                  roles,
                  users,
                  userId: user.id,
                  userName: user.name,
                })
              }
            />
          ) : viewMode === "team" ? (
            data.byDimension ? (
              <ByDimensionTable
                months={data.months}
                dim={data.byDimension}
                onDrillMonth={(month, bucket) =>
                  setDrillDown({
                    month,
                    range,
                    teams,
                    roles,
                    users,
                    // For the synthetic Team view we pass the bucketId (which IS
                    // a real Team id) up to the drilldown — DealsDrilldownModal
                    // filters deals by the team's member ownerIds.
                    dimensionId: data.byDimension!.dimensionId,
                    bucketId: bucket.id,
                    bucketLabel: bucket.name,
                  })
                }
              />
            ) : (
              <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
                No teams configured. Add teams in Settings → Teams.
              </div>
            )
          ) : data.byDimension ? (
            <ByDimensionTable
              months={data.months}
              dim={data.byDimension}
              onDrillMonth={(month, bucket) =>
                setDrillDown({
                  month,
                  range,
                  teams,
                  roles,
                  users,
                  dimensionId: data.byDimension!.dimensionId,
                  bucketId: bucket.id,
                  bucketLabel: bucket.name,
                })
              }
            />
          ) : (
            <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
              Pick a dimension above.
            </div>
          )
        ) : (
          <div className="text-sm text-zinc-500 py-12 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-md">
            No data for this selection.
          </div>
        )}
      </section>

      {drillDown && <DealsDrilldownModal ctx={drillDown} onClose={() => setDrillDown(null)} />}
    </div>
  );
}

function QuotaActualChart({
  months,
  onMonthClick,
}: {
  months: Month[];
  onMonthClick?: (month: string) => void;
}) {
  if (months.length === 0) return null;
  // The y-axis spans the larger of (max quota, max actual) so both series
  // share a comparable scale. Guard against zero to avoid /0 in heights.
  const maxVal = Math.max(
    1,
    ...months.map((m) => m.quota),
    ...months.map((m) => m.actual)
  );
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Quota vs Actual
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-300 dark:bg-zinc-700" />
            Quota
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-zinc-900 dark:bg-zinc-100" />
            Actual
          </span>
        </div>
      </div>
      <div className="flex items-stretch gap-1.5" style={{ height: 180 }}>
        {months.map((m) => {
          const att = m.quota > 0 ? m.actual / m.quota : null;
          const qH = (m.quota / maxVal) * 100;
          const aH = (m.actual / maxVal) * 100;
          const attClass =
            att == null
              ? "text-zinc-400"
              : att >= 1
              ? "text-emerald-600"
              : att >= 0.7
              ? "text-amber-600"
              : "text-red-600";
          return (
            <button
              key={m.month}
              type="button"
              onClick={() => onMonthClick?.(m.month)}
              title={`${fmtMonthShort(m.month)}
Quota: ${fmtMoneyFull(m.quota)}
Actual: ${fmtMoneyFull(m.actual)}
Attainment: ${fmtPct(att)}`}
              className="group flex-1 min-w-0 flex flex-col items-stretch cursor-pointer"
            >
              <div
                className={`text-[10px] font-mono text-center tabular-nums ${attClass}`}
                style={{ minHeight: 14 }}
              >
                {fmtPct(att)}
              </div>
              <div className="flex-1 flex items-end justify-center gap-0.5 mt-1">
                <div
                  className="w-1/2 rounded-sm bg-zinc-300 dark:bg-zinc-700 transition group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600"
                  style={{ height: `${qH}%` }}
                />
                <div
                  className="w-1/2 rounded-sm bg-zinc-900 dark:bg-zinc-100 transition group-hover:bg-zinc-700 dark:group-hover:bg-zinc-300"
                  style={{ height: `${aH}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-500 text-center mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                {fmtMonthShort(m.month)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PerfTable({
  months,
  totalQuota,
  totalActual,
  totalDealCount,
  totalYearlyDealCount,
  totalYearlyActual,
  onDrillMonth,
}: {
  months: Month[];
  totalQuota: number;
  totalActual: number;
  totalDealCount: number;
  totalYearlyDealCount: number;
  totalYearlyActual: number;
  onDrillMonth?: (month: string) => void;
}) {
  const totalAttainment = totalQuota > 0 ? totalActual / totalQuota : null;
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
              Metric
            </th>
            {months.map((m) => (
              <th key={m.month} className="text-right py-2 px-3 font-medium whitespace-nowrap">
                {fmtMonthShort(m.month)}
              </th>
            ))}
            <th className="text-right py-2 pl-4 pr-2 font-medium whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 font-medium">Quotas</td>
            {months.map((m) => (
              <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap">
                {m.quota > 0 ? fmtMoneyFull(m.quota) : <span className="text-zinc-400">—</span>}
              </td>
            ))}
            <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
              {fmtMoneyFull(totalQuota)}
            </td>
          </tr>
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 font-medium">Actuals</td>
            {months.map((m) => {
              const clickable = onDrillMonth && m.actual > 0;
              return (
                <td
                  key={m.month}
                  onClick={clickable ? () => onDrillMonth(m.month) : undefined}
                  className={`py-2 px-3 text-right font-mono whitespace-nowrap ${
                    clickable ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:underline decoration-dotted" : ""
                  }`}
                >
                  {m.actual > 0 ? fmtMoneyFull(m.actual) : <span className="text-zinc-400">—</span>}
                </td>
              );
            })}
            <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
              {fmtMoneyFull(totalActual)}
            </td>
          </tr>
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 font-medium text-zinc-500">
              Attainment
            </td>
            {months.map((m) => {
              const a = m.quota > 0 ? m.actual / m.quota : null;
              const cls =
                a == null
                  ? "text-zinc-400"
                  : a >= 1
                  ? "text-emerald-600"
                  : a >= 0.7
                  ? "text-amber-600"
                  : "text-red-600";
              return (
                <td key={m.month} className={`py-2 px-3 text-right font-mono whitespace-nowrap ${cls}`}>
                  {fmtPct(a)}
                </td>
              );
            })}
            <td
              className={`py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold ${
                totalAttainment == null
                  ? "text-zinc-400"
                  : totalAttainment >= 1
                  ? "text-emerald-600"
                  : totalAttainment >= 0.7
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {fmtPct(totalAttainment)}
            </td>
          </tr>
          {/* New: % Yearly Deals — share of closed-won DEALS that have commitment
              in (Yearly, Multiyears). Denominator is total closed-won deals;
              deals with null commitment count in the denominator only. */}
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 font-medium text-zinc-500">
              % Yearly Deals
            </td>
            {months.map((m) => {
              const r = m.dealCount > 0 ? m.yearlyDealCount / m.dealCount : null;
              return (
                <td
                  key={m.month}
                  className="py-2 px-3 text-right font-mono whitespace-nowrap text-zinc-600 dark:text-zinc-300"
                  title={
                    m.dealCount > 0
                      ? `${m.yearlyDealCount} of ${m.dealCount} deals are Yearly or Multiyears`
                      : undefined
                  }
                >
                  {fmtPct(r)}
                </td>
              );
            })}
            <td
              className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-200"
              title={`${totalYearlyDealCount} of ${totalDealCount} deals are Yearly or Multiyears`}
            >
              {fmtPct(totalDealCount > 0 ? totalYearlyDealCount / totalDealCount : null)}
            </td>
          </tr>
          {/* New: % Yearly ARR — share of MRR coming from Yearly/Multiyears
              deals. Same denominator logic as % Yearly Deals. */}
          <tr>
            <td className="py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 font-medium text-zinc-500">
              % Yearly ARR
            </td>
            {months.map((m) => {
              const r = m.actual > 0 ? m.yearlyActual / m.actual : null;
              return (
                <td
                  key={m.month}
                  className="py-2 px-3 text-right font-mono whitespace-nowrap text-zinc-600 dark:text-zinc-300"
                  title={
                    m.actual > 0
                      ? `${fmtMoneyFull(m.yearlyActual)} of ${fmtMoneyFull(m.actual)} MRR is Yearly/Multiyears`
                      : undefined
                  }
                >
                  {fmtPct(r)}
                </td>
              );
            })}
            <td
              className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-700 dark:text-zinc-200"
              title={`${fmtMoneyFull(totalYearlyActual)} of ${fmtMoneyFull(totalActual)} MRR is Yearly/Multiyears`}
            >
              {fmtPct(totalActual > 0 ? totalYearlyActual / totalActual : null)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

type IndividualMetric = "actuals" | "quotas" | "attainment";

function ByUserTable({
  months,
  byUser,
  onDrillMonth,
}: {
  months: Month[];
  byUser: UserBreakdown[];
  onDrillMonth?: (month: string, user: { id: number; name: string }) => void;
}) {
  // Which metric rows to render per user. Persisted across page loads so
  // returning to Individual remembers your last choice. Guard against an
  // empty selection (always keep at least one).
  const STORAGE_KEY = "perf:byUser:metrics";
  const ALL: IndividualMetric[] = ["actuals", "quotas", "attainment"];
  const [visible, setVisible] = useState<Set<IndividualMetric>>(() => {
    if (typeof window === "undefined") return new Set(ALL);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as IndividualMetric[];
        const allowed = arr.filter((m) => ALL.includes(m));
        if (allowed.length > 0) return new Set(allowed);
      }
    } catch {}
    return new Set(ALL);
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...visible]));
    } catch {}
  }, [visible]);
  function toggle(m: IndividualMetric) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(m)) {
        // Don't allow turning everything off — leave the user with at least
        // one visible row.
        if (next.size === 1) return prev;
        next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
  }

  // Sort by total actual desc; ties alphabetical.
  const sorted = [...byUser].sort((a, b) => {
    if (b.totals.actual !== a.totals.actual) return b.totals.actual - a.totals.actual;
    return a.name.localeCompare(b.name);
  });
  const monthTotals = months.map((m, i) => ({
    month: m.month,
    actual: sorted.reduce((t, u) => t + (u.months[i]?.actual ?? 0), 0),
    quota: sorted.reduce((t, u) => t + (u.months[i]?.quota ?? 0), 0),
  }));
  const grandActual = sorted.reduce((t, u) => t + u.totals.actual, 0);
  const grandQuota = sorted.reduce((t, u) => t + u.totals.quota, 0);

  const showActuals = visible.has("actuals");
  const showQuotas = visible.has("quotas");
  const showAttainment = visible.has("attainment");
  // Single-metric mode: collapse the per-user 3-row block into 1 row and drop
  // the "Metric" label column so the table reads cleanly.
  const singleMetric = visible.size === 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Show:</span>
        {ALL.map((m) => {
          const on = visible.has(m);
          const label = m === "actuals" ? "Actuals" : m === "quotas" ? "Quotas" : "Attainment";
          return (
            <button
              key={m}
              onClick={() => toggle(m)}
              className={`px-2 py-0.5 rounded-md border transition ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="text-sm w-full">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">User</th>
              {!singleMetric && (
                <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">Metric</th>
              )}
              {months.map((m) => (
                <th key={m.month} className="text-right py-2 px-3 font-medium whitespace-nowrap">
                  {fmtMonthShort(m.month)}
                </th>
              ))}
              <th className="text-right py-2 pl-4 pr-2 font-medium whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={months.length + (singleMetric ? 2 : 3)}
                  className="py-8 text-center text-zinc-500"
                >
                  No users in scope.
                </td>
              </tr>
            ) : (
              sorted.map((u, ui) => {
                const totalAtt = u.totals.quota > 0 ? u.totals.actual / u.totals.quota : null;
                const groupBorder = ui === 0 ? "" : "border-t-2 border-zinc-200 dark:border-zinc-800";
                return (
                  <UserBlock
                    key={u.id}
                    user={u}
                    groupBorder={groupBorder}
                    totalAtt={totalAtt}
                    onDrillMonth={onDrillMonth}
                    showActuals={showActuals}
                    showQuotas={showQuotas}
                    showAttainment={showAttainment}
                  />
                );
              })
            )}
          </tbody>
        {sorted.length > 0 && (
          <tfoot>
            {showActuals && (
              <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40">
                <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={singleMetric ? 1 : 2}>
                  {singleMetric ? "Total" : "Total — Actuals"}
                </td>
                {monthTotals.map((m) => (
                  <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap font-semibold">
                    {m.actual > 0 ? fmtMoneyFull(m.actual) : <span className="text-zinc-400">—</span>}
                  </td>
                ))}
                <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold">
                  {fmtMoneyFull(grandActual)}
                </td>
              </tr>
            )}
            {showQuotas && (
              <tr className={`bg-zinc-50 dark:bg-zinc-900/40 ${!showActuals ? "border-t-2 border-zinc-300 dark:border-zinc-700" : ""}`}>
                <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={singleMetric ? 1 : 2}>
                  {singleMetric ? "Total" : "Total — Quotas"}
                </td>
                {monthTotals.map((m) => (
                  <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap font-semibold">
                    {m.quota > 0 ? fmtMoneyFull(m.quota) : <span className="text-zinc-400">—</span>}
                  </td>
                ))}
                <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold">
                  {fmtMoneyFull(grandQuota)}
                </td>
              </tr>
            )}
            {showAttainment && (
              <tr className={`bg-zinc-50 dark:bg-zinc-900/40 ${!showActuals && !showQuotas ? "border-t-2 border-zinc-300 dark:border-zinc-700" : ""}`}>
                <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={singleMetric ? 1 : 2}>
                  {singleMetric ? "Total" : "Total — Attainment"}
                </td>
                {monthTotals.map((m) => {
                  const a = m.quota > 0 ? m.actual / m.quota : null;
                  return (
                    <td
                      key={m.month}
                      className={`py-2 px-3 text-right font-mono whitespace-nowrap font-semibold ${attainmentClass(a)}`}
                    >
                      {fmtPct(a)}
                    </td>
                  );
                })}
                <td
                  className={`py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold ${attainmentClass(
                    grandQuota > 0 ? grandActual / grandQuota : null
                  )}`}
                >
                  {fmtPct(grandQuota > 0 ? grandActual / grandQuota : null)}
                </td>
              </tr>
            )}
          </tfoot>
        )}
        </table>
      </div>
    </div>
  );
}

function UserBlock({
  user,
  groupBorder,
  totalAtt,
  onDrillMonth,
  showActuals,
  showQuotas,
  showAttainment,
}: {
  user: UserBreakdown;
  groupBorder: string;
  totalAtt: number | null;
  onDrillMonth?: (month: string, user: { id: number; name: string }) => void;
  showActuals: boolean;
  showQuotas: boolean;
  showAttainment: boolean;
}) {
  const labelCellClass =
    "py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 whitespace-nowrap font-medium";
  const rowCount = (showActuals ? 1 : 0) + (showQuotas ? 1 : 0) + (showAttainment ? 1 : 0);
  const singleMetric = rowCount === 1;
  // The rep-name cell anchors the first visible row via rowSpan; collapse to
  // a single row when only one metric is showing (no need for the Metric col).
  let nameCellPlaced = false;
  const placeName = () => {
    if (nameCellPlaced) return null;
    nameCellPlaced = true;
    return (
      <td rowSpan={rowCount} className={labelCellClass}>
        {user.name}
      </td>
    );
  };

  return (
    <>
      {showActuals && (
        <tr className={`border-b border-zinc-100 dark:border-zinc-800/50 ${groupBorder}`}>
          {placeName()}
          {!singleMetric && (
            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Actuals</td>
          )}
          {user.months.map((m) => {
            const clickable = onDrillMonth && m.actual > 0;
            return (
              <td
                key={m.month}
                onClick={clickable ? () => onDrillMonth(m.month, { id: user.id, name: user.name }) : undefined}
                className={`py-2 px-3 text-right font-mono whitespace-nowrap ${
                  clickable
                    ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:underline decoration-dotted"
                    : ""
                }`}
              >
                {m.actual > 0 ? fmtMoneyFull(m.actual) : <span className="text-zinc-400">—</span>}
              </td>
            );
          })}
          <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
            {user.totals.actual > 0 ? fmtMoneyFull(user.totals.actual) : <span className="text-zinc-400">—</span>}
          </td>
        </tr>
      )}
      {showQuotas && (
        <tr className={`border-b border-zinc-100 dark:border-zinc-800/50 ${!showActuals ? groupBorder : ""}`}>
          {placeName()}
          {!singleMetric && (
            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Quotas</td>
          )}
          {user.months.map((m) => (
            <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap">
              {m.quota > 0 ? fmtMoneyFull(m.quota) : <span className="text-zinc-400">—</span>}
            </td>
          ))}
          <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
            {user.totals.quota > 0 ? fmtMoneyFull(user.totals.quota) : <span className="text-zinc-400">—</span>}
          </td>
        </tr>
      )}
      {showAttainment && (
        <tr className={`border-b border-zinc-100 dark:border-zinc-800/50 ${!showActuals && !showQuotas ? groupBorder : ""}`}>
          {placeName()}
          {!singleMetric && (
            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Attainment</td>
          )}
          {user.months.map((m) => {
            const a = m.quota > 0 ? m.actual / m.quota : null;
            return (
              <td
                key={m.month}
                className={`py-2 px-3 text-right font-mono whitespace-nowrap ${attainmentClass(a)}`}
              >
                {fmtPct(a)}
              </td>
            );
          })}
          <td
            className={`py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold ${attainmentClass(
              totalAtt
            )}`}
          >
            {fmtPct(totalAtt)}
          </td>
        </tr>
      )}
    </>
  );
}

function ByDimensionTable({
  months,
  dim,
  onDrillMonth,
}: {
  months: Month[];
  dim: DimensionBreakdown;
  onDrillMonth?: (
    month: string,
    bucket: { id: number | "__unassigned__"; name: string }
  ) => void;
}) {
  // Sort buckets by total actual desc, Unassigned always last for visibility.
  const real = dim.buckets.filter((b) => b.id !== "__unassigned__");
  const unassigned = dim.buckets.find((b) => b.id === "__unassigned__") ?? null;
  real.sort((a, b) => totalsOf(b).actual - totalsOf(a).actual);
  const ordered = unassigned ? [...real, unassigned] : real;

  const monthTotals = months.map((m, i) => ({
    month: m.month,
    actual: ordered.reduce((t, b) => t + (b.months[i]?.actual ?? 0), 0),
    quota: ordered.reduce((t, b) => t + (b.months[i]?.quota ?? 0), 0),
  }));
  const grandActual = ordered.reduce((t, b) => t + totalsOf(b).actual, 0);
  const grandQuota = ordered.reduce((t, b) => t + totalsOf(b).quota, 0);

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="text-sm w-full">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
              {dim.name}
            </th>
            <th className="text-left py-2 pr-4 font-medium sticky left-0 bg-white dark:bg-zinc-950 z-10">
              Metric
            </th>
            {months.map((m) => (
              <th key={m.month} className="text-right py-2 px-3 font-medium whitespace-nowrap">
                {fmtMonthShort(m.month)}
              </th>
            ))}
            <th className="text-right py-2 pl-4 pr-2 font-medium whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((b, bi) => {
            const isUnassigned = b.id === "__unassigned__";
            const showQuotas = dim.quotasAvailable;
            const rowCount = showQuotas ? 3 : 1;
            const t = totalsOf(b);
            const totalAtt = t.quota > 0 ? t.actual / t.quota : null;
            return (
              <BucketBlock
                key={String(b.id)}
                bucket={b}
                months={months}
                rowCount={rowCount}
                showQuotas={showQuotas}
                isUnassigned={isUnassigned}
                isFirst={bi === 0}
                totalAtt={totalAtt}
                onDrillMonth={onDrillMonth}
              />
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40">
            <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={2}>
              Total — Actuals
            </td>
            {monthTotals.map((m) => (
              <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap font-semibold">
                {m.actual > 0 ? fmtMoneyFull(m.actual) : <span className="text-zinc-400">—</span>}
              </td>
            ))}
            <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold">
              {fmtMoneyFull(grandActual)}
            </td>
          </tr>
          {dim.quotasAvailable && (
            <>
              <tr className="bg-zinc-50 dark:bg-zinc-900/40">
                <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={2}>
                  Total — Quotas
                </td>
                {monthTotals.map((m) => (
                  <td key={m.month} className="py-2 px-3 text-right font-mono whitespace-nowrap font-semibold">
                    {m.quota > 0 ? fmtMoneyFull(m.quota) : <span className="text-zinc-400">—</span>}
                  </td>
                ))}
                <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold">
                  {fmtMoneyFull(grandQuota)}
                </td>
              </tr>
              <tr className="bg-zinc-50 dark:bg-zinc-900/40">
                <td className="py-2 pr-4 sticky left-0 bg-zinc-50 dark:bg-zinc-900/40 z-10 font-semibold" colSpan={2}>
                  Total — Attainment
                </td>
                {monthTotals.map((m) => {
                  const att = m.quota > 0 ? m.actual / m.quota : null;
                  return (
                    <td
                      key={m.month}
                      className={`py-2 px-3 text-right font-mono whitespace-nowrap font-semibold ${attainmentClass(att)}`}
                    >
                      {fmtPct(att)}
                    </td>
                  );
                })}
                <td
                  className={`py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-bold ${attainmentClass(
                    grandQuota > 0 ? grandActual / grandQuota : null
                  )}`}
                >
                  {fmtPct(grandQuota > 0 ? grandActual / grandQuota : null)}
                </td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function attainmentClass(a: number | null) {
  if (a == null) return "text-zinc-400";
  if (a >= 1) return "text-emerald-600";
  if (a >= 0.7) return "text-amber-600";
  return "text-red-600";
}

// Module-level helper so both ByDimensionTable and BucketBlock can use it.
// Older cached payloads stored `b.total: number`; newer ones store
// `b.totals: { actual, quota }`. Accept both shapes.
function totalsOf(b: DimensionBucketRow): { actual: number; quota: number } {
  if (b.totals) return b.totals;
  const legacy = (b as unknown as { total?: number }).total;
  return { actual: legacy ?? 0, quota: 0 };
}

function BucketBlock({
  bucket,
  months,
  rowCount,
  showQuotas,
  isUnassigned,
  isFirst,
  totalAtt,
  onDrillMonth,
}: {
  bucket: DimensionBucketRow;
  months: Month[];
  rowCount: number;
  showQuotas: boolean;
  isUnassigned: boolean;
  isFirst: boolean;
  totalAtt: number | null;
  onDrillMonth?: (month: string, bucket: { id: number | "__unassigned__"; name: string }) => void;
}) {
  const labelCellClass = `py-2 pr-4 sticky left-0 bg-white dark:bg-zinc-950 z-10 whitespace-nowrap ${
    isUnassigned ? "italic text-zinc-500" : "font-medium"
  }`;
  const groupBorder = isFirst ? "" : "border-t-2 border-zinc-200 dark:border-zinc-800";

  return (
    <>
      {/* Actuals row (also carries the bucket label as rowSpan=N) */}
      <tr className={`border-b border-zinc-100 dark:border-zinc-800/50 ${groupBorder}`}>
        <td rowSpan={rowCount} className={labelCellClass}>
          {bucket.name}
        </td>
        <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Actuals</td>
        {bucket.months.map((m) => {
          const actual = m?.actual ?? 0;
          const clickable = onDrillMonth && actual > 0;
          return (
            <td
              key={m?.month ?? Math.random()}
              onClick={clickable ? () => onDrillMonth(m.month, { id: bucket.id, name: bucket.name }) : undefined}
              className={`py-2 px-3 text-right font-mono whitespace-nowrap ${
                clickable
                  ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:underline decoration-dotted"
                  : ""
              }`}
            >
              {actual > 0 ? fmtMoneyFull(actual) : <span className="text-zinc-400">—</span>}
            </td>
          );
        })}
        <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
          {totalsOf(bucket).actual > 0
            ? fmtMoneyFull(totalsOf(bucket).actual)
            : <span className="text-zinc-400">—</span>}
        </td>
      </tr>
      {showQuotas && (
        <>
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Quotas</td>
            {bucket.months.map((m) => {
              const q = m?.quota ?? 0;
              return (
                <td key={m?.month ?? Math.random()} className="py-2 px-3 text-right font-mono whitespace-nowrap">
                  {q > 0 ? fmtMoneyFull(q) : <span className="text-zinc-400">—</span>}
                </td>
              );
            })}
            <td className="py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold">
              {totalsOf(bucket).quota > 0
                ? fmtMoneyFull(totalsOf(bucket).quota)
                : <span className="text-zinc-400">—</span>}
            </td>
          </tr>
          <tr className="border-b border-zinc-100 dark:border-zinc-800/50">
            <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">Attainment</td>
            {bucket.months.map((m) => {
              const q = m?.quota ?? 0;
              const ac = m?.actual ?? 0;
              const a = q > 0 ? ac / q : null;
              return (
                <td
                  key={m?.month ?? Math.random()}
                  className={`py-2 px-3 text-right font-mono whitespace-nowrap ${attainmentClass(a)}`}
                >
                  {fmtPct(a)}
                </td>
              );
            })}
            <td
              className={`py-2 pl-4 pr-2 text-right font-mono whitespace-nowrap border-l border-zinc-200 dark:border-zinc-800 font-semibold ${attainmentClass(
                totalAtt
              )}`}
            >
              {fmtPct(totalAtt)}
            </td>
          </tr>
        </>
      )}
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-xl font-semibold mt-1 font-mono">{value}</div>
    </div>
  );
}

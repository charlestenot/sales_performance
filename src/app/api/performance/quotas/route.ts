import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMonthString } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function lastDayOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
function* iterateMonths(from: Date, to: Date) {
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    yield new Date(cur);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = parseMonthString(url.searchParams.get("from") ?? "");
  const to = parseMonthString(url.searchParams.get("to") ?? "");
  const teams = url.searchParams.getAll("teams").map(Number).filter((n) => Number.isFinite(n));
  const roles = url.searchParams.getAll("roles").map(Number).filter((n) => Number.isFinite(n));
  const users = url.searchParams.getAll("users").map(Number).filter((n) => Number.isFinite(n));
  const dimensionIdRaw = url.searchParams.get("dimension");
  // Two shapes: a numeric ID points at a saved Dimension; a synthetic token
  // (e.g. "__team__") asks us to build a one-bucket-per-X breakdown on the fly
  // — used by the built-in Team Performance tab so it works with zero setup.
  const dimensionId =
    dimensionIdRaw && /^\d+$/.test(dimensionIdRaw) ? Number(dimensionIdRaw) : null;
  const syntheticGroup =
    dimensionIdRaw === "__team__"
      ? "team"
      : dimensionIdRaw === "__role__"
      ? "role"
      : null;

  if (!from || !to) {
    return NextResponse.json({ error: "from and to (YYYY-MM) required" }, { status: 400 });
  }

  // Always scope to SalesReps in our Users list (the canonical "users"
  // universe). Team / Role / User filters narrow the scope further.
  const where: {
    teamId?: { in: number[] };
    currentRoleId?: { in: number[] };
    id?: { in: number[] };
  } = {};
  if (teams.length) where.teamId = { in: teams };
  if (roles.length) where.currentRoleId = { in: roles };
  if (users.length) where.id = { in: users };
  const reps = await prisma.salesRep.findMany({
    where,
    select: { id: true, ownerId: true },
  });
  const repIdFilter: number[] = reps.map((r) => r.id);
  const ownerIdFilter: string[] = reps.map((r) => r.ownerId);

  // ---- Quotas (sum RepMonthly.quota grouped by month) ----
  const quotaWhere: {
    month: { gte: Date; lte: Date };
    salesRepId?: { in: number[] };
  } = { month: { gte: from, lte: lastDayOfMonthUTC(to) } };
  // Always restrict quotas to the rep scope (zero-rep scope → empty result).
  quotaWhere.salesRepId = { in: repIdFilter.length ? repIdFilter : [-1] };
  const quotaEntries = await prisma.repMonthly.findMany({ where: quotaWhere });
  const quotaByMonth = new Map<string, { sum: number; count: number }>();
  for (const e of quotaEntries) {
    const key = e.month.toISOString().slice(0, 7);
    const cur = quotaByMonth.get(key) ?? { sum: 0, count: 0 };
    if (e.quota != null) cur.sum += e.quota;
    cur.count++;
    quotaByMonth.set(key, cur);
  }

  // ---- Actuals (sum closed-won deal MRR grouped by close month) ----
  const dealWhere: {
    closeDate: { gte: Date; lte: Date };
    ownerId?: { in: string[] };
  } = { closeDate: { gte: from, lte: lastDayOfMonthUTC(to) } };
  // Always restrict to deals owned by SalesReps in our Users list. If the
  // scope is empty, return no deals at all.
  dealWhere.ownerId = { in: ownerIdFilter.length ? ownerIdFilter : ["__none__"] };

  // Selected currency / amount property to use for the actuals sum. If unset,
  // fall back to the historical default (mrr_incremental_at_close_date).
  const amountSetting = await prisma.appSetting.findUnique({
    where: { key: "performance_amount_field" },
  });
  const amountField = amountSetting?.value ?? null;
  // Stage mapping from Settings → Mapping. When set, ONLY deals whose
  // (pipeline, stage) matches one of the selected pairs count as actuals.
  // When not set, fall back to HubSpot's hs_is_closed_won flag.
  const stageSetting = await prisma.appSetting.findUnique({
    where: { key: "performance_actual_stages" },
  });
  let selectedStages: { pipeline: string | null; stage: string | null }[] = [];
  if (stageSetting) {
    try {
      const parsed = JSON.parse(stageSetting.value);
      if (Array.isArray(parsed)) selectedStages = parsed;
    } catch {}
  }
  const stageKey = (p: string | null, s: string | null) => `${p ?? ""}::${s ?? ""}`;
  const stageSet = new Set(selectedStages.map((s) => stageKey(s.pipeline, s.stage)));
  const useMapping = stageSet.size > 0;

  // Fetch ONLY the deal fields we actually iterate over — never the full
  // properties JSON (~10KB/row). The amount and is_closed_won live inside
  // properties but we extract them with Postgres' JSONB operators server-side,
  // turning a multi-hundred-MB payload into a few MB and a 27s endpoint into
  // a sub-second one. The amount key comes from the user-selected setting,
  // sanitized to a safe identifier before being interpolated.
  const amountKey = (amountField ?? "mrr_incremental_at_close_date").replace(/[^a-zA-Z0-9_]/g, "");
  const ownerIds = ownerIdFilter.length ? ownerIdFilter : ["__none__"];
  type DealLite = {
    id: string;
    ownerId: string | null;
    pipeline: string | null;
    dealStage: string | null;
    closeDate: Date;
    amount: number | null;
    isClosedWon: boolean;
    isYearly: boolean;
  };
  const deals = await prisma.$queryRaw<DealLite[]>`
    SELECT
      "id",
      "ownerId",
      "pipeline",
      "dealStage",
      "closeDate",
      COALESCE(NULLIF("properties" ->> ${amountKey}, '')::numeric, 0)::float8 AS "amount",
      (("properties" ->> 'hs_is_closed_won') = 'true') AS "isClosedWon",
      (("properties" ->> 'commitment') IN ('Yearly', 'Multiyears')) AS "isYearly"
    FROM "Deal"
    WHERE "closeDate" >= ${from}
      AND "closeDate" <= ${lastDayOfMonthUTC(to)}
      AND "ownerId" = ANY(${ownerIds}::text[])
  `;
  const actualsByMonth = new Map<
    string,
    { sum: number; count: number; yearlySum: number; yearlyCount: number }
  >();
  for (const d of deals) {
    if (useMapping) {
      if (!stageSet.has(stageKey(d.pipeline, d.dealStage))) continue;
    } else {
      if (!d.isClosedWon) continue;
    }
    if (!d.closeDate) continue;
    const key = d.closeDate.toISOString().slice(0, 7);
    const amount = Number(d.amount ?? 0) || 0;
    const cur = actualsByMonth.get(key) ?? {
      sum: 0,
      count: 0,
      yearlySum: 0,
      yearlyCount: 0,
    };
    cur.sum += amount;
    cur.count++;
    if (d.isYearly) {
      cur.yearlySum += amount;
      cur.yearlyCount++;
    }
    actualsByMonth.set(key, cur);
  }

  // ---- Stitch the full month sequence so the table axis is consistent ----
  const months: {
    month: string;
    quota: number;
    actual: number;
    quotaCount: number;
    dealCount: number;
    yearlyActual: number;
    yearlyDealCount: number;
  }[] = [];
  for (const m of iterateMonths(from, to)) {
    const key = m.toISOString().slice(0, 7);
    const q = quotaByMonth.get(key) ?? { sum: 0, count: 0 };
    const a = actualsByMonth.get(key) ?? { sum: 0, count: 0, yearlySum: 0, yearlyCount: 0 };
    months.push({
      month: key,
      quota: q.sum,
      actual: a.sum,
      quotaCount: q.count,
      dealCount: a.count,
      yearlyActual: a.yearlySum,
      yearlyDealCount: a.yearlyCount,
    });
  }

  const totals = months.reduce(
    (t, m) => ({
      quota: t.quota + m.quota,
      actual: t.actual + m.actual,
      quotaCount: t.quotaCount + m.quotaCount,
      dealCount: t.dealCount + m.dealCount,
      yearlyActual: t.yearlyActual + m.yearlyActual,
      yearlyDealCount: t.yearlyDealCount + m.yearlyDealCount,
    }),
    { quota: 0, actual: 0, quotaCount: 0, dealCount: 0, yearlyActual: 0, yearlyDealCount: 0 }
  );

  // ---- Per-user breakdown for the "By User" view ----
  // Build per-rep month maps for quotas (by salesRepId) and actuals (by ownerId).
  const quotasByRepMonth = new Map<number, Map<string, { sum: number; count: number }>>();
  for (const e of quotaEntries) {
    const inner = quotasByRepMonth.get(e.salesRepId) ?? new Map();
    const k = e.month.toISOString().slice(0, 7);
    const cur = inner.get(k) ?? { sum: 0, count: 0 };
    if (e.quota != null) cur.sum += e.quota;
    cur.count++;
    inner.set(k, cur);
    quotasByRepMonth.set(e.salesRepId, inner);
  }

  type ActualCell = { sum: number; count: number; yearlySum: number; yearlyCount: number };
  const actualsByOwnerMonth = new Map<string, Map<string, ActualCell>>();
  for (const d of deals) {
    if (!d.closeDate || !d.ownerId) continue;
    if (useMapping) {
      if (!stageSet.has(stageKey(d.pipeline, d.dealStage))) continue;
    } else {
      if (!d.isClosedWon) continue;
    }
    const k = d.closeDate.toISOString().slice(0, 7);
    const amount = Number(d.amount ?? 0) || 0;
    const inner = actualsByOwnerMonth.get(d.ownerId) ?? new Map<string, ActualCell>();
    const cur = inner.get(k) ?? { sum: 0, count: 0, yearlySum: 0, yearlyCount: 0 };
    cur.sum += amount;
    cur.count++;
    if (d.isYearly) {
      cur.yearlySum += amount;
      cur.yearlyCount++;
    }
    inner.set(k, cur);
    actualsByOwnerMonth.set(d.ownerId, inner);
  }

  // Resolve rep display names. We already queried the rep scope above for
  // ownerId/id, but need names too for the breakdown — fetch them together.
  const repsWithNames = await prisma.salesRep.findMany({
    where: { id: { in: repIdFilter.length ? repIdFilter : [-1] } },
    select: { id: true, name: true, ownerId: true },
    orderBy: { name: "asc" },
  });

  const byUser = repsWithNames.map((r) => {
    const qMap = quotasByRepMonth.get(r.id);
    const aMap = actualsByOwnerMonth.get(r.ownerId);
    const userMonths = months.map((m) => {
      const q = qMap?.get(m.month) ?? { sum: 0, count: 0 };
      const a = aMap?.get(m.month) ?? { sum: 0, count: 0, yearlySum: 0, yearlyCount: 0 };
      return {
        month: m.month,
        quota: q.sum,
        actual: a.sum,
        dealCount: a.count,
        yearlyActual: a.yearlySum,
        yearlyDealCount: a.yearlyCount,
      };
    });
    const userTotals = userMonths.reduce(
      (t, m) => ({
        quota: t.quota + m.quota,
        actual: t.actual + m.actual,
        dealCount: t.dealCount + m.dealCount,
        yearlyActual: t.yearlyActual + m.yearlyActual,
        yearlyDealCount: t.yearlyDealCount + m.yearlyDealCount,
      }),
      { quota: 0, actual: 0, dealCount: 0, yearlyActual: 0, yearlyDealCount: 0 }
    );
    return {
      id: r.id,
      name: r.name,
      ownerId: r.ownerId,
      months: userMonths,
      totals: userTotals,
    };
  });

  // ---- Per-dimension breakdown (optional) ----
  let byDimension: {
    dimensionId: number;
    name: string;
    attribute: string;
    /** Whether quotas can be split by this attribute (user / team / role). */
    quotasAvailable: boolean;
    buckets: {
      id: number | "__unassigned__";
      name: string;
      months: {
        month: string;
        actual: number;
        quota: number;
        dealCount: number;
        yearlyActual: number;
        yearlyDealCount: number;
      }[];
      totals: {
        actual: number;
        quota: number;
        dealCount: number;
        yearlyActual: number;
        yearlyDealCount: number;
      };
    }[];
  } | null = null;

  // Resolve the dimension to use — either a saved one (numeric id) or a
  // synthetic one assembled from the Team/Role table for the built-in tabs.
  type ResolvedDim = {
    id: number;
    name: string;
    attribute: string;
    buckets: { id: number; name: string; values: string }[];
  };
  let dim: ResolvedDim | null = null;
  if (dimensionId && Number.isFinite(dimensionId)) {
    const found = await prisma.dimension.findUnique({
      where: { id: dimensionId },
      include: { buckets: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    });
    if (found) dim = found;
  } else if (syntheticGroup === "team") {
    const allTeams = await prisma.team.findMany({
      where: { archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    dim = {
      id: -1, // synthetic — not persisted
      name: "Team",
      attribute: "team",
      buckets: allTeams.map((t) => ({
        id: t.id,
        name: t.name,
        values: JSON.stringify([t.id]),
      })),
    };
  } else if (syntheticGroup === "role") {
    const allRoles = await prisma.role.findMany({
      where: { archived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    dim = {
      id: -2,
      name: "Role",
      attribute: "role",
      buckets: allRoles.map((r) => ({
        id: r.id,
        name: r.name,
        values: JSON.stringify([r.id]),
      })),
    };
  }

  if (dim) {
    {
      // value (string) → bucket id
      const valueToBucket = new Map<string, number>();
      for (const b of dim.buckets) {
        try {
          const arr = JSON.parse(b.values) as (string | number)[];
          if (Array.isArray(arr)) for (const v of arr) valueToBucket.set(String(v), b.id);
        } catch {}
      }

      // owner → rep, rep → team / currentRole (for user/team/role attributes)
      const ownerToRepId = new Map<string, number>();
      const repIdToTeamId = new Map<number, number | null>();
      const repIdToRoleId = new Map<number, number | null>();
      const repIdsForDim = await prisma.salesRep.findMany({
        select: { id: true, ownerId: true, teamId: true, currentRoleId: true },
      });
      for (const r of repIdsForDim) {
        ownerToRepId.set(r.ownerId, r.id);
        repIdToTeamId.set(r.id, r.teamId);
        repIdToRoleId.set(r.id, r.currentRoleId);
      }
      // Per-month role/team SNAPSHOTS from RepMonthly. We use the snapshotted
      // value at the deal's close month — that way:
      //   1. Reps whose live currentRoleId is null but who have a monthly
      //      snapshot still get bucketed (the original cause of $X "Unassigned").
      //   2. A rep who changed roles mid-period has their deals correctly split
      //      between buckets by the role they actually held that month.
      const repMonthRole = new Map<string, number | null>(); // `${repId}|${ym}` → roleId
      const repMonthTeam = new Map<string, number | null>();
      for (const e of quotaEntries) {
        const k = `${e.salesRepId}|${e.month.toISOString().slice(0, 7)}`;
        repMonthRole.set(k, e.roleId);
        repMonthTeam.set(k, e.teamId);
      }
      const lookupRoleAt = (repId: number, ym: string): number | null => {
        const v = repMonthRole.get(`${repId}|${ym}`);
        if (v != null) return v;
        return repIdToRoleId.get(repId) ?? null; // fall back to live current role
      };
      const lookupTeamAt = (repId: number, ym: string): number | null => {
        const v = repMonthTeam.get(`${repId}|${ym}`);
        if (v != null) return v;
        return repIdToTeamId.get(repId) ?? null;
      };

      type BucketCell = {
        sum: number;
        count: number;
        yearlySum: number;
        yearlyCount: number;
      };
      const bucketAggs = new Map<string, Map<string, BucketCell>>();
      const ensure = (key: string) => {
        let m = bucketAggs.get(key);
        if (!m) {
          m = new Map<string, BucketCell>();
          bucketAggs.set(key, m);
        }
        return m;
      };

      for (const d of deals) {
        if (!d.closeDate) continue;
        if (useMapping) {
          if (!stageSet.has(stageKey(d.pipeline, d.dealStage))) continue;
        } else {
          if (!d.isClosedWon) continue;
        }
        let bucketId: number | "__unassigned__" = "__unassigned__";
        if (dim.attribute === "pipeline") {
          const v = d.pipeline ?? "";
          const found = valueToBucket.get(v);
          if (found != null) bucketId = found;
        } else if (dim.attribute === "stage") {
          const v = `${d.pipeline ?? ""}::${d.dealStage ?? ""}`;
          const found = valueToBucket.get(v);
          if (found != null) bucketId = found;
        } else if (dim.attribute === "user") {
          const repId = d.ownerId ? ownerToRepId.get(d.ownerId) : null;
          if (repId != null) {
            const found = valueToBucket.get(String(repId));
            if (found != null) bucketId = found;
          }
        } else if (dim.attribute === "team") {
          const repId = d.ownerId ? ownerToRepId.get(d.ownerId) : null;
          const ym = d.closeDate.toISOString().slice(0, 7);
          const teamId = repId != null ? lookupTeamAt(repId, ym) : null;
          if (teamId != null) {
            const found = valueToBucket.get(String(teamId));
            if (found != null) bucketId = found;
          }
        } else if (dim.attribute === "role") {
          const repId = d.ownerId ? ownerToRepId.get(d.ownerId) : null;
          const ym = d.closeDate.toISOString().slice(0, 7);
          const roleId = repId != null ? lookupRoleAt(repId, ym) : null;
          if (roleId != null) {
            const found = valueToBucket.get(String(roleId));
            if (found != null) bucketId = found;
          }
        }
        const k = d.closeDate.toISOString().slice(0, 7);
        const amount = Number(d.amount ?? 0) || 0;
        const m = ensure(String(bucketId));
        const cur = m.get(k) ?? { sum: 0, count: 0, yearlySum: 0, yearlyCount: 0 };
        cur.sum += amount;
        cur.count++;
        if (d.isYearly) {
          cur.yearlySum += amount;
          cur.yearlyCount++;
        }
        m.set(k, cur);
      }

      // Quotas-per-bucket only make sense when the dimension splits the rep
      // population (user / team / role). For pipeline / stage dimensions there
      // is no canonical way to attribute a rep's quota to a pipeline.
      const quotasAvailable =
        dim.attribute === "user" || dim.attribute === "team" || dim.attribute === "role";
      // Resolve the bucket for each RepMonthly row using its OWN snapshot, so
      // a rep who changed role/team mid-period has their quota correctly
      // split across buckets by the actual role/team they held that month.
      // (User dimension is time-invariant — it's just the rep id.)
      const quotaByBucketMonth = new Map<string, Map<string, number>>();
      if (quotasAvailable) {
        for (const e of quotaEntries) {
          if (e.quota == null) continue;
          let v: string | null = null;
          if (dim.attribute === "user") {
            v = String(e.salesRepId);
          } else if (dim.attribute === "team") {
            const teamId = e.teamId ?? repIdToTeamId.get(e.salesRepId) ?? null;
            v = teamId != null ? String(teamId) : null;
          } else if (dim.attribute === "role") {
            const roleId = e.roleId ?? repIdToRoleId.get(e.salesRepId) ?? null;
            v = roleId != null ? String(roleId) : null;
          }
          const found = v != null ? valueToBucket.get(v) : null;
          const bid: number | "__unassigned__" = found ?? "__unassigned__";
          const k = e.month.toISOString().slice(0, 7);
          const inner = quotaByBucketMonth.get(String(bid)) ?? new Map();
          inner.set(k, (inner.get(k) ?? 0) + e.quota);
          quotaByBucketMonth.set(String(bid), inner);
        }
      }

      const buildBucket = (
        id: number | "__unassigned__",
        name: string
      ) => {
        const aInner = bucketAggs.get(String(id));
        const qInner = quotaByBucketMonth.get(String(id));
        const monthsArr = months.map((mm) => {
          const cell = aInner?.get(mm.month);
          return {
            month: mm.month,
            actual: cell?.sum ?? 0,
            quota: qInner?.get(mm.month) ?? 0,
            dealCount: cell?.count ?? 0,
            yearlyActual: cell?.yearlySum ?? 0,
            yearlyDealCount: cell?.yearlyCount ?? 0,
          };
        });
        return {
          id,
          name,
          months: monthsArr,
          totals: monthsArr.reduce(
            (t, m) => ({
              actual: t.actual + m.actual,
              quota: t.quota + m.quota,
              dealCount: t.dealCount + m.dealCount,
              yearlyActual: t.yearlyActual + m.yearlyActual,
              yearlyDealCount: t.yearlyDealCount + m.yearlyDealCount,
            }),
            { actual: 0, quota: 0, dealCount: 0, yearlyActual: 0, yearlyDealCount: 0 }
          ),
        };
      };

      const buckets = dim.buckets.map((b) => buildBucket(b.id, b.name));
      buckets.push(buildBucket("__unassigned__" as const, "Unassigned"));

      byDimension = {
        dimensionId: dim.id,
        name: dim.name,
        attribute: dim.attribute,
        quotasAvailable,
        buckets,
      };
    }
  }

  return NextResponse.json({ months, totals, byUser, byDimension, filters: { teams, roles, users } });
}

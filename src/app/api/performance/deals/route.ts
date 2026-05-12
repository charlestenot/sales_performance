import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMonthString } from "@/lib/dates";
import { listDealPipelines } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function lastDayOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
const stageKey = (p: string | null, s: string | null) => `${p ?? ""}::${s ?? ""}`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = parseMonthString(url.searchParams.get("month") ?? "");
  if (!month) return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 });

  const teams = url.searchParams.getAll("teams").map(Number).filter((n) => Number.isFinite(n));
  const roles = url.searchParams.getAll("roles").map(Number).filter((n) => Number.isFinite(n));
  const users = url.searchParams.getAll("users").map(Number).filter((n) => Number.isFinite(n));
  const dimensionIdRaw = url.searchParams.get("dimension");
  const dimensionId =
    dimensionIdRaw && /^-?\d+$/.test(dimensionIdRaw) ? Number(dimensionIdRaw) : null;
  const syntheticGroup =
    dimensionIdRaw === "__team__"
      ? "team"
      : dimensionIdRaw === "__role__"
      ? "role"
      : null;
  const bucketIdRaw = url.searchParams.get("bucket"); // number string or "__unassigned__"

  // Same scope-resolution as /api/performance/quotas: SalesReps narrowed by
  // any team/role/user filters present.
  const repWhere: { teamId?: { in: number[] }; currentRoleId?: { in: number[] }; id?: { in: number[] } } = {};
  if (teams.length) repWhere.teamId = { in: teams };
  if (roles.length) repWhere.currentRoleId = { in: roles };
  if (users.length) repWhere.id = { in: users };
  const reps = await prisma.salesRep.findMany({
    where: repWhere,
    select: { id: true, ownerId: true, name: true, teamId: true, currentRoleId: true },
  });
  const ownerToRep = new Map(reps.map((r) => [r.ownerId, r]));

  // Stage + amount mapping (parallel to the perf endpoint).
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
  const stageSet = new Set(selectedStages.map((s) => stageKey(s.pipeline, s.stage)));
  const useMapping = stageSet.size > 0;

  const amountSetting = await prisma.appSetting.findUnique({
    where: { key: "performance_amount_field" },
  });
  const amountField = amountSetting?.value ?? null;

  // Dimension bucket filter (optional). Resolved from one of:
  //   1) a saved Dimension (dimensionId is a real numeric id), or
  //   2) a synthetic group (dimension="__team__" or "__role__"), where buckets
  //      are auto-derived from the Team/Role table — bucket ids ARE row ids.
  let dimensionFilter: { attribute: string; allowed: Set<string>; mode: "include" | "exclude" } | null = null;
  type ResolvedBuckets = { attribute: string; buckets: { id: number; values: string }[] };
  let resolved: ResolvedBuckets | null = null;
  if (dimensionId && bucketIdRaw) {
    const dim = await prisma.dimension.findUnique({
      where: { id: dimensionId },
      include: { buckets: true },
    });
    if (dim) resolved = { attribute: dim.attribute, buckets: dim.buckets };
  } else if (syntheticGroup === "team" && bucketIdRaw) {
    const allTeams = await prisma.team.findMany({
      where: { archived: false },
      select: { id: true },
    });
    resolved = {
      attribute: "team",
      buckets: allTeams.map((t) => ({ id: t.id, values: JSON.stringify([t.id]) })),
    };
  } else if (syntheticGroup === "role" && bucketIdRaw) {
    const allRoles = await prisma.role.findMany({
      where: { archived: false },
      select: { id: true },
    });
    resolved = {
      attribute: "role",
      buckets: allRoles.map((r) => ({ id: r.id, values: JSON.stringify([r.id]) })),
    };
  }
  if (resolved && bucketIdRaw) {
    if (bucketIdRaw === "__unassigned__") {
      const used = new Set<string>();
      for (const b of resolved.buckets) {
        try {
          const arr = JSON.parse(b.values) as (string | number)[];
          for (const v of arr) used.add(String(v));
        } catch {}
      }
      dimensionFilter = { attribute: resolved.attribute, allowed: used, mode: "exclude" };
    } else {
      const target = resolved.buckets.find((b) => b.id === Number(bucketIdRaw));
      if (target) {
        const allowed = new Set<string>();
        try {
          const arr = JSON.parse(target.values) as (string | number)[];
          for (const v of arr) allowed.add(String(v));
        } catch {}
        dimensionFilter = { attribute: resolved.attribute, allowed, mode: "include" };
      }
    }
  }

  const ownerIdFilter = reps.map((r) => r.ownerId);
  const from = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const to = lastDayOfMonthUTC(month);

  const deals = await prisma.deal.findMany({
    where: {
      closeDate: { gte: from, lte: to },
      ownerId: { in: ownerIdFilter.length ? ownerIdFilter : ["__none__"] },
    },
  });

  // Per-month role/team SNAPSHOTS so the drilldown's team/role bucket filter
  // matches the main table's per-month bucketing (a rep who switched roles
  // mid-period has the right deals show up under each role's drilldown).
  const monthlyRows = await prisma.repMonthly.findMany({
    where: { month: { gte: from, lte: to } },
    select: { salesRepId: true, roleId: true, teamId: true },
  });
  const repMonthRole = new Map<number, number | null>();
  const repMonthTeam = new Map<number, number | null>();
  for (const e of monthlyRows) {
    repMonthRole.set(e.salesRepId, e.roleId);
    repMonthTeam.set(e.salesRepId, e.teamId);
  }

  // Resolve pipeline + stage labels from HubSpot (best-effort).
  const pipelineLabel = new Map<string, string>(); // raw value → label
  const stageLabel = new Map<string, string>(); // "<pipelineRaw>::<stageRaw>" → label
  try {
    const pipelines = await listDealPipelines();
    for (const p of pipelines) {
      // Index by both id and label since Deal.pipeline can hold either.
      pipelineLabel.set(p.id, p.label);
      pipelineLabel.set(p.label, p.label);
      for (const s of p.stages ?? []) {
        stageLabel.set(`${p.id}::${s.id}`, s.label);
        stageLabel.set(`${p.label}::${s.id}`, s.label);
        stageLabel.set(`${p.id}::${s.label}`, s.label);
        stageLabel.set(`${p.label}::${s.label}`, s.label);
      }
    }
  } catch {
    // Offline / no token — fall back to raw values below.
  }

  type Out = {
    id: string;
    name: string | null;
    ownerId: string | null;
    repName: string | null;
    closeDate: string | null;
    dealStage: string | null;
    dealStageLabel: string | null;
    pipeline: string | null;
    pipelineLabel: string | null;
    amount: number;
  };

  const out: Out[] = [];
  for (const d of deals) {
    let props: Record<string, string | null>;
    try {
      props = JSON.parse(d.properties) as Record<string, string | null>;
    } catch {
      continue;
    }
    if (useMapping) {
      if (!stageSet.has(stageKey(d.pipeline, d.dealStage))) continue;
    } else {
      if (props.hs_is_closed_won !== "true") continue;
    }
    if (dimensionFilter) {
      let v: string | null = null;
      if (dimensionFilter.attribute === "pipeline") v = d.pipeline ?? "";
      else if (dimensionFilter.attribute === "stage") v = stageKey(d.pipeline, d.dealStage);
      else {
        const rep = d.ownerId ? ownerToRep.get(d.ownerId) ?? null : null;
        if (rep) {
          if (dimensionFilter.attribute === "user") v = String(rep.id);
          else if (dimensionFilter.attribute === "team") {
            const tid = repMonthTeam.get(rep.id) ?? rep.teamId;
            v = tid != null ? String(tid) : null;
          } else if (dimensionFilter.attribute === "role") {
            const rid = repMonthRole.get(rep.id) ?? rep.currentRoleId;
            v = rid != null ? String(rid) : null;
          }
        }
      }
      const inSet = v != null && dimensionFilter.allowed.has(v);
      if (dimensionFilter.mode === "include" && !inSet) continue;
      if (dimensionFilter.mode === "exclude" && inSet) continue;
    }
    let amountRaw: string | null | undefined;
    if (amountField) amountRaw = props[amountField];
    if (amountRaw == null) amountRaw = props.mrr_incremental_at_close_date ?? props.mrr_incremental;
    const amount = Number(amountRaw ?? 0) || 0;
    out.push({
      id: d.id,
      name: d.name,
      ownerId: d.ownerId,
      repName: d.ownerId ? ownerToRep.get(d.ownerId)?.name ?? null : null,
      closeDate: d.closeDate?.toISOString() ?? null,
      dealStage: d.dealStage,
      dealStageLabel:
        d.dealStage != null
          ? stageLabel.get(`${d.pipeline ?? ""}::${d.dealStage}`) ?? null
          : null,
      pipeline: d.pipeline,
      pipelineLabel: d.pipeline != null ? pipelineLabel.get(d.pipeline) ?? null : null,
      amount,
    });
  }

  return NextResponse.json({ deals: out, amountField });
}

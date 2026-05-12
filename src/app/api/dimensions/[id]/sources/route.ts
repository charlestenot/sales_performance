import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Returns the universe of source values for the dimension's attribute.
 * Each source is { value, label, count? } — usable as multi-select options.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const dimId = Number(id);
  if (!Number.isFinite(dimId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const dim = await prisma.dimension.findUnique({ where: { id: dimId } });
  if (!dim) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (dim.attribute === "user") {
    const reps = await prisma.salesRep.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, ownerId: true, terminated: true },
    });
    return NextResponse.json({
      attribute: dim.attribute,
      sources: reps.map((r) => ({
        value: r.id,
        label: r.name,
        sublabel: r.ownerId,
        archived: r.terminated,
      })),
    });
  }
  if (dim.attribute === "team") {
    const teams = await prisma.team.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json({
      attribute: dim.attribute,
      sources: teams.map((t) => ({ value: t.id, label: t.name, archived: t.archived })),
    });
  }
  if (dim.attribute === "role") {
    const roles = await prisma.role.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json({
      attribute: dim.attribute,
      sources: roles.map((r) => ({ value: r.id, label: r.name, archived: r.archived })),
    });
  }
  if (dim.attribute === "pipeline") {
    const grouped = await prisma.deal.groupBy({
      by: ["pipeline"],
      _count: { _all: true },
      where: { pipeline: { not: null } },
    });
    return NextResponse.json({
      attribute: dim.attribute,
      sources: grouped
        .filter((g) => g.pipeline)
        .sort((a, b) => b._count._all - a._count._all)
        .map((g) => ({ value: g.pipeline as string, label: g.pipeline as string, count: g._count._all })),
    });
  }
  if (dim.attribute === "stage") {
    // Restrict to stages currently selected in the Stage mapping (the user's
    // active set). Without it, we fall back to all distinct stages.
    const stageSetting = await prisma.appSetting.findUnique({
      where: { key: "performance_actual_stages" },
    });
    let selected: { pipeline: string | null; stage: string | null }[] = [];
    if (stageSetting) {
      try {
        const parsed = JSON.parse(stageSetting.value);
        if (Array.isArray(parsed)) selected = parsed;
      } catch {}
    }
    const grouped = await prisma.deal.groupBy({
      by: ["pipeline", "dealStage"],
      _count: { _all: true },
      where: { dealStage: { not: null } },
    });
    const allowedKeys = new Set(selected.map((s) => `${s.pipeline ?? ""}::${s.stage ?? ""}`));
    const sources: { value: string; label: string; count: number }[] = [];
    for (const g of grouped) {
      if (!g.dealStage) continue;
      const key = `${g.pipeline ?? ""}::${g.dealStage ?? ""}`;
      if (allowedKeys.size > 0 && !allowedKeys.has(key)) continue;
      sources.push({
        value: `${g.pipeline ?? ""}::${g.dealStage ?? ""}`,
        label: `${g.pipeline ?? "(no pipeline)"} → ${g.dealStage}`,
        count: g._count._all,
      });
    }
    sources.sort((a, b) => b.count - a.count);
    return NextResponse.json({ attribute: dim.attribute, sources });
  }
  return NextResponse.json({ error: "unknown attribute" }, { status: 500 });
}

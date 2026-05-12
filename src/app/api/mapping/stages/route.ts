import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listDealPipelines } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTING_KEY = "performance_actual_stages";

type StageKey = { pipeline: string | null; stage: string | null };

export async function GET() {
  // Distinct (pipeline, stage) tuples from local deals, with counts.
  const grouped = await prisma.deal.groupBy({
    by: ["pipeline", "dealStage"],
    _count: { _all: true },
  });

  // Pipeline metadata from HubSpot for human-readable labels (best-effort).
  const labels = new Map<string, { label: string; stages: Map<string, string> }>();
  try {
    const pipelines = await listDealPipelines();
    for (const p of pipelines) {
      const stages = new Map<string, string>();
      for (const s of p.stages ?? []) stages.set(s.id, s.label);
      labels.set(p.id, { label: p.label, stages });
      // Some pipeline ids don't match the value stored on Deal.pipeline (e.g.
      // legacy pipelines store the label there). Index by label too.
      labels.set(p.label, { label: p.label, stages });
    }
  } catch {
    // No HubSpot access (offline / token missing) — return raw values only.
  }

  const available = grouped.map((g) => {
    const pipKey = g.pipeline ?? "";
    const meta = labels.get(pipKey);
    return {
      pipeline: g.pipeline,
      stage: g.dealStage,
      count: g._count._all,
      pipelineLabel: meta?.label ?? null,
      stageLabel: g.dealStage ? meta?.stages.get(g.dealStage) ?? null : null,
    };
  });

  // Sort by pipeline, then by count desc within pipeline.
  available.sort((a, b) => {
    const pa = (a.pipelineLabel ?? a.pipeline ?? "") || "";
    const pb = (b.pipelineLabel ?? b.pipeline ?? "") || "";
    if (pa !== pb) return pa.localeCompare(pb);
    return b.count - a.count;
  });

  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  let selected: StageKey[] = [];
  if (setting) {
    try {
      const parsed = JSON.parse(setting.value);
      if (Array.isArray(parsed)) selected = parsed;
    } catch {}
  }

  return NextResponse.json({ available, selected });
}

export async function POST(req: Request) {
  const body = await req.json();
  const selected = body.selected;
  if (!Array.isArray(selected)) {
    return NextResponse.json({ error: "selected: array required" }, { status: 400 });
  }
  // Normalise to plain {pipeline, stage} objects.
  const normalised: StageKey[] = [];
  for (const s of selected) {
    if (s && typeof s === "object") {
      normalised.push({
        pipeline: s.pipeline ?? null,
        stage: s.stage ?? null,
      });
    }
  }
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(normalised) },
    update: { value: JSON.stringify(normalised) },
  });
  return NextResponse.json({ ok: true, count: normalised.length });
}

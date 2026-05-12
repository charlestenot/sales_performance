import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSyncRunning, runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [latest, history, dealCount, ownerCount] = await Promise.all([
    prisma.syncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.syncRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.deal.count(),
    prisma.owner.count(),
  ]);
  return NextResponse.json({ latest, history, dealCount, ownerCount, running: latest?.status === "running" });
}

export async function POST() {
  if (!process.env.HUBSPOT_TOKEN) {
    return NextResponse.json({ error: "HUBSPOT_TOKEN is not set in .env" }, { status: 400 });
  }
  if (await isSyncRunning()) {
    return NextResponse.json({ error: "A sync is already running" }, { status: 409 });
  }
  // Kick off sync without awaiting — return immediately so UI can poll status.
  runSync("manual").catch((e) => console.error("[sync] manual run failed:", e));
  return NextResponse.json({ ok: true, started: true });
}

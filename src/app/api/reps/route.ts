import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentMonthUTC, parseMonthString } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";
  const monthParam = url.searchParams.get("month");
  const repIdRaw = url.searchParams.get("repId");
  const repId = repIdRaw ? Number(repIdRaw) : null;

  let monthFilter: Date | undefined;
  if (!all && !repId) {
    const m = monthParam ? parseMonthString(monthParam) : currentMonthUTC();
    monthFilter = m ?? currentMonthUTC();
  }

  // Always return only real monthly rows (no empty placeholders). Filter on
  // month, repId, or both — fall through to all history if neither is set.
  const where: { month?: Date; salesRepId?: number } = {};
  if (monthFilter) where.month = monthFilter;
  if (repId && Number.isFinite(repId)) where.salesRepId = repId;

  const monthly = await prisma.repMonthly.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: [{ month: "desc" }, { salesRepId: "asc" }, { id: "asc" }],
    include: { rep: true },
  });
  const rows = monthly.map((m) => ({
    monthlyId: m.id,
    repId: m.salesRepId,
    repName: m.rep.name,
    ownerId: m.rep.ownerId,
    startDate: m.rep.startDate?.toISOString() ?? null,
    month: m.month.toISOString(),
    roleId: m.roleId,
    roleName: m.roleName,
    baseQuota: m.baseQuota,
    teamId: m.teamId,
    teamName: m.teamName,
    manager: m.manager,
    quota: m.quota,
    frupPct: m.frupPct,
  }));
  return NextResponse.json({
    rows,
    mode: monthFilter ? "month" : "all",
    month: monthFilter?.toISOString() ?? null,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const ownerId = String(body.ownerId ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!ownerId) return NextResponse.json({ error: "ownerId required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const exists = await prisma.salesRep.findUnique({ where: { ownerId } });
  if (exists) {
    return NextResponse.json({ error: "A rep with this HubSpot ID already exists" }, { status: 409 });
  }

  const rep = await prisma.salesRep.create({
    data: {
      ownerId,
      name,
      startDate: body.startDate ? new Date(body.startDate) : null,
    },
  });
  return NextResponse.json({ rep });
}

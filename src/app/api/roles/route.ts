import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseRampPct, serializeRampPct } from "@/lib/ramp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ROLES = [
  "Account Executive",
  "Account Executive Senior",
  "Account Executive Small Business",
  "Account Executive US Corp",
  "Team Lead Sales",
  "Team Lead Small Business",
  "Inside Sales",
  "Inside Sales Senior",
];

async function seedIfEmpty() {
  const count = await prisma.role.count();
  if (count > 0) return;
  await prisma.role.createMany({
    data: DEFAULT_ROLES.map((name, i) => ({ name, baseQuota: 0, rampPct: "[]", sortOrder: i })),
  });
}

export async function GET() {
  await seedIfEmpty();
  const roles = await prisma.role.findMany({
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      baseQuota: r.baseQuota,
      rampPct: parseRampPct(r.rampPct),
      sortOrder: r.sortOrder,
      archived: r.archived,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const baseQuota = Number(body.baseQuota ?? 0) || 0;
  const rampPct = Array.isArray(body.rampPct) ? body.rampPct.map(Number) : [];

  // Place new roles at the end of the order.
  const max = await prisma.role.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  try {
    const role = await prisma.role.create({
      data: { name, baseQuota, rampPct: serializeRampPct(rampPct), sortOrder },
    });
    return NextResponse.json({ role });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

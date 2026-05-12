import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const dimId = Number(id);
  if (!Number.isFinite(dimId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const values = Array.isArray(body.values) ? body.values : [];

  const max = await prisma.dimensionBucket.aggregate({
    where: { dimensionId: dimId },
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;
  const bucket = await prisma.dimensionBucket.create({
    data: {
      dimensionId: dimId,
      name,
      values: JSON.stringify(values),
      sortOrder,
    },
  });
  return NextResponse.json({ bucket });
}

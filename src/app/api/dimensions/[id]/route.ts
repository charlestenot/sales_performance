import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const dimId = Number(id);
  if (!Number.isFinite(dimId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const dim = await prisma.dimension.findUnique({
    where: { id: dimId },
    include: { buckets: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!dim) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    dimension: {
      id: dim.id,
      name: dim.name,
      attribute: dim.attribute,
      sortOrder: dim.sortOrder,
      buckets: dim.buckets.map((b) => {
        let values: (string | number)[] = [];
        try {
          const parsed = JSON.parse(b.values);
          if (Array.isArray(parsed)) values = parsed;
        } catch {}
        return { id: b.id, name: b.name, values, sortOrder: b.sortOrder };
      }),
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const dimId = Number(id);
  if (!Number.isFinite(dimId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const data: { name?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  try {
    const dim = await prisma.dimension.update({ where: { id: dimId }, data });
    return NextResponse.json({ dimension: dim });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A dimension with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const dimId = Number(id);
  if (!Number.isFinite(dimId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await prisma.dimension.delete({ where: { id: dimId } });
  return NextResponse.json({ ok: true });
}

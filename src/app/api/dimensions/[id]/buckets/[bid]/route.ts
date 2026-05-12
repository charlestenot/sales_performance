import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; bid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { bid } = await ctx.params;
  const id = Number(bid);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const data: { name?: string; values?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (Array.isArray(body.values)) data.values = JSON.stringify(body.values);
  const bucket = await prisma.dimensionBucket.update({ where: { id }, data });
  return NextResponse.json({ bucket });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { bid } = await ctx.params;
  const id = Number(bid);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await prisma.dimensionBucket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

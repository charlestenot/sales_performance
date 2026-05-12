import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeRampPct } from "@/lib/ramp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const roleId = Number(id);
  if (!Number.isFinite(roleId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const data: { name?: string; baseQuota?: number; rampPct?: string; archived?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.baseQuota !== undefined) data.baseQuota = Number(body.baseQuota) || 0;
  if (Array.isArray(body.rampPct)) data.rampPct = serializeRampPct(body.rampPct.map(Number));
  if (typeof body.archived === "boolean") data.archived = body.archived;

  try {
    const role = await prisma.role.update({ where: { id: roleId }, data });
    return NextResponse.json({ role });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const roleId = Number(id);
  if (!Number.isFinite(roleId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  // Don't break historical rows: detach FK on monthly entries (snapshot fields stay).
  await prisma.repMonthly.updateMany({
    where: { roleId },
    data: { roleId: null },
  });
  await prisma.role.delete({ where: { id: roleId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json();
  const data: { name?: string; archived?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.archived === "boolean") data.archived = body.archived;
  try {
    const team = await prisma.team.update({ where: { id: teamId }, data });
    return NextResponse.json({ team });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  // Detach from any reps before deleting (relationMode = "prisma" doesn't enforce).
  await prisma.salesRep.updateMany({ where: { teamId }, data: { teamId: null } });
  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}

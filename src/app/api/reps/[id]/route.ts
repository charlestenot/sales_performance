import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const repId = Number(id);
  if (!Number.isFinite(repId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const data: { name?: string; ownerId?: string; startDate?: Date | null; endDate?: Date | null; managerId?: number | null; teamId?: number | null; currentRoleId?: number | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.ownerId === "string" && body.ownerId.trim()) data.ownerId = body.ownerId.trim();
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.managerId !== undefined) {
    if (body.managerId === null || body.managerId === "") data.managerId = null;
    else if (Number(body.managerId) === repId) {
      return NextResponse.json({ error: "A rep cannot manage themselves" }, { status: 400 });
    } else {
      data.managerId = Number(body.managerId);
    }
  }
  if (body.teamId !== undefined) {
    data.teamId = body.teamId === null || body.teamId === "" ? null : Number(body.teamId);
  }
  if (body.currentRoleId !== undefined) {
    (data as { currentRoleId?: number | null }).currentRoleId =
      body.currentRoleId === null || body.currentRoleId === "" ? null : Number(body.currentRoleId);
  }

  try {
    const rep = await prisma.salesRep.update({ where: { id: repId }, data });
    return NextResponse.json({ rep });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "Another rep already uses this HubSpot ID" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const repId = Number(id);
  if (!Number.isFinite(repId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  // Null out this rep on anyone who reports to them — manager is a soft FK.
  await prisma.salesRep.updateMany({ where: { managerId: repId }, data: { managerId: null } });
  await prisma.salesRep.delete({ where: { id: repId } });
  return NextResponse.json({ ok: true });
}

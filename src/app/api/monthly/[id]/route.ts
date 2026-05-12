import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMonthString } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.month !== undefined) {
    const m = parseMonthString(String(body.month));
    if (!m) return NextResponse.json({ error: "bad month format (use YYYY-MM)" }, { status: 400 });
    data.month = m;
  }

  // Picking a role re-snapshots roleName + baseQuota (unless overridden in body).
  if (body.roleId !== undefined) {
    if (body.roleId === null || body.roleId === "") {
      data.roleId = null;
    } else {
      const role = await prisma.role.findUnique({ where: { id: Number(body.roleId) } });
      if (role) {
        data.roleId = role.id;
        if (body.roleName === undefined) data.roleName = role.name;
        if (body.baseQuota === undefined) data.baseQuota = role.baseQuota;
      }
    }
  }
  if (body.roleName !== undefined) data.roleName = body.roleName || null;
  if (body.baseQuota !== undefined)
    data.baseQuota = body.baseQuota === "" || body.baseQuota == null ? null : Number(body.baseQuota);
  // Team snapshot mirrors role snapshot.
  if (body.teamId !== undefined) {
    if (body.teamId === null || body.teamId === "") {
      data.teamId = null;
    } else {
      const team = await prisma.team.findUnique({ where: { id: Number(body.teamId) } });
      if (team) {
        data.teamId = team.id;
        if (body.teamName === undefined) data.teamName = team.name;
      }
    }
  }
  if (body.teamName !== undefined) data.teamName = body.teamName || null;

  if (body.manager !== undefined) data.manager = body.manager || null;
  if (body.quota !== undefined) data.quota = body.quota === "" || body.quota == null ? null : Number(body.quota);
  if (body.frupPct !== undefined)
    data.frupPct = body.frupPct === "" || body.frupPct == null ? null : Number(body.frupPct);
  if (body.note !== undefined) data.note = body.note || null;

  const entry = await prisma.repMonthly.update({ where: { id: entryId }, data });
  return NextResponse.json({ entry });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await prisma.repMonthly.delete({ where: { id: entryId } });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMonthString } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const repId = Number(id);
  if (!Number.isFinite(repId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const body = await req.json();
  const month = body.month ? parseMonthString(String(body.month)) : null;
  if (!month) return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 });

  // Snapshot role name + base quota at write time so future renames /
  // base-quota changes don't mutate history.
  let roleId: number | null = null;
  let roleName: string | null = body.roleName ?? null;
  let baseQuota: number | null = body.baseQuota != null ? Number(body.baseQuota) : null;
  if (body.roleId != null) {
    const role = await prisma.role.findUnique({ where: { id: Number(body.roleId) } });
    if (role) {
      roleId = role.id;
      roleName = role.name;
      baseQuota = baseQuota ?? role.baseQuota;
    }
  }
  // Same snapshot for team.
  let teamId: number | null = null;
  let teamName: string | null = body.teamName ?? null;
  if (body.teamId != null && body.teamId !== "") {
    const team = await prisma.team.findUnique({ where: { id: Number(body.teamId) } });
    if (team) {
      teamId = team.id;
      teamName = team.name;
    }
  }

  const entry = await prisma.repMonthly.create({
    data: {
      salesRepId: repId,
      month,
      roleId,
      roleName,
      baseQuota,
      teamId,
      teamName,
      manager: body.manager ?? null,
      quota: body.quota != null && body.quota !== "" ? Number(body.quota) : null,
      frupPct: body.frupPct != null && body.frupPct !== "" ? Number(body.frupPct) : null,
      note: body.note ?? null,
    },
  });
  return NextResponse.json({ entry });
}

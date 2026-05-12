import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseMonthString } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingEntry = {
  repId: number | string;
  roleId?: number | string | null;
  manager?: string | null;
  quota?: number | string | null;
  frupPct?: number | string | null;
  note?: string | null;
};

export async function POST(req: Request) {
  const body = await req.json();
  const month = body.month ? parseMonthString(String(body.month)) : null;
  if (!month) return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 });
  if (!Array.isArray(body.entries)) {
    return NextResponse.json({ error: "entries: array required" }, { status: 400 });
  }

  // Pre-fetch roles referenced so we can snapshot label + base quota.
  const roleIds = Array.from(
    new Set(
      (body.entries as IncomingEntry[])
        .map((e) => (e.roleId == null || e.roleId === "" ? null : Number(e.roleId)))
        .filter((id): id is number => id != null && Number.isFinite(id))
    )
  );
  const roles = roleIds.length
    ? await prisma.role.findMany({ where: { id: { in: roleIds } } })
    : [];
  const roleById = new Map(roles.map((r) => [r.id, r]));

  // Resolve incoming entries first so the transaction is short and predictable.
  type Resolved = {
    repId: number;
    roleId: number | null;
    roleName: string | null;
    baseQuota: number | null;
    manager: string | null;
    quota: number | null;
    frupPct: number | null;
    note: string | null;
  };
  const resolved: Resolved[] = [];
  for (const e of body.entries as IncomingEntry[]) {
    const repId = Number(e.repId);
    if (!Number.isFinite(repId)) continue;
    let roleId: number | null = null;
    let roleName: string | null = null;
    let baseQuota: number | null = null;
    if (e.roleId != null && e.roleId !== "") {
      roleId = Number(e.roleId);
      const r = roleById.get(roleId);
      if (r) {
        roleName = r.name;
        baseQuota = r.baseQuota;
      }
    }
    const quotaNum = e.quota == null || e.quota === "" ? null : Number(e.quota);
    const frupNum = e.frupPct == null || e.frupPct === "" ? null : Number(e.frupPct);
    resolved.push({
      repId,
      roleId,
      roleName,
      baseQuota,
      manager: e.manager ?? null,
      quota: Number.isFinite(quotaNum) ? quotaNum : null,
      frupPct: Number.isFinite(frupNum) ? frupNum : null,
      note: e.note ?? null,
    });
  }

  // Look up which reps already have an entry for this month — those get
  // UPDATED; the rest get CREATED. No (salesRepId, month) unique constraint
  // exists on the table yet, so do the upsert by hand on the first match.
  const repIds = resolved.map((r) => r.repId);
  const existing = repIds.length
    ? await prisma.repMonthly.findMany({
        where: { salesRepId: { in: repIds }, month },
        select: { id: true, salesRepId: true },
      })
    : [];
  const existingByRep = new Map(existing.map((e) => [e.salesRepId, e.id]));

  const ops = resolved.map((r) => {
    const exId = existingByRep.get(r.repId);
    const data = {
      roleId: r.roleId,
      roleName: r.roleName,
      baseQuota: r.baseQuota,
      manager: r.manager,
      quota: r.quota,
      frupPct: r.frupPct,
      note: r.note,
    };
    return exId != null
      ? prisma.repMonthly.update({ where: { id: exId }, data })
      : prisma.repMonthly.create({ data: { ...data, salesRepId: r.repId, month } });
  });
  await prisma.$transaction(ops);

  const created = resolved.filter((r) => !existingByRep.has(r.repId)).length;
  const updated = resolved.length - created;
  return NextResponse.json({
    created,
    updated,
    month: month.toISOString(),
  });
}

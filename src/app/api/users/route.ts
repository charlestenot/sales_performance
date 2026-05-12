import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const reps = await prisma.salesRep.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      monthly: { orderBy: [{ month: "desc" }, { id: "desc" }], take: 1 },
      team: { select: { id: true, name: true } },
      currentRole: { select: { id: true, name: true } },
    },
  });
  // Resolve manager names manually since `manager` isn't modelled as a Prisma
  // relation (self-relations conflict with relationMode = "prisma" + Cascade).
  const byId = new Map(reps.map((r) => [r.id, r]));
  return NextResponse.json({
    users: reps.map((r) => {
      const latest = r.monthly[0];
      const manager = r.managerId != null ? byId.get(r.managerId) : null;
      // Prefer the explicit currentRole assignment on the rep; fall back to the
      // latest monthly snapshot for reps that haven't been set up yet.
      const roleId = r.currentRoleId ?? latest?.roleId ?? null;
      const roleName = r.currentRole?.name ?? latest?.roleName ?? null;
      return {
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        startDate: r.startDate?.toISOString() ?? null,
        endDate: r.endDate?.toISOString() ?? null,
        terminated: !!r.endDate,
        currentRoleId: roleId,
        currentRoleName: roleName,
        managerId: r.managerId ?? null,
        managerName: manager?.name ?? null,
        teamId: r.teamId ?? null,
        teamName: r.team?.name ?? null,
      };
    }),
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : null;
  if (!ids || ids.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: "ids: number[] required" }, { status: 400 });
  }
  await prisma.$transaction(
    ids.map((id, i) =>
      prisma.role.update({ where: { id }, data: { sortOrder: i } })
    )
  );
  return NextResponse.json({ ok: true });
}

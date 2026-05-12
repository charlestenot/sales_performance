import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: [{ archived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ teams });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const max = await prisma.team.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;
  try {
    const team = await prisma.team.create({ data: { name, sortOrder } });
    return NextResponse.json({ team });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

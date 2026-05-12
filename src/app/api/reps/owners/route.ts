import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const owners = await prisma.owner.findMany({
    orderBy: [{ archived: "asc" }, { firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      fullName: true,
      archived: true,
    },
  });
  return NextResponse.json({ owners });
}

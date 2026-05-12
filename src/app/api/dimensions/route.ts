import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTRIBUTES = new Set(["user", "team", "role", "pipeline", "stage"]);

export async function GET() {
  const dims = await prisma.dimension.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { buckets: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  return NextResponse.json({
    dimensions: dims.map((d) => ({
      id: d.id,
      name: d.name,
      attribute: d.attribute,
      sortOrder: d.sortOrder,
      buckets: d.buckets.map((b) => {
        let values: (string | number)[] = [];
        try {
          const parsed = JSON.parse(b.values);
          if (Array.isArray(parsed)) values = parsed;
        } catch {}
        return { id: b.id, name: b.name, values, sortOrder: b.sortOrder };
      }),
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const attribute = String(body.attribute ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!ATTRIBUTES.has(attribute)) {
    return NextResponse.json({ error: "attribute must be one of: user, team, role, pipeline, stage" }, { status: 400 });
  }
  const max = await prisma.dimension.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;
  try {
    const dim = await prisma.dimension.create({ data: { name, attribute, sortOrder } });
    return NextResponse.json({ dimension: { ...dim, buckets: [] } });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) {
      return NextResponse.json({ error: "A dimension with this name already exists" }, { status: 409 });
    }
    throw e;
  }
}

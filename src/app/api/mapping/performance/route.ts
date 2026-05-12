import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY = "performance_amount_field";

export async function GET() {
  const setting = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return NextResponse.json({ amountField: setting?.value ?? null });
}

export async function POST(req: Request) {
  const body = await req.json();
  const amountField = typeof body.amountField === "string" ? body.amountField.trim() : null;
  if (amountField) {
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: amountField },
      update: { value: amountField },
    });
  } else {
    await prisma.appSetting.delete({ where: { key: KEY } }).catch(() => {});
  }
  return NextResponse.json({ ok: true, amountField });
}

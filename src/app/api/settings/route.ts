import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pingDeals } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const cron = await prisma.appSetting.findUnique({ where: { key: "cron_enabled" } });
  const rampUnitRow = await prisma.appSetting.findUnique({ where: { key: "ramp_unit" } });
  const rampUnit = rampUnitRow?.value === "usd" ? "usd" : "pct";
  const tokenSet = !!process.env.HUBSPOT_TOKEN;
  let connection: { ok: boolean; error?: string } = { ok: false };
  if (tokenSet) {
    try {
      await pingDeals();
      connection = { ok: true };
    } catch (e) {
      connection = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({
    tokenSet,
    cronEnabled: cron?.value === "true",
    connection,
    rampUnit,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (typeof body.cronEnabled === "boolean") {
    await prisma.appSetting.upsert({
      where: { key: "cron_enabled" },
      create: { key: "cron_enabled", value: body.cronEnabled ? "true" : "false" },
      update: { value: body.cronEnabled ? "true" : "false" },
    });
  }
  if (body.rampUnit === "pct" || body.rampUnit === "usd") {
    await prisma.appSetting.upsert({
      where: { key: "ramp_unit" },
      create: { key: "ramp_unit", value: body.rampUnit },
      update: { value: body.rampUnit },
    });
  }
  return NextResponse.json({ ok: true });
}

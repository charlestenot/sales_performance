import { NextResponse } from "next/server";
import { listDealPipelines } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cache: { data: Awaited<ReturnType<typeof listDealPipelines>>; expiresAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (!cache || cache.expiresAt < now) {
    const data = await listDealPipelines();
    cache = { data, expiresAt: now + TTL_MS };
  }
  return NextResponse.json({ pipelines: cache.data });
}

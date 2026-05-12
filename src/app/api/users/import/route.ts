import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CSV =
  "/Users/charles/Downloads/[Sales Perf]  - V2 Individual Sales Perf.csv";

// Minimal CSV parser supporting quoted fields with commas. The V2 sheet uses
// dollar amounts like "$4,500" wrapped in quotes — we handle that case.
function parseCsv(text: string): Array<Record<string, string>> {
  const lines: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        lines.push(row);
        row = [];
        cur = "";
      } else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    lines.push(row);
  }
  if (lines.length === 0) return [];
  const header = lines[0].map((h) => h.trim());
  return lines.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = (r[i] ?? "").trim();
      return obj;
    });
}

export async function POST(req: Request) {
  let body: { path?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const path = body.path?.trim() || DEFAULT_CSV;

  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read CSV at ${path}: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  const rows = parseCsv(text);
  // Build unique map by ownerId — ignore rows missing owner or name.
  const byOwner = new Map<string, string>();
  for (const r of rows) {
    const ownerId = r["Owner ID"]?.trim();
    const name = r["SalesName"]?.trim();
    if (!ownerId || !name) continue;
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, name);
  }

  const existing = await prisma.salesRep.findMany({
    select: { ownerId: true },
  });
  const existingIds = new Set(existing.map((r) => r.ownerId));

  let created = 0;
  let skipped = 0;
  for (const [ownerId, name] of byOwner) {
    if (existingIds.has(ownerId)) {
      skipped++;
      continue;
    }
    await prisma.salesRep.create({ data: { ownerId, name } });
    created++;
  }

  return NextResponse.json({
    path,
    totalUnique: byOwner.size,
    created,
    skipped,
  });
}

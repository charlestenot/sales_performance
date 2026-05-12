import { NextResponse } from "next/server";
import { listDealProperties } from "@/lib/hubspot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // e.g. "number"
  const props = await listDealProperties();
  const filtered = type ? props.filter((p) => p.type === type) : props;
  // Return shape friendly for client comboboxes.
  // Sort: labelled fields first, then alpha by label/name.
  const sorted = filtered.slice().sort((a, b) => {
    const la = (a.label ?? a.name ?? "").toLowerCase();
    const lb = (b.label ?? b.name ?? "").toLowerCase();
    return la.localeCompare(lb);
  });
  return NextResponse.json({
    properties: sorted.map((p) => ({
      name: p.name,
      label: p.label ?? p.name,
      type: p.type,
      fieldType: p.fieldType,
    })),
  });
}

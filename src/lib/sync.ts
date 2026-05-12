import { prisma } from "./db";
import { countDeals, iterateDeals, iterateOwners, listDealProperties } from "./hubspot";

const STANDARD_PROPS = [
  "dealname",
  "closedate",
  "createdate",
  "hs_lastmodifieddate",
  "hubspot_owner_id",
  "amount",
  "dealstage",
  "pipeline",
];

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0) return new Date(n);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseFloatOrNull(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function isSyncRunning(): Promise<boolean> {
  const running = await prisma.syncRun.findFirst({ where: { status: "running" } });
  return !!running;
}

export async function runSync(trigger: "manual" | "cron"): Promise<{ runId: number; deals: number; owners: number }> {
  if (await isSyncRunning()) throw new Error("A sync is already running");

  const run = await prisma.syncRun.create({
    data: { trigger, status: "running" },
  });

  let dealsFetched = 0;
  let ownersFetched = 0;
  try {
    // 1. Sync owners (small, full refresh each run).
    for await (const o of iterateOwners()) {
      const fullName = [o.firstName, o.lastName].filter(Boolean).join(" ") || null;
      await prisma.owner.upsert({
        where: { id: o.id },
        create: {
          id: o.id,
          email: o.email ?? null,
          firstName: o.firstName ?? null,
          lastName: o.lastName ?? null,
          fullName,
          archived: !!o.archived,
        },
        update: {
          email: o.email ?? null,
          firstName: o.firstName ?? null,
          lastName: o.lastName ?? null,
          fullName,
          archived: !!o.archived,
          syncedAt: new Date(),
        },
      });
      ownersFetched++;
    }

    // 2. Discover deal properties so we capture custom fields without hard-coding.
    const propsMeta = await listDealProperties();
    const customNames = propsMeta
      .map((p) => p.name)
      .filter((n) => !STANDARD_PROPS.includes(n));
    const allProps = Array.from(new Set([...STANDARD_PROPS, ...customNames]));

    // 3. Incremental sync by hs_lastmodifieddate watermark.
    const watermarkRow = await prisma.appSetting.findUnique({
      where: { key: "hubspot_deal_watermark_ms" },
    });
    const sinceMs = watermarkRow ? Number(watermarkRow.value) : 0;
    let maxSeen = sinceMs;

    // Estimate total up-front so the UI can render a progress bar.
    try {
      const total = await countDeals(sinceMs);
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { dealsTotal: total },
      });
    } catch {
      // Non-fatal: leave dealsTotal null and the UI shows indeterminate progress.
    }

    const BATCH = 50;
    type DealUpsertInput = {
      id: string;
      name: string | null;
      ownerId: string | null;
      pipeline: string | null;
      dealStage: string | null;
      closeDate: Date | null;
      createDate: Date | null;
      hsLastModified: Date | null;
      amount: number | null;
      properties: string;
    };
    let buffer: DealUpsertInput[] = [];

    async function flush() {
      if (buffer.length === 0) return;
      const items = buffer;
      buffer = [];
      // Single transaction = one fsync per batch instead of one per row.
      await prisma.$transaction(
        items.map((d) =>
          prisma.deal.upsert({
            where: { id: d.id },
            create: d,
            update: { ...d, syncedAt: new Date() },
          })
        )
      );
      dealsFetched += items.length;
      await prisma.syncRun.update({
        where: { id: run.id },
        data: { dealsFetched },
      });
    }

    for await (const deal of iterateDeals({ properties: allProps, sinceMs })) {
      const p = deal.properties;
      const hsLastModified = parseDate(p.hs_lastmodifieddate);
      buffer.push({
        id: deal.id,
        name: p.dealname ?? null,
        ownerId: p.hubspot_owner_id || null,
        pipeline: p.pipeline ?? null,
        dealStage: p.dealstage ?? null,
        closeDate: parseDate(p.closedate),
        createDate: parseDate(p.createdate),
        hsLastModified,
        amount: parseFloatOrNull(p.amount),
        properties: JSON.stringify(p),
      });
      if (hsLastModified && hsLastModified.getTime() > maxSeen) {
        maxSeen = hsLastModified.getTime();
      }
      if (buffer.length >= BATCH) await flush();
    }
    await flush();

    if (maxSeen > sinceMs) {
      await prisma.appSetting.upsert({
        where: { key: "hubspot_deal_watermark_ms" },
        create: { key: "hubspot_deal_watermark_ms", value: String(maxSeen) },
        update: { value: String(maxSeen) },
      });
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        dealsFetched,
        ownersFetched,
      },
    });
    return { runId: run.id, deals: dealsFetched, owners: ownersFetched };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        dealsFetched,
        ownersFetched,
        errorMessage: msg,
      },
    });
    throw e;
  }
}

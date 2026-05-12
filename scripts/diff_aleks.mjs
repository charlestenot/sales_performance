import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";

const p = new PrismaClient();

const allReps = await p.salesRep.findMany({
  select: { id: true, ownerId: true, name: true, currentRoleId: true, endDate: true },
});
console.log("All reps:");
for (const r of allReps) {
  const term = r.endDate ? " (TERMINATED " + r.endDate.toISOString().slice(0, 10) + ")" : "";
  console.log(`  ${r.name.padEnd(28)} ownerId=${r.ownerId.padEnd(12)} currentRoleId=${r.currentRoleId}${term}`);
}

// CSV
const text = fs.readFileSync("/Users/charles/Downloads/Untitled spreadsheet - Sheet1.csv", "utf8");
const csvLines = text.split(/\r?\n/).filter((l) => l.trim());
const csvIds = csvLines.slice(1).map((l) => l.split(",")[0]);

// Are any of those 34 missing from DB? Check by exact id
const dbIds = new Set((await p.deal.findMany({ where: { id: { in: csvIds } }, select: { id: true } })).map((d) => d.id));
const missing = csvIds.filter((id) => !dbIds.has(id));
console.log(`\nCSV: ${csvIds.length} ids, in DB: ${dbIds.size}, missing from DB: ${missing.length}`);

// Sync run + watermark
const sync = await p.syncRun.findFirst({ orderBy: { startedAt: "desc" } });
const wm = await p.appSetting.findUnique({ where: { key: "hubspot_deal_watermark_ms" } });
console.log(`\nLast sync: ${sync?.startedAt?.toISOString()} status=${sync?.status} fetched=${sync?.dealsFetched}`);
console.log(`Watermark: ${wm?.value} (${wm?.value ? new Date(Number(wm.value)).toISOString() : "n/a"})`);

await p.$disconnect();

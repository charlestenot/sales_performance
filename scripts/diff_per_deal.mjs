import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";

const p = new PrismaClient();
const text = fs.readFileSync("/Users/charles/Downloads/Untitled spreadsheet - Sheet1.csv", "utf8");
function parseCsv(t) {
  const out = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
const rows = parseCsv(text).filter((r) => r[0]);
const head = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));

const csvById = new Map();
for (const r of records) {
  csvById.set(r["Record ID"], {
    owner: r["Deal owner"],
    mrr: Number(r["MRR incremental at close date"] || 0),
    stage: r["Deal Stage"],
    pipeline: r["Pipeline"],
    closeDate: r["Close Date"],
  });
}

// Pull our DB deals for IS owners (not Aleks) in April with matched stages.
const isOwners = ["32292803", "29173646", "29348140", "136690510", "78303310", "30469706"];
const stagePairs = new Set(["71583962::172414709", "500369134::761079517", "default::closedwon"]);
const deals = await p.deal.findMany({
  where: { ownerId: { in: isOwners }, closeDate: { gte: new Date("2026-04-01"), lte: new Date("2026-04-30T23:59:59Z") } },
});
let matched = 0, dbSum = 0, csvSum = 0;
const dbInCsv = [], dbOnly = [];
const mrrDiffs = [];
for (const d of deals) {
  const k = `${d.pipeline ?? ""}::${d.dealStage ?? ""}`;
  if (!stagePairs.has(k)) continue;
  matched++;
  const props = JSON.parse(d.properties);
  const dbMrr = Number(props.mrr_incremental_at_close_date ?? 0);
  dbSum += dbMrr;
  if (csvById.has(d.id)) {
    dbInCsv.push(d.id);
    csvSum += csvById.get(d.id).mrr;
    const csvMrr = csvById.get(d.id).mrr;
    if (Math.abs(dbMrr - csvMrr) > 0.01) {
      mrrDiffs.push({ id: d.id, csv: csvMrr, db: dbMrr, owner: csvById.get(d.id).owner });
    }
  } else {
    dbOnly.push({ id: d.id, mrr: dbMrr, owner: d.ownerId, stage: d.dealStage, pipeline: d.pipeline });
  }
}
console.log(`Our DB matched (excluding Aleksandar): ${matched} deals`);
console.log(`  DB sum: $${dbSum.toFixed(2)}`);
console.log(`  Same deals' CSV sum: $${csvSum.toFixed(2)}`);
console.log(`  Diff: $${(dbSum - csvSum).toFixed(2)}`);
console.log(`\nDB-counted deals NOT in CSV: ${dbOnly.length}`);
for (const x of dbOnly) console.log(`  ${x.id} owner=${x.owner} stage=${x.stage} pipeline=${x.pipeline} mrr=$${x.mrr}`);
console.log(`\nDeals where MRR differs >$0.01 between CSV and DB: ${mrrDiffs.length}`);
for (const d of mrrDiffs.slice(0, 10)) console.log(`  ${d.id} (${d.owner}): csv=$${d.csv} db=$${d.db} delta=$${(d.db - d.csv).toFixed(2)}`);

await p.$disconnect();

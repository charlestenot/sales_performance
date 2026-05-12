import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";

const p = new PrismaClient();

// Parse CSV (handles quoted fields).
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

// CSV totals
let csvTotal = 0;
const csvByOwner = {};
const csvIds = [];
for (const r of records) {
  const id = r["Record ID"];
  const mrr = Number(r["MRR incremental at close date"] || 0);
  csvTotal += mrr;
  csvIds.push(id);
  csvByOwner[r["Deal owner"]] = (csvByOwner[r["Deal owner"]] || 0) + mrr;
}
console.log(`CSV: ${records.length} deals, total $${csvTotal.toFixed(2)}`);
console.log("CSV by owner:");
for (const [k, v] of Object.entries(csvByOwner).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(28)} $${v.toFixed(2)}`);
}

// DB IS bucket reps + Aleksandar
const isReps = await p.salesRep.findMany({
  where: { currentRoleId: { in: [11, 12] } },
  select: { id: true, ownerId: true, name: true },
});
const isOwners = isReps.map((r) => r.ownerId);
const allIsCandidates = [...isOwners, "78303311"]; // include Aleksandar manually

const stagePairs = new Set([
  "71583962::172414709",
  "500369134::761079517",
  "default::closedwon",
]);

// Aleksandar in our DB
const aleksDeals = await p.deal.findMany({
  where: {
    ownerId: "78303311",
    closeDate: { gte: new Date("2026-04-01"), lte: new Date("2026-04-30T23:59:59Z") },
  },
});
let aleksMatched = 0, aleksMrr = 0;
for (const d of aleksDeals) {
  const k = `${d.pipeline ?? ""}::${d.dealStage ?? ""}`;
  if (!stagePairs.has(k)) continue;
  aleksMatched++;
  const props = JSON.parse(d.properties);
  aleksMrr += Number(props.mrr_incremental_at_close_date ?? 0);
}
console.log(`\nAleksandar in DB (April, matched stages): ${aleksMatched} deals, $${aleksMrr.toFixed(2)}`);
console.log(`Aleksandar in CSV: ${csvByOwner["Aleksandar DAVIDOVIC"] != null ? "$" + csvByOwner["Aleksandar DAVIDOVIC"].toFixed(2) : "none"}`);

// Per-deal compare for Aleksandar's CSV deals vs our DB
const aleksCsvIds = records.filter((r) => r["Deal owner"] === "Aleksandar DAVIDOVIC").map((r) => r["Record ID"]);
const aleksDbById = new Map(aleksDeals.map((d) => [d.id, d]));
let csvDbMatch = 0, csvOnly = 0, dbOnly = 0;
let totalCsvMrr = 0, totalDbMrr = 0;
for (const r of records.filter((r) => r["Deal owner"] === "Aleksandar DAVIDOVIC")) {
  const id = r["Record ID"];
  const csvMrr = Number(r["MRR incremental at close date"] || 0);
  totalCsvMrr += csvMrr;
  const d = aleksDbById.get(id);
  if (d) {
    csvDbMatch++;
    const props = JSON.parse(d.properties);
    totalDbMrr += Number(props.mrr_incremental_at_close_date ?? 0);
  } else {
    csvOnly++;
  }
}
console.log(`Aleksandar CSV/DB intersection: ${csvDbMatch}, csv-only: ${csvOnly}, csv mrr=$${totalCsvMrr.toFixed(2)}, db mrr=$${totalDbMrr.toFixed(2)}`);

await p.$disconnect();

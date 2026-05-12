import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";

const p = new PrismaClient();

// --- Parse CSV ---
const path = "/Users/charles/Downloads/Untitled spreadsheet - Sheet1 (1).csv";
const text = fs.readFileSync(path, "utf8");
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
function parseMoney(s) {
  if (!s) return null;
  const x = String(s).replace(/[$,\s]/g, "");
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function dmyToYM(s) {
  const parts = String(s).split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}`;
}

const rows = parseCsv(text).filter((r) => r[0]);
const headers = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), r[i] ?? ""])));

// CSV: rep → month → quota
const csvByRep = new Map();
for (const r of records) {
  const name = (r["SalesName"] || "").trim();
  const ym = dmyToYM(r["Calendar Month"] || "");
  const q = parseMoney(r["Quota"]);
  if (!name || !ym) continue;
  const m = csvByRep.get(name) ?? new Map();
  m.set(ym, q ?? 0);
  csvByRep.set(name, m);
}

// --- Pull our DB quotas for the same set of reps ---
const allReps = await p.salesRep.findMany({ select: { id: true, name: true, ownerId: true, currentRoleId: true } });
function normalise(s) { return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim(); }
const repByNormName = new Map(allReps.map((r) => [normalise(r.name), r]));

// Map CSV rep name → DB rep
const repMatches = new Map();
for (const csvName of csvByRep.keys()) {
  const r = repByNormName.get(normalise(csvName));
  repMatches.set(csvName, r ?? null);
}

// All RepMonthly entries for those rep ids
const matchedRepIds = [...repMatches.values()].filter(Boolean).map((r) => r.id);
const dbEntries = await p.repMonthly.findMany({
  where: { salesRepId: { in: matchedRepIds } },
  orderBy: [{ salesRepId: "asc" }, { month: "asc" }],
});
// DB: repId → month → sum quota (in case multiple entries per month)
const dbByRep = new Map();
for (const e of dbEntries) {
  const ym = e.month.toISOString().slice(0, 7);
  const m = dbByRep.get(e.salesRepId) ?? new Map();
  m.set(ym, (m.get(ym) ?? 0) + (e.quota ?? 0));
  dbByRep.set(e.salesRepId, m);
}

// --- Build per-rep diff ---
const allMonths = new Set();
for (const m of csvByRep.values()) for (const k of m.keys()) allMonths.add(k);
for (const m of dbByRep.values()) for (const k of m.keys()) allMonths.add(k);
const months = [...allMonths].sort();

const fmt = (n) => (n == null ? "—" : n === 0 ? "$0" : `$${Math.round(n).toLocaleString("en-US")}`);

console.log("\nPer-rep quota diff (CSV vs our DB):\n");
let totalCsv = 0, totalDb = 0;
for (const csvName of csvByRep.keys()) {
  const rep = repMatches.get(csvName);
  if (!rep) {
    const csvRepTotal = [...csvByRep.get(csvName).values()].reduce((a, b) => a + (b ?? 0), 0);
    console.log(`${csvName}  ⚠ NOT FOUND in DB  (CSV total $${csvRepTotal.toLocaleString()})`);
    totalCsv += csvRepTotal;
    continue;
  }
  const csvMap = csvByRep.get(csvName);
  const dbMap = dbByRep.get(rep.id) ?? new Map();
  let csvTot = 0, dbTot = 0;
  const diffs = [];
  for (const ym of months) {
    if (!csvMap.has(ym) && !dbMap.has(ym)) continue;
    const c = csvMap.get(ym);
    const d = dbMap.get(ym);
    csvTot += c ?? 0;
    dbTot += d ?? 0;
    if (c == null && d != null) diffs.push(`${ym}: CSV — / DB ${fmt(d)}  (extra in DB)`);
    else if (c != null && d == null) diffs.push(`${ym}: CSV ${fmt(c)} / DB —  (missing in DB)`);
    else if ((c ?? 0) !== (d ?? 0)) diffs.push(`${ym}: CSV ${fmt(c)} / DB ${fmt(d)}  Δ ${fmt((d ?? 0) - (c ?? 0))}`);
  }
  totalCsv += csvTot;
  totalDb += dbTot;
  console.log(`${csvName}  (DB id=${rep.id}, currentRoleId=${rep.currentRoleId})`);
  console.log(`  CSV total: ${fmt(csvTot)}   DB total: ${fmt(dbTot)}   Δ ${fmt(dbTot - csvTot)}`);
  if (diffs.length === 0) console.log(`  ✔ months match exactly`);
  else for (const line of diffs) console.log(`    ${line}`);
  console.log();
}

console.log(`\nGRAND TOTAL  CSV: ${fmt(totalCsv)}  DB: ${fmt(totalDb)}  Δ ${fmt(totalDb - totalCsv)}`);

await p.$disconnect();

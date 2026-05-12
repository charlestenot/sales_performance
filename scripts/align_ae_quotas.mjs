// Regenerate monthly quotas for AE reps from the spreadsheet's per-month role
// assignments. Creates the missing "AE US Corp" role if needed. Overrides
// existing quotas, leaves SalesRep.currentRoleId untouched, and clears the
// manager field on every entry.

import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";
import { suggestedFromRamp, seniorityMonths, parseRamp } from "../src/lib/ramp.ts";

const p = new PrismaClient();
const path = "/Users/charles/Downloads/Untitled spreadsheet - Sheet1 (2).csv";
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
function dmyToYM(s) {
  const parts = String(s).split("/");
  if (parts.length !== 3) return null;
  const [, m, y] = parts;
  return `${y.padStart(4, "0")}-${m.padStart(2, "0")}`;
}
function ymToDate(ym) {
  const [y, m] = ym.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1));
}
function normalise(s) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const rows = parseCsv(text).filter((r) => r[0]);
const headers = rows[0];
const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));

// Group by rep → ym → role
const csvByRep = new Map();
for (const r of records) {
  const name = r["SalesName"];
  const ym = dmyToYM(r["Calendar Month"]);
  const role = r["Role"];
  if (!name || !ym || !role) continue;
  const m = csvByRep.get(name) ?? new Map();
  m.set(ym, role);
  csvByRep.set(name, m);
}

// --- Resolve role mapping (creating "AE US Corp" if missing) ---
const ROLE_MAP_PRIMARY = new Map([
  ["AE", "Account Executive - France"],
  ["AE Senior", "Senior Account Executive - France"],
  ["Lead AE", "Team Lead - Sales"],
]);
const allRoles = await p.role.findMany();
const roleByName = new Map(allRoles.map((r) => [r.name, r]));
const csvRoleToDbRole = new Map();
for (const [csvName, dbName] of ROLE_MAP_PRIMARY) {
  const r = roleByName.get(dbName);
  if (!r) throw new Error(`Missing DB role: ${dbName}`);
  csvRoleToDbRole.set(csvName, r);
}
let aeUsCorpRole = roleByName.get("AE US Corp") ?? roleByName.get("Account Executive US Corp");
if (!aeUsCorpRole) {
  const max = await p.role.aggregate({ _max: { sortOrder: true } });
  aeUsCorpRole = await p.role.create({
    data: {
      name: "AE US Corp",
      baseQuota: 5500,
      rampPct: JSON.stringify([0, 1000, 2000, 3000, 4500, 5500]),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  console.log(`✓ Created role "AE US Corp" (id=${aeUsCorpRole.id})`);
}
csvRoleToDbRole.set("AE US Corp", aeUsCorpRole);

// --- Settings ---
const unitSetting = await p.appSetting.findUnique({ where: { key: "rampUnit" } });
const rampUnit = unitSetting?.value === "pct" ? "pct" : "usd"; // existing roles use $ ramps
console.log(`Ramp unit: ${rampUnit}`);

// --- Reps lookup ---
const allReps = await p.salesRep.findMany();
const repByNorm = new Map(allReps.map((r) => [normalise(r.name), r]));

let creates = 0, updates = 0, deletes = 0, skipped = 0;
const issues = [];

for (const [csvName, monthMap] of csvByRep) {
  const rep = repByNorm.get(normalise(csvName));
  if (!rep) {
    issues.push(`SKIP  ${csvName}  not found in DB`);
    skipped++;
    continue;
  }
  if (!rep.startDate) {
    issues.push(`SKIP  ${csvName}  no start date — cannot compute seniority`);
    skipped++;
    continue;
  }
  const startDate = new Date(rep.startDate);

  // Pull all DB entries for this rep
  const dbRows = await p.repMonthly.findMany({
    where: { salesRepId: rep.id },
    orderBy: [{ month: "asc" }, { id: "asc" }],
  });
  const dbByMonth = new Map();
  for (const e of dbRows) {
    const k = e.month.toISOString().slice(0, 7);
    const arr = dbByMonth.get(k) ?? [];
    arr.push(e);
    dbByMonth.set(k, arr);
  }

  for (const [ym, csvRoleName] of monthMap) {
    const role = csvRoleToDbRole.get(csvRoleName);
    if (!role) {
      issues.push(`SKIP  ${csvName} ${ym}  unknown role ${csvRoleName}`);
      continue;
    }
    const monthDate = ymToDate(ym);
    const seniority = seniorityMonths(startDate, monthDate);
    const ramp = parseRamp(role.rampPct);
    const sug = suggestedFromRamp({ baseQuota: role.baseQuota, ramp, unit: rampUnit, seniority });
    const computedQuota = Math.round(sug.quota);

    const existing = dbByMonth.get(ym);
    if (existing && existing.length > 0) {
      const first = existing[0];
      await p.repMonthly.update({
        where: { id: first.id },
        data: {
          roleId: role.id,
          roleName: role.name,
          baseQuota: role.baseQuota,
          teamId: null,
          teamName: null,
          manager: null,
          quota: computedQuota,
          frupPct: sug.frupPct,
        },
      });
      updates++;
    } else {
      await p.repMonthly.create({
        data: {
          salesRepId: rep.id,
          month: monthDate,
          roleId: role.id,
          roleName: role.name,
          baseQuota: role.baseQuota,
          teamId: null,
          teamName: null,
          manager: null,
          quota: computedQuota,
          frupPct: sug.frupPct,
        },
      });
      creates++;
    }
  }

  // Delete DB entries for months not in the CSV (full alignment).
  for (const [ym, entries] of dbByMonth) {
    if (monthMap.has(ym)) continue;
    for (const e of entries) {
      await p.repMonthly.delete({ where: { id: e.id } });
      deletes++;
    }
  }
}

if (issues.length) {
  console.log("\nIssues:");
  for (const line of issues) console.log("  " + line);
}
console.log(`\n${creates} created, ${updates} updated, ${deletes} deleted, ${skipped} reps skipped`);

await p.$disconnect();

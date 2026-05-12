// Align RepMonthly entries for the 7 Inside-Sales reps in the spreadsheet to
// match the CSV exactly. For each matched rep:
//   - Update existing entries' quotas to match the CSV value (other fields kept).
//   - Create new entries for months in CSV but not in DB (snapshots role + team
//     from the rep's CURRENT values).
//   - Delete entries in DB but not in the CSV for that rep.
// Reports every change.

import { PrismaClient } from "../src/generated/prisma/index.js";
import fs from "node:fs";

const p = new PrismaClient();
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
const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), r[i] ?? ""])));

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

const allReps = await p.salesRep.findMany({
  select: { id: true, name: true, ownerId: true, currentRoleId: true, teamId: true, managerId: true },
});
const repByNorm = new Map(allReps.map((r) => [normalise(r.name), r]));

let creates = 0, updates = 0, deletes = 0, unchanged = 0;
const log = [];

for (const [csvName, monthMap] of csvByRep) {
  const rep = repByNorm.get(normalise(csvName));
  if (!rep) {
    log.push(`SKIP  ${csvName}  not found in DB`);
    continue;
  }

  // Pre-snapshot role + team for any new entries we'll create.
  const role = rep.currentRoleId
    ? await p.role.findUnique({ where: { id: rep.currentRoleId } })
    : null;
  const team = rep.teamId
    ? await p.team.findUnique({ where: { id: rep.teamId } })
    : null;
  const manager = rep.managerId
    ? await p.salesRep.findUnique({ where: { id: rep.managerId }, select: { name: true } })
    : null;

  const dbRows = await p.repMonthly.findMany({
    where: { salesRepId: rep.id },
    orderBy: [{ month: "asc" }, { id: "asc" }],
  });
  // group by ym
  const dbByMonth = new Map();
  for (const e of dbRows) {
    const k = e.month.toISOString().slice(0, 7);
    const arr = dbByMonth.get(k) ?? [];
    arr.push(e);
    dbByMonth.set(k, arr);
  }

  // 1. Update / create per CSV month
  for (const [ym, csvQuota] of monthMap) {
    const existing = dbByMonth.get(ym);
    if (existing && existing.length > 0) {
      // Update the first entry's quota; if there are duplicate entries for
      // the same month, leave duplicates' quotas alone (rare; user-managed).
      const first = existing[0];
      if ((first.quota ?? 0) === csvQuota) {
        unchanged++;
      } else {
        await p.repMonthly.update({ where: { id: first.id }, data: { quota: csvQuota } });
        updates++;
        log.push(`UPDATE ${csvName.padEnd(22)} ${ym}  quota ${first.quota ?? "—"} → ${csvQuota}`);
      }
    } else {
      await p.repMonthly.create({
        data: {
          salesRepId: rep.id,
          month: ymToDate(ym),
          roleId: role?.id ?? null,
          roleName: role?.name ?? null,
          baseQuota: role?.baseQuota ?? null,
          teamId: team?.id ?? null,
          teamName: team?.name ?? null,
          manager: manager?.name ?? null,
          quota: csvQuota,
          frupPct: null,
        },
      });
      creates++;
      log.push(`CREATE ${csvName.padEnd(22)} ${ym}  quota = ${csvQuota}`);
    }
  }

  // 2. Delete entries in DB but not in CSV for this rep
  for (const [ym, entries] of dbByMonth) {
    if (monthMap.has(ym)) continue;
    for (const e of entries) {
      await p.repMonthly.delete({ where: { id: e.id } });
      deletes++;
      log.push(`DELETE ${csvName.padEnd(22)} ${ym}  was quota=${e.quota ?? "—"}`);
    }
  }
}

for (const line of log) console.log(line);
console.log(`\n${creates} created, ${updates} updated, ${deletes} deleted, ${unchanged} unchanged`);

await p.$disconnect();

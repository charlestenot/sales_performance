// One-off: parse scripts/hr_log.tsv and update SalesRep.startDate to the
// earliest "Role Start Date" matching each rep by name (case + accent
// insensitive). Reports DB reps not found in the log — those are likely "left"
// employees; we leave endDate alone for the user to confirm in the UI.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

function normalize(s) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseDDMMYYYY(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

const tsv = readFileSync(join(__dirname, "hr_log.tsv"), "utf8");
const lines = tsv.split(/\r?\n/).filter((l) => l.trim() !== "");
const header = lines[0].split("\t").map((s) => s.trim());
const fullNameIdx = header.indexOf("Full Name");
const dateIdx = header.indexOf("Role Start Date");
if (fullNameIdx < 0 || dateIdx < 0) throw new Error("missing required columns");

// fullKey = normalized full name → { earliest: Date, original: string }
const byFull = new Map();
// firstLast = normalized "first last" (first 2 tokens) → list of fullKeys (for fuzzy fallback)
const byFirstLast = new Map();

for (const line of lines.slice(1)) {
  const cols = line.split("\t");
  const name = (cols[fullNameIdx] ?? "").trim();
  const dateRaw = (cols[dateIdx] ?? "").trim();
  if (!name || !dateRaw) continue;
  const date = parseDDMMYYYY(dateRaw);
  if (!date) continue;
  const key = normalize(name);
  const existing = byFull.get(key);
  if (!existing || date < existing.earliest) {
    byFull.set(key, { earliest: date, original: name });
  }
  const tokens = key.split(" ");
  if (tokens.length >= 2) {
    const fl = `${tokens[0]} ${tokens[tokens.length - 1]}`;
    if (!byFirstLast.has(fl)) byFirstLast.set(fl, new Set());
    byFirstLast.get(fl).add(key);
  }
}

const reps = await prisma.salesRep.findMany({ orderBy: { name: "asc" } });

const matched = [];
const unmatched = [];

for (const rep of reps) {
  const repKey = normalize(rep.name);
  let hit = byFull.get(repKey);
  let how = "exact";
  if (!hit) {
    const tokens = repKey.split(" ");
    if (tokens.length >= 2) {
      const fl = `${tokens[0]} ${tokens[tokens.length - 1]}`;
      const set = byFirstLast.get(fl);
      if (set && set.size === 1) {
        const onlyKey = [...set][0];
        hit = byFull.get(onlyKey);
        how = `first+last → ${hit?.original ?? "?"}`;
      } else if (set && set.size > 1) {
        how = `first+last AMBIGUOUS (${set.size} candidates) — skipped`;
      }
    }
  }
  // Token-subset fallback: one name's tokens are a subset of the other's
  // (covers e.g. "Eduardo Harriague Castex" ↔ "Eduardo Harriague").
  if (!hit) {
    const repTokens = new Set(repKey.split(" "));
    const candidates = [];
    for (const [logKey, val] of byFull) {
      const logTokens = new Set(logKey.split(" "));
      const inter = [...repTokens].filter((t) => logTokens.has(t)).length;
      if (inter < 2) continue;
      const dbSubsetOfLog = [...repTokens].every((t) => logTokens.has(t));
      const logSubsetOfDb = [...logTokens].every((t) => repTokens.has(t));
      if (dbSubsetOfLog || logSubsetOfDb) {
        candidates.push({ logKey, val });
      }
    }
    if (candidates.length === 1) {
      hit = candidates[0].val;
      how = `token-subset → ${hit.original}`;
    } else if (candidates.length > 1) {
      how = `token-subset AMBIGUOUS (${candidates.length} candidates) — skipped`;
    }
  }
  if (hit) {
    matched.push({ rep, hit, how });
  } else {
    unmatched.push(rep);
  }
}

console.log(`\nMatched: ${matched.length} / ${reps.length}\n`);
for (const { rep, hit, how } of matched) {
  const prev = rep.startDate ? rep.startDate.toISOString().slice(0, 10) : "—";
  const next = hit.earliest.toISOString().slice(0, 10);
  const change = prev === next ? " (unchanged)" : prev === "—" ? " (was empty)" : ` (was ${prev})`;
  console.log(`  ${rep.name.padEnd(28)}  ${prev} → ${next}${change}   [${how}]`);
  await prisma.salesRep.update({ where: { id: rep.id }, data: { startDate: hit.earliest } });
}

console.log(`\nUnmatched (DB rep not found in HR log → likely former employee, set endDate manually): ${unmatched.length}`);
for (const rep of unmatched) {
  console.log(`  - ${rep.name}  (owner ${rep.ownerId})`);
}

await prisma.$disconnect();

#!/usr/bin/env node
// One-shot data migration: SQLite (prisma/dev.db) → Postgres (Supabase).
//
// Prereqs:
//   1. Supabase project created. `DIRECT_URL` (port 5432) must be set.
//   2. Postgres schema already migrated (run `prisma migrate deploy` against
//      prisma/schema.postgres.prisma BEFORE running this script — empty tables
//      ready to receive data).
//   3. devDeps installed: `npm i -D better-sqlite3 pg`
//
// Usage:
//   DIRECT_URL='postgres://...:5432/postgres' \
//   node scripts/migrate-to-postgres.mjs
//
// What it does:
//   - Reads every row from each table in prisma/dev.db
//   - Bulk-inserts into Postgres in FK-safe order
//   - Resets each table's id sequence so future inserts continue cleanly
//   - Reports rowcount per table; bails on the first hard error
//
// Idempotent? No — it assumes target tables are empty. If you re-run after a
// partial success, TRUNCATE first or DROP/recreate the schema via `prisma
// migrate reset`.

import Database from "better-sqlite3";
import pg from "pg";
import path from "node:path";

const SQLITE_PATH = path.resolve(process.cwd(), "prisma/dev.db");
const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error("DIRECT_URL is required (Supabase direct connection, port 5432).");
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const { Client } = pg;
const pgClient = new Client({ connectionString: DIRECT_URL });
await pgClient.connect();

// Tables in FK-safe insert order. Auto-increment children (RepMonthly,
// DimensionBucket) reference parents, so parents must land first.
const TABLES = [
  { sqlite: "Owner", pg: '"Owner"', cols: ["id", "email", "firstName", "lastName", "fullName", "archived", "syncedAt"] },
  { sqlite: "Deal", pg: '"Deal"', cols: ["id", "name", "ownerId", "pipeline", "dealStage", "closeDate", "createDate", "hsLastModified", "amount", "properties", "syncedAt"] },
  { sqlite: "SyncRun", pg: '"SyncRun"', cols: ["id", "startedAt", "finishedAt", "trigger", "status", "dealsFetched", "dealsTotal", "ownersFetched", "errorMessage"], serial: true },
  { sqlite: "AppSetting", pg: '"AppSetting"', cols: ["key", "value"] },
  { sqlite: "Role", pg: '"Role"', cols: ["id", "name", "baseQuota", "rampPct", "sortOrder", "archived", "createdAt", "updatedAt"], serial: true },
  { sqlite: "Team", pg: '"Team"', cols: ["id", "name", "sortOrder", "archived", "createdAt", "updatedAt"], serial: true },
  { sqlite: "SalesRep", pg: '"SalesRep"', cols: ["id", "ownerId", "name", "startDate", "endDate", "managerId", "teamId", "currentRoleId", "sortOrder", "createdAt", "updatedAt"], serial: true },
  { sqlite: "RepMonthly", pg: '"RepMonthly"', cols: ["id", "salesRepId", "month", "roleId", "roleName", "baseQuota", "teamId", "teamName", "manager", "quota", "frupPct", "note", "createdAt", "updatedAt"], serial: true },
  { sqlite: "Dimension", pg: '"Dimension"', cols: ["id", "name", "attribute", "sortOrder", "createdAt", "updatedAt"], serial: true },
  { sqlite: "DimensionBucket", pg: '"DimensionBucket"', cols: ["id", "dimensionId", "name", "values", "sortOrder", "createdAt", "updatedAt"], serial: true },
];

// Prisma stores DateTime in SQLite as INTEGER (Unix epoch ms). pg needs real
// Date objects (or ISO strings) for `timestamp` columns. Coerce here.
// SQLite booleans are stored as 0/1; convert to true/false.
const BOOL_COLS = new Set(["archived"]);
const DATE_COLS = new Set([
  "syncedAt",
  "closeDate",
  "createDate",
  "hsLastModified",
  "startedAt",
  "finishedAt",
  "startDate",
  "endDate",
  "month",
  "createdAt",
  "updatedAt",
]);

function coerce(col, value) {
  if (value == null) return null;
  if (BOOL_COLS.has(col)) return value === 1 || value === "1" || value === true;
  if (DATE_COLS.has(col)) {
    // SQLite via better-sqlite3 returns the raw stored value. Prisma writes
    // DateTime as INTEGER epoch-ms, but older rows may also be ISO TEXT —
    // accept either shape.
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") return new Date(value);
    if (value instanceof Date) return value;
    return null;
  }
  return value;
}

const BATCH = 500;

// Truncate every target table first so re-runs are idempotent. CASCADE so we
// don't have to drop in FK-reverse order. Single statement — fast.
const truncateList = TABLES.map((t) => t.pg).join(", ");
await pgClient.query(`TRUNCATE ${truncateList} RESTART IDENTITY CASCADE`);
console.log("Truncated target tables\n");

for (const t of TABLES) {
  const rows = sqlite.prepare(`SELECT * FROM "${t.sqlite}"`).all();
  if (rows.length === 0) {
    console.log(`  ${t.sqlite}: 0 rows (skipped)`);
    continue;
  }

  const colList = t.cols.map((c) => `"${c}"`).join(", ");

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = slice.map((row, rowIdx) => {
      const cellPlaceholders = t.cols.map((c, colIdx) => {
        values.push(coerce(c, row[c]));
        return `$${rowIdx * t.cols.length + colIdx + 1}`;
      });
      return `(${cellPlaceholders.join(", ")})`;
    });
    const sql = `INSERT INTO ${t.pg} (${colList}) VALUES ${placeholders.join(", ")}`;
    try {
      await pgClient.query(sql, values);
    } catch (e) {
      console.error(`\n✗ Insert failed on ${t.sqlite} batch ${i}/${rows.length}:`, e.message);
      process.exit(1);
    }
  }

  // Reset the SERIAL sequence so subsequent app-created rows don't collide
  // with the ids we just inserted. Postgres sequence name follows the
  // <table>_<column>_seq convention.
  if (t.serial) {
    // Pass the quoted-identifier form so Postgres doesn't case-fold
    // "SyncRun" → "syncrun" and fail to find the relation.
    const seqRes = await pgClient.query(
      `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
      [t.pg]
    );
    const seq = seqRes.rows[0]?.seq;
    if (seq) {
      await pgClient.query(
        `SELECT setval($1, COALESCE((SELECT MAX(id) FROM ${t.pg}), 1), true)`,
        [seq]
      );
    }
  }

  console.log(`  ${t.sqlite}: ${rows.length} rows`);
}

console.log("\n✓ Migration complete. Verify counts in Supabase Studio.");
await pgClient.end();
sqlite.close();

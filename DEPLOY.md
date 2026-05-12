# Deploying to Vercel + Supabase

End-to-end checklist for moving this local-first app to a hosted Postgres on
Supabase and serving it from Vercel.

## 0. Prereqs

- Vercel account (free)
- Supabase account (free) — https://supabase.com
- GitHub repo for this code (we'll init one at step 4)
- HubSpot Service Key still works (the existing `pat-eu1-…` token)

## 1. Create the Supabase project

1. New project → pick a name + region close to you (e.g. eu-west).
2. Set a strong database password (you'll never log in as the postgres user
   directly from Vercel — Vercel uses the connection strings — but Supabase
   needs it for admin access).
3. Wait for provisioning (~1 min).
4. Project Settings → **Database** → copy these two strings:

| Vercel env var | Supabase string | Port |
|---|---|---|
| `DATABASE_URL` | "Connection pooling" — **Transaction mode**, append `?pgbouncer=true&connection_limit=1` | 6543 |
| `DIRECT_URL`   | "Connection string" — Postgres direct                                                     | 5432 |

The pooler is mandatory for serverless. Without it you'll hit "too many
connections" once traffic shows up.

## 2. Run schema migrations against the new DB

```bash
# Point Prisma at the Postgres schema for these commands.
cd web

# Sanity-check the schema parses.
DIRECT_URL='postgres://…:5432/postgres' \
  npx prisma validate --schema=prisma/schema.postgres.prisma

# Create the tables on Supabase.
DIRECT_URL='postgres://…:5432/postgres' \
  npx prisma migrate deploy --schema=prisma/schema.postgres.prisma
```

If `migrate deploy` says "no migrations found", run `migrate dev` once locally
against the postgres schema to generate the migration, then `migrate deploy`.
The migrations folder currently contains only the SQLite history.

## 3. Move the data (one-time)

Install the two helper deps used by the migration script:

```bash
npm i -D better-sqlite3 pg
```

Then run the migration:

```bash
DIRECT_URL='postgres://…:5432/postgres' \
  node scripts/migrate-to-postgres.mjs
```

Expected output is per-table row counts. Verify in Supabase Studio that the
totals match your local DB.

## 4. Cut over the live schema

Replace the SQLite schema with the Postgres one and regenerate the Prisma
client:

```bash
mv prisma/schema.prisma prisma/schema.sqlite.prisma.bak
mv prisma/schema.postgres.prisma prisma/schema.prisma
rm -rf prisma/migrations          # SQLite migration history no longer applies
DIRECT_URL='…' DATABASE_URL='…' npx prisma generate
# Optional: capture the current Postgres schema as a baseline migration
npx prisma migrate dev --name init --create-only
```

From this moment, local dev points at Supabase too. The SQLite file lives on
as a backup at `prisma/dev.db` (gitignored).

## 5. Git + GitHub

```bash
cd /Users/charles/Sales\ Performance
git init -b main
git add web
# Sanity-check that secrets aren't staged:
git status | grep -E "\\.env|\\.db" && echo "STOP — secrets staged!" || echo "ok"
git commit -m "Initial commit"
gh repo create sales-performance --private --source=. --push
```

## 6. Deploy on Vercel

1. Vercel dashboard → **Add New… → Project** → import the GitHub repo.
2. Root directory: `web`.
3. Framework preset: Next.js (auto-detected).
4. Environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase **pooler** string (port 6543) |
| `DIRECT_URL` | Supabase **direct** string (port 5432) |
| `HUBSPOT_SERVICE_KEY` | `pat-eu1-…` |
| `APP_PASSWORD` | A long random string you'll share with the team |

5. **Deploy.** First build takes ~3 min. Subsequent builds are faster.

## 7. Smoke test the deployed URL

- `https://<your-app>.vercel.app/` → bounces to `/login`.
- Enter `APP_PASSWORD` → lands on Current Month.
- Open each page; the numbers should match your local instance.

## 8. Set up scheduled HubSpot sync

The full sync takes longer than Vercel's 60s function timeout, but the code
already uses a watermark — short cron runs pick up where the last one left
off. Add a Vercel Cron in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/sync?max=2000", "schedule": "*/15 * * * *" }]
}
```

(Adjust `max` if needed — the sync endpoint already supports incremental
batches via the `hsLastModified` watermark.)

## Troubleshooting

- **`too many connections`** — `DATABASE_URL` is pointed at the direct port.
  Use the pooler (6543) with `?pgbouncer=true&connection_limit=1`.
- **`prisma migrate deploy` hangs / fails** — make sure `DIRECT_URL` is set;
  Prisma needs a non-pooled connection for migrations.
- **`Failed to convert rust String into napi string`** — the Deal-table napi
  bug we hit on SQLite. The chunked fetch in `/api/performance/quotas`
  already mitigates this; Postgres shouldn't trip it.
- **Local dev now requires the cloud DB** — to keep working offline, copy
  `prisma/dev.db` back into place and temporarily revert `schema.prisma` to
  the SQLite version. Long-term, run Postgres locally via Docker if you want
  parity.

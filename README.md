# Sales Performance

Local web app to analyze sales performance from HubSpot, replacing the `[Sales Perf].xlsx` spreadsheet.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind · SQLite · Prisma · HubSpot REST API.

## 1. Create a HubSpot Service Key

HubSpot is moving away from legacy Private Apps for single-account integrations. Use a **Service Key** (public beta as of Feb 2026). Same `Bearer` token format under the hood, simpler management.

You need the **Developer tools access** permission (or a Developer Seat) on your HubSpot account.

1. In HubSpot, in the left sidebar: **Development → Keys → Service keys**.
2. Top right: **Create service key**.
3. Name it `Sales Performance Local`.
4. Click **Add new scope** and select these read scopes (use the search bar):
   - `crm.objects.deals.read`
   - `crm.schemas.deals.read`
   - `crm.objects.owners.read`
5. Click **Create** (top right) → confirm.
6. Copy the token. Format looks like `pat-na1-…` or `pat-eu1-…`.
7. Edit [`web/.env`](web/.env) and paste it:
   ```
   HUBSPOT_TOKEN="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```
8. Restart `npm run dev` so Next.js picks up the new env var.

The token is stored locally in `.env` (gitignored). Rotate it every ~6 months per HubSpot guidance.

> If your HubSpot account doesn't yet have Service Keys (still rolling out), the legacy Private App flow still works — same scopes, same `Bearer` token format. Click "I still want a legacy private app" in the warning dialog.

## 2. Run the app

```bash
cd web
npm install
npx prisma migrate dev --name init   # one-time: creates SQLite DB
npm run dev
```

Open http://localhost:3000 → redirects to **Settings**.

## 3. First sync

1. On the Settings page, confirm **Connection: Connected (deals scope verified)**.
2. Click **Sync now**. The first run pulls all deals + owners; expect a few minutes for ~4k deals.
3. Watch the **Deals in DB** counter — refresh polls every 2 s while running.
4. Toggle **Hourly cron: Enabled** to keep the DB fresh while the dev server is running.

Subsequent syncs are incremental (filtered by `hs_lastmodifieddate`).

## Project layout

```
web/
├── prisma/schema.prisma       # SQLite schema (Deal, Owner, SyncRun, AppSetting)
├── src/
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── hubspot.ts         # HubSpot REST client (paginated iterators)
│   │   ├── sync.ts            # owner + deal sync with watermark
│   │   └── cron.ts            # node-cron, hourly trigger
│   ├── instrumentation.ts     # boots cron on Next.js server start
│   ├── app/
│   │   ├── layout.tsx         # nav shell
│   │   ├── settings/          # Settings tab (HubSpot status, sync, cron)
│   │   └── api/
│   │       ├── sync/          # POST trigger, GET status
│   │       └── settings/      # GET state, POST cron toggle
│   └── generated/prisma/      # generated Prisma client
└── .env                       # DATABASE_URL + HUBSPOT_TOKEN (gitignored)
```

## Build status

- [x] Step 1 — Settings tab + HubSpot sync (manual + hourly cron)
- [ ] Step 2 — Sales Reps DB (rep + monthly quota/role/manager/FRUP)
- [ ] Step 3 — Account Executive dashboard (closing per month)
- [ ] Step 4 — Inside Sales dashboard

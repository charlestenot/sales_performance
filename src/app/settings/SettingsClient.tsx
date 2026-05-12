"use client";

import { useEffect, useState } from "react";
import RolesSection from "./RolesSection";
import UsersSection from "./UsersSection";
import TeamsSection from "./TeamsSection";
import MappingSection from "./MappingSection";
import DimensionsSection from "./DimensionsSection";

type Settings = {
  tokenSet: boolean;
  cronEnabled: boolean;
  connection: { ok: boolean; error?: string };
};

type SyncRun = {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  status: string;
  dealsFetched: number;
  dealsTotal: number | null;
  ownersFetched: number;
  errorMessage: string | null;
};

type SyncStatus = {
  latest: SyncRun | null;
  history: SyncRun[];
  dealCount: number;
  ownerCount: number;
  running: boolean;
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}
function fmtDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

type Tab = "connection" | "roles" | "users" | "teams" | "mapping" | "dimensions";

export default function SettingsClient() {
  const [tab, setTab] = useState<Tab>("connection");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [s, st] = await Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/sync").then((r) => r.json()),
    ]);
    setSettings(s);
    setStatus(st);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Poll while a sync is running. Faster cadence so the progress bar feels live.
  useEffect(() => {
    if (!status?.running) return;
    const id = setInterval(loadAll, 1000);
    return () => clearInterval(id);
  }, [status?.running]);

  async function triggerSync() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Sync failed");
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  async function toggleCron(enabled: boolean) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronEnabled: enabled }),
    });
    await loadAll();
  }

  if (!settings || !status) return <div className="text-sm text-zinc-500">Loading…</div>;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "connection", label: "Connection" },
    { id: "roles", label: "Roles" },
    { id: "teams", label: "Teams" },
    { id: "users", label: "Users" },
    { id: "mapping", label: "Mapping" },
    { id: "dimensions", label: "Dimensions" },
  ];

  // Modernised tab strip — underline-active style instead of pill-buttons.
  // Falls through to the per-section content unchanged.

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <nav className="flex gap-0 border-b border-zinc-200/70 dark:border-zinc-800/70">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3.5 py-2 text-[13.5px] transition-colors -mb-px ${
              tab === t.id
                ? "text-zinc-900 dark:text-zinc-100 font-medium"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full" />
            )}
          </button>
        ))}
      </nav>

      {tab === "roles" && <RolesSection />}
      {tab === "teams" && <TeamsSection />}
      {tab === "users" && <UsersSection onNavigateToRoles={() => setTab("roles")} />}
      {tab === "mapping" && <MappingSection />}
      {tab === "dimensions" && <DimensionsSection />}

      {tab === "connection" && (
        <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">HubSpot Connection</h2>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">Token configured</dt>
          <dd>{settings.tokenSet ? "Yes" : <span className="text-red-600">No — set HUBSPOT_TOKEN in .env and restart</span>}</dd>
          <dt className="text-zinc-500">Connection</dt>
          <dd>
            {settings.connection.ok ? (
              <span className="text-emerald-600">Connected (deals scope verified)</span>
            ) : settings.tokenSet ? (
              <span className="text-red-600">Failed: {settings.connection.error}</span>
            ) : (
              "—"
            )}
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Data Sync</h2>
            <p className="text-xs text-zinc-500 mt-1">Pulls owners + all deals (incremental by last-modified).</p>
          </div>
          <button
            onClick={triggerSync}
            disabled={busy || status.running || !settings.connection.ok}
            className="px-4 py-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {status.running ? "Syncing…" : "Sync now"}
          </button>
        </div>
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}
        {status.running && status.latest && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>
                {status.latest.dealsFetched.toLocaleString()}
                {status.latest.dealsTotal != null && (
                  <> / {status.latest.dealsTotal.toLocaleString()}</>
                )}
                {" deals"}
              </span>
              <span>
                {status.latest.dealsTotal && status.latest.dealsTotal > 0
                  ? `${Math.min(100, Math.round((status.latest.dealsFetched / status.latest.dealsTotal) * 100))}%`
                  : "…"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              {status.latest.dealsTotal && status.latest.dealsTotal > 0 ? (
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (status.latest.dealsFetched / status.latest.dealsTotal) * 100)}%`,
                  }}
                />
              ) : (
                <div className="h-full w-1/3 animate-pulse bg-emerald-500/60" />
              )}
            </div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">Deals in DB</dt>
          <dd className="font-mono">{status.dealCount.toLocaleString()}</dd>
          <dt className="text-zinc-500">Owners in DB</dt>
          <dd className="font-mono">{status.ownerCount.toLocaleString()}</dd>
          <dt className="text-zinc-500">Last sync</dt>
          <dd>
            {status.latest ? (
              <>
                {fmtDate(status.latest.startedAt)} · {status.latest.status}
                {status.latest.status === "success" && (
                  <> · {status.latest.dealsFetched} deals, {status.latest.ownersFetched} owners</>
                )}
                {status.latest.errorMessage && <span className="text-red-600"> · {status.latest.errorMessage}</span>}
              </>
            ) : (
              "Never"
            )}
          </dd>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Hourly cron</h2>
            <p className="text-xs text-zinc-500 mt-1">Runs at minute 0 every hour while the app is running.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.cronEnabled}
              onChange={(e) => toggleCron(e.target.checked)}
              className="size-4"
            />
            Enabled
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">Sync history</h2>
        {status.history.length === 0 ? (
          <p className="text-sm text-zinc-500">No syncs yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="text-left py-2 font-medium">Started</th>
                <th className="text-left py-2 font-medium">Trigger</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-right py-2 font-medium">Deals</th>
                <th className="text-right py-2 font-medium">Owners</th>
                <th className="text-right py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {status.history.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0">
                  <td className="py-2">{fmtDate(r.startedAt)}</td>
                  <td className="py-2">{r.trigger}</td>
                  <td className="py-2">
                    <span
                      className={
                        r.status === "success"
                          ? "text-emerald-600"
                          : r.status === "error"
                          ? "text-red-600"
                          : "text-amber-600"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 text-right font-mono">{r.dealsFetched}</td>
                  <td className="py-2 text-right font-mono">{r.ownersFetched}</td>
                  <td className="py-2 text-right font-mono text-zinc-500">{fmtDuration(r.startedAt, r.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
        </div>
      )}
    </div>
  );
}

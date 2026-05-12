"use client";

import { useEffect, useMemo, useState } from "react";

type Deal = {
  id: string;
  name: string | null;
  ownerId: string | null;
  repName: string | null;
  closeDate: string | null;
  dealStage: string | null;
  dealStageLabel: string | null;
  pipeline: string | null;
  pipelineLabel: string | null;
  amount: number;
};

type SortKey = "id" | "name" | "repName" | "closeDate" | "dealStage" | "pipeline" | "amount";
type SortDir = "asc" | "desc";

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmtMonthLong(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export type DrillDownContext = {
  month: string; // YYYY-MM
  // Pre-filled filter context from the parent page:
  range: { from: string; to: string };
  teams: (string | number)[];
  roles: (string | number)[];
  users: (string | number)[];
  dimensionId?: number | null;
  // Specialised slices (optional):
  userId?: number | null; // when drilling on a user row
  bucketId?: number | "__unassigned__" | null; // when drilling on a dimension bucket
  bucketLabel?: string | null;
  userName?: string | null;
};

export default function DealsDrilldownModal({
  ctx,
  onClose,
}: {
  ctx: DrillDownContext;
  onClose: () => void;
}) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [amountField, setAmountField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("month", ctx.month);
    ctx.teams.forEach((t) => params.append("teams", String(t)));
    ctx.roles.forEach((r) => params.append("roles", String(r)));
    if (ctx.userId != null) {
      params.append("users", String(ctx.userId));
    } else {
      ctx.users.forEach((u) => params.append("users", String(u)));
    }
    if (ctx.dimensionId && ctx.bucketId != null) {
      params.set("dimension", String(ctx.dimensionId));
      params.set("bucket", String(ctx.bucketId));
    }
    setLoading(true);
    setErr(null);
    fetch(`/api/performance/deals?${params}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) {
          setErr(j.error);
          setDeals([]);
        } else {
          setDeals(j.deals);
          setAmountField(j.amountField ?? null);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [ctx]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = useMemo(() => {
    if (!deals) return [];
    const accessor = (d: Deal): string | number => {
      switch (sortKey) {
        case "id":
          return d.id;
        case "name":
          return (d.name ?? "").toLowerCase();
        case "repName":
          return (d.repName ?? "").toLowerCase();
        case "closeDate":
          return d.closeDate ?? "";
        case "dealStage":
          return (d.dealStageLabel ?? d.dealStage ?? "").toLowerCase();
        case "pipeline":
          return (d.pipelineLabel ?? d.pipeline ?? "").toLowerCase();
        case "amount":
          return d.amount;
      }
    };
    const arr = [...deals];
    arr.sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), undefined, { numeric: true });
    });
    return sortDir === "desc" ? arr.reverse() : arr;
  }, [deals, sortKey, sortDir]);

  const total = useMemo(() => sorted.reduce((t, d) => t + d.amount, 0), [sorted]);

  function downloadCsv() {
    const headers = [
      "Deal ID",
      "Deal Name",
      "User",
      "Owner ID",
      "Close Date",
      "Stage",
      "Stage ID",
      "Pipeline",
      "Pipeline ID",
      "Amount",
    ];
    const rows = sorted.map((d) => [
      d.id,
      d.name ?? "",
      d.repName ?? "",
      d.ownerId ?? "",
      d.closeDate ? d.closeDate.slice(0, 10) : "",
      d.dealStageLabel ?? d.dealStage ?? "",
      d.dealStage ?? "",
      d.pipelineLabel ?? d.pipeline ?? "",
      d.pipeline ?? "",
      d.amount.toFixed(2),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\n");
    const slug = (sliceLabel ?? "all").replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
    const filename = `deals-${ctx.month}-${slug}.csv`;
    // Prepend BOM so Excel opens UTF-8 (e.g. accented rep names) cleanly.
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function clickSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "amount" || k === "closeDate" ? "desc" : "asc");
    }
  }

  function header(label: string, k: SortKey, align: "left" | "right" = "left") {
    const active = sortKey === k;
    return (
      <th
        onClick={() => clickSort(k)}
        className={`py-2 px-3 font-medium whitespace-nowrap select-none cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100 ${
          align === "right" ? "text-right" : "text-left"
        }`}
      >
        {label}
        {active && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </th>
    );
  }

  const sliceLabel = ctx.userName ?? ctx.bucketLabel ?? null;
  const canExport = !loading && sorted.length > 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl max-h-[90vh] flex flex-col rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-base">
              Deals — {fmtMonthLong(`${ctx.month}-01`)}
              {sliceLabel ? <span className="text-zinc-500 font-normal"> · {sliceLabel}</span> : null}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {loading ? "Loading…" : `${sorted.length.toLocaleString()} deals · ${fmtMoney(total)} total`}
              {amountField && (
                <>
                  {" · field "}
                  <span className="font-mono">{amountField}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCsv}
              disabled={!canExport}
              title={canExport ? "Download as CSV" : "Nothing to export"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-base">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {err ? (
            <div className="text-sm text-red-600 p-5">{err}</div>
          ) : !deals ? (
            <div className="text-sm text-zinc-500 p-8 text-center">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-zinc-500 p-8 text-center">
              No deals for this slice.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900">
                <tr>
                  {header("Deal ID", "id")}
                  {header("Deal Name", "name")}
                  {header("User", "repName")}
                  {header("Close Date", "closeDate")}
                  {header("Stage", "dealStage")}
                  {header("Pipeline", "pipeline")}
                  {header("Amount", "amount", "right")}
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                  >
                    <td className="py-2 px-3 font-mono text-xs whitespace-nowrap">{d.id}</td>
                    <td
                      className="py-2 px-3 max-w-[280px] truncate"
                      title={d.name ?? undefined}
                    >
                      {d.name ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {d.repName ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">{fmtDate(d.closeDate)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {d.dealStageLabel ?? d.dealStage ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {d.pipelineLabel ?? d.pipeline ?? <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
                      {fmtMoney(d.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40">
                  <td colSpan={6} className="py-2 px-3 font-semibold">
                    Total
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold">{fmtMoney(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

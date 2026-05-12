"use client";

import { useEffect, useMemo, useState } from "react";

type Resp = {
  months: { month: string; quota: number; actual: number; dealCount: number }[];
  totals: { quota: number; actual: number };
};

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
function fmtPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function currentYM() {
  // Use UTC to match the API's month bucketing convention.
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtMonthLong(s: string) {
  const [y, m] = s.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
function daysInMonthUTC(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export default function CurrentMonthClient() {
  const ym = useMemo(() => currentYM(), []);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: ym, to: ym });
      const res = await fetch(`/api/performance/quotas?${params}`, { cache: "no-store" });
      const j: Resp = await res.json();
      setData(j);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quota = data?.totals.quota ?? 0;
  const actual = data?.totals.actual ?? 0;
  const attainment = quota > 0 ? actual / quota : null;
  const remaining = Math.max(0, quota - actual);

  // Month-pace metrics: where would we be if linear pacing held?
  const now = new Date();
  const day = now.getUTCDate();
  const totalDays = daysInMonthUTC(ym);
  const pacePct = day / totalDays;
  const expectedSoFar = quota * pacePct;
  const aheadBy = actual - expectedSoFar;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Current Month</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Month-to-date closed-won MRR vs. {fmtMonthLong(ym)} total quota.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-8">
        <Gauge value={attainment} />

        <div className="mt-8 grid grid-cols-4 gap-4 text-sm border-t border-zinc-100 dark:border-zinc-800/60 pt-6">
          <Stat label="Quota" value={fmtMoney(quota)} />
          <Stat label="Closed MTD" value={fmtMoney(actual)} />
          <Stat label="Remaining" value={fmtMoney(remaining)} />
          <Stat label="Deals closed" value={String(data?.months[0]?.dealCount ?? 0)} />
        </div>

        <div className="mt-4 text-xs text-zinc-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Day {day} of {totalDays} ({fmtPct(pacePct)})
          </span>
          <span>
            Expected at this pace: <span className="font-mono">{fmtMoney(expectedSoFar)}</span>
          </span>
          <span
            className={
              aheadBy >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }
          >
            {aheadBy >= 0 ? "Ahead by " : "Behind by "}
            <span className="font-mono">{fmtMoney(Math.abs(aheadBy))}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-mono text-lg text-zinc-900 dark:text-zinc-100">{value}</div>
    </div>
  );
}

function Gauge({ value }: { value: number | null }) {
  // Half-circle gauge. Sweep is 180° from 9 o'clock → 3 o'clock.
  // We cap the fill at 120% so going over still looks proportional but doesn't
  // wrap around. The needle moves freely, even past 120%, but the arc fill
  // saturates at the cap.
  const CAP = 1.2;
  const pct = value == null ? 0 : Math.max(0, Math.min(CAP, value));
  const W = 360;
  const H = 200;
  const cx = W / 2;
  const cy = H - 20;
  const r = 130;
  const stroke = 22;

  // Arc path from (cx-r, cy) to (cx+r, cy) — the top semicircle.
  // For a partial fill of length `t` (0..1) along the semicircle, sweep
  // from start (180°) → start + 180*t (degrees).
  const arcPath = (t: number) => {
    if (t <= 0) return "";
    const start = Math.PI; // 180°
    const end = Math.PI - Math.PI * t; // 0° at t=1
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = t > 0.5 ? 1 : 0;
    // sweep flag = 1 because we go counter-clockwise from 180° to 0° in
    // screen coordinates (y-axis flipped), tracing the upper half.
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  const tFill = pct / CAP;
  const color =
    value == null
      ? "stroke-zinc-300 dark:stroke-zinc-700"
      : value >= 1
      ? "stroke-emerald-500"
      : value >= 0.7
      ? "stroke-amber-500"
      : "stroke-red-500";
  const valueText = value == null ? "—" : `${(value * 100).toFixed(0)}%`;
  const valueColor =
    value == null
      ? "text-zinc-400"
      : value >= 1
      ? "text-emerald-600"
      : value >= 0.7
      ? "text-amber-600"
      : "text-red-600";

  // Tick marks at 0, 50, 100, 120
  const ticks = [0, 0.5, 1.0];
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[460px]">
        {/* Track */}
        <path
          d={arcPath(1)}
          className="stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        {/* Fill */}
        <path
          d={arcPath(tFill)}
          className={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
        {/* 100% marker — a darker tick on the track */}
        {ticks.map((t) => {
          const angle = Math.PI - Math.PI * (t / CAP);
          const x1 = cx + (r - stroke / 2 - 4) * Math.cos(angle);
          const y1 = cy + (r - stroke / 2 - 4) * Math.sin(angle);
          const x2 = cx + (r + stroke / 2 + 4) * Math.cos(angle);
          const y2 = cy + (r + stroke / 2 + 4) * Math.sin(angle);
          const lx = cx + (r + stroke / 2 + 18) * Math.cos(angle);
          const ly = cy + (r + stroke / 2 + 18) * Math.sin(angle);
          return (
            <g key={t}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className="stroke-zinc-300 dark:stroke-zinc-700"
                strokeWidth={1.5}
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-zinc-400 text-[10px]"
                style={{ fontFamily: "var(--font-geist-mono, ui-monospace)" }}
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}
      </svg>
      <div className={`-mt-12 text-5xl font-semibold tabular-nums ${valueColor}`}>{valueText}</div>
      <div className="mt-1 text-xs text-zinc-500">attainment</div>
    </div>
  );
}

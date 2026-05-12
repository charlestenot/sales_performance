"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PRESETS = [
  { id: "last3m", label: "Last 3 months", months: 3 },
  { id: "last6m", label: "Last 6 months", months: 6 },
  { id: "last13m", label: "Last 13 months", months: 13 },
  { id: "ytd", label: "Year to date" },
  { id: "custom", label: "Custom…" },
] as const;

export type DateRange = { from: string; to: string };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ym(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
function lastFinishedMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

export function defaultRange(): DateRange {
  return computePreset("last13m")!;
}

export function computePreset(id: string): DateRange | null {
  const lm = lastFinishedMonth();
  const to = ym(lm);
  if (id === "ytd") {
    return { from: `${lm.getUTCFullYear()}-01`, to };
  }
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset || !("months" in preset)) return null;
  const from = new Date(Date.UTC(lm.getUTCFullYear(), lm.getUTCMonth() - preset.months + 1, 1));
  return { from: ym(from), to };
}

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setCoords({ left: r.left, top: r.bottom + 4 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function fmtMonth(s: string) {
    const [y, m] = s.split("-");
    return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  // Detect which preset matches the current range (if any) for active-state styling.
  const matchingPreset = PRESETS.find((p) => {
    const r = computePreset(p.id);
    return r && r.from === value.from && r.to === value.to;
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span className="text-zinc-500">Date:</span>
        <span>
          {fmtMonth(value.from)} → {fmtMonth(value.to)}
        </span>
        <span className="text-xs text-zinc-400">▾</span>
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", left: coords.left, top: coords.top }}
            className="z-50 rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 shadow-lg p-3 text-sm w-72"
          >
            <div className="space-y-1">
              {PRESETS.filter((p) => p.id !== "custom").map((p) => {
                const active = matchingPreset?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      const r = computePreset(p.id);
                      if (r) onChange(r);
                      setOpen(false);
                    }}
                    className={`block w-full text-left px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      active ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 mb-2">Custom range</div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={value.from}
                  onChange={(e) => onChange({ ...value, from: e.target.value })}
                  className="flex-1 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                />
                <span className="text-zinc-400">→</span>
                <input
                  type="month"
                  value={value.to}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                  className="flex-1 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

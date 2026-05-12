"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MultiSelectOption = { value: string | number; label: string };

export default function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: (string | number)[];
  onChange: (next: (string | number)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(null);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    setCoords({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) });
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

  const selectedSet = useMemo(() => new Set(selected.map(String)), [selected]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(v: string | number) {
    const set = new Set(selected.map(String));
    if (set.has(String(v))) set.delete(String(v));
    else set.add(String(v));
    onChange(options.filter((o) => set.has(String(o.value))).map((o) => o.value));
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-zinc-900 text-white text-[10px] dark:bg-zinc-100 dark:text-zinc-900">
            {selected.length}
          </span>
        )}
        <span className="text-xs text-zinc-400">▾</span>
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              minWidth: coords.width,
              maxHeight: 320,
            }}
            className="z-50 overflow-y-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 shadow-lg p-2 text-sm"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search…"
              className="w-full px-2 py-1 mb-2 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none"
            />
            {filtered.length === 0 ? (
              <div className="px-2 py-1 text-zinc-400">No matches</div>
            ) : (
              filtered.map((o) => (
                <label
                  key={String(o.value)}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(String(o.value))}
                    onChange={() => toggle(o.value)}
                  />
                  <span>{o.label}</span>
                </label>
              ))
            )}
            {selected.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="mt-2 w-full text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Clear ({selected.length})
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComboboxOption = { value: string | number; label: string };

/**
 * Typeahead select: type to filter, arrow keys to navigate, Enter to pick.
 * Renders the option list in a portal so it escapes virtualized cell overflow.
 */
export default function Combobox({
  value,
  options,
  onPick,
  onCancel,
  placeholder,
}: {
  value: string | number | null;
  options: ComboboxOption[];
  onPick: (value: string | number | null) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const initialLabel = options.find((o) => String(o.value) === String(value))?.label ?? "";
  const [query, setQuery] = useState(initialLabel);
  const [activeIdx, setActiveIdx] = useState(0);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useLayoutEffect(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const PREFERRED = 288; // matches max-h-72 default
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    let top: number;
    let maxHeight: number;
    if (spaceBelow >= PREFERRED || spaceBelow >= spaceAbove) {
      // Open below — preferred when there's room.
      top = r.bottom + 2;
      maxHeight = Math.min(PREFERRED, Math.max(120, spaceBelow));
    } else {
      // Flip above — for cells near the viewport bottom.
      maxHeight = Math.min(PREFERRED, Math.max(120, spaceAbove));
      top = r.top - maxHeight - 2;
    }
    setCoords({ left: r.left, top, width: r.width, maxHeight });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 100);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 100);
  }, [query, options]);

  function pick(idx: number) {
    if (pickedRef.current) return;
    const o = filtered[idx];
    if (!o) {
      onCancel();
      return;
    }
    pickedRef.current = true;
    onPick(o.value);
  }

  function clear() {
    if (pickedRef.current) return;
    pickedRef.current = true;
    onPick(null);
  }

  return (
    <div ref={wrapRef} className="w-full h-full">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (query.trim() === "") clear();
            else pick(activeIdx);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Tab") {
            // commit current highlight then let focus advance naturally
            if (filtered[activeIdx]) pick(activeIdx);
          }
        }}
        onBlur={() => {
          // give option-mousedown a chance to land first
          setTimeout(() => {
            if (!pickedRef.current) onCancel();
          }, 120);
        }}
        placeholder={placeholder ?? "search…"}
        className="w-full h-full px-2 border-0 bg-white dark:bg-zinc-900 outline-none"
      />
      {coords &&
        createPortal(
          <div
            role="listbox"
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              minWidth: Math.max(coords.width, 180),
              maxHeight: coords.maxHeight,
            }}
            className="z-50 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-zinc-400">No matches</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={String(o.value)}
                  type="button"
                  role="option"
                  aria-selected={i === activeIdx}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(i);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`block w-full text-left px-3 py-1.5 ${
                    i === activeIdx ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

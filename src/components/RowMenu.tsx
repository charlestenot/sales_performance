"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  /** Visual variant. "danger" → red text. */
  variant?: "default" | "danger";
  disabled?: boolean;
};

/**
 * Small kebab-button menu that escapes its parent's overflow via a portal.
 * Designed to live inside a virtualized table cell.
 */
export default function RowMenu({ items, label = "⋮" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    // Estimate menu height: ~32px per item + padding.
    const estimated = items.length * 32 + 12;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - r.bottom - MARGIN;
    const spaceAbove = r.top - MARGIN;
    let top: number;
    let maxHeight: number;
    if (spaceBelow >= estimated || spaceBelow >= spaceAbove) {
      top = r.bottom + 4;
      maxHeight = Math.max(120, spaceBelow);
    } else {
      maxHeight = Math.max(120, spaceAbove);
      top = r.top - Math.min(estimated, maxHeight) - 4;
    }
    setCoords({ left: r.right - 160, top, maxHeight });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        title="Actions"
      >
        {label}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              maxHeight: coords.maxHeight,
            }}
            className="z-50 min-w-40 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 py-1 text-sm"
          >
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className={`block w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 ${
                  it.variant === "danger" ? "text-red-600 dark:text-red-400" : ""
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

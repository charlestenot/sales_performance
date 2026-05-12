"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DataGrid,
  type Column,
  type RenderCellProps,
  type RenderEditCellProps,
  type SortColumn,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
import Combobox from "./Combobox";

// Re-export a stable ColumnDef API so consumers don't import RDG types directly.
export type ColumnDef<R> = {
  key: string;
  header: string;
  width?: string | number;
  align?: "left" | "right";
  className?: string;
  render?: (row: R) => React.ReactNode;
  /** Canonical scalar value for copy/paste & default display. */
  getValue?: (row: R) => string | number | null | undefined;
  /** Optional formatter for the default display when render is omitted. */
  format?: (v: unknown, row: R) => React.ReactNode;
  /** Cell editor type. False/undefined = read-only. */
  editable?: false | "text" | "number" | "date" | "select";
  selectOptions?: { value: string | number; label: string }[];
  /** Called when an edit is committed or a paste lands in this cell. */
  onSave?: (row: R, value: string | number | null) => Promise<void> | void;
  /** Defaults to true. Set false to disable header sort for this column. */
  sortable?: boolean;
  sortAccessor?: (row: R) => string | number | null | undefined;
  emptyDisplay?: string;
};

export type DataTableProps<R> = {
  rows: R[];
  columns: ColumnDef<R>[];
  rowId: (row: R) => number | string;
  /** Reorder is no longer rendered as drag-drop; consumers may still pass it.
   * Surfacing as a future hook — currently a no-op. */
  onReorder?: (ids: (number | string)[]) => Promise<void> | void;
  rowActions?: (row: R) => React.ReactNode;
  emptyMessage?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" } | null;
  rowClassName?: (row: R) => string;
  /** Pixel height of the grid. Defaults to fit content (auto). */
  height?: number;
  /** When set, sort state is persisted to localStorage under this key (per-table). */
  storageKey?: string;
};

export default function DataTable<R>({
  rows,
  columns,
  rowId,
  rowActions,
  emptyMessage = "No rows",
  defaultSort = null,
  rowClassName,
  height,
  storageKey,
}: DataTableProps<R>) {
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(() => {
    if (storageKey && typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`datatable.sort.${storageKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed as SortColumn[];
        }
      } catch {}
    }
    return defaultSort
      ? [{ columnKey: defaultSort.key, direction: defaultSort.dir.toUpperCase() as "ASC" | "DESC" }]
      : [];
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`datatable.sort.${storageKey}`, JSON.stringify(sortColumns));
    } catch {}
  }, [sortColumns, storageKey]);

  const sortedRows = useMemo(() => {
    if (sortColumns.length === 0) return rows;
    const sc = sortColumns[0];
    const col = columns.find((c) => c.key === sc.columnKey);
    if (!col) return rows;
    const accessor =
      col.sortAccessor ??
      col.getValue ??
      ((r: R) => (r as Record<string, unknown>)[col.key] as string | number | null | undefined);
    const out = [...rows].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), undefined, { sensitivity: "base", numeric: true });
    });
    return sc.direction === "DESC" ? out.reverse() : out;
  }, [rows, sortColumns, columns]);

  const rdgColumns: Column<R>[] = useMemo(() => {
    const base: Column<R>[] = columns.map((col) => {
      const isEditable = !!col.editable && !!col.onSave;
      return {
        key: col.key,
        name: col.header,
        // Default to a flex column so the table fills the container width
        // (Google-Sheets-style) instead of stopping at content-width with a
        // hard right edge. Consumers can override with a fixed width when
        // tight columns are preferred.
        width: col.width ?? "minmax(120px, 1fr)",
        minWidth: 80,
        sortable: col.sortable !== false,
        resizable: true,
        cellClass: (row: R) => {
          const parts: string[] = [];
          if (col.className) parts.push(col.className);
          if (col.align === "right") parts.push("rdg-cell-right");
          if (rowClassName) {
            const c = rowClassName(row);
            if (c) parts.push(c);
          }
          return parts.join(" ") || undefined;
        },
        renderCell: (props: RenderCellProps<R>) => {
          if (col.render) return <>{col.render(props.row)}</>;
          const v = col.getValue?.(props.row) ?? (props.row as Record<string, unknown>)[col.key];
          if (v == null || v === "") {
            return <span className="text-zinc-400">{col.emptyDisplay ?? "—"}</span>;
          }
          if (col.format) return <>{col.format(v, props.row)}</>;
          return <>{String(v)}</>;
        },
        editable: isEditable,
        renderEditCell: isEditable
          ? (props: RenderEditCellProps<R>) => (
              <CellEditor
                row={props.row}
                col={col}
                onCommit={(value) => {
                  props.onClose(false, true);
                  Promise.resolve(col.onSave!(props.row, value));
                }}
                onCancel={() => props.onClose(false, true)}
              />
            )
          : undefined,
      } as Column<R>;
    });

    if (rowActions) {
      base.push({
        key: "__actions",
        name: "",
        editable: false,
        sortable: false,
        resizable: false,
        cellClass: "rdg-actions-cell",
        width: "max-content",
        minWidth: 100,
        renderCell: (props: RenderCellProps<R>) => (
          <div onMouseDown={(e) => e.stopPropagation()}>{rowActions(props.row)}</div>
        ),
      });
    }
    return base;
  }, [columns, rowActions, rowClassName]);

  return (
    <div className="rdg-wrapper" style={height ? { height } : undefined}>
      {sortedRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-500">{emptyMessage}</div>
      ) : (
        <DataGrid<R>
          rows={sortedRows}
          columns={rdgColumns}
          rowKeyGetter={(r) => rowId(r) as React.Key}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
          onCellClick={(args, event) => {
            const target = event.target as HTMLElement;
            // Don't enter edit when clicking inner buttons/links/inputs.
            if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("select")) return;
            // Single-click to edit on editable columns.
            if (args.column.editable === true || (typeof args.column.editable === "function" && args.column.editable(args.row))) {
              args.selectCell(true);
            }
          }}
          onCellCopy={(args, event) => {
            // Cmd/Ctrl+C copies the SCALAR value of the cell (whatever
            // getValue returns, or the raw object key) into the clipboard as
            // text. Pretty-renders are ignored — we want the underlying value
            // so it can be pasted into a textbox / spreadsheet meaningfully.
            const col = columns.find((c) => c.key === args.column.key);
            if (!col) return;
            const v =
              col.getValue?.(args.row) ?? (args.row as Record<string, unknown>)[args.column.key];
            const text = v == null ? "" : String(v);
            event.clipboardData.setData("text/plain", text);
          }}
          onCellPaste={(args, event) => {
            // Cmd/Ctrl+V pastes clipboard text into an editable cell using
            // the column's onSave handler. Read-only columns silently no-op.
            const col = columns.find((c) => c.key === args.column.key);
            if (!col || !col.editable || !col.onSave) return args.row;
            const raw = event.clipboardData.getData("text/plain").replace(/\r?\n$/, "");
            let value: string | number | null = raw;
            if (raw === "") value = null;
            else if (col.editable === "number" || col.editable === "select") {
              const n = Number(raw);
              value = Number.isFinite(n) ? n : raw;
            }
            // Fire-and-forget — the async onSave triggers the consumer's
            // reload path, which refreshes the row from the server.
            Promise.resolve(col.onSave(args.row, value));
            return args.row;
          }}
          rowHeight={36}
          headerRowHeight={36}
          className="rdg-light"
          style={{ blockSize: height ?? "auto" }}
        />
      )}
    </div>
  );
}

function CellEditor<R>({
  row,
  col,
  onCommit,
  onCancel,
}: {
  row: R;
  col: ColumnDef<R>;
  onCommit: (value: string | number | null) => void;
  onCancel: () => void;
}) {
  const initial = col.getValue?.(row) ?? (row as Record<string, unknown>)[col.key];
  const [draft, setDraft] = useState<string>(initial == null ? "" : String(initial));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current && "select" in inputRef.current) {
      try {
        (inputRef.current as HTMLInputElement).select();
      } catch {}
    }
  }, []);

  function commit(value: string) {
    if (committedRef.current) return;
    committedRef.current = true;
    if (col.editable === "number") {
      onCommit(value === "" ? null : Number(value));
    } else {
      onCommit(value === "" ? null : value);
    }
  }

  if (col.editable === "select") {
    return (
      <Combobox
        value={initial == null ? null : (initial as string | number)}
        options={col.selectOptions ?? []}
        onPick={(v) => {
          if (committedRef.current) return;
          committedRef.current = true;
          onCommit(v);
        }}
        onCancel={onCancel}
      />
    );
  }

  const inputType = col.editable === "number" ? "number" : col.editable === "date" ? "date" : "text";
  return (
    <input
      ref={(el) => {
        inputRef.current = el;
      }}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(draft);
        } else if (e.key === "Escape") {
          onCancel();
        }
      }}
      className={`w-full h-full px-2 border-0 bg-white dark:bg-zinc-900 outline-none ${
        col.editable === "number" ? "text-right font-mono" : ""
      }`}
    />
  );
}

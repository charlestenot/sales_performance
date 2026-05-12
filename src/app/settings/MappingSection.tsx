"use client";

import { useEffect, useMemo, useState } from "react";

type PropMeta = { name: string; label: string; type: string; fieldType: string };
type Avail = {
  pipeline: string | null;
  stage: string | null;
  count: number;
  pipelineLabel: string | null;
  stageLabel: string | null;
};
type StageKey = { pipeline: string | null; stage: string | null };

const keyOf = (p: string | null, s: string | null) => `${p ?? "∅"}::${s ?? "∅"}`;

export default function MappingSection() {
  const [available, setAvailable] = useState<Avail[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  async function load() {
    const r = await fetch("/api/mapping/stages");
    const j = await r.json();
    setAvailable(j.available);
    setSelected(new Set((j.selected as StageKey[]).map((s) => keyOf(s.pipeline, s.stage))));
    setDirty(false);
  }
  useEffect(() => {
    load();
  }, []);

  function toggle(a: Avail) {
    const k = keyOf(a.pipeline, a.stage);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
    setDirty(true);
  }

  async function save() {
    if (!available) return;
    setBusy(true);
    try {
      const payload: StageKey[] = available
        .filter((a) => selected.has(keyOf(a.pipeline, a.stage)))
        .map((a) => ({ pipeline: a.pipeline, stage: a.stage }));
      await fetch("/api/mapping/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: payload }),
      });
      setDirty(false);
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  // Group by pipeline.
  const groups = useMemo(() => {
    if (!available) return [];
    const m = new Map<string, { label: string; raw: string | null; rows: Avail[] }>();
    for (const a of available) {
      const groupKey = (a.pipelineLabel ?? a.pipeline ?? "Unknown") || "Unknown";
      const cur = m.get(groupKey) ?? { label: groupKey, raw: a.pipeline, rows: [] };
      cur.rows.push(a);
      m.set(groupKey, cur);
    }
    return [...m.values()];
  }, [available]);

  const totalDealsSelected = useMemo(() => {
    if (!available) return 0;
    return available.reduce((n, a) => (selected.has(keyOf(a.pipeline, a.stage)) ? n + a.count : n), 0);
  }, [available, selected]);

  return (
    <div className="space-y-12">
      <PerformanceFieldSection />
      <StageSection
        available={available}
        selected={selected}
        toggle={toggle}
        save={save}
        busy={busy}
        dirty={dirty}
        savedAt={savedAt}
        groups={groups}
        totalDealsSelected={totalDealsSelected}
      />
    </div>
  );
}

function StageSection({
  available, selected, toggle, save, busy, dirty, savedAt, groups, totalDealsSelected,
}: {
  available: Avail[] | null;
  selected: Set<string>;
  toggle: (a: Avail) => void;
  save: () => Promise<void>;
  busy: boolean;
  dirty: boolean;
  savedAt: number | null;
  groups: { label: string; raw: string | null; rows: Avail[] }[];
  totalDealsSelected: number;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stage</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Pick the deal stages that count as <strong>actuals</strong> in the Performance dashboard.
            Anything else is ignored.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-xs text-emerald-600">Saved</span>
          )}
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        {available
          ? `${selected.size} stage${selected.size === 1 ? "" : "s"} selected · ${totalDealsSelected.toLocaleString()} deals will count`
          : "Loading…"}
      </div>

      {available === null ? <p className="text-sm text-zinc-500">Loading…</p> : groups.length === 0 ? (
        <div className="text-sm text-zinc-500 py-8">
          No deal data yet — sync first under Settings → Connection.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const groupKeys = g.rows.map((r) => keyOf(r.pipeline, r.stage));
            const allSel = groupKeys.every((k) => selected.has(k));
            const noneSel = groupKeys.every((k) => !selected.has(k));
            function toggleAll() {
              const next = new Set(selected);
              if (allSel) for (const k of groupKeys) next.delete(k);
              else for (const k of groupKeys) next.add(k);
              setSelected(next);
              setDirty(true);
            }
            return (
              <div key={g.label}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{g.label}</h3>
                  <button
                    onClick={toggleAll}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {allSel ? "Deselect all" : noneSel ? "Select all" : "Select all"}
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="w-8"></th>
                      <th className="text-left py-2 pr-4 font-medium">Stage</th>
                      <th className="text-left py-2 pr-4 font-medium text-zinc-400">Raw value</th>
                      <th className="text-right py-2 pr-2 font-medium">Deals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((a) => {
                      const k = keyOf(a.pipeline, a.stage);
                      const isSel = selected.has(k);
                      return (
                        <tr
                          key={k}
                          onClick={() => toggle(a)}
                          className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                        >
                          <td className="py-2 pl-1">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggle(a)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="py-2 pr-4">
                            {a.stageLabel ?? <span className="text-zinc-500 italic">—</span>}
                          </td>
                          <td className="py-2 pr-4 text-zinc-400 font-mono text-xs">{a.stage ?? "(null)"}</td>
                          <td className="py-2 pr-2 text-right font-mono">{a.count.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PerformanceFieldSection() {
  const [props, setProps] = useState<PropMeta[] | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/mapping/properties?type=number").then((r) => r.json()),
      fetch("/api/mapping/performance").then((r) => r.json()),
    ]).then(([p, m]) => {
      setProps(p.properties);
      setField(m.amountField);
      setOriginal(m.amountField);
    });
  }, []);

  const dirty = field !== original;

  async function save() {
    setBusy(true);
    try {
      await fetch("/api/mapping/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountField: field }),
      });
      setOriginal(field);
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!props) return [];
    const q = query.trim().toLowerCase();
    if (!q) return props.slice(0, 50);
    return props
      .filter((p) => p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
      .slice(0, 50);
  }, [props, query]);

  const selected = props?.find((p) => p.name === field);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Performance</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Pick the deal property that measures performance (the currency value summed in the Performance
            dashboard&apos;s <strong>Actuals</strong> row).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && <span className="text-xs text-emerald-600">Saved</span>}
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        {selected ? (
          <>
            Currently using <strong>{selected.label}</strong>{" "}
            <span className="font-mono text-zinc-400">({selected.name})</span>
          </>
        ) : (
          <>
            No field selected — defaults to <span className="font-mono">mrr_incremental_at_close_date</span>
          </>
        )}
      </div>

      {props === null ? (
        <p className="text-sm text-zinc-500">Loading numeric properties…</p>
      ) : (
        <div className="space-y-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties (name or label)…"
            className="w-full max-w-md px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
          <div className="max-h-72 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 sticky top-0">
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left py-2 px-3 font-medium">Label</th>
                  <th className="text-left py-2 px-3 font-medium">Name</th>
                  <th className="text-left py-2 px-3 font-medium text-zinc-400">Field type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-zinc-500">
                      No matches.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const isSel = field === p.name;
                    return (
                      <tr
                        key={p.name}
                        onClick={() => setField(isSel ? null : p.name)}
                        className={`border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30 ${
                          isSel ? "bg-emerald-50 dark:bg-emerald-950/30" : ""
                        }`}
                      >
                        <td className="py-1.5 pl-3">
                          <input
                            type="radio"
                            checked={isSel}
                            onChange={() => setField(isSel ? null : p.name)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="py-1.5 px-3">{p.label}</td>
                        <td className="py-1.5 px-3 font-mono text-xs text-zinc-500">{p.name}</td>
                        <td className="py-1.5 px-3 text-xs text-zinc-400">{p.fieldType}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-zinc-500">
            Showing first {Math.min(filtered.length, 50)} matches. Refine the search to narrow further.
          </p>
        </div>
      )}
    </section>
  );
}

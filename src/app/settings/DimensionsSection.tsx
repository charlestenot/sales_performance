"use client";

import { useEffect, useMemo, useState } from "react";

type Bucket = { id: number; name: string; values: (string | number)[]; sortOrder: number };
type Dimension = {
  id: number;
  name: string;
  attribute: "user" | "team" | "role" | "pipeline" | "stage";
  sortOrder: number;
  buckets: Bucket[];
};
type Source = { value: string | number; label: string; sublabel?: string; count?: number; archived?: boolean };

const ATTRIBUTE_LABELS: Record<Dimension["attribute"], string> = {
  user: "User",
  team: "Team",
  role: "Role",
  pipeline: "Pipeline",
  stage: "Stage",
};

export default function DimensionsSection() {
  const [dimensions, setDimensions] = useState<Dimension[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    const r = await fetch("/api/dimensions");
    const j = await r.json();
    setDimensions(j.dimensions);
  }
  useEffect(() => {
    load();
  }, []);

  if (editingId != null) {
    return (
      <DimensionEditor
        dimensionId={editingId}
        onClose={async () => {
          setEditingId(null);
          await load();
        }}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dimensions</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Custom slices for the Performance dashboard. A dimension groups source values
            (users, teams, pipelines, or stages) into named buckets. Anything you don&apos;t bucket
            falls into <strong>Unassigned</strong> so 100% of the data is captured.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add Dimension
        </button>
      </div>

      {dimensions === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : dimensions.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded">
          No dimensions yet. Click <strong>Add Dimension</strong> to create your first one
          (e.g. AE / Inside Sales split based on user).
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="text-left py-2 pr-4 font-medium">Name</th>
              <th className="text-left py-2 pr-4 font-medium">Based on</th>
              <th className="text-right py-2 pr-4 font-medium">Buckets</th>
              <th className="text-right py-2 pr-2 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => (
              <tr
                key={d.id}
                className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer"
                onClick={() => setEditingId(d.id)}
              >
                <td className="py-3 pr-4 font-medium">{d.name}</td>
                <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-300">
                  {ATTRIBUTE_LABELS[d.attribute]}
                </td>
                <td className="py-3 pr-4 text-right font-mono">{d.buckets.length}</td>
                <td className="py-3 pr-2 text-right">
                  <button
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mr-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(d.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-xs text-zinc-500 hover:text-red-600"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete dimension "${d.name}"?`)) return;
                      await fetch(`/api/dimensions/${d.id}`, { method: "DELETE" });
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddDimensionModal
          onClose={() => setAdding(false)}
          onCreated={async (id) => {
            setAdding(false);
            await load();
            setEditingId(id);
          }}
        />
      )}
    </section>
  );
}

function AddDimensionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState("");
  const [attribute, setAttribute] = useState<Dimension["attribute"]>("user");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, attribute }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Failed");
        return;
      }
      onCreated(j.dimension.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold">Add Dimension</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Name</div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Org"
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Based on</div>
            <select
              value={attribute}
              onChange={(e) => setAttribute(e.target.value as Dimension["attribute"])}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            >
              <option value="user">User</option>
              <option value="team">Team</option>
              <option value="role">Role</option>
              <option value="pipeline">Pipeline</option>
              <option value="stage">Stage (within selected mapping)</option>
            </select>
            <p className="text-[11px] text-zinc-500 mt-1">
              You can&apos;t change this after creation — buckets reference values of this attribute.
            </p>
          </label>
          {err && <div className="text-red-600">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !name.trim()}
              className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "Saving…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DimensionEditor({ dimensionId, onClose }: { dimensionId: number; onClose: () => void }) {
  const [dim, setDim] = useState<Dimension | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);

  async function load() {
    const [d, s] = await Promise.all([
      fetch(`/api/dimensions/${dimensionId}`).then((r) => r.json()),
      fetch(`/api/dimensions/${dimensionId}/sources`).then((r) => r.json()),
    ]);
    setDim(d.dimension);
    setSources(s.sources);
  }
  useEffect(() => {
    load();
  }, [dimensionId]);

  // Source values already assigned somewhere → not eligible to add elsewhere.
  const assigned = useMemo(() => {
    const m = new Map<string, number>(); // value → bucketId
    if (!dim) return m;
    for (const b of dim.buckets) {
      for (const v of b.values) m.set(String(v), b.id);
    }
    return m;
  }, [dim]);

  // Catch-all: source values not assigned to any bucket → "Unassigned" preview.
  const unassigned = useMemo(() => {
    if (!sources) return [];
    return sources.filter((s) => !assigned.has(String(s.value)));
  }, [sources, assigned]);

  async function rename(name: string) {
    if (!dim) return;
    await fetch(`/api/dimensions/${dim.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await load();
  }

  async function addBucket(name: string) {
    if (!dim) return;
    await fetch(`/api/dimensions/${dim.id}/buckets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, values: [] }),
    });
    await load();
  }

  async function patchBucket(bid: number, data: { name?: string; values?: (string | number)[] }) {
    if (!dim) return;
    await fetch(`/api/dimensions/${dim.id}/buckets/${bid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  }

  async function deleteBucket(bid: number) {
    if (!dim) return;
    if (!confirm("Delete this bucket? Its members will fall into Unassigned.")) return;
    await fetch(`/api/dimensions/${dim.id}/buckets/${bid}`, { method: "DELETE" });
    await load();
  }

  if (!dim || !sources) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={onClose}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2"
          >
            ← Back to dimensions
          </button>
          <h2 className="text-lg font-semibold">
            <InlineRename value={dim.name} onSave={rename} />
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Based on <strong>{ATTRIBUTE_LABELS[dim.attribute]}</strong>. {sources.length} source value
            {sources.length === 1 ? "" : "s"} available.
          </p>
        </div>
        <AddBucketButton onAdd={addBucket} />
      </div>

      <div className="space-y-4">
        {dim.buckets.map((b) => (
          <BucketCard
            key={b.id}
            bucket={b}
            sources={sources}
            assignedElsewhere={(v) => {
              const owner = assigned.get(String(v));
              return owner != null && owner !== b.id;
            }}
            onPatch={(data) => patchBucket(b.id, data)}
            onDelete={() => deleteBucket(b.id)}
          />
        ))}
        {/* Auto-rendered Unassigned preview */}
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-500">
              Unassigned <span className="text-xs font-normal">(auto · catch-all)</span>
            </h3>
            <span className="text-xs text-zinc-500">
              {unassigned.length} {unassigned.length === 1 ? "value" : "values"}
            </span>
          </div>
          {unassigned.length === 0 ? (
            <p className="text-xs text-zinc-500">All source values are bucketed. 🎯</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unassigned.slice(0, 30).map((s) => (
                <span
                  key={String(s.value)}
                  className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                >
                  {s.label}
                </span>
              ))}
              {unassigned.length > 30 && (
                <span className="text-xs text-zinc-400">+ {unassigned.length - 30} more</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InlineRename({ value, onSave }: { value: string; onSave: (next: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="hover:underline decoration-dotted">
        {value}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft !== value) onSave(draft.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="px-2 py-1 rounded border border-zinc-400 bg-white dark:bg-zinc-900 outline-none"
    />
  );
}

function AddBucketButton({ onAdd }: { onAdd: (name: string) => void | Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  if (!creating) {
    return (
      <button
        onClick={() => setCreating(true)}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Add Bucket
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Bucket name"
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onAdd(name.trim());
            setName("");
            setCreating(false);
          } else if (e.key === "Escape") {
            setName("");
            setCreating(false);
          }
        }}
        className="px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
      />
      <button
        onClick={() => {
          if (name.trim()) {
            onAdd(name.trim());
            setName("");
            setCreating(false);
          }
        }}
        className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add
      </button>
      <button
        onClick={() => {
          setName("");
          setCreating(false);
        }}
        className="text-xs text-zinc-500"
      >
        Cancel
      </button>
    </div>
  );
}

function BucketCard({
  bucket,
  sources,
  assignedElsewhere,
  onPatch,
  onDelete,
}: {
  bucket: Bucket;
  sources: Source[];
  assignedElsewhere: (v: string | number) => boolean;
  onPatch: (data: { name?: string; values?: (string | number)[] }) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const memberSet = useMemo(() => new Set(bucket.values.map(String)), [bucket.values]);

  function toggle(v: string | number) {
    const k = String(v);
    if (memberSet.has(k)) {
      onPatch({ values: bucket.values.filter((x) => String(x) !== k) });
    } else {
      onPatch({ values: [...bucket.values, v] });
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.label.toLowerCase().includes(q) || (s.sublabel ?? "").toLowerCase().includes(q));
  }, [sources, query]);

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-base font-semibold">
          <InlineRename value={bucket.name} onSave={(n) => onPatch({ name: n })} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {bucket.values.length} {bucket.values.length === 1 ? "member" : "members"}
          </span>
          <button onClick={onDelete} className="text-xs text-zinc-500 hover:text-red-600">
            Delete
          </button>
        </div>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search source values…"
        className="w-full mb-2 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm"
      />
      <div className="max-h-56 overflow-y-auto -mx-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-zinc-500 px-2 py-2">No matches.</p>
        ) : (
          filtered.map((s) => {
            const isMember = memberSet.has(String(s.value));
            const elsewhere = !isMember && assignedElsewhere(s.value);
            return (
              <label
                key={String(s.value)}
                className={`flex items-center gap-2 px-2 py-1 text-sm rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  elsewhere ? "opacity-40" : ""
                }`}
                title={elsewhere ? "Already in another bucket" : ""}
              >
                <input
                  type="checkbox"
                  checked={isMember}
                  disabled={elsewhere}
                  onChange={() => toggle(s.value)}
                />
                <span>{s.label}</span>
                {s.sublabel && (
                  <span className="text-[11px] font-mono text-zinc-400">{s.sublabel}</span>
                )}
                {s.count != null && (
                  <span className="ml-auto text-[11px] text-zinc-400">{s.count.toLocaleString()}</span>
                )}
                {elsewhere && <span className="ml-auto text-[10px] text-zinc-400">in another bucket</span>}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

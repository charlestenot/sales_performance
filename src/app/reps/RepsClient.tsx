"use client";

import { useEffect, useMemo, useState } from "react";
import { seniorityMonths, suggestedFromRamp, type RampUnit } from "@/lib/ramp";
import AddMonthlyQuotasView from "./AddMonthlyQuotasView";
import IndividualQuotaView from "./IndividualQuotaView";

type ViewTab = "all" | "individual";

type Row = {
  monthlyId: number | null;
  repId: number;
  repName: string;
  ownerId: string;
  startDate: string | null;
  month: string;
  roleId: number | null;
  roleName: string | null;
  baseQuota: number | null;
  manager: string | null;
  quota: number | null;
  frupPct: number | null;
};

type Owner = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  archived: boolean;
};

type Role = {
  id: number;
  name: string;
  baseQuota: number;
  rampPct: number[];
  archived: boolean;
};

type ListResponse = {
  rows: Row[];
  mode: "month" | "all";
  month?: string;
};

function formatMonth(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function monthInputValue(iso: string) {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function currentMonthInput() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtMoney(n: number | null) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}
function monthInputToDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

export default function RepsClient() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rampUnit, setRampUnit] = useState<RampUnit>("pct");
  const [allMode, setAllMode] = useState(false);
  const [month, setMonth] = useState(currentMonthInput());
  const [addRepOpen, setAddRepOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [tab, setTab] = useState<ViewTab>("all");
  const [editing, setEditing] = useState<Row | null>(null);

  async function load() {
    const url = allMode ? `/api/reps?all=true` : `/api/reps?month=${month}`;
    const r = await fetch(url);
    setData(await r.json());
  }
  async function loadStatic() {
    const [oRes, rRes, sRes] = await Promise.all([
      fetch("/api/reps/owners"),
      fetch("/api/roles"),
      fetch("/api/settings"),
    ]);
    const oJ = await oRes.json();
    const rJ = await rRes.json();
    const sJ = await sRes.json();
    setOwners(oJ.owners);
    setRoles(rJ.roles);
    setRampUnit(sJ.rampUnit ?? "pct");
  }
  useEffect(() => {
    load();
  }, [allMode, month]);
  useEffect(() => {
    loadStatic();
  }, []);

  const ownerMap = useMemo(() => {
    const m = new Map<string, Owner>();
    for (const o of owners) m.set(o.id, o);
    return m;
  }, [owners]);

  if (bulkAddOpen) {
    return (
      <AddMonthlyQuotasView
        onClose={() => setBulkAddOpen(false)}
        onSaved={async () => {
          setBulkAddOpen(false);
          await load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Monthly Quotas</h1>
          <p className="text-sm text-zinc-500 mt-1">
            One row per (rep × month). A rep can have multiple rows in the same month.
          </p>
        </div>
        {tab === "all" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkAddOpen(true)}
              className="px-3 py-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Add Monthly Quotas
            </button>
          </div>
        )}
      </header>

      <nav className="flex gap-0 border-b border-zinc-200/70 dark:border-zinc-800/70">
        {(
          [
            { id: "all" as ViewTab, label: "All Quotas" },
            { id: "individual" as ViewTab, label: "Individual Quota" },
          ]
        ).map((t) => (
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

      {tab === "individual" ? (
        <IndividualQuotaView />
      ) : (
        <>

      <div className="flex items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={allMode} onChange={(e) => setAllMode(e.target.checked)} />
          Show all history
        </label>
        {!allMode && (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-900"
          />
        )}
        <span className="text-zinc-500">
          {data ? `${data.rows.length} row${data.rows.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="text-left py-3 px-4 font-medium">Sales Rep</th>
              <th className="text-left py-3 px-4 font-medium">Month</th>
              <th className="text-left py-3 px-4 font-medium">Role</th>
              <th className="text-left py-3 px-4 font-medium">Manager</th>
              <th className="text-right py-3 px-4 font-medium">Individual Quota</th>
              <th className="text-right py-3 px-4 font-medium">FRUP</th>
              <th className="text-right py-3 px-4 font-medium w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-zinc-500">
                  No reps yet. Click <strong>+ Add Rep</strong> to get started.
                </td>
              </tr>
            )}
            {data?.rows.map((row, i) => (
              <RepRow
                key={`${row.repId}-${row.monthlyId ?? "empty"}-${i}`}
                row={row}
                roles={roles}
                onChanged={load}
                onOpenEdit={() => setEditing(row)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {addRepOpen && (
        <AddRepModal
          owners={owners}
          roles={roles}
          rampUnit={rampUnit}
          onClose={() => setAddRepOpen(false)}
          onSaved={async () => {
            setAddRepOpen(false);
            await load();
          }}
        />
      )}

      {editing && (
        <EditRowModal
          row={editing}
          ownerName={ownerMap.get(editing.ownerId)?.fullName ?? null}
          roles={roles}
          rampUnit={rampUnit}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
        </>
      )}
    </div>
  );
}

async function saveField(row: Row, body: Record<string, unknown>) {
  if (row.monthlyId) {
    await fetch(`/api/monthly/${row.monthlyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    await fetch(`/api/reps/${row.repId}/monthly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: monthInputValue(row.month), ...body }),
    });
  }
}

function CellButton({
  onClick,
  align = "left",
  children,
}: {
  onClick: () => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-2 py-1 -mx-2 -my-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </button>
  );
}

function InlineText({
  value,
  onSave,
  placeholder,
}: {
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  if (!editing) {
    return (
      <CellButton onClick={() => setEditing(true)}>
        {value || <span className="text-zinc-400">{placeholder ?? "—"}</span>}
      </CellButton>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        if (draft !== (value ?? "")) await onSave(draft.trim() || null);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      className="w-full px-2 py-1 -mx-2 -my-1 border border-zinc-400 rounded bg-white dark:bg-zinc-900 outline-none"
    />
  );
}

function InlineNumber({
  value,
  onSave,
  display,
  scale = 1,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void>;
  display: (n: number | null) => React.ReactNode;
  scale?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(Math.round(value * scale)) : "");
  useEffect(() => setDraft(value != null ? String(Math.round(value * scale)) : ""), [value, scale]);
  if (!editing) {
    return (
      <CellButton onClick={() => setEditing(true)} align="right">
        <span className="font-mono">{display(value)}</span>
      </CellButton>
    );
  }
  return (
    <input
      autoFocus
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        const original = value != null ? String(Math.round(value * scale)) : "";
        if (draft !== original) {
          const next = draft === "" ? null : Number(draft) / scale;
          await onSave(next);
        }
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(value != null ? String(Math.round(value * scale)) : "");
          setEditing(false);
        }
      }}
      className="w-full px-2 py-1 -mx-2 -my-1 border border-zinc-400 rounded bg-white dark:bg-zinc-900 text-right font-mono outline-none"
    />
  );
}

function InlineRoleSelect({
  value,
  roleName,
  roles,
  onSave,
}: {
  value: number | null;
  roleName: string | null;
  roles: Role[];
  onSave: (id: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <CellButton onClick={() => setEditing(true)}>
        {roleName ?? <span className="text-zinc-400">—</span>}
      </CellButton>
    );
  }
  return (
    <select
      autoFocus
      defaultValue={value != null ? String(value) : ""}
      onChange={async (e) => {
        const next = e.target.value === "" ? null : Number(e.target.value);
        if (next !== value) await onSave(next);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full px-2 py-1 -mx-2 -my-1 border border-zinc-400 rounded bg-white dark:bg-zinc-900 outline-none"
    >
      <option value="">— select —</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

function RepRow({
  row,
  roles,
  onChanged,
  onOpenEdit,
}: {
  row: Row;
  roles: Role[];
  onChanged: () => Promise<void>;
  onOpenEdit: () => void;
}) {
  async function save(body: Record<string, unknown>) {
    await saveField(row, body);
    await onChanged();
  }
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-50/40 dark:hover:bg-zinc-800/20">
      <td className="py-2 px-4">
        <div className="font-medium">{row.repName}</div>
        <div className="text-xs text-zinc-500 font-mono">{row.ownerId}</div>
      </td>
      <td className="py-2 px-4 whitespace-nowrap">{formatMonth(row.month)}</td>
      <td className="py-2 px-4">
        <InlineRoleSelect
          value={row.roleId}
          roleName={row.roleName}
          roles={roles}
          onSave={(roleId) => save({ roleId })}
        />
      </td>
      <td className="py-2 px-4">
        <InlineText value={row.manager} onSave={(v) => save({ manager: v })} />
      </td>
      <td className="py-2 px-4 text-right">
        <InlineNumber
          value={row.quota}
          display={(v) => fmtMoney(v)}
          onSave={(v) => save({ quota: v })}
        />
      </td>
      <td className="py-2 px-4 text-right">
        <InlineNumber
          value={row.frupPct}
          scale={100}
          display={(v) => fmtPct(v)}
          onSave={(v) => save({ frupPct: v })}
        />
      </td>
      <td className="py-2 px-4 text-right">
        <button
          onClick={onOpenEdit}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          title="Open full editor (delete, add another, snapshot)"
        >
          More
        </button>
      </td>
    </tr>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function RoleSelectAndRamp({
  roles,
  rampUnit,
  startDate,
  monthValue,
  roleId,
  setRoleId,
  quota,
  setQuota,
  frup,
  setFrup,
}: {
  roles: Role[];
  rampUnit: RampUnit;
  startDate: string | null;
  monthValue: string;
  roleId: string;
  setRoleId: (v: string) => void;
  quota: string;
  setQuota: (v: string) => void;
  frup: string;
  setFrup: (v: string) => void;
}) {
  const role = roles.find((r) => String(r.id) === roleId) ?? null;
  const monthDate = monthInputToDate(monthValue);
  const start = startDate ? new Date(startDate) : null;
  const seniority = role && monthDate ? seniorityMonths(start, monthDate) : -1;
  const suggestion = role && monthDate
    ? suggestedFromRamp({ baseQuota: role.baseQuota, ramp: role.rampPct, unit: rampUnit, seniority })
    : null;

  function pickRole(v: string) {
    setRoleId(v);
    const r = roles.find((x) => String(x.id) === v);
    if (!r || !monthDate) return;
    const sen = seniorityMonths(start, monthDate);
    const s = suggestedFromRamp({ baseQuota: r.baseQuota, ramp: r.rampPct, unit: rampUnit, seniority: sen });
    setQuota(String(Math.round(s.quota)));
    setFrup(String(Math.round(s.frupPct * 100)));
  }

  return (
    <>
      <Field label="Role">
        <select
          value={roleId}
          onChange={(e) => pickRole(e.target.value)}
          className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        >
          <option value="">— select —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {role && suggestion && (
          <div className="text-[11px] text-zinc-500 mt-1">
            {start && monthDate ? (
              <>
                Seniority: <strong>M{Math.max(1, seniority + 1)}</strong> ·{" "}
              </>
            ) : (
              <>No start date set · </>
            )}
            Base ${role.baseQuota.toLocaleString()} · suggested $
            {Math.round(suggestion.quota).toLocaleString()} ({Math.round(suggestion.frupPct * 100)}%)
          </div>
        )}
      </Field>
      <Field label="Individual Quota ($)">
        <input
          type="number"
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
        />
      </Field>
      <Field label="FRUP %">
        <input
          type="number"
          value={frup}
          onChange={(e) => setFrup(e.target.value)}
          placeholder="0–100"
          className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
        />
      </Field>
    </>
  );
}

function AddRepModal({
  owners,
  roles,
  rampUnit,
  onClose,
  onSaved,
}: {
  owners: Owner[];
  roles: Role[];
  rampUnit: RampUnit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [withEntry, setWithEntry] = useState(true);
  const [month, setMonth] = useState(currentMonthInput());
  const [roleId, setRoleId] = useState("");
  const [manager, setManager] = useState("");
  const [quota, setQuota] = useState("");
  const [frup, setFrup] = useState("");

  function pickOwner(id: string) {
    setOwnerId(id);
    const o = owners.find((x) => x.id === id);
    if (!o || name) return;
    const guess = o.fullName ?? `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim();
    setName(guess || o.email || id);
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, name, startDate: startDate || null }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j.error ?? "Failed to create rep");
        return;
      }
      if (withEntry) {
        const r2 = await fetch(`/api/reps/${j.rep.id}/monthly`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month,
            roleId: roleId === "" ? null : Number(roleId),
            manager: manager || null,
            quota: quota === "" ? null : Number(quota),
            frupPct: frup === "" ? null : Number(frup) / 100,
          }),
        });
        if (!r2.ok) {
          const e = await r2.json();
          setErr(e.error ?? "Rep created but monthly entry failed");
          return;
        }
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Add Sales Rep" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="HubSpot Owner ID *">
          <input
            list="owners-list"
            value={ownerId}
            onChange={(e) => pickOwner(e.target.value)}
            placeholder="pick or paste an ID"
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono"
          />
          <datalist id="owners-list">
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName ?? o.email ?? o.id}
                {o.archived ? " (archived)" : ""}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Display Name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        </Field>
        <Field label="Start Date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
        </Field>

        <label className="inline-flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <input type="checkbox" checked={withEntry} onChange={(e) => setWithEntry(e.target.checked)} />
          Add an initial monthly entry
        </label>

        {withEntry && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </Field>
            <Field label="Manager">
              <input
                value={manager}
                onChange={(e) => setManager(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </Field>
            <RoleSelectAndRamp
              roles={roles}
              rampUnit={rampUnit}
              startDate={startDate ? new Date(startDate).toISOString() : null}
              monthValue={month}
              roleId={roleId}
              setRoleId={setRoleId}
              quota={quota}
              setQuota={setQuota}
              frup={frup}
              setFrup={setFrup}
            />
          </div>
        )}

        {err && <div className="text-red-600">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            disabled={busy || !ownerId || !name}
            onClick={save}
            className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function EditRowModal({
  row,
  ownerName,
  roles,
  rampUnit,
  onClose,
  onSaved,
}: {
  row: Row;
  ownerName: string | null;
  roles: Role[];
  rampUnit: RampUnit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.repName);
  const [month, setMonth] = useState(monthInputValue(row.month));
  const [roleId, setRoleId] = useState(row.roleId != null ? String(row.roleId) : "");
  const [manager, setManager] = useState(row.manager ?? "");
  const [quota, setQuota] = useState(row.quota != null ? String(row.quota) : "");
  const [frup, setFrup] = useState(row.frupPct != null ? String(Math.round(row.frupPct * 100)) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      if (name !== row.repName) {
        const res = await fetch(`/api/reps/${row.repId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          setErr("Failed to update rep name");
          return;
        }
      }
      const monthlyBody = {
        month,
        roleId: roleId === "" ? null : Number(roleId),
        manager: manager || null,
        quota: quota === "" ? null : Number(quota),
        frupPct: frup === "" ? null : Number(frup) / 100,
      };
      if (row.monthlyId) {
        const res = await fetch(`/api/monthly/${row.monthlyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(monthlyBody),
        });
        if (!res.ok) {
          setErr("Failed to update monthly entry");
          return;
        }
      } else {
        const res = await fetch(`/api/reps/${row.repId}/monthly`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(monthlyBody),
        });
        if (!res.ok) {
          setErr("Failed to create monthly entry");
          return;
        }
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry() {
    if (!row.monthlyId) return;
    if (!confirm("Delete this monthly entry?")) return;
    setBusy(true);
    try {
      await fetch(`/api/monthly/${row.monthlyId}`, { method: "DELETE" });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function addAnother() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/reps/${row.repId}/monthly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          roleId: roleId === "" ? null : Number(roleId),
          manager: manager || null,
          quota: quota === "" ? null : Number(quota),
          frupPct: frup === "" ? null : Number(frup) / 100,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        setErr(e.error ?? "Failed");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  // Rep deletion intentionally lives only in Settings → Users. This modal is
  // scoped to ONE monthly entry, so the only destructive action here is
  // deleting that entry.

  return (
    <ModalShell title="Edit Row" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Display Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
          />
          <div className="text-xs text-zinc-500 mt-1">
            HubSpot owner: <span className="font-mono">{row.ownerId}</span>
            {ownerName && <> · {ownerName}</>}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Month">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </Field>
          <Field label="Manager">
            <input
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </Field>
          <RoleSelectAndRamp
            roles={roles}
            rampUnit={rampUnit}
            startDate={row.startDate}
            monthValue={month}
            roleId={roleId}
            setRoleId={setRoleId}
            quota={quota}
            setQuota={setQuota}
            frup={frup}
            setFrup={setFrup}
          />
        </div>
        {row.monthlyId && row.baseQuota != null && (
          <div className="text-[11px] text-zinc-500 px-1">
            Snapshot at write time: role <strong>{row.roleName ?? "—"}</strong>, base ${row.baseQuota.toLocaleString()}
          </div>
        )}
        {err && <div className="text-red-600">{err}</div>}
        <div className="flex justify-between items-center pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex gap-2">
            {row.monthlyId && (
              <button
                onClick={deleteEntry}
                disabled={busy}
                className="px-3 py-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Delete entry
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={addAnother}
              disabled={busy}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
              title="Create a second entry for the same rep+month (e.g. role change mid-month)"
            >
              + Add as new entry
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

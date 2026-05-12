"use client";

import { useEffect, useMemo, useState } from "react";
import DataTable, { type ColumnDef } from "@/components/DataTable";
import RowMenu from "@/components/RowMenu";

type User = {
  id: number;
  ownerId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  terminated: boolean;
  currentRoleId: number | null;
  currentRoleName: string | null;
  managerId: number | null;
  managerName: string | null;
  teamId: number | null;
  teamName: string | null;
};

type Team = { id: number; name: string };
type Role = { id: number; name: string };

type Owner = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  archived: boolean;
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDateShort(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function UsersSection({ onNavigateToRoles }: { onNavigateToRoles?: () => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [adding, setAdding] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  async function load() {
    const r = await fetch("/api/users");
    const j = await r.json();
    setUsers(j.users);
  }
  async function loadOwners() {
    const r = await fetch("/api/reps/owners");
    const j = await r.json();
    setOwners(j.owners);
  }
  async function loadTeams() {
    const r = await fetch("/api/teams");
    const j = await r.json();
    setTeams(j.teams);
  }
  async function loadRoles() {
    const r = await fetch("/api/roles");
    const j = await r.json();
    setRoles(j.roles);
  }
  useEffect(() => {
    load();
    loadOwners();
    loadTeams();
    loadRoles();
  }, []);

  async function patch(
    id: number,
    data: { startDate?: string | null; endDate?: string | null; name?: string; ownerId?: string; managerId?: number | null; teamId?: number | null; currentRoleId?: number | null }
  ) {
    await fetch(`/api/reps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  }

  async function deleteUser(u: User) {
    if (!confirm(`Delete "${u.name}" and all their monthly entries? This cannot be undone.`)) return;
    await fetch(`/api/reps/${u.id}`, { method: "DELETE" });
    await load();
  }

  async function reorder(ids: (number | string)[]) {
    await fetch("/api/users/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.map(Number) }),
    });
    await load();
  }

  function jumpToUser(id: number) {
    const el = document.getElementById(`user-row-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    window.setTimeout(() => setHighlightedId((cur) => (cur === id ? null : cur)), 1800);
  }

  const managerOptions = useMemo(
    () =>
      (users ?? []).map((u) => ({ value: u.id, label: u.name + (u.terminated ? " (terminated)" : "") })),
    [users]
  );

  const TEAM_CREATE = "__create_team__";
  const teamOptions = useMemo(
    () => [
      ...teams.map((t) => ({ value: t.id, label: t.name })),
      { value: TEAM_CREATE, label: "+ Create new team…" },
    ],
    [teams]
  );

  async function createTeamAndAssign(userId: number) {
    const name = window.prompt("New team name:");
    if (!name?.trim()) return;
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const j = await res.json();
    if (!res.ok) {
      alert(j.error ?? "Failed to create team");
      return;
    }
    await loadTeams();
    await patch(userId, { teamId: j.team.id });
  }

  const columns: ColumnDef<User>[] = [
    {
      key: "name",
      header: "Name",
      editable: "text",
      getValue: (u) => u.name,
      onSave: (u, v) => patch(u.id, { name: typeof v === "string" ? v : v == null ? "" : String(v) }),
    },
    {
      key: "ownerId",
      header: "HubSpot ID",
      editable: "text",
      getValue: (u) => u.ownerId,
      onSave: (u, v) => patch(u.id, { ownerId: typeof v === "string" ? v : v == null ? "" : String(v) }),
    },
    {
      key: "startDate",
      header: "Start",
      editable: "date",
      getValue: (u) => toDateInput(u.startDate),
      render: (u) => (u.startDate ? <>{fmtDateShort(u.startDate)}</> : <span className="text-zinc-400">—</span>),
      sortAccessor: (u) => u.startDate ?? "",
      onSave: (u, v) => patch(u.id, { startDate: typeof v === "string" ? v : v == null ? null : String(v) }),
    },
    {
      key: "endDate",
      header: "End",
      editable: "date",
      getValue: (u) => toDateInput(u.endDate),
      render: (u) =>
        u.endDate ? <>{fmtDateShort(u.endDate)}</> : <span className="text-zinc-400">—</span>,
      sortAccessor: (u) => u.endDate ?? "",
      // Editing End date directly: clearing it reactivates the rep (the
      // `terminated` flag is derived from `!!endDate` on the server).
      onSave: (u, v) =>
        patch(u.id, { endDate: typeof v === "string" && v !== "" ? v : null }),
    },
    {
      key: "currentRole",
      header: "Role",
      editable: "select",
      selectOptions: roles.map((r) => ({ value: r.id, label: r.name })),
      getValue: (u) => (u.currentRoleId == null ? null : u.currentRoleId),
      sortAccessor: (u) => u.currentRoleName ?? "",
      onSave: async (u, v) => {
        const nextId = v == null || v === "" ? null : Number(v);
        await patch(u.id, { currentRoleId: nextId });
      },
      render: (u) =>
        u.currentRoleName ? (
          <span className="inline-flex items-baseline gap-1.5">
            <span>{u.currentRoleName}</span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToRoles?.();
              }}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px]"
              title="Open Roles tab"
            >
              ↗
            </button>
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      key: "manager",
      header: "Manager",
      editable: "select",
      selectOptions: managerOptions,
      getValue: (u) => (u.managerId == null ? null : u.managerId),
      sortAccessor: (u) => u.managerName ?? "",
      onSave: async (u, v) => {
        const nextId = v == null || v === "" ? null : Number(v);
        if (nextId === u.id) return;
        await patch(u.id, { managerId: nextId });
      },
      render: (u) =>
        u.managerId && u.managerName ? (
          <span className="inline-flex items-baseline gap-1.5">
            <span>{u.managerName}</span>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                jumpToUser(u.managerId!);
              }}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[10px]"
              title="Jump to manager's row"
            >
              ↗
            </button>
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      key: "team",
      header: "Team",
      editable: "select",
      selectOptions: teamOptions,
      getValue: (u) => (u.teamId == null ? null : u.teamId),
      sortAccessor: (u) => u.teamName ?? "",
      onSave: async (u, v) => {
        if (v === TEAM_CREATE) {
          await createTeamAndAssign(u.id);
          return;
        }
        const nextId = v == null || v === "" ? null : Number(v);
        await patch(u.id, { teamId: nextId });
      },
      render: (u) =>
        u.teamName ? (
          <span>{u.teamName}</span>
        ) : (
          <span className="text-zinc-400">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortAccessor: (u) => (u.terminated ? 1 : 0),
      render: (u) =>
        u.terminated ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            Terminated
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">
            Active
          </span>
        ),
    },
  ];

  const sorted = users ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add User
        </button>
      </div>

      {users === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : (
        <DataTable
          rows={sorted}
          columns={columns}
          rowId={(u) => u.id}
          storageKey="settings-users"
          onReorder={reorder}
          rowActions={(u) => (
            <UserActions
              user={u}
              onPatch={patch}
              onDelete={deleteUser}
            />
          )}
          rowClassName={(u) => {
            const classes: string[] = [];
            if (u.terminated) classes.push("text-zinc-500");
            if (highlightedId === u.id) classes.push("bg-amber-50 dark:bg-amber-950/30");
            return classes.join(" ");
          }}
          emptyMessage="No users yet. Click Add User to create one."
        />
      )}

      {/* Hidden anchors so jumpToUser can scrollIntoView. */}
      {users?.map((u) => <span key={u.id} id={`user-row-${u.id}`} className="sr-only" />)}

      {adding && (
        <AddUserModal
          owners={owners}
          existingOwnerIds={new Set((users ?? []).map((u) => u.ownerId))}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </section>
  );
}

function UserActions({
  user,
  onPatch,
  onDelete,
}: {
  user: User;
  onPatch: (id: number, data: { startDate?: string | null; endDate?: string | null; name?: string; managerId?: number | null }) => Promise<void>;
  onDelete: (u: User) => Promise<void>;
}) {
  const [terminating, setTerminating] = useState(false);
  const [termDate, setTermDate] = useState(todayInput());
  const [busy, setBusy] = useState(false);

  async function confirmTerminate() {
    if (!termDate) return;
    setBusy(true);
    try {
      await onPatch(user.id, { endDate: termDate });
      setTerminating(false);
    } finally {
      setBusy(false);
    }
  }
  async function reactivate() {
    if (!confirm(`Reactivate ${user.name}? Their end date will be cleared.`)) return;
    setBusy(true);
    try {
      await onPatch(user.id, { endDate: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RowMenu
        items={[
          user.terminated
            ? { label: "Reactivate", onSelect: reactivate, disabled: busy }
            : {
                label: "Terminate…",
                onSelect: () => {
                  setTermDate(todayInput());
                  setTerminating(true);
                },
                disabled: busy,
              },
          { label: "Delete", onSelect: () => onDelete(user), variant: "danger" as const },
        ]}
      />

      {terminating && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setTerminating(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h2 className="font-semibold text-base">Terminate {user.name}</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Sets an end date on the rep. They&apos;ll be marked terminated and excluded
                from active-rep flows from this date forward. Historical entries are kept.
              </p>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <label className="block">
                <div className="text-xs text-zinc-500 mb-1">End date</div>
                <input
                  type="date"
                  value={termDate}
                  onChange={(e) => setTermDate(e.target.value)}
                  autoFocus
                  className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
              </label>
              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setTerminating(false)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTerminate}
                  disabled={busy || !termDate}
                  className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {busy ? "Terminating…" : "Terminate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddUserModal({
  owners,
  existingOwnerIds,
  onClose,
  onSaved,
}: {
  owners: Owner[];
  existingOwnerIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        setErr(j.error ?? "Failed to create user");
        return;
      }
      onSaved();
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
          <h2 className="font-semibold">Add User</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">HubSpot Owner ID *</div>
            <input
              list="users-add-owners"
              value={ownerId}
              onChange={(e) => pickOwner(e.target.value)}
              placeholder="paste any HubSpot owner ID, or pick from synced list"
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
            <datalist id="users-add-owners">
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName ?? o.email ?? o.id}
                  {o.archived ? " (archived)" : ""}
                  {existingOwnerIds.has(o.id) ? " · already added" : ""}
                </option>
              ))}
            </datalist>
            <div className="text-[11px] text-zinc-500 mt-1">
              Free-text — you can paste any HubSpot ID, even ones not synced yet.
            </div>
            {ownerId && existingOwnerIds.has(ownerId) && (
              <div className="text-[11px] text-amber-600 mt-1">This owner is already added as a user.</div>
            )}
          </label>
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Display Name *</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
          </label>
          <label className="block">
            <div className="text-xs text-zinc-500 mb-1">Start Date</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            />
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
              disabled={busy || !ownerId || !name || existingOwnerIds.has(ownerId)}
              className="px-3 py-1.5 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

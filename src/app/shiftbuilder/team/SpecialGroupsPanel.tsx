"use client";

/**
 * SpecialGroupsPanel — group-centric editor for the weekly special-assignment
 * pools (On Call / AM Overlaps / PM Overlaps). Promoted out of the per-TM roster
 * drawer into its own /team section: here you see each pool and its whole roster
 * at once, rather than toggling one person at a time.
 *
 * Membership is keyed on the canonical uuid (TMRecord.id) — the same id the
 * roster drawer wrote — so both surfaces stay in sync. Groups are created lazily
 * on first add via /api/admin/tm-groups.
 */

import React from "react";
import { UserPlus, X } from "lucide-react";
import { SudoTabLoading } from "../sudo/SudoGlass";
import type { TMRecord } from "@/lib/shiftbuilder/sudoActions";

// On Call is the only special pool with no other home — the AM/PM overlap pools
// live on the Graves Schedule (grave_pool bands), which is their single source of
// truth. Editing them here would just be a second, drift-prone copy.
const SPECIAL_GROUPS: Array<{ name: string; blurb: string; accent: string }> = [
  { name: "On Call", blurb: "Backup coverage for tonight's gaps", accent: "#B89708" },
];

type Group = { id: string; name: string; members: string[] };

export function SpecialGroupsPanel() {
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [tms, setTms] = React.useState<TMRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [flash, setFlash] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tms) m.set(t.id, t.displayName || t.fullName || t.tmId);
    return m;
  }, [tms]);

  const loadGroups = React.useCallback(async () => {
    const res = await fetch("/api/admin/tm-groups");
    const json = await res.json();
    setGroups((json.data || []) as Group[]);
  }, []);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { listAllTMs } = await import("@/lib/shiftbuilder/sudoActions");
        const [roster] = await Promise.all([listAllTMs(), loadGroups()]);
        setTms(roster.filter((t) => t.active));
      } catch {
        setFlash({ kind: "err", msg: "Failed to load special groups" });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadGroups]);

  const flashFor = (kind: "ok" | "err", msg: string) => {
    setFlash({ kind, msg });
    setTimeout(() => setFlash(null), 2400);
  };

  const ensureGroup = async (name: string): Promise<Group | null> => {
    let g: Group | null = groups.find((x) => x.name === name) ?? null;
    if (g) return g;
    await fetch("/api/admin/tm-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_group",
        name,
        description: `${name} weekly special assignments`,
      }),
    });
    await loadGroups();
    const res = await fetch("/api/admin/tm-groups");
    const json = await res.json();
    const fresh = (json.data || []) as Group[];
    setGroups(fresh);
    g = fresh.find((x) => x.name === name) ?? null;
    return g ?? null;
  };

  const addMember = async (name: string, tmId: string) => {
    setBusy(true);
    try {
      const group = await ensureGroup(name);
      if (!group) throw new Error("group");
      const res = await fetch("/api/admin/tm-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_member", group_id: group.id, tm_id: tmId }),
      });
      if (!res.ok) throw new Error("add");
      await loadGroups();
      flashFor("ok", `Added ${nameById.get(tmId) ?? "TM"} to ${name}`);
    } catch {
      flashFor("err", `Failed to add to ${name}`);
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (group: Group, tmId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tm-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_member", group_id: group.id, tm_id: tmId }),
      });
      if (!res.ok) throw new Error("remove");
      await loadGroups();
      flashFor("ok", `Removed ${nameById.get(tmId) ?? "TM"} from ${group.name}`);
    } catch {
      flashFor("err", `Failed to remove from ${group.name}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SudoTabLoading className="!py-6 text-[13px]">Loading special groups</SudoTabLoading>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-[#1C1C1E]">On-Call Pool</h2>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          Who is eligible for on-call backup coverage. AM &amp; PM overlaps live on the{" "}
          <span className="font-medium text-neutral-600">Graves Schedule</span> — this is the one place for on-call.
        </p>
      </div>

      {flash && (
        <div
          className={`rounded-lg border px-3 py-2 text-[12px] ${
            flash.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {flash.msg}
        </div>
      )}

      <div className="grid max-w-md gap-4">
        {SPECIAL_GROUPS.map((def) => {
          const group = groups.find((g) => g.name === def.name);
          const memberIds = group?.members ?? [];
          const available = tms.filter((t) => !memberIds.includes(t.id));
          return (
            <GroupCard
              key={def.name}
              def={def}
              memberIds={memberIds}
              nameById={nameById}
              available={available}
              busy={busy}
              onAdd={(tmId) => addMember(def.name, tmId)}
              onRemove={(tmId) => group && removeMember(group, tmId)}
            />
          );
        })}
      </div>
    </div>
  );
}

function GroupCard({
  def,
  memberIds,
  nameById,
  available,
  busy,
  onAdd,
  onRemove,
}: {
  def: { name: string; blurb: string; accent: string };
  memberIds: string[];
  nameById: Map<string, string>;
  available: TMRecord[];
  busy: boolean;
  onAdd: (tmId: string) => void;
  onRemove: (tmId: string) => void;
}) {
  const sorted = [...memberIds].sort((a, b) =>
    (nameById.get(a) ?? "").localeCompare(nameById.get(b) ?? ""),
  );
  return (
    <section className="flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="border-b border-neutral-100 px-4 py-3" style={{ borderTop: `3px solid ${def.accent}` }}>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-[#1C1C1E]">{def.name}</h3>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 tabular-nums">
            {memberIds.length}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-400">{def.blurb}</p>
      </div>

      <div className="min-h-[80px] flex-1 space-y-1 px-3 py-3">
        {sorted.length === 0 ? (
          <p className="px-1 py-4 text-center text-[12px] text-neutral-400">No members yet.</p>
        ) : (
          sorted.map((id) => (
            <div
              key={id}
              className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-neutral-50"
            >
              <span className="truncate font-medium text-neutral-800">
                {nameById.get(id) ?? id}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(id)}
                className="sb-interactive rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                title={`Remove from ${def.name}`}
                aria-label={`Remove ${nameById.get(id) ?? "member"} from ${def.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-neutral-100 p-3">
        <AddMemberPicker groupName={def.name} available={available} busy={busy} onAdd={onAdd} />
      </div>
    </section>
  );
}

function AddMemberPicker({
  groupName,
  available,
  busy,
  onAdd,
}: {
  groupName: string;
  available: TMRecord[];
  busy: boolean;
  onAdd: (tmId: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? available.filter((t) => (t.displayName || t.tmId).toLowerCase().includes(q))
    : available;

  const pick = (tmId: string) => {
    setOpen(false);
    setQuery("");
    onAdd(tmId);
  };

  if (available.length === 0) {
    return <p className="px-1 text-[11px] text-neutral-400">Everyone active is in {groupName}.</p>;
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
        <UserPlus size={14} className="shrink-0 text-neutral-400" />
        <input
          type="search"
          value={query}
          disabled={busy}
          placeholder={`Add TM (${available.length})…`}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              pick(filtered[0].id);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="w-full bg-transparent text-[12px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:opacity-50"
          autoComplete="off"
        />
      </div>
      {open && (
        <ul className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[220px] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[11px] text-neutral-400">No matches</li>
          ) : (
            filtered.slice(0, 40).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={busy}
                  className="sb-interactive w-full px-3 py-1.5 text-left text-[12px] hover:bg-neutral-100 disabled:opacity-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t.id)}
                >
                  <span className="font-medium text-neutral-900">{t.displayName || t.tmId}</span>
                  {t.gravePool && (
                    <span className="ml-2 text-[10px] text-neutral-400">{t.gravePool}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default SpecialGroupsPanel;

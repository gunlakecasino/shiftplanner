"use client";

/**
 * Team tab — manage every TM in tm_profiles.
 *
 * Layout:
 *   1. Top strip of unmatched ADP names from the most-recently-applied schedule.
 *      Each pill offers two actions:
 *        • Add → creates a brand new TM (then opens the edit drawer)
 *        • Merge → links the raw ADP spelling to an *existing* TM by appending
 *          it to their full_name (so future parses match). Also opens the drawer.
 *      Non-person rows ("Grave Shift Headcount:", "Day Shift Headcount:", etc.)
 *      are filtered out at the parser level and never appear here.
 *   2. Filterable list of all TMs (active + inactive).
 *   3. Row-click → right-side drawer with 4 sub-tabs:
 *        - Identity (display_name, full_name, employee_name, status, notes)
 *        - Grave (grave_pool, primary_section, tie_break_rank, slot_preference)
 *        - Prefs (tm_preferences + tm_accommodations CRUD)
 *        - Skills (overall skill_score + per-slot 0-10 grid backed by tm_slot_skills)
 *
 * No-auth caveat: every write goes through the service-role key. The drawer
 * always confirms destructive actions (soft-delete, restore) before firing.
 */

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  listAllTMs,
  upsertTM,
  softDeleteTM,
  restoreTM,
  getUnmatchedFromLatestSchedule,
  getTMDetail,
  upsertSlotSkill,
  addTMPreference,
  deleteTMPreference,
  addTMAccommodation,
  deleteTMAccommodation,
  createTMFromUnmatched,
  mergeUnmatchedIntoTM,
  type TMRecord,
  type TMPreference,
  type TMAccommodation,
  type TMSlotSkill,
} from "@/lib/shiftbuilder/sudoActions";
import { supabase } from "@/lib/supabase";

export interface TeamTabProps {
  onDataChanged?: () => void;
}

type Filter = "active" | "inactive" | "all";

export function TeamTab({ onDataChanged }: TeamTabProps = {}) {
  const [tms, setTMs] = React.useState<TMRecord[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [unmatched, setUnmatched] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState<Filter>("active");
  const [query, setQuery] = React.useState("");

  // Merge flow for unmatched ADP names ("this is actually an existing TM")
  const [mergingName, setMergingName] = React.useState<string | null>(null);
  const [mergeSearch, setMergeSearch] = React.useState("");
  const [drawerTmId, setDrawerTmId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [allSlotIds, setAllSlotIds] = React.useState<string[]>([]);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const rows = await listAllTMs();
      setTMs(rows);
      // Discover unmatched names from the most recent applied schedule.
      const rosterForMatch = rows
        .filter((r) => r.active)
        .map((r) => ({ id: r.tmId, name: r.displayName, fullName: r.fullName }));
      const um = await getUnmatchedFromLatestSchedule(rosterForMatch);
      setUnmatched(um);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTMs([]);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  // Slot list for the Skills tab — pull from slot_difficulty so the column
  // header order mirrors the engine's notion of slots.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("slot_difficulty")
        .select("slot_id")
        .order("slot_id");
      if (!cancelled && !error && data) {
        setAllSlotIds(data.map((r: any) => String(r.slot_id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const filtered = React.useMemo(() => {
    if (!tms) return [];
    const q = query.trim().toLowerCase();
    return tms.filter((t) => {
      if (filter === "active" && !t.active) return false;
      if (filter === "inactive" && t.active) return false;
      if (!q) return true;
      return (
        (t.displayName ?? "").toLowerCase().includes(q) ||
        (t.fullName ?? "").toLowerCase().includes(q) ||
        (t.tmId ?? "").toLowerCase().includes(q)
      );
    });
  }, [tms, filter, query]);

  const drawerTM = React.useMemo(
    () => tms?.find((t) => t.tmId === drawerTmId) ?? null,
    [tms, drawerTmId]
  );

  const handleAddUnmatched = async (rawName: string) => {
    try {
      const newId = await createTMFromUnmatched(rawName);
      flash("ok", `Created — opening drawer to finish setup`);
      await refresh();
      setDrawerTmId(newId);
      onDataChanged?.();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : String(err));
    }
  };

  const handleMergeUnmatched = async (rawName: string, targetTmId: string) => {
    try {
      await mergeUnmatchedIntoTM(rawName, targetTmId);
      flash("ok", `Merged "${rawName}" into existing TM — future schedules will match`);
      setMergingName(null);
      setMergeSearch("");
      await refresh();
      setDrawerTmId(targetTmId); // open the drawer so operator can review
      onDataChanged?.();
    } catch (err) {
      flash("err", err instanceof Error ? err.message : String(err));
    }
  };

  // Active TMs for the merge picker (filtered by the small search box)
  const mergeCandidates = React.useMemo(() => {
    if (!tms) return [];
    const q = mergeSearch.toLowerCase().trim();
    return tms
      .filter((t) => t.active)
      .filter((t) => {
        if (!q) return true;
        return (
          t.displayName.toLowerCase().includes(q) ||
          (t.fullName ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 12); // keep the list small and fast
  }, [tms, mergeSearch]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[15px] text-zinc-100">Team</h2>
          <p className="text-[12px] text-zinc-500 leading-snug max-w-2xl">
            Manage every TM in <span className="font-mono">tm_profiles</span>. Edit identity,
            grave pool, preferences, accommodations, and per-slot skill scores.
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
        >
          <span className="ms" style={{ fontSize: 12 }}>refresh</span> refresh
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "mx-6 mt-3 rounded-lg px-3 py-2 text-[12px] border",
            toast.kind === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
              : "bg-red-500/10 border-red-500/30 text-red-200"
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
        {/* Unmatched from latest applied schedule — now supports Add (new TM) or Merge (existing TM) */}
        {unmatched.length > 0 && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="ms text-amber-300" style={{ fontSize: 14 }}>person_add</span>
              <span className="text-[11px] uppercase tracking-wider text-amber-200 font-mono">
                Unmatched from latest schedule ({unmatched.length})
              </span>
              <span className="text-[10px] text-zinc-500">
                — real people missing from tm_profiles. Use <span className="font-medium text-amber-300">Add</span> or <span className="font-medium text-sky-400">Merge</span>.
              </span>
            </div>

            {/* Normal list of unmatched pills (hidden while in merge picker mode) */}
            {!mergingName && (
              <div className="flex flex-wrap gap-2">
                {unmatched.map((name) => (
                  <div
                    key={name}
                    className="group flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-zinc-900/70 px-2.5 py-1.5 text-left"
                  >
                    <span className="text-[12px] text-zinc-200 font-medium px-1">{name}</span>

                    {/* Add as brand new TM */}
                    <button
                      onClick={() => handleAddUnmatched(name)}
                      className="ml-1 flex items-center gap-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 text-[10px] text-amber-300 hover:text-amber-200 transition-colors"
                      title="Create new TM from this name"
                    >
                      <span className="ms" style={{ fontSize: 12 }}>person_add</span>
                      Add
                    </button>

                    {/* Merge into existing TM (the name is a variant of someone already in the roster) */}
                    <button
                      onClick={() => {
                        setMergingName(name);
                        setMergeSearch("");
                      }}
                      className="flex items-center gap-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 px-2 py-0.5 text-[10px] text-sky-400 hover:text-sky-300 transition-colors"
                      title="This person already exists — link the ADP spelling to them"
                    >
                      <span className="ms" style={{ fontSize: 12 }}>link</span>
                      Merge
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Merge picker — appears when you click "Merge" on one of the unmatched names */}
            {mergingName && (
              <div className="rounded-xl border border-sky-500/40 bg-zinc-950/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] text-sky-400">
                    Merge <span className="font-semibold text-zinc-200">“{mergingName}”</span> into which existing TM?
                  </div>
                  <button
                    onClick={() => {
                      setMergingName(null);
                      setMergeSearch("");
                    }}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                  >
                    <span className="ms" style={{ fontSize: 12 }}>close</span> Cancel
                  </button>
                </div>

                {/* Quick search within active TMs */}
                <div className="relative mb-2">
                  <span className="ms absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" style={{ fontSize: 12 }}>search</span>
                  <input
                    type="text"
                    value={mergeSearch}
                    onChange={(e) => setMergeSearch(e.target.value)}
                    placeholder="Search active TMs by name…"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded pl-7 pr-3 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                    autoFocus
                  />
                </div>

                {/* Candidate list */}
                {mergeCandidates.length === 0 ? (
                  <div className="text-[11px] text-zinc-500 py-1">No matching active TMs</div>
                ) : (
                  <div className="max-h-[180px] overflow-auto space-y-0.5 pr-1">
                    {mergeCandidates.map((tm) => (
                      <button
                        key={tm.tmId}
                        onClick={() => handleMergeUnmatched(mergingName, tm.tmId)}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-sky-500/10 border border-transparent hover:border-sky-500/30 flex items-center justify-between text-[12px]"
                      >
                        <div>
                          <span className="font-medium text-zinc-200">{tm.displayName}</span>
                          {tm.fullName && tm.fullName !== tm.displayName && (
                            <span className="ml-2 text-[10px] text-zinc-500">({tm.fullName})</span>
                          )}
                        </div>
                        <div className="text-[10px] text-sky-400">select → merge</div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 text-[10px] text-zinc-500">
                  This will append the exact ADP spelling to the chosen TM’s full_name so future schedules match automatically.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <span className="ms absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" style={{ fontSize: 14 }}>search</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by display name, full name, or tm_id…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
            {(["active", "inactive", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors",
                  filter === f
                    ? "bg-red-500/20 text-red-200"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              try {
                const newId = await upsertTM({ displayName: "New TM", active: true, status: "active" });
                await refresh();
                setDrawerTmId(newId);
                onDataChanged?.();
              } catch (err) {
                flash("err", err instanceof Error ? err.message : String(err));
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-medium inline-flex items-center gap-1.5"
          >
            <span className="ms" style={{ fontSize: 12 }}>person_add</span> new TM
          </button>
        </div>

        {/* List */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            <span className="ms inline mr-1" style={{ fontSize: 12 }}>warning</span>
            {error}
          </div>
        )}
        {tms === null && (
          <div className="text-zinc-500 text-[12px] flex items-center gap-2">
            <span className="ms animate-spin" style={{ fontSize: 12 }}>sync</span> Loading TMs…
          </div>
        )}
        {tms && (
          <div className="rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Display name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Full name</th>
                  <th className="text-left px-4 py-2.5 font-medium">tm_id</th>
                  <th className="text-left px-4 py-2.5 font-medium">Pool</th>
                  <th className="text-right px-4 py-2.5 font-medium">Skill</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tm) => (
                  <tr
                    key={tm.tmId}
                    onClick={() => setDrawerTmId(tm.tmId)}
                    className={cn(
                      "border-t border-zinc-900 hover:bg-zinc-900/40 cursor-pointer",
                      !tm.active && "opacity-60"
                    )}
                  >
                    <td className="px-4 py-2.5 text-zinc-100 font-medium">{tm.displayName}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{tm.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-500 font-mono text-[11px]">{tm.tmId}</td>
                    <td className="px-4 py-2.5">
                      <PoolPill pool={tm.gravePool} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 font-mono text-[11px]">
                      {tm.skillScore === null ? "—" : tm.skillScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill active={tm.active} status={tm.status} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-zinc-500 text-[12px]">
                      No TMs match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerTM && (
        <TMEditDrawer
          tm={drawerTM}
          allSlotIds={allSlotIds}
          onClose={() => setDrawerTmId(null)}
          onSaved={async () => {
            await refresh();
            onDataChanged?.();
          }}
          onFlash={flash}
        />
      )}
    </div>
  );
}

// =====================================================================
// Pills
// =====================================================================

function PoolPill({ pool }: { pool: string | null }) {
  if (!pool) return <span className="text-zinc-600 text-[10px] font-mono">—</span>;
  const p = pool.toUpperCase();
  const label =
    p === "FULL" ? "Graves"
    : p === "PM"  ? "PM Overlap"
    : p === "AM"  ? "AM Overlap"
    : p === "OTHER" ? "Other"
    : p;
  const color =
    p === "FULL"
      ? "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20"
      : p === "PM"
      ? "bg-[#AF52DE]/10 text-[#AF52DE] border-[#AF52DE]/20"
      : p === "AM"
      ? "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20"
      : "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span
      className={cn(
        "text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-mono border",
        color
      )}
    >
      {label}
    </span>
  );
}

function StatusPill({ active, status }: { active: boolean; status: string }) {
  if (!active) {
    const color =
      status === "LOA"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : status === "transferred"
        ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
        : "bg-zinc-800 text-zinc-500 border-zinc-700";
    return (
      <span className={cn("text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-mono border", color)}>
        {status || "inactive"}
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-mono border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
      active
    </span>
  );
}

// =====================================================================
// Edit Drawer
// =====================================================================

type DrawerTab = "identity" | "grave" | "prefs" | "skills";

function TMEditDrawer({
  tm,
  allSlotIds,
  onClose,
  onSaved,
  onFlash,
}: {
  tm: TMRecord;
  allSlotIds: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
}) {
  const [tab, setTab] = React.useState<DrawerTab>("identity");
  const [form, setForm] = React.useState<TMRecord>(tm);
  const [saving, setSaving] = React.useState(false);
  const [drawerToast, setDrawerToast] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const flashDrawer = React.useCallback((kind: "ok" | "err", msg: string) => {
    setDrawerToast({ kind, msg });
    setTimeout(() => setDrawerToast(null), 5000);
  }, []);
  const [detail, setDetail] = React.useState<{
    preferences: TMPreference[];
    accommodations: TMAccommodation[];
    slotSkills: TMSlotSkill[];
  } | null>(null);

  // Re-sync form when a different TM is selected
  React.useEffect(() => {
    setForm(tm);
  }, [tm.tmId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await getTMDetail(tm.tmId);
        if (!cancelled) setDetail(d);
      } catch (err) {
        if (!cancelled) onFlash("err", err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tm.tmId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc to close
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertTM({
        tmId: form.tmId,
        displayName: form.displayName,
        fullName: form.fullName,
        employeeName: form.employeeName,
        active: form.active,
        gravePool: form.gravePool,
        primarySection: form.primarySection,
        tieBreakRank: form.tieBreakRank,
        skillScore: form.skillScore,
        status: form.status,
        slotPreference: form.slotPreference,
        notes: form.notes,
      });
      flashDrawer("ok", `Saved ${form.displayName}`);
      onFlash("ok", `Saved ${form.displayName}`);
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      flashDrawer("err", msg);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    if (!window.confirm(`Soft-delete ${form.displayName}?\n\nThey'll be marked inactive and removed from the engine roster. History (night_tm_status, appraisals, etc.) is preserved.`)) {
      return;
    }
    setSaving(true);
    try {
      await softDeleteTM(form.tmId);
      onFlash("ok", `${form.displayName} marked inactive`);
      await onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      flashDrawer("err", msg);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setSaving(true);
    try {
      await restoreTM(form.tmId);
      flashDrawer("ok", `${form.displayName} restored`);
      onFlash("ok", `${form.displayName} restored`);
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      flashDrawer("err", msg);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[10010] flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative h-full w-[640px] bg-zinc-950 text-zinc-100 border-l border-zinc-800 shadow-2xl flex flex-col overflow-hidden"
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-zinc-100">{form.displayName || "(no display name)"}</div>
            <div className="text-[10px] font-mono text-zinc-500">{form.tmId}</div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 rounded p-1 transition-colors"
            aria-label="Close drawer"
          >
            <span className="ms" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Tab rail */}
        <div className="px-3 border-b border-zinc-800 flex items-center gap-1">
          {(["identity", "grave", "prefs", "skills"] as DrawerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2 text-[11px] uppercase tracking-wider font-mono transition-colors border-b-2",
                tab === t
                  ? "border-red-400 text-red-200"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* In-drawer toast */}
        {drawerToast && (
          <div
            className={cn(
              "mx-4 mt-2 rounded-lg px-3 py-2 text-[12px] border",
              drawerToast.kind === "ok"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
                : "bg-red-500/10 border-red-500/30 text-red-200"
            )}
          >
            {drawerToast.msg}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-4">
          {tab === "identity" && (
            <IdentityForm form={form} setForm={setForm} />
          )}
          {tab === "grave" && <GraveForm form={form} setForm={setForm} />}
          {tab === "prefs" && detail && (
            <PrefsForm
              tmId={form.tmId}
              preferences={detail.preferences}
              accommodations={detail.accommodations}
              onChanged={async () => {
                const d = await getTMDetail(form.tmId);
                setDetail(d);
              }}
              onFlash={onFlash}
            />
          )}
          {tab === "skills" && detail && (
            <SkillsForm
              tmId={form.tmId}
              overallScore={form.skillScore}
              onOverallChange={(v) => setForm((f) => ({ ...f, skillScore: v }))}
              slotSkills={detail.slotSkills}
              allSlotIds={allSlotIds}
              onScoreSaved={async () => {
                const d = await getTMDetail(form.tmId);
                setDetail(d);
              }}
              onFlash={onFlash}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-2.5 flex items-center justify-between gap-2">
          <div>
            {form.active ? (
              <button
                onClick={softDelete}
                disabled={saving}
                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-red-600/30 text-zinc-400 hover:text-red-300 text-[11px] font-mono inline-flex items-center gap-1.5"
              >
                <span className="ms" style={{ fontSize: 12 }}>archive</span> soft-delete
              </button>
            ) : (
              <button
                onClick={restore}
                disabled={saving}
                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-300 text-[11px] font-mono inline-flex items-center gap-1.5"
              >
                <span className="ms" style={{ fontSize: 12 }}>undo</span> restore
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 text-[12px]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[12px] font-medium inline-flex items-center gap-1.5"
            >
              {saving ? <span className="ms animate-spin" style={{ fontSize: 12 }}>sync</span> : <span className="ms" style={{ fontSize: 12 }}>check_circle</span>}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// =====================================================================
// Field forms
// =====================================================================

function IdentityForm({
  form,
  setForm,
}: {
  form: TMRecord;
  setForm: React.Dispatch<React.SetStateAction<TMRecord>>;
}) {
  return (
    <div className="space-y-3">
      <Field label="Display Name *">
        <input
          type="text"
          value={form.displayName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          className={inputCx}
        />
      </Field>
      <Field label="Full Name (legal / payroll)">
        <input
          type="text"
          value={form.fullName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          className={inputCx}
        />
      </Field>
      <Field label="Employee Name (as it appears in ADP)">
        <input
          type="text"
          value={form.employeeName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))}
          className={inputCx}
        />
      </Field>
      <Field label="tm_id (immutable)">
        <input type="text" value={form.tmId} readOnly disabled className={cn(inputCx, "opacity-60")} />
      </Field>
      <Field label="Active status">
        <div className="flex gap-1.5 items-center">
          {([true, false] as const).map((opt) => (
            <button
              key={String(opt)}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  active: opt,
                  // valid status values: 'active' | 'LOA' | 'transferred' | 'separated' | 'other'
                  status: opt
                    ? "active"
                    : f.status === "active"
                    ? "separated"
                    : f.status,
                }))
              }
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider border transition-colors",
                form.active === opt
                  ? opt
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                    : "bg-zinc-700 text-zinc-300 border-zinc-600"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              )}
            >
              {opt ? "active" : "inactive"}
            </button>
          ))}
          {!form.active && (
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="ml-2 px-2 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 font-mono focus:outline-none focus:border-zinc-500"
            >
              <option value="separated">separated</option>
              <option value="LOA">LOA</option>
              <option value="transferred">transferred</option>
              <option value="other">other</option>
            </select>
          )}
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Inactive TMs are hidden from the engine roster and the active filter. Hit Save to persist.
        </p>
      </Field>
      <Field label="Notes">
        <textarea
          rows={4}
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={inputCx}
        />
      </Field>
    </div>
  );
}

function GraveForm({
  form,
  setForm,
}: {
  form: TMRecord;
  setForm: React.Dispatch<React.SetStateAction<TMRecord>>;
}) {
  return (
    <div className="space-y-3">
      <Field label="Grave Pool">
        <div className="flex flex-wrap gap-1.5">
          {([
            { value: null,    label: "None",       active: "bg-zinc-700 text-zinc-200 border-zinc-500" },
            { value: "Full",  label: "Graves",     active: "bg-[#007AFF]/20 text-[#60aaff] border-[#007AFF]/40" },
            { value: "PM",    label: "PM Overlap", active: "bg-[#AF52DE]/20 text-[#d084f0] border-[#AF52DE]/40" },
            { value: "AM",    label: "AM Overlap", active: "bg-[#34C759]/20 text-[#5ddf7d] border-[#34C759]/40" },
            { value: "Other", label: "Other",      active: "bg-zinc-700 text-zinc-200 border-zinc-500" },
          ] as Array<{ value: string | null; label: string; active: string }>).map(({ value, label, active }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setForm((f) => ({ ...f, gravePool: value }))}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-wider border transition-colors",
                form.gravePool === value
                  ? active
                  : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
          <span className="text-[#60aaff]">Graves</span> = full 11pm–7am shift ·{" "}
          <span className="text-[#d084f0]">PM Overlap</span> = out at ~1am ·{" "}
          <span className="text-[#5ddf7d]">AM Overlap</span> = in at 5am–5:15am (on next day's ADP schedule) ·{" "}
          <span className="text-zinc-400">None</span> = not on grave shift
        </div>
      </Field>
      <Field label="Primary Section">
        <input
          type="text"
          value={form.primarySection ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, primarySection: e.target.value || null }))}
          className={inputCx}
          placeholder="e.g. zones / restrooms / aux"
        />
      </Field>
      <Field label="Slot Preference">
        <input
          type="text"
          value={form.slotPreference ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, slotPreference: e.target.value || null }))}
          className={inputCx}
          placeholder="e.g. Z9SR, ADM"
        />
      </Field>
      <Field label="Tie-Break Rank">
        <input
          type="number"
          value={form.tieBreakRank ?? ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              tieBreakRank: e.target.value === "" ? null : Number(e.target.value),
            }))
          }
          className={inputCx}
        />
      </Field>
    </div>
  );
}

function PrefsForm({
  tmId,
  preferences,
  accommodations,
  onChanged,
  onFlash,
}: {
  tmId: string;
  preferences: TMPreference[];
  accommodations: TMAccommodation[];
  onChanged: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
}) {
  const [newPref, setNewPref] = React.useState({ stance: "prefer", strength: "soft", target: "", note: "" });
  const [newAcc, setNewAcc] = React.useState({ type: "physical", severity: "soft", target: "", note: "" });

  return (
    <div className="space-y-5">
      {/* Preferences */}
      <section>
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2 font-mono">Preferences</div>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-950 text-zinc-500 text-[9px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-1.5">Stance</th>
                <th className="text-left px-2 py-1.5">Strength</th>
                <th className="text-left px-2 py-1.5">Target</th>
                <th className="text-left px-2 py-1.5">Note</th>
                <th className="text-right px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {preferences.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-zinc-600 text-[11px]">
                    No preferences yet
                  </td>
                </tr>
              )}
              {preferences.map((p) => (
                <tr key={p.id} className="border-t border-zinc-900">
                  <td className="px-2 py-1.5 text-zinc-300">{p.stance}</td>
                  <td className="px-2 py-1.5 text-zinc-400">{p.strength}</td>
                  <td className="px-2 py-1.5 text-zinc-200 font-mono">{p.target}</td>
                  <td className="px-2 py-1.5 text-zinc-500 truncate max-w-[180px]">{p.note ?? ""}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await deleteTMPreference(p.id);
                          await onChanged();
                        } catch (err) {
                          onFlash("err", err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className="text-zinc-600 hover:text-red-400"
                    >
                      <span className="ms" style={{ fontSize: 12 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-zinc-900 bg-zinc-900/40">
                <td className="px-2 py-1.5">
                  <select
                    value={newPref.stance}
                    onChange={(e) => setNewPref({ ...newPref, stance: e.target.value })}
                    className={miniSelectCx}
                  >
                    <option value="prefer">prefer</option>
                    <option value="avoid">avoid</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={newPref.strength}
                    onChange={(e) => setNewPref({ ...newPref, strength: e.target.value })}
                    className={miniSelectCx}
                  >
                    <option value="soft">soft</option>
                    <option value="hard">hard</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newPref.target}
                    placeholder="slot / area / TM"
                    onChange={(e) => setNewPref({ ...newPref, target: e.target.value })}
                    className={miniInputCx}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newPref.note}
                    placeholder="optional note"
                    onChange={(e) => setNewPref({ ...newPref, note: e.target.value })}
                    className={miniInputCx}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={async () => {
                      if (!newPref.target.trim()) return;
                      try {
                        await addTMPreference({ tmId, ...newPref });
                        setNewPref({ stance: "prefer", strength: "soft", target: "", note: "" });
                        await onChanged();
                      } catch (err) {
                        onFlash("err", err instanceof Error ? err.message : String(err));
                      }
                    }}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-mono"
                  >
                    add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Accommodations */}
      <section>
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2 font-mono">Accommodations</div>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-950 text-zinc-500 text-[9px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-1.5">Type</th>
                <th className="text-left px-2 py-1.5">Severity</th>
                <th className="text-left px-2 py-1.5">Target</th>
                <th className="text-left px-2 py-1.5">Note</th>
                <th className="text-right px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {accommodations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-zinc-600 text-[11px]">
                    No accommodations
                  </td>
                </tr>
              )}
              {accommodations.map((a) => (
                <tr key={a.id} className="border-t border-zinc-900">
                  <td className="px-2 py-1.5 text-zinc-300">{a.type}</td>
                  <td className="px-2 py-1.5 text-zinc-400">{a.severity}</td>
                  <td className="px-2 py-1.5 text-zinc-200 font-mono">{a.target ?? "—"}</td>
                  <td className="px-2 py-1.5 text-zinc-500 truncate max-w-[180px]">{a.note}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await deleteTMAccommodation(a.id);
                          await onChanged();
                        } catch (err) {
                          onFlash("err", err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className="text-zinc-600 hover:text-red-400"
                    >
                      <span className="ms" style={{ fontSize: 12 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-zinc-900 bg-zinc-900/40">
                <td className="px-2 py-1.5">
                  <select
                    value={newAcc.type}
                    onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value })}
                    className={miniSelectCx}
                  >
                    <option value="physical">physical</option>
                    <option value="medical">medical</option>
                    <option value="schedule">schedule</option>
                    <option value="other">other</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={newAcc.severity}
                    onChange={(e) => setNewAcc({ ...newAcc, severity: e.target.value })}
                    className={miniSelectCx}
                  >
                    <option value="soft">soft</option>
                    <option value="hard">hard</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newAcc.target}
                    placeholder="e.g. no_sweeper"
                    onChange={(e) => setNewAcc({ ...newAcc, target: e.target.value })}
                    className={miniInputCx}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newAcc.note}
                    placeholder="required note"
                    onChange={(e) => setNewAcc({ ...newAcc, note: e.target.value })}
                    className={miniInputCx}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={async () => {
                      if (!newAcc.note.trim()) return;
                      try {
                        await addTMAccommodation({
                          tmId,
                          type: newAcc.type,
                          severity: newAcc.severity,
                          target: newAcc.target || null,
                          note: newAcc.note,
                          status: "active",
                        });
                        setNewAcc({ type: "physical", severity: "soft", target: "", note: "" });
                        await onChanged();
                      } catch (err) {
                        onFlash("err", err instanceof Error ? err.message : String(err));
                      }
                    }}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-mono"
                  >
                    add
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SkillsForm({
  tmId,
  overallScore,
  onOverallChange,
  slotSkills,
  allSlotIds,
  onScoreSaved,
  onFlash,
}: {
  tmId: string;
  overallScore: number | null;
  onOverallChange: (v: number | null) => void;
  slotSkills: TMSlotSkill[];
  allSlotIds: string[];
  onScoreSaved: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
}) {
  const byId = React.useMemo(() => {
    const m = new Map<string, number>();
    slotSkills.forEach((s) => m.set(s.slotId, s.score));
    return m;
  }, [slotSkills]);

  const setScore = async (slotId: string, score: number) => {
    try {
      await upsertSlotSkill({ tmId, slotId, score });
      await onScoreSaved();
    } catch (err) {
      onFlash("err", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Overall skill score (0-10) — fallback for any slot missing a per-slot score">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={overallScore ?? 5}
            onChange={(e) => onOverallChange(Number(e.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={overallScore ?? ""}
            onChange={(e) =>
              onOverallChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className={cn(inputCx, "w-20 text-center")}
          />
        </div>
      </Field>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-2 font-mono">
          Per-slot scores (auto-saves)
        </div>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead className="bg-zinc-950 text-zinc-500 text-[9px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-2 py-1.5">Slot</th>
                <th className="text-left px-2 py-1.5 w-48">Score</th>
                <th className="text-right px-2 py-1.5 w-12">Val</th>
              </tr>
            </thead>
            <tbody>
              {allSlotIds.map((slotId) => {
                const current = byId.get(slotId) ?? null;
                return (
                  <tr key={slotId} className="border-t border-zinc-900">
                    <td className="px-2 py-1.5 text-zinc-200 font-mono">{slotId}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={current ?? 5}
                        onChange={(e) => setScore(slotId, Number(e.target.value))}
                        className="w-full"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right text-zinc-300 font-mono">
                      {current ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {allSlotIds.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-2 py-3 text-center text-zinc-600 text-[11px]">
                    No slots defined in slot_difficulty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Form primitives
// =====================================================================

const inputCx =
  "w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600";
const miniInputCx =
  "w-full px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600";
const miniSelectCx =
  "px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-200 focus:outline-none focus:border-zinc-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

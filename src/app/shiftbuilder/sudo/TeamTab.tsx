"use client";

/**
 * Team tab — manage every TM in tm_profiles.
 *
 * Layout:
 *   1. Filterable list of all TMs (active + inactive).
 *   2. Row-click → right-side drawer with 4 sub-tabs:
 *        - Identity (display_name, full_name, employee_name, status, notes)
 *        - Grave (grave_pool, primary_section, tie_break_rank, slot_preference)
 *        - Prefs (tm_preferences + tm_accommodations CRUD)
 *        - Skills (overall skill_score + per-slot 0-10 grid backed by tm_slot_skills)
 *
 * Writes are session-gated via postOpsMutation (canAccessSudo ∥ canManageTeam).
 * The drawer always confirms destructive actions (soft-delete, restore) before firing.
 */

import React from "react";
import { cn } from "@/lib/utils";
// TM management functions are dynamically imported inside handlers/effects
// to prevent static pulling of the heavy data module through sudoActions (Turbopack HMR fix).
import type {
  TMRecord,
  TMPreference,
  TMAccommodation,
  TMSlotSkill,
} from "@/lib/shiftbuilder/sudoActions";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useConfirm } from "../components/ConfirmDialog";
import {
  GlassSurface,
  GoldHairline,
  CenteredGlassModal,
  SudoTabButton,
  SudoTabLoading,
  BuilderBusyLabel,
} from "./SudoGlass";

export interface TeamTabProps {
  onDataChanged?: () => void;
  /** Follows the parent Sudo theme for correct glass + text colors */
  isDark?: boolean;
}

// Dynamic helpers — prevents static top-level dependency on sudoActions (which pulls data)
const dyn = {
  listAllTMs: async () => (await import("@/lib/shiftbuilder/sudoActions")).listAllTMs(),
  upsertTM: async (p: any) => (await import("@/lib/shiftbuilder/sudoActions")).upsertTM(p),
  softDeleteTM: async (id: string) => (await import("@/lib/shiftbuilder/sudoActions")).softDeleteTM(id),
  restoreTM: async (id: string) => (await import("@/lib/shiftbuilder/sudoActions")).restoreTM(id),
  getTMDetail: async (id: string) => (await import("@/lib/shiftbuilder/sudoActions")).getTMDetail(id),
  upsertSlotSkill: async (p: any) => (await import("@/lib/shiftbuilder/sudoActions")).upsertSlotSkill(p),
  addTMPreference: async (p: any) => (await import("@/lib/shiftbuilder/sudoActions")).addTMPreference(p),
  deleteTMPreference: async (id: string) => (await import("@/lib/shiftbuilder/sudoActions")).deleteTMPreference(id),
  addTMAccommodation: async (p: any) => (await import("@/lib/shiftbuilder/sudoActions")).addTMAccommodation(p),
  deleteTMAccommodation: async (id: string) => (await import("@/lib/shiftbuilder/sudoActions")).deleteTMAccommodation(id),
};

type Filter = "active" | "inactive" | "all";

export function TeamTab({ onDataChanged, isDark = false }: TeamTabProps = {}) {
  // Zone matrix heat-map lives on Reports → Zone Rotation Matrix (live night history).
  // Engine fairness uses tm_zone_matrix, refreshed on draft apply / live assign.
  const [tms, setTMs] = React.useState<TMRecord[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<Filter>("active");
  const [query, setQuery] = React.useState("");
  const [poolFilter, setPoolFilter] = React.useState<"all" | "Graves" | "PM Overlap" | "AM Overlap" | "None">("all");

  const [drawerTmId, setDrawerTmId] = React.useState<string | null>(null);
  const [allSlotIds, setAllSlotIds] = React.useState<string[]>([]);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      const { listAllTMs } = await import("@/lib/shiftbuilder/sudoActions");

      const rows = await listAllTMs();
      setTMs(rows);
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
    if (kind === "ok") toast.success(msg);
    else toast.error(msg);
  };

  const filtered = React.useMemo(() => {
    if (!tms) return [];
    const q = query.trim().toLowerCase();
    return tms.filter((t) => {
      if (filter === "active" && !t.active) return false;
      if (filter === "inactive" && t.active) return false;

      // Pool filter
      if (poolFilter !== "all") {
        const p = (t.gravePool || "").toLowerCase();
        if (poolFilter === "Graves" && p !== "full") return false;
        if (poolFilter === "PM Overlap" && p !== "pm") return false;
        if (poolFilter === "AM Overlap" && p !== "am") return false;
        if (poolFilter === "None" && p) return false;
      }

      if (!q) return true;
      const nameMatch =
        (t.displayName ?? "").toLowerCase().includes(q) ||
        (t.fullName ?? "").toLowerCase().includes(q) ||
        (t.tmId ?? "").toLowerCase().includes(q);
      const poolMatch = (t.gravePool ?? "").toLowerCase().includes(q);
      return nameMatch || poolMatch;
    });
  }, [tms, filter, query, poolFilter]);

  const drawerTM = React.useMemo(
    () => tms?.find((t) => t.tmId === drawerTmId) ?? null,
    [tms, drawerTmId]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-black/3 dark:bg-white/3">
        <div>
          <h2 className={cn("font-semibold text-[15px]", isDark ? "text-zinc-100" : "text-[#1C1C1E]")}>Team</h2>
          <p className={cn("text-[12px] leading-snug max-w-2xl", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
            Manage every TM in <span className="font-mono">tm_profiles</span>. Edit identity,
            grave pool, preferences, accommodations, and per-slot skill scores.
          </p>
        </div>
        <button
          onClick={refresh}
          className={cn("text-[11px] inline-flex items-center gap-1.5", isDark ? "text-zinc-400 hover:text-zinc-200" : "text-[#6C6C72] hover:text-[#111]")}
        >
          <span className="ms" style={{ fontSize: 12 }}>refresh</span> refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <span className={cn("ms absolute left-2.5 top-1/2 -translate-y-1/2", isDark ? "text-zinc-500" : "text-[#6C6C72]")} style={{ fontSize: 14 }}>search</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, pool (Graves/PM/AM), or tm_id…"
              className={cn(
                "w-full pl-8 pr-3 py-1.5 rounded-lg text-[12px] focus:outline-none transition-colors",
                isDark
                  ? "bg-[#1C1C1E] border border-[#3A3A3C] text-[#F2F2F4] placeholder:text-zinc-600 focus:border-[#B89708]/60"
                  : "bg-white border border-[#E5E5E7] text-[#1C1C1E] placeholder:text-[#9CA3AF] focus:border-[#B89708]/60"
              )}
            />
          </div>

          {/* Pool filter */}
          <select
            value={poolFilter}
            onChange={(e) => setPoolFilter(e.target.value as any)}
            className={cn(
              "text-[12px] px-2 py-1.5 rounded-lg border focus:outline-none",
              isDark
                ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F2F2F4]"
                : "bg-white border-[#E5E5E7] text-[#1C1C1E]"
            )}
          >
            <option value="all">All pools</option>
            <option value="Graves">Graves (Full)</option>
            <option value="PM Overlap">PM Overlap</option>
            <option value="AM Overlap">AM Overlap</option>
            <option value="None">No Grave pool</option>
          </select>

          <div className={cn("flex items-center gap-1 rounded-lg p-0.5 border", isDark ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5E7]")}>
            {(["active", "inactive", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors",
                  filter === f
                    ? isDark
                      ? "bg-[#B89708]/15 text-[#E9B948]"
                      : "bg-[#B89708]/10 text-[#8B6910]"
                    : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-[#6C6C72] hover:text-[#111]"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              try {
                const newId = await dyn.upsertTM({ displayName: "New TM", active: true, status: "active" });
                await refresh();
                setDrawerTmId(newId);
                onDataChanged?.();
              } catch (err) {
                flash("err", err instanceof Error ? err.message : String(err));
              }
            }}
            className="sb-interactive px-3 py-1.5 rounded-lg bg-[#B89708] hover:bg-[#A07F07] text-white text-[11px] font-medium inline-flex items-center gap-1.5"
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
        {tms === null && <SudoTabLoading>Loading TMs</SudoTabLoading>}
        {tms && (
          <div className={cn("rounded-2xl border overflow-hidden", isDark ? "border-white/10" : "border-black/10")}>
            <table className="w-full text-[12px]">
              <thead className={cn("text-[10px] uppercase tracking-wider", isDark ? "bg-[#1C1C1E] text-[#8E8E93]" : "bg-[#F2F2F0] text-[#6C6C72]")}>
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Display name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Full name</th>
                  <th className="text-left px-4 py-2.5 font-medium">tm_id</th>
                  <th className="text-left px-4 py-2.5 font-medium">Pool</th>
                  <th className="text-left px-4 py-2.5 font-medium">Gender</th>
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
                      "sb-list-row border-t cursor-pointer",
                      isDark ? "border-white/5 hover:bg-white/5" : "border-black/5 hover:bg-black/5",
                      !tm.active && "opacity-60"
                    )}
                  >
                    <td className={cn("px-4 py-2.5 font-medium", isDark ? "text-zinc-100" : "text-[#1C1C1E]")}>{tm.displayName}</td>
                    <td className={cn("px-4 py-2.5", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>{tm.fullName ?? "—"}</td>
                    <td className={cn("px-4 py-2.5 font-mono text-[11px]", isDark ? "text-zinc-500" : "text-[#8E8E93]")}>{tm.tmId}</td>
                    <td className="px-4 py-2.5">
                      <PoolPill pool={tm.gravePool} isDark={isDark} />
                    </td>
                    <td className="px-4 py-2.5">
                      <GenderPill gender={tm.gender} isDark={isDark} />
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-mono text-[11px]", isDark ? "text-zinc-300" : "text-[#3C3C43]")}>
                      {tm.skillScore === null ? "—" : tm.skillScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill active={tm.active} status={tm.status} isDark={isDark} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className={cn("px-4 py-6 text-center text-[12px]", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
                      No TMs match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer — centered premium glass modal */}
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
          isDark={isDark}
        />
      )}
    </div>
  );
}

// =====================================================================
// Pills
// =====================================================================

function PoolPill({ pool, isDark = false }: { pool: string | null; isDark?: boolean }) {
  if (!pool) return <span className={cn("text-[10px] font-mono", isDark ? "text-zinc-600" : "text-neutral-400")}>—</span>;
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
      : isDark
      ? "bg-zinc-800 text-zinc-400 border-zinc-700"
      : "bg-neutral-100 text-neutral-600 border-neutral-300";
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

function GenderPill({ gender, isDark = false }: { gender?: 'M' | 'F' | null; isDark?: boolean }) {
  if (!gender) return <span className={cn("text-[10px] font-mono", isDark ? "text-zinc-600" : "text-neutral-400")}>—</span>;
  const isM = gender === 'M';
  return (
    <span
      className={cn(
        "text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border",
        isM
          ? "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20"
          : "bg-[#FF2D55]/10 text-[#FF2D55] border-[#FF2D55]/20"
      )}
      title={isM ? "Male — eligible for MRR (men's restrooms)" : "Female — eligible for WRR (women's restrooms)"}
    >
      {isM ? "M" : "F"}
    </span>
  );
}

function StatusPill({ active, status, isDark = false }: { active: boolean; status: string; isDark?: boolean }) {
  if (!active) {
    const color =
      status === "LOA"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : status === "transferred"
        ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
        : isDark
        ? "bg-zinc-800 text-zinc-500 border-zinc-700"
        : "bg-neutral-100 text-neutral-500 border-neutral-300";
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
  isDark = false,
}: {
  tm: TMRecord;
  allSlotIds: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
  isDark?: boolean;
}) {
  const confirmDialog = useConfirm();
  const [tab, setTab] = React.useState<DrawerTab>("identity");
  const [form, setForm] = React.useState<TMRecord>(tm);
  const [saving, setSaving] = React.useState(false);
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
        const d = await dyn.getTMDetail(tm.tmId);
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
      await dyn.upsertTM({
        tmId: form.tmId,
        displayName: form.displayName,
        fullName: form.fullName,
        employeeName: form.employeeName,
        active: form.active,
        gravePool: form.gravePool,
        primarySection: form.primarySection,
        gender: form.gender,
        tieBreakRank: form.tieBreakRank,
        skillScore: form.skillScore,
        status: form.status,
        slotPreference: form.slotPreference,
        notes: form.notes,
      });
      onFlash("ok", `Saved ${form.displayName}`);
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  const softDelete = async () => {
    const ok = await confirmDialog(
      "They'll be marked inactive and removed from the engine roster. History (night_tm_status, appraisals, etc.) is preserved.",
      { title: `Soft-delete ${form.displayName}?`, confirmLabel: "Soft-delete", tone: "danger" },
    );
    if (!ok) {
      return;
    }
    setSaving(true);
    try {
      await dyn.softDeleteTM(form.tmId);
      onFlash("ok", `${form.displayName} marked inactive`);
      await onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setSaving(true);
    try {
      await dyn.restoreTM(form.tmId);
      onFlash("ok", `${form.displayName} restored`);
      await onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onFlash("err", msg);
    } finally {
      setSaving(false);
    }
  };

  // New centered premium glass modal (replaces the old right slide-in)
  return (
    <CenteredGlassModal
      open={true}
      onClose={onClose}
      isDark={isDark}
      width={680}
      title={form.displayName || "(no display name)"}
      subtitle={form.tmId}
      headerActions={
        saving ? (
          <span className="text-[11px] text-[#6C6C72] dark:text-zinc-500 font-mono mr-2">saving…</span>
        ) : null
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {form.active ? (
              <button
                onClick={softDelete}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-[11px] font-mono border border-black/10 dark:border-white/10 text-[#6C6C72] dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <span className="ms mr-1" style={{ fontSize: 12 }}>archive</span>
                soft-delete
              </button>
            ) : (
              <button
                onClick={restore}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-[11px] font-mono border border-black/10 dark:border-white/10 text-[#6C6C72] dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <span className="ms mr-1" style={{ fontSize: 12 }}>undo</span>
                restore
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-[12px] text-[#6C6C72] dark:text-zinc-400 hover:text-[#111] dark:hover:text-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="sb-interactive px-5 py-1.5 rounded-lg bg-[#B89708] hover:bg-[#A07F07] text-white text-[12px] font-medium inline-flex items-center gap-2 shadow-sm"
            >
              {saving ? (
                <BuilderBusyLabel>Saving</BuilderBusyLabel>
              ) : (
                <>
                  <span className="ms" style={{ fontSize: 14 }}>check_circle</span>
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      {/* Horizontal tab strip (gold accent for active) */}
      <div className="flex items-center gap-1 border-b border-black/10 dark:border-white/10 pb-2 mb-4">
        {(["identity", "grave", "prefs", "skills"] as DrawerTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "sb-interactive px-4 py-1.5 text-[11px] uppercase tracking-[1px] font-mono rounded-lg",
              tab === t
                ? isDark
                  ? "bg-[#B89708]/15 text-[#E9B948] border border-[#B89708]/30"
                  : "bg-[#B89708]/10 text-[#8B6910] border border-[#B89708]/25"
                : isDark
                ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                : "text-[#6C6C72] hover:bg-black/5 hover:text-[#111]"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Form body */}
      <div className="space-y-4 text-[13px]">
        {tab === "identity" && <IdentityForm form={form} setForm={setForm} isDark={isDark} />}
        {tab === "grave" && <GraveForm form={form} setForm={setForm} isDark={isDark} />}
        {tab === "prefs" && detail && (
          <PrefsForm
            tmId={form.tmId}
            preferences={detail.preferences}
            accommodations={detail.accommodations}
            onChanged={async () => {
              const d = await dyn.getTMDetail(form.tmId);
              setDetail(d);
            }}
            onFlash={onFlash}
            isDark={isDark}
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
              const d = await dyn.getTMDetail(form.tmId);
              setDetail(d);
            }}
            onFlash={onFlash}
            isDark={isDark}
          />
        )}

      </div>
    </CenteredGlassModal>
  );
}

// =====================================================================
// Field forms
// =====================================================================

function IdentityForm({
  form,
  setForm,
  isDark = false,
}: {
  form: TMRecord;
  setForm: React.Dispatch<React.SetStateAction<TMRecord>>;
  isDark?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="Display Name *" isDark={isDark}>
        <input
          type="text"
          value={form.displayName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
          className={inputCx(isDark)}
        />
      </Field>
      <Field label="Full Name (legal / payroll)" isDark={isDark}>
        <input
          type="text"
          value={form.fullName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          className={inputCx(isDark)}
        />
      </Field>
      <Field label="Employee / legal name" isDark={isDark}>
        <input
          type="text"
          value={form.employeeName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, employeeName: e.target.value }))}
          className={inputCx(isDark)}
        />
      </Field>
      <Field label="tm_id (immutable)" isDark={isDark}>
        <input type="text" value={form.tmId} readOnly disabled className={cn(inputCx(isDark), "opacity-60")} />
      </Field>
      <Field label="Active status" isDark={isDark}>
        <div className="flex gap-1.5 items-center">
          {([true, false] as const).map((opt) => (
            <button
              key={String(opt)}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  active: opt,
                  status: opt ? "active" : f.status === "active" ? "separated" : f.status,
                }))
              }
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider border transition-colors",
                form.active === opt
                  ? opt
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-200 border-amber-500/30"
                  : isDark
                  ? "bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200"
                  : "bg-black/5 text-[#6C6C72] border-black/10 hover:text-[#111]"
              )}
            >
              {opt ? "active" : "inactive"}
            </button>
          ))}
          {!form.active && (
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className={cn("ml-2 px-2 py-1.5 rounded-lg text-[11px] font-mono focus:outline-none", miniSelectCx(isDark))}
            >
              <option value="separated">separated</option>
              <option value="LOA">LOA</option>
              <option value="transferred">transferred</option>
              <option value="other">other</option>
            </select>
          )}
        </div>
        <p className={cn("text-[10px] mt-1", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
          Inactive TMs are hidden from the engine roster and the active filter. Hit Save to persist.
        </p>
      </Field>
      <Field label="Gender (restroom eligibility)" isDark={isDark}>
        <div className="flex gap-1.5 items-center">
          {([
            { val: 'M', label: 'Male (MRR)' },
            { val: 'F', label: 'Female (WRR)' },
            { val: null, label: 'Unknown (RR blocked)' },
          ] as const).map((opt) => (
            <button
              key={String(opt.val)}
              type="button"
              onClick={() => setForm((f) => ({ ...f, gender: opt.val }))}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider border transition-colors",
                form.gender === opt.val
                  ? opt.val === 'M'
                    ? "bg-[#007AFF]/15 text-[#007AFF] border-[#007AFF]/30"
                    : opt.val === 'F'
                    ? "bg-[#FF2D55]/15 text-[#FF2D55] border-[#FF2D55]/30"
                    : isDark
                    ? "bg-white/5 text-zinc-400 border-white/10"
                    : "bg-black/5 text-[#6C6C72] border-black/10"
                  : isDark
                  ? "bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200"
                  : "bg-black/5 text-[#6C6C72] border-black/10 hover:text-[#111]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className={cn("text-[10px] mt-1", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
          Drives isEligibleForSlot (MRR only M, WRR only F; unknown = safe fallback for both). Edit here then Save. Picker / marker / engine pick up on next roster load (or invalidate).
        </p>
      </Field>
      <Field label="Notes" isDark={isDark}>
        <textarea
          rows={4}
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={inputCx(isDark)}
        />
      </Field>
    </div>
  );
}

function GraveForm({
  form,
  setForm,
  isDark = false,
}: {
  form: TMRecord;
  setForm: React.Dispatch<React.SetStateAction<TMRecord>>;
  isDark?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="Grave Pool" isDark={isDark}>
        <div className="flex flex-wrap gap-1.5">
          {([
            { value: null,    label: "None",       active: isDark ? "bg-zinc-700 text-zinc-200 border-zinc-500" : "bg-neutral-700 text-white border-neutral-600" },
            { value: "Full",  label: "Graves",     active: "bg-[#007AFF]/20 text-[#60aaff] border-[#007AFF]/40" },
            { value: "PM",    label: "PM Overlap", active: "bg-[#AF52DE]/20 text-[#d084f0] border-[#AF52DE]/40" },
            { value: "AM",    label: "AM Overlap", active: "bg-[#34C759]/20 text-[#5ddf7d] border-[#34C759]/40" },
            { value: "Other", label: "Other",      active: isDark ? "bg-zinc-700 text-zinc-200 border-zinc-500" : "bg-neutral-700 text-white border-neutral-600" },
          ] as Array<{ value: string | null; label: string; active: string }>).map(({ value, label, active }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setForm((f) => ({ ...f, gravePool: value }))}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-mono tracking-wider border transition-colors",
                form.gravePool === value
                  ? active
                  : isDark
                  ? "bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200"
                  : "bg-black/5 text-[#6C6C72] border-black/10 hover:text-[#111]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={cn("text-[10px] mt-1.5 leading-relaxed", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
          <span className="text-[#007AFF]">Graves</span> = full 11pm–7am shift ·{" "}
          <span className="text-[#AF52DE]">PM Overlap</span> = out at ~1am ·{" "}
          <span className="text-[#34C759]">AM Overlap</span> = early overlap pool ·{" "}
          <span className={isDark ? "text-zinc-400" : "text-[#6C6C72]"}>None</span> = not on grave shift
        </div>
      </Field>
      <Field label="Primary Section" isDark={isDark}>
        <input
          type="text"
          value={form.primarySection ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, primarySection: e.target.value || null }))}
          className={inputCx(isDark)}
          placeholder="e.g. zones / restrooms / aux"
        />
      </Field>
      <Field label="Slot Preference" isDark={isDark}>
        <input
          type="text"
          value={form.slotPreference ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, slotPreference: e.target.value || null }))}
          className={inputCx(isDark)}
          placeholder="e.g. Z9SR, ADM"
        />
      </Field>
      <Field label="Tie-Break Rank" isDark={isDark}>
        <input
          type="number"
          value={form.tieBreakRank ?? ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              tieBreakRank: e.target.value === "" ? null : Number(e.target.value),
            }))
          }
          className={inputCx(isDark)}
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
  isDark = false,
}: {
  tmId: string;
  preferences: TMPreference[];
  accommodations: TMAccommodation[];
  onChanged: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
  isDark?: boolean;
}) {
  const [newPref, setNewPref] = React.useState({ stance: "prefer", strength: "soft", target: "", note: "" });
  const [newAcc, setNewAcc] = React.useState({ type: "physical", severity: "soft", target: "", note: "" });

  return (
    <div className="space-y-5">
      {/* Preferences */}
      <section>
        <div className={cn("text-[11px] uppercase tracking-wider mb-2 font-mono", isDark ? "text-zinc-400" : "text-neutral-500")}>Preferences</div>
        <div className={cn("rounded-lg border overflow-hidden", isDark ? "border-zinc-800" : "border-neutral-200")}>
          <table className="w-full text-[11.5px]">
            <thead className={cn("text-[9px] uppercase tracking-wider", isDark ? "bg-zinc-950 text-zinc-500" : "bg-neutral-50 text-neutral-500")}>
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
                  <td colSpan={5} className={cn("px-2 py-3 text-center text-[11px]", isDark ? "text-zinc-600" : "text-neutral-400")}>
                    No preferences yet
                  </td>
                </tr>
              )}
              {preferences.map((p) => (
                <tr key={p.id} className={cn("border-t", isDark ? "border-zinc-900" : "border-neutral-200")}>
                  <td className={cn("px-2 py-1.5", isDark ? "text-zinc-300" : "text-neutral-700")}>{p.stance}</td>
                  <td className={cn("px-2 py-1.5", isDark ? "text-zinc-400" : "text-neutral-600")}>{p.strength}</td>
                  <td className={cn("px-2 py-1.5 font-mono", isDark ? "text-zinc-200" : "text-neutral-900")}>{p.target}</td>
                  <td className={cn("px-2 py-1.5 truncate max-w-[180px]", isDark ? "text-zinc-500" : "text-neutral-500")}>{p.note ?? ""}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await dyn.deleteTMPreference(p.id);
                          await onChanged();
                        } catch (err) {
                          onFlash("err", err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className={cn(isDark ? "text-zinc-600 hover:text-red-400" : "text-neutral-400 hover:text-red-500")}
                    >
                      <span className="ms" style={{ fontSize: 12 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              <tr className={cn("border-t", isDark ? "border-zinc-900 bg-zinc-900/40" : "border-neutral-200 bg-neutral-50")}>
                <td className="px-2 py-1.5">
                  <select
                    value={newPref.stance}
                    onChange={(e) => setNewPref({ ...newPref, stance: e.target.value })}
                    className={miniSelectCx(isDark)}
                  >
                    <option value="prefer">prefer</option>
                    <option value="avoid">avoid</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={newPref.strength}
                    onChange={(e) => setNewPref({ ...newPref, strength: e.target.value })}
                    className={miniSelectCx(isDark)}
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
                    className={miniInputCx(isDark)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newPref.note}
                    placeholder="optional note"
                    onChange={(e) => setNewPref({ ...newPref, note: e.target.value })}
                    className={miniInputCx(isDark)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={async () => {
                      if (!newPref.target.trim()) return;
                      try {
                        await dyn.addTMPreference({ tmId, ...newPref });
                        setNewPref({ stance: "prefer", strength: "soft", target: "", note: "" });
                        await onChanged();
                      } catch (err) {
                        onFlash("err", err instanceof Error ? err.message : String(err));
                      }
                    }}
                    className={cn("text-[10px] font-mono", isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-600 hover:text-emerald-500")}
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
        <div className={cn("text-[11px] uppercase tracking-wider mb-2 font-mono", isDark ? "text-zinc-400" : "text-neutral-500")}>Accommodations</div>
        <div className={cn("rounded-lg border overflow-hidden", isDark ? "border-zinc-800" : "border-neutral-200")}>
          <table className="w-full text-[11.5px]">
            <thead className={cn("text-[9px] uppercase tracking-wider", isDark ? "bg-zinc-950 text-zinc-500" : "bg-neutral-50 text-neutral-500")}>
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
                  <td colSpan={5} className={cn("px-2 py-3 text-center text-[11px]", isDark ? "text-zinc-600" : "text-neutral-400")}>
                    No accommodations
                  </td>
                </tr>
              )}
              {accommodations.map((a) => (
                <tr key={a.id} className={cn("border-t", isDark ? "border-zinc-900" : "border-neutral-200")}>
                  <td className={cn("px-2 py-1.5", isDark ? "text-zinc-300" : "text-neutral-700")}>{a.type}</td>
                  <td className={cn("px-2 py-1.5", isDark ? "text-zinc-400" : "text-neutral-600")}>{a.severity}</td>
                  <td className={cn("px-2 py-1.5 font-mono", isDark ? "text-zinc-200" : "text-neutral-900")}>{a.target ?? "—"}</td>
                  <td className={cn("px-2 py-1.5 truncate max-w-[180px]", isDark ? "text-zinc-500" : "text-neutral-500")}>{a.note}</td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={async () => {
                        try {
                          await dyn.deleteTMAccommodation(a.id);
                          await onChanged();
                        } catch (err) {
                          onFlash("err", err instanceof Error ? err.message : String(err));
                        }
                      }}
                      className={cn(isDark ? "text-zinc-600 hover:text-red-400" : "text-neutral-400 hover:text-red-500")}
                    >
                      <span className="ms" style={{ fontSize: 12 }}>delete</span>
                    </button>
                  </td>
                </tr>
              ))}
              <tr className={cn("border-t", isDark ? "border-zinc-900 bg-zinc-900/40" : "border-neutral-200 bg-neutral-50")}>
                <td className="px-2 py-1.5">
                  <select
                    value={newAcc.type}
                    onChange={(e) => setNewAcc({ ...newAcc, type: e.target.value })}
                    className={miniSelectCx(isDark)}
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
                    className={miniSelectCx(isDark)}
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
                    className={miniInputCx(isDark)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={newAcc.note}
                    placeholder="required note"
                    onChange={(e) => setNewAcc({ ...newAcc, note: e.target.value })}
                    className={miniInputCx(isDark)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={async () => {
                      if (!newAcc.note.trim()) return;
                      try {
                        await dyn.addTMAccommodation({
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
                    className={cn("text-[10px] font-mono", isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-600 hover:text-emerald-500")}
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
  isDark = false,
}: {
  tmId: string;
  overallScore: number | null;
  onOverallChange: (v: number | null) => void;
  slotSkills: TMSlotSkill[];
  allSlotIds: string[];
  onScoreSaved: () => void | Promise<void>;
  onFlash: (kind: "ok" | "err", msg: string) => void;
  isDark?: boolean;
}) {
  const [draftScores, setDraftScores] = React.useState<Record<string, number>>({});
  const lastSubmittedRef = React.useRef<Record<string, number>>({});
  const byId = React.useMemo(() => {
    const m = new Map<string, number>();
    slotSkills.forEach((s) => m.set(s.slotId, s.score));
    return m;
  }, [slotSkills]);

  const setScore = async (slotId: string, score: number) => {
    if (lastSubmittedRef.current[slotId] === score) return;
    lastSubmittedRef.current[slotId] = score;
    try {
      await dyn.upsertSlotSkill({ tmId, slotId, score });
      await onScoreSaved();
      setDraftScores((current) => {
        const next = { ...current };
        delete next[slotId];
        return next;
      });
    } catch (err) {
      delete lastSubmittedRef.current[slotId];
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
            className={cn(inputCx(isDark), "w-20 text-center")}
          />
        </div>
      </Field>

      <div>
        <div className={cn("text-[11px] uppercase tracking-wider mb-2 font-mono", isDark ? "text-zinc-400" : "text-neutral-500")}>
          Per-slot scores (auto-saves)
        </div>
        <div className={cn("rounded-lg border overflow-hidden", isDark ? "border-zinc-800" : "border-neutral-200")}>
          <table className="w-full text-[11.5px]">
            <thead className={cn("text-[9px] uppercase tracking-wider", isDark ? "bg-zinc-950 text-zinc-500" : "bg-neutral-50 text-neutral-500")}>
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
                  <tr key={slotId} className={cn("border-t", isDark ? "border-zinc-900" : "border-neutral-200")}>
                    <td className={cn("px-2 py-1.5 font-mono", isDark ? "text-zinc-200" : "text-neutral-900")}>{slotId}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={draftScores[slotId] ?? current ?? 5}
                        onChange={(e) => {
                          const score = Number(e.target.value);
                          setDraftScores((scores) => ({ ...scores, [slotId]: score }));
                        }}
                        onPointerUp={(e) => void setScore(slotId, Number(e.currentTarget.value))}
                        onKeyUp={(e) => {
                          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
                            void setScore(slotId, Number(e.currentTarget.value));
                          }
                        }}
                        onBlur={(e) => void setScore(slotId, Number(e.currentTarget.value))}
                        className="w-full"
                      />
                    </td>
                    <td className={cn("px-2 py-1.5 text-right font-mono", isDark ? "text-zinc-300" : "text-neutral-700")}>
                      {draftScores[slotId] ?? current ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {allSlotIds.length === 0 && (
                <tr>
                  <td colSpan={3} className={cn("px-2 py-3 text-center text-[11px]", isDark ? "text-zinc-600" : "text-neutral-400")}>
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

const inputCx = (isDark: boolean) =>
  cn(
    "w-full px-2.5 py-1.5 rounded-lg text-[12px] placeholder:text-[#9CA3AF] focus:outline-none transition-colors",
    isDark
      ? "bg-[#1C1C1E] border border-[#3A3A3C] text-[#F2F2F4] focus:border-[#B89708]/60"
      : "bg-white border border-[#E5E5E7] text-[#1C1C1E] focus:border-[#B89708]/60"
  );

const miniInputCx = (isDark: boolean) =>
  cn(
    "w-full px-2 py-1 rounded text-[11px] focus:outline-none transition-colors",
    isDark
      ? "bg-[#0F0E10] border border-[#3A3A3C] text-[#F2F2F4] focus:border-[#B89708]/50"
      : "bg-[#FAFAF8] border border-[#E5E5E7] text-[#1C1C1E] focus:border-[#B89708]/50"
  );

const miniSelectCx = (isDark: boolean) =>
  cn(
    "px-2 py-1 rounded text-[11px] focus:outline-none transition-colors",
    isDark
      ? "bg-[#0F0E10] border border-[#3A3A3C] text-[#F2F2F4] focus:border-[#B89708]/50"
      : "bg-[#FAFAF8] border border-[#E5E5E7] text-[#1C1C1E] focus:border-[#B89708]/50"
  );

function Field({ label, children, isDark = false }: { label: string; children: React.ReactNode; isDark?: boolean }) {
  return (
    <label className="block">
      <span className={cn("text-[10px] uppercase tracking-wider font-mono", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

"use client";

/**
 * DefaultsTab — configure per-slot default **break groups**, then push them to
 * the current night or the entire GRAVE week (Fri–Thu).
 *
 * Sections: Zones | Restrooms | AUX | AM Overlaps | PM Overlaps.
 * Each row: accent strip, icon + label, BreakBadge (click to cycle + auto-save).
 *
 * Standing task pools for OL live in Projects → Defaults (AM/PM Overlap Pool)
 * and are applied via Apply Overlap Tasks — not from this tab.
 *
 * Push buttons live in a sticky action bar at the top.
 */

import React, { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import BreakBadge from "../components/BreakBadge";
import { BuilderBusyLabel } from "../components/builderPrimitives";
import { SudoTabLoading } from "./SudoGlass";
import { useConfirm } from "../components/ConfirmDialog";
// Break-default helpers are dynamically imported inside the handlers that use them.
// This prevents the heavy data.ts module from being part of the top-level static import graph of Sudo tabs (Turbopack HMR fix).
// NOTE: task-chip defaults were retired by the cutover — they now live in Projects → Defaults.
import type { SlotDefault } from "@/lib/shiftbuilder/data";
import {
  ZONE_DEFS,
  RR_DEFS,
  AUX_ROLE_PRESETS,
  ZONE_ICONS,
  RR_ICONS,
  getZoneColor,
  getRRAccent,
  getAuxIconForRole,
  getAuxAccentForRole,
  getOverlapAccent,
  overlapSlotLabel,
} from "@/lib/shiftbuilder/constants";
import { nextBreakGroup, type BreakGroup } from "@/lib/shiftbuilder/constants";
import {
  graveBreakGroupForCompositeKey,
  graveBreakGroupSlotDefaults,
} from "@/lib/shiftbuilder/graveBreakGroupDefaults";
import { sudoIosClasses, sudoPushButtonClasses } from "./sudoIosTheme";

// ─────────────────────────────────────────────────────────────────────────────
// Slot descriptor — flattened list of all manageable slots
// ─────────────────────────────────────────────────────────────────────────────

interface SlotDef {
  compositeKey: string;   // "dbKey|rrSide" — the map key used everywhere
  dbKey: string;          // e.g. "zone_1", "rr_1_2", "admin", "overlap_am_0"
  dbType: "zone" | "rr" | "aux" | "overlap";
  rrSide: string;         // '' for zone/aux/overlap (NOT NULL in DB); 'mens'/'womens' for RR
  label: string;          // display label
  sublabel: string;       // location hint
  icon: string;
  accent: string;
  section: "zone" | "rr" | "aux" | "am-overlap" | "pm-overlap";
}

/** Build the ordered list of all slot descriptors once. */
function buildSlotDefs(): SlotDef[] {
  const out: SlotDef[] = [];

  // Zones
  for (const z of ZONE_DEFS) {
    const num = z.key.replace("Z", "");
    out.push({
      compositeKey: `zone_${num}|`,
      dbKey: `zone_${num}`,
      dbType: "zone",
      rrSide: "",
      label: z.label,
      sublabel: "",
      icon: ZONE_ICONS[z.key] ?? "●",
      accent: getZoneColor(z.key),
      section: "zone",
    });
  }

  // Restrooms — men's first, then women's for each RR num
  for (const rr of RR_DEFS) {
    const dbKey = rr.num === 1 ? "rr_1_2" : `rr_${rr.num}`;
    out.push({
      compositeKey: `${dbKey}|mens`,
      dbKey,
      dbType: "rr",
      rrSide: "mens",
      label: `${rr.label} (M)`,
      sublabel: "",
      icon: RR_ICONS[rr.num] ?? "●",
      accent: getRRAccent(rr.num),
      section: "rr",
    });
    out.push({
      compositeKey: `${dbKey}|womens`,
      dbKey,
      dbType: "rr",
      rrSide: "womens",
      label: `${rr.label} (W)`,
      sublabel: "",
      icon: RR_ICONS[rr.num] ?? "●",
      accent: getRRAccent(rr.num),
      section: "rr",
    });
  }

  // AUX
  const ROLE_DB_KEYS: Record<string, string> = {
    z9sr: "z9_sr",
    admin: "admin",
    trash: "trash_1",
    support: "support_1",
    oasis: "oasis_1",
    job_coach: "job_coach",
    step_up: "step_up",
  };
  for (const [role, preset] of Object.entries(AUX_ROLE_PRESETS)) {
    const dbKey = ROLE_DB_KEYS[role] ?? role;
    out.push({
      compositeKey: `${dbKey}|`,
      dbKey,
      dbType: "aux",
      rrSide: "",
      label: preset.label ?? preset.labelBase ?? role,
      sublabel: preset.locations[0] ?? "",
      icon: getAuxIconForRole(role as import("@/lib/shiftbuilder/placement").AuxRole),
      accent: getAuxAccentForRole(role as import("@/lib/shiftbuilder/placement").AuxRole),
      section: "aux",
    });
  }

  // AM Overlaps — single break-default row (stored under overlap_am_0).
  // Standing task chips for the band pool are configured in Projects → Defaults.
  out.push({
    compositeKey: `overlap_am_0|`,
    dbKey: `overlap_am_0`,
    dbType: "overlap",
    rrSide: "",
    label: "AM Overlaps",
    sublabel: "Break default · tasks in Projects → Defaults",
    icon: "◆",
    accent: "#059669",
    section: "am-overlap",
  });

  // PM Overlaps — per-card break defaults (seats still need break groups).
  // Task standing pool is Projects → Defaults → PM Overlap Pool (overlap_pm_0).
  for (let i = 0; i < 6; i++) {
    const uiKey = `OL-PM-${i}`;
    const dbKey = `overlap_pm_${i}`;
    out.push({
      compositeKey: `${dbKey}|`,
      dbKey,
      dbType: "overlap",
      rrSide: "",
      label: overlapSlotLabel(uiKey),
      sublabel: "Break default",
      icon: "◆",
      accent: getOverlapAccent(uiKey),
      section: "pm-overlap",
    });
  }

  return out;
}

const ALL_SLOT_DEFS = buildSlotDefs();

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface DefaultsTabProps {
  onDataChanged?: () => void;
  currentNightId?: string | null;
  /** The Friday that starts the current GRAVE week (Fri–Thu). */
  weekStart?: Date | null;
  isDark?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ToastKind = "error" | "success" | "info";
interface LocalToast { id: number; message: string; kind: ToastKind; }

let _toastId = 0;

const PUSH_CONFIRM_MESSAGES: Record<"breaks-today" | "breaks-week", string> = {
  "breaks-today":
    "Push card-default break groups to tonight? This overwrites any per-shift break overrides on assigned slots.",
  "breaks-week":
    "Push card-default break groups to the entire GRAVE week (Fri–Thu)? This overwrites per-shift break overrides on all existing nights with assignments.",
};

const SAVE_GRAVE_BREAK_MAP_CONFIRM =
  "Save the canonical GRAVE break map to Card Defaults? This overwrites every stored break default with the built-in rotation map.";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DefaultsTab({ onDataChanged, currentNightId, weekStart, isDark = false }: DefaultsTabProps) {
  const ios = sudoIosClasses(isDark);
  const confirmDialog = useConfirm();
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<LocalToast[]>([]);

  // Default break groups: compositeKey → 0|1|2|3
  const [breakGroups, setBreakGroups] = useState<Record<string, BreakGroup>>({});

  // Push operation loading states
  const [pushing, setPushing] = useState<"breaks-today" | "breaks-week" | null>(null);
  const [seedingGrave, setSeedingGrave] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { getSlotDefaults } = await import("@/lib/shiftbuilder/data");
      const defaults = await getSlotDefaults();

      const bg: Record<string, BreakGroup> = {};
      for (const d of defaults) {
        const ck = `${d.slotKey}|${d.rrSide ?? ''}`;
        bg[ck] = d.defaultBreakGroup;
      }
      for (const row of graveBreakGroupSlotDefaults()) {
        const ck = `${row.slotKey}|${row.rrSide}`;
        if (!(ck in bg)) {
          bg[ck] = row.defaultBreakGroup as BreakGroup;
        }
      }
      setBreakGroups(bg);
    } catch (e: any) {
      showToast("Failed to load defaults: " + (e?.message ?? "unknown"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  const showToast = (message: string, kind: ToastKind = "info") => {
    const id = ++_toastId;
    setToasts((p) => [...p, { id, message, kind }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  // ── Break group cycling ───────────────────────────────────────────────────
  const handleSaveGraveBreakMap = useCallback(async () => {
    if (seedingGrave) return;
    if (!(await confirmDialog(SAVE_GRAVE_BREAK_MAP_CONFIRM, { confirmLabel: "Save" }))) return;
    setSeedingGrave(true);
    try {
      const { seedGraveBreakGroupDefaults } = await import("@/lib/shiftbuilder/data");
      const { count } = await seedGraveBreakGroupDefaults();
      await load();
      showToast(`GRAVE break map saved (${count} slots)`, "success");
    } catch (e: any) {
      showToast("Failed to save GRAVE break map: " + (e?.message ?? "unknown"), "error");
    } finally {
      setSeedingGrave(false);
    }
  }, [seedingGrave, load, confirmDialog]);

  const handleCycleBreak = useCallback(
    async (def: SlotDef) => {
      const cur = (breakGroups[def.compositeKey]
        ?? graveBreakGroupForCompositeKey(def.compositeKey)
        ?? 0) as BreakGroup;
      const next = nextBreakGroup(cur);

      // Optimistic update
      setBreakGroups((p) => ({ ...p, [def.compositeKey]: next }));

      try {
        const { upsertSlotDefault } = await import("@/lib/shiftbuilder/data");
        await upsertSlotDefault({
          slotKey: def.dbKey,
          slotType: def.dbType,
          rrSide: def.rrSide,
          defaultBreakGroup: next,
        });
      } catch (e: any) {
        // Revert on failure
        setBreakGroups((p) => ({ ...p, [def.compositeKey]: cur }));
        showToast("Failed to save break default: " + (e?.message ?? "unknown"), "error");
      }
    },
    [breakGroups]
  );

  // ── Push operations (break-group defaults only) ─────────────────────────────
  const handlePush = useCallback(
    async (op: "breaks-today" | "breaks-week") => {
      if (pushing) return;
      if (!(await confirmDialog(PUSH_CONFIRM_MESSAGES[op], { confirmLabel: "Push" }))) return;
      setPushing(op);

      try {
        const { pushBreakDefaultsToNight, pushBreakDefaultsToWeek } = await import("@/lib/shiftbuilder/data");

        if (op === "breaks-today") {
          if (!currentNightId) { showToast("No current night loaded", "error"); return; }
          const { applied } = await pushBreakDefaultsToNight(currentNightId);
          showToast(`Break defaults pushed — ${applied} slot${applied !== 1 ? "s" : ""} updated`, "success");
          onDataChanged?.();
        } else if (op === "breaks-week") {
          if (!weekStart) { showToast("Week start date not available", "error"); return; }
          const { nights, applied } = await pushBreakDefaultsToWeek(weekStart);
          showToast(`Break defaults pushed — ${applied} slot${applied !== 1 ? "s" : ""} across ${nights} nights`, "success");
          onDataChanged?.();
        }
      } catch (e: any) {
        showToast("Push failed: " + (e?.message ?? "unknown"), "error");
      } finally {
        setPushing(null);
      }
    },
    [pushing, currentNightId, weekStart, onDataChanged, confirmDialog]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const sections: Array<{ id: "zone" | "rr" | "aux" | "am-overlap" | "pm-overlap"; label: string }> = [
    { id: "zone", label: "Zones" },
    { id: "rr",   label: "Restrooms" },
    { id: "aux",  label: "AUX / Support" },
    { id: "am-overlap", label: "AM Overlaps" },
    { id: "pm-overlap", label: "PM Overlaps" },
  ];

  const atkinsonStyle = { fontFamily: "var(--font-atkinson), var(--font-geist-sans)" };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={atkinsonStyle}
    >
      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className={ios.actionBar}>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 mr-2">
            <span className="ms" style={{ fontSize: 16, color: isDark ? "#f87171" : "var(--ios-red)" }}>layers</span>
            <span className={cn("text-[13px] font-semibold tracking-wide", ios.actionTitle)}>
              Card Defaults
            </span>
          </div>

          {/* Push buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <PushButton
              label="Breaks → Today"
              icon={<span className="ms" style={{ fontSize: 14 }}>calendar_month</span>}
              loading={pushing === "breaks-today"}
              disabled={!currentNightId || pushing !== null}
              onClick={() => handlePush("breaks-today")}
              isDark={isDark}
            />
            <PushButton
              label="Breaks → Week"
              icon={<span className="ms" style={{ fontSize: 14 }}>upload</span>}
              loading={pushing === "breaks-week"}
              disabled={!weekStart || pushing !== null}
              onClick={() => handlePush("breaks-week")}
              isDark={isDark}
            />
            <PushButton
              label="Save GRAVE break map"
              icon={<span className="ms" style={{ fontSize: 14 }}>save</span>}
              loading={seedingGrave}
              disabled={seedingGrave || pushing !== null}
              onClick={handleSaveGraveBreakMap}
              isDark={isDark}
            />
          </div>

          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className={cn("ml-auto", ios.ghostBtn)}
          >
            {loading ? (
              <BuilderBusyLabel className="text-[11px]">Reloading</BuilderBusyLabel>
            ) : (
              <>
                <span className="ms" style={{ fontSize: 14 }}>refresh</span>
                Reload
              </>
            )}
          </button>
        </div>

        {/* Legend */}
        <div className={cn("mt-2 flex items-center gap-4 flex-wrap", ios.legend)}>
          <span className="flex items-center gap-1">
            <span className="w-[18px] h-[12px] bg-[#1C1C1E] text-white text-[8px] font-bold rounded-[2px] flex items-center justify-center">1</span>
            Break group default (click to cycle: 1 → 2 → 3 → OL → –)
          </span>
          <span>· Standing OL tasks: Projects → Defaults (Apply Overlap for staffed seats)</span>
        </div>
      </div>

      {/* ── Slot list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <SudoTabLoading>Loading defaults</SudoTabLoading>
          </div>
        ) : (
          sections.map((sec) => {
            const defs = ALL_SLOT_DEFS.filter((d) => d.section === sec.id);
            return (
              <section key={sec.id}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={ios.sectionLabel}>
                    {sec.label}
                  </span>
                  <div className={cn("flex-1 h-px", ios.divider)} />
                </div>

                {/* Slot rows */}
                <div className="space-y-1">
                  {defs.map((def) => (
                    <SlotRow
                      key={def.compositeKey}
                      def={def}
                      breakGroup={(breakGroups[def.compositeKey]
                        ?? graveBreakGroupForCompositeKey(def.compositeKey)
                        ?? 0) as BreakGroup}
                      onCycleBreak={() => handleCycleBreak(def)}
                      isDark={isDark}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* ── Toasts ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-[11000] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-2 px-4 py-3 rounded-lg shadow-xl text-[12px] font-medium max-w-xs pointer-events-auto",
              t.kind === "error"   ? "bg-red-900/90 border border-red-700 text-red-100" :
              t.kind === "success" ? "bg-green-900/90 border border-green-700 text-green-100" :
                                    "bg-zinc-800 border border-zinc-700 text-zinc-200"
            )}
            style={atkinsonStyle}
          >
            {t.kind === "error"   && <span className="ms mt-0.5 shrink-0 text-red-400" style={{ fontSize: 14 }}>warning</span>}
            {t.kind === "success" && <span className="ms mt-0.5 shrink-0 text-green-400" style={{ fontSize: 14 }}>check_circle</span>}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SlotRow
// ─────────────────────────────────────────────────────────────────────────────

interface SlotRowProps {
  def: SlotDef;
  breakGroup: BreakGroup;
  onCycleBreak: () => void;
  isDark?: boolean;
}

function SlotRow({
  def,
  breakGroup,
  onCycleBreak,
  isDark = false,
}: SlotRowProps) {
  const ios = sudoIosClasses(isDark);

  return (
    <div className={ios.row}>
      {/* Accent strip */}
      <div
        className="mt-0.5 w-[3px] rounded-full shrink-0 self-stretch min-h-[20px]"
        style={{ backgroundColor: def.accent }}
      />

      {/* Icon + label */}
      <div className="w-[120px] shrink-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[12px] leading-none"
            style={{ color: def.accent }}
          >
            {def.icon}
          </span>
          <span className={ios.rowLabel}>
            {def.label}
          </span>
        </div>
        {def.sublabel && (
          <div className={cn("mt-0.5 truncate pl-[18px] text-[9px]", ios.legend)}>
            {def.sublabel}
          </div>
        )}
      </div>

      {/* Break badge */}
      <div className="shrink-0 mt-0.5 flex flex-col items-center gap-0.5">
        <BreakBadge value={breakGroup} onCycle={onCycleBreak} size="sm" />
        <span className={cn("text-[8px]", ios.legend)}>break</span>
      </div>

      {/* Task chips retired — default tasks now live in Projects → Defaults. */}
      <div className="flex-1 min-w-0 mt-0.5" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PushButton
// ─────────────────────────────────────────────────────────────────────────────

function PushButton({
  label, icon, loading, disabled, onClick, variant = "breaks", isDark = false,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: "breaks" | "tasks";
  isDark?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={sudoPushButtonClasses(variant, isDark)}
    >
      {loading ? <BuilderBusyLabel className="text-[11px]">{label}</BuilderBusyLabel> : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}

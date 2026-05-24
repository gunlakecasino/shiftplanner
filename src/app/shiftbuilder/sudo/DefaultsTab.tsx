"use client";

/**
 * DefaultsTab — configure per-slot default break groups and task chips,
 * then push them to the current night or the entire GRAVE week (Fri–Thu).
 *
 * Three sections: Zones (Z1–Z10) | Restrooms (RR pairs) | AUX slots.
 * Each row: accent strip, icon + label, BreakBadge (click to cycle + auto-save),
 *           task chips with × removal, inline "add task" input.
 *
 * Push buttons live in a sticky action bar at the top.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Layers,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Plus,
  X,
  Upload,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import BreakBadge from "../components/BreakBadge";
import {
  getSlotDefaults,
  getSlotDefaultTasks,
  upsertSlotDefault,
  addSlotDefaultTask,
  removeSlotDefaultTask,
  pushBreakDefaultsToNight,
  pushBreakDefaultsToWeek,
  pushTaskDefaultsToNight,
  pushTaskDefaultsToWeek,
  type SlotDefault,
  type SlotDefaultTask,
} from "@/lib/shiftbuilder/data";
import {
  ZONE_DEFS,
  RR_DEFS,
  DEFAULT_AUX_DEFS,
  ZONE_ICONS,
  RR_ICONS,
  AUX_ICONS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
} from "@/lib/shiftbuilder/constants";
import { nextBreakGroup, type BreakGroup } from "@/lib/shiftbuilder/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Slot descriptor — flattened list of all manageable slots
// ─────────────────────────────────────────────────────────────────────────────

interface SlotDef {
  compositeKey: string;   // "dbKey|rrSide" — the map key used everywhere
  dbKey: string;          // e.g. "zone_1", "rr_1_2", "admin"
  dbType: "zone" | "rr" | "aux";
  rrSide: string;         // '' for zone/aux; 'mens'|'womens' for RR
  label: string;          // display label
  sublabel: string;       // location hint
  icon: string;
  accent: string;
  section: "zone" | "rr" | "aux";
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
      sublabel: z.locations[0] ?? "",
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
      sublabel: rr.mensLoc,
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
      sublabel: rr.womensLoc,
      icon: RR_ICONS[rr.num] ?? "●",
      accent: getRRAccent(rr.num),
      section: "rr",
    });
  }

  // AUX
  const AUX_DB_KEYS: Record<string, string> = {
    Z9SR: "z9_sr",
    ADM: "admin",
    TR1: "trash_1",
    TR2: "trash_2",
    SP1: "support_1",
    SP2: "support_2",
  };
  for (const a of DEFAULT_AUX_DEFS) {
    const dbKey = AUX_DB_KEYS[a.key] ?? a.key.toLowerCase();
    out.push({
      compositeKey: `${dbKey}|`,
      dbKey,
      dbType: "aux",
      rrSide: "",
      label: a.label,
      sublabel: a.locations[0] ?? "",
      icon: AUX_ICONS[a.key] ?? "✦",
      accent: getAuxAccent(a.key),
      section: "aux",
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type ToastKind = "error" | "success" | "info";
interface LocalToast { id: number; message: string; kind: ToastKind; }

let _toastId = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DefaultsTab({ onDataChanged, currentNightId, weekStart }: DefaultsTabProps) {
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<LocalToast[]>([]);

  // Default break groups: compositeKey → 0|1|2|3
  const [breakGroups, setBreakGroups] = useState<Record<string, BreakGroup>>({});
  // Default tasks: compositeKey → SlotDefaultTask[]
  const [tasksBySlot, setTasksBySlot] = useState<Record<string, SlotDefaultTask[]>>({});

  // Per-slot "add task" input value
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addInput, setAddInput] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);

  // Push operation loading states
  const [pushing, setPushing] = useState<"breaks-today" | "breaks-week" | "tasks-today" | "tasks-week" | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [defaults, tasks] = await Promise.all([
        getSlotDefaults(),
        getSlotDefaultTasks(),
      ]);

      const bg: Record<string, BreakGroup> = {};
      for (const d of defaults) {
        const ck = `${d.slotKey}|${d.rrSide}`;
        bg[ck] = d.defaultBreakGroup;
      }
      setBreakGroups(bg);

      const ts: Record<string, SlotDefaultTask[]> = {};
      for (const t of tasks) {
        const ck = `${t.slotKey}|${t.rrSide}`;
        if (!ts[ck]) ts[ck] = [];
        ts[ck].push(t);
      }
      setTasksBySlot(ts);
    } catch (e: any) {
      showToast("Failed to load defaults: " + (e?.message ?? "unknown"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Focus the add-task input whenever it becomes visible
  useEffect(() => {
    if (addingFor) {
      setTimeout(() => addInputRef.current?.focus(), 50);
    }
  }, [addingFor]);

  // ── Toasts ────────────────────────────────────────────────────────────────
  const showToast = (message: string, kind: ToastKind = "info") => {
    const id = ++_toastId;
    setToasts((p) => [...p, { id, message, kind }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  };

  // ── Break group cycling ───────────────────────────────────────────────────
  const handleCycleBreak = useCallback(
    async (def: SlotDef) => {
      const cur = (breakGroups[def.compositeKey] ?? 0) as BreakGroup;
      const next = nextBreakGroup(cur);

      // Optimistic update
      setBreakGroups((p) => ({ ...p, [def.compositeKey]: next }));

      try {
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

  // ── Add task ──────────────────────────────────────────────────────────────
  const handleAddTask = useCallback(
    async (def: SlotDef) => {
      const label = addInput.trim();
      if (!label) return;

      const existing = tasksBySlot[def.compositeKey] ?? [];
      const sortOrder = existing.length;

      const optimisticTask: SlotDefaultTask = {
        id: `_optimistic_${Date.now()}`,
        slotKey: def.dbKey,
        slotType: def.dbType,
        rrSide: def.rrSide,
        taskLabel: label,
        taskColor: null,
        isCoverage: false,
        sortOrder,
      };

      setTasksBySlot((p) => ({
        ...p,
        [def.compositeKey]: [...existing, optimisticTask],
      }));
      setAddInput("");
      setAddingFor(null);

      try {
        await addSlotDefaultTask({
          slotKey: def.dbKey,
          slotType: def.dbType,
          rrSide: def.rrSide,
          taskLabel: label,
          sortOrder,
        });
        // Re-fetch to get real id
        const fresh = await getSlotDefaultTasks();
        const ts: Record<string, SlotDefaultTask[]> = {};
        for (const t of fresh) {
          const ck = `${t.slotKey}|${t.rrSide}`;
          if (!ts[ck]) ts[ck] = [];
          ts[ck].push(t);
        }
        setTasksBySlot(ts);
      } catch (e: any) {
        // Revert optimistic
        setTasksBySlot((p) => ({
          ...p,
          [def.compositeKey]: (p[def.compositeKey] ?? []).filter(
            (t) => t.id !== optimisticTask.id
          ),
        }));
        showToast("Failed to add task: " + (e?.message ?? "unknown"), "error");
      }
    },
    [addInput, tasksBySlot]
  );

  // ── Remove task ───────────────────────────────────────────────────────────
  const handleRemoveTask = useCallback(
    async (def: SlotDef, task: SlotDefaultTask) => {
      // Optimistic remove
      setTasksBySlot((p) => ({
        ...p,
        [def.compositeKey]: (p[def.compositeKey] ?? []).filter((t) => t.id !== task.id),
      }));

      try {
        await removeSlotDefaultTask(task.id);
      } catch (e: any) {
        // Revert
        setTasksBySlot((p) => ({
          ...p,
          [def.compositeKey]: [...(p[def.compositeKey] ?? []), task],
        }));
        showToast("Failed to remove task: " + (e?.message ?? "unknown"), "error");
      }
    },
    []
  );

  // ── Push operations ───────────────────────────────────────────────────────
  const handlePush = useCallback(
    async (op: "breaks-today" | "breaks-week" | "tasks-today" | "tasks-week") => {
      if (pushing) return;
      setPushing(op);

      try {
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
        } else if (op === "tasks-today") {
          if (!currentNightId) { showToast("No current night loaded", "error"); return; }
          const { applied } = await pushTaskDefaultsToNight(currentNightId);
          showToast(`Task defaults pushed — ${applied} task chip${applied !== 1 ? "s" : ""} installed`, "success");
          onDataChanged?.();
        } else if (op === "tasks-week") {
          if (!weekStart) { showToast("Week start date not available", "error"); return; }
          const { nights, applied } = await pushTaskDefaultsToWeek(weekStart);
          showToast(`Task defaults pushed — ${applied} chips across ${nights} nights`, "success");
          onDataChanged?.();
        }
      } catch (e: any) {
        showToast("Push failed: " + (e?.message ?? "unknown"), "error");
      } finally {
        setPushing(null);
      }
    },
    [pushing, currentNightId, weekStart, onDataChanged]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const sections: Array<{ id: "zone" | "rr" | "aux"; label: string }> = [
    { id: "zone", label: "Zones" },
    { id: "rr",   label: "Restrooms" },
    { id: "aux",  label: "AUX / Support" },
  ];

  const atkinsonStyle = { fontFamily: "var(--font-atkinson), var(--font-geist-sans)" };

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={atkinsonStyle}
    >
      {/* ── Action bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Title */}
          <div className="flex items-center gap-2 mr-2">
            <Layers className="h-4 w-4 text-red-400" />
            <span className="text-[13px] font-semibold text-zinc-200 tracking-wide">
              Card Defaults
            </span>
          </div>

          {/* Push buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <PushButton
              label="Breaks → Today"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              loading={pushing === "breaks-today"}
              disabled={!currentNightId || pushing !== null}
              onClick={() => handlePush("breaks-today")}
            />
            <PushButton
              label="Breaks → Week"
              icon={<Upload className="h-3.5 w-3.5" />}
              loading={pushing === "breaks-week"}
              disabled={!weekStart || pushing !== null}
              onClick={() => handlePush("breaks-week")}
            />
            <PushButton
              label="Tasks → Today"
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              loading={pushing === "tasks-today"}
              disabled={!currentNightId || pushing !== null}
              variant="tasks"
              onClick={() => handlePush("tasks-today")}
            />
            <PushButton
              label="Tasks → Week"
              icon={<Upload className="h-3.5 w-3.5" />}
              loading={pushing === "tasks-week"}
              disabled={!weekStart || pushing !== null}
              variant="tasks"
              onClick={() => handlePush("tasks-week")}
            />
          </div>

          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Legend */}
        <div className="mt-2 flex items-center gap-4 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <span className="w-[18px] h-[12px] bg-[#1C1C1E] text-white text-[8px] font-bold rounded-[2px] flex items-center justify-center">1</span>
            Break group default (click to cycle: 1 → 2 → 3 → –)
          </span>
          <span>· Task chips are pushed as <em>replace</em> (existing chips are wiped)</span>
        </div>
      </div>

      {/* ── Slot list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading defaults…
          </div>
        ) : (
          sections.map((sec) => {
            const defs = ALL_SLOT_DEFS.filter((d) => d.section === sec.id);
            return (
              <section key={sec.id}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                    {sec.label}
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>

                {/* Slot rows */}
                <div className="space-y-1">
                  {defs.map((def) => (
                    <SlotRow
                      key={def.compositeKey}
                      def={def}
                      breakGroup={(breakGroups[def.compositeKey] ?? 0) as BreakGroup}
                      tasks={tasksBySlot[def.compositeKey] ?? []}
                      isAdding={addingFor === def.compositeKey}
                      addInput={addInput}
                      addInputRef={addingFor === def.compositeKey ? addInputRef : undefined}
                      onCycleBreak={() => handleCycleBreak(def)}
                      onStartAdd={() => {
                        setAddingFor(def.compositeKey);
                        setAddInput("");
                      }}
                      onCancelAdd={() => {
                        setAddingFor(null);
                        setAddInput("");
                      }}
                      onAddInputChange={setAddInput}
                      onAddSubmit={() => handleAddTask(def)}
                      onRemoveTask={(t) => handleRemoveTask(def, t)}
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
            {t.kind === "error"   && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" />}
            {t.kind === "success" && <CheckCircle2  className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-400" />}
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
  tasks: SlotDefaultTask[];
  isAdding: boolean;
  addInput: string;
  addInputRef?: React.RefObject<HTMLInputElement | null>;
  onCycleBreak: () => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onAddInputChange: (v: string) => void;
  onAddSubmit: () => void;
  onRemoveTask: (t: SlotDefaultTask) => void;
}

function SlotRow({
  def, breakGroup, tasks, isAdding, addInput, addInputRef,
  onCycleBreak, onStartAdd, onCancelAdd, onAddInputChange, onAddSubmit, onRemoveTask,
}: SlotRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-zinc-900/50 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors px-3 py-2">
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
          <span className="text-[12px] font-semibold text-zinc-200 tracking-wide">
            {def.label}
          </span>
        </div>
        {def.sublabel && (
          <div className="mt-0.5 text-[9px] text-zinc-600 truncate pl-[18px]">
            {def.sublabel}
          </div>
        )}
      </div>

      {/* Break badge */}
      <div className="shrink-0 mt-0.5 flex flex-col items-center gap-0.5">
        <BreakBadge value={breakGroup} onCycle={onCycleBreak} size="sm" />
        <span className="text-[8px] text-zinc-600">break</span>
      </div>

      {/* Task chips + add input */}
      <div className="flex-1 flex flex-wrap items-center gap-1.5 min-w-0 mt-0.5">
        {tasks.map((t) => (
          <span
            key={t.id}
            className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300"
          >
            {t.taskLabel}
            <button
              onClick={() => onRemoveTask(t)}
              className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
              title="Remove default task"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}

        {isAdding ? (
          <div className="flex items-center gap-1">
            <input
              ref={addInputRef}
              value={addInput}
              onChange={(e) => onAddInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onAddSubmit(); }
                if (e.key === "Escape") onCancelAdd();
              }}
              placeholder="Task label…"
              className="h-[22px] px-2 rounded text-[10px] bg-zinc-800 border border-zinc-600 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-red-500/60 w-[120px]"
            />
            <button
              onClick={onAddSubmit}
              disabled={!addInput.trim()}
              className="h-[22px] px-2 rounded bg-red-500/20 text-red-300 text-[10px] border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={onCancelAdd}
              className="h-[22px] px-1.5 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={onStartAdd}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-dashed border-zinc-700 text-[10px] text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <Plus className="h-2.5 w-2.5" /> task
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PushButton
// ─────────────────────────────────────────────────────────────────────────────

function PushButton({
  label, icon, loading, disabled, onClick, variant = "breaks",
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: "breaks" | "tasks";
}) {
  const base =
    "flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-medium transition-colors border";
  const colors =
    variant === "tasks"
      ? "border-blue-500/30 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-40"
      : "border-red-500/30 text-red-300 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40";

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(base, colors)}
    >
      {loading ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}

"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { normalizeGender } from "@/lib/shiftbuilder/placement";
import {
  ZONE_DEFS,
  RR_DEFS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  type BreakGroup,
} from "@/lib/shiftbuilder/constants";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { getTmPlacementHistory } from "@/lib/shiftbuilder/data";
import { getSlotMeta, TmPicker, type TmEntry } from "./MarkerPad";
import {
  PLACEMENT_SPREAD_NIGHTS,
  getSpreadPlacementKeys,
  getLastPlacementSequence,
  getDaysSinceForKey,
  formatPlacementUiLabel,
  nightIsoFromDate,
} from "./placementPadHelpers";

const Z9_STAT_RED = "#E53935";
const LAST5_COUNT = 5;

export type PlacementPadAnchor = "left" | "right" | "bottom";

export interface PlacementPadProps {
  slotKey: string;
  anchor: PlacementPadAnchor;
  /** Host card wrapper — portaled pad positions from [data-placement-host] rect. */
  hostId?: string;
  onClose: () => void;
  assignments: Record<string, any>;
  selectedTasks: Record<string, NightSlotTask[]>;
  selectedDay: DayDef;
  members?: any[];
  auxDefs: AuxDef[];
  isDark: boolean;
  isCurrentNightLocked?: boolean;
  setBreakGroupForSlot?: (k: string, g: BreakGroup) => void;
  onAddCoverage?: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  onLiveUnassign?: (slotKey: string) => void;
  onToggleLock?: (slotKey: string) => void;
  onAssign?: (slotKey: string, tmId: string, tmName: string) => void;
  onAddTask?: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onRequestEngineInsight?: (slotKey: string, context?: string | Record<string, unknown>) => Promise<string>;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  onAddOnCall?: (tmId: string, tmName: string) => void | Promise<void>;
}

const PAD_W = 272;

function anchorClass(anchor: PlacementPadAnchor): string {
  if (anchor === "left") return "placement-pad absolute top-0 right-full mr-1.5";
  if (anchor === "bottom") return "placement-pad absolute bottom-0 left-full ml-1.5";
  return "placement-pad absolute top-0 left-full ml-1.5";
}

function computePortalStyle(
  hostId: string,
  anchor: PlacementPadAnchor,
): React.CSSProperties | null {
  const host = document.querySelector(
    `[data-placement-host="${hostId}"]`,
  ) as HTMLElement | null;
  if (!host) return null;

  const rect = host.getBoundingClientRect();
  const gap = 6;
  const padW = PAD_W;
  const maxH = Math.min(window.innerHeight - 16, 560);

  let left = rect.right + gap;
  let top = rect.top;

  if (anchor === "left") {
    left = rect.left - padW - gap;
    top = rect.top;
  } else if (anchor === "bottom") {
    left = rect.right + gap;
    top = rect.bottom;
  }

  if (left + padW > window.innerWidth - 8) {
    left = rect.left - padW - gap;
  }
  if (left < 8) left = 8;

  const base: React.CSSProperties = {
    position: "fixed",
    left,
    width: padW,
    zIndex: 200,
    maxHeight: maxH,
    overflowY: "auto",
  };

  if (anchor === "bottom") {
    const bottomAlignedTop = rect.bottom;
    const wouldOverflowTop = bottomAlignedTop - maxH < 8;
    if (wouldOverflowTop) {
      return { ...base, top: 8 };
    }
    return {
      ...base,
      top: bottomAlignedTop,
      transform: "translateY(-100%)",
    };
  }

  let clampedTop = top;
  if (clampedTop + maxH > window.innerHeight - 8) {
    clampedTop = Math.max(8, window.innerHeight - maxH - 8);
  }
  return { ...base, top: clampedTop };
}

function usePortalPlacementStyle(
  hostId: string | undefined,
  anchor: PlacementPadAnchor,
): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  const update = useCallback(() => {
    if (!hostId) {
      setStyle(null);
      return;
    }
    setStyle(computePortalStyle(hostId, anchor));
  }, [hostId, anchor]);

  useLayoutEffect(() => {
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [update]);

  return style;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
      {children}
    </span>
  );
}

function PlacementCell({
  label,
  placed,
  accent,
  title,
}: {
  label: string;
  placed: boolean;
  accent: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? label}
      className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-bold tabular-nums transition-colors"
      style={
        placed
          ? {
              background: `${accent}22`,
              border: `1px solid ${accent}55`,
              color: accent,
            }
          : {
              background: "rgba(0,0,0,0.02)",
              border: "1px solid rgba(0,0,0,0.06)",
              color: "rgba(0,0,0,0.28)",
            }
      }
    >
      {label}
    </span>
  );
}

function InlineCoverage({
  sourceKey,
  auxDefs,
  onPick,
  onCancel,
}: {
  sourceKey: string;
  auxDefs: AuxDef[];
  onPick: (target: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-black/[0.06] bg-neutral-50/80 px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-700">Add coverage</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="text-neutral-400 hover:text-neutral-600 text-xs px-1"
        >
          ✕
        </button>
      </div>
      {[
        { title: "Zones", items: ZONE_DEFS.map((z) => ({ key: z.key, label: z.key.replace("Z", ""), color: getZoneColor(z.key) })) },
        {
          title: "Restrooms",
          items: RR_DEFS.map((rr) => ({
            key: `MRR${rr.num}`,
            label: rr.label,
            color: getRRAccent(rr.num),
          })),
        },
        {
          title: "Aux",
          items: auxDefs
            .filter((d) => !d.key.startsWith("SP"))
            .map((aux) => ({
              key: aux.key,
              label: (aux.label || aux.key).replace(/ .*/, "").slice(0, 5),
              color: getAuxAccent(aux.key),
            })),
        },
      ].map((section) => (
        <div key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <div
            className="mt-1 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${section.title === "Aux" ? 4 : 5}, 1fr)` }}
          >
            {section.items.map((item) => {
              const isSelf =
                item.key === sourceKey ||
                (section.title === "Restrooms" &&
                  (sourceKey === item.key || sourceKey === item.key.replace("MRR", "WRR")));
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={isSelf}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelf) onPick(item.key);
                  }}
                  className="h-[22px] rounded-md text-[9px] font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid ${isSelf ? "rgba(0,0,0,0.06)" : `${item.color}66`}`,
                    background: isSelf ? "transparent" : `${item.color}14`,
                    color: isSelf ? "rgba(0,0,0,0.2)" : item.color,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const PlacementPad: React.FC<PlacementPadProps> = ({
  slotKey,
  anchor,
  hostId,
  onClose,
  assignments,
  selectedTasks,
  selectedDay,
  members = [],
  auxDefs,
  isCurrentNightLocked,
  onAddCoverage,
  onLiveUnassign,
  onToggleLock,
  onAssign,
  onAddTask,
  onRemoveTask,
  onAssignSweeper,
  onRequestEngineInsight,
  scheduledUnassigned = [],
  allEligibleTms,
  onAddOnCall,
}) => {
  const { label, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const prov = a.provenance || {};
  const hasProv = !!(prov.rationale || (prov.fairnessSignals && Object.keys(prov.fairnessSignals).length > 0));
  const tasks = (selectedTasks[slotKey] || []).filter((t) => !t.isCoverage);

  const [padHistory, setPadHistory] = useState<ZoneDetailEntry | null>(null);
  const [padHistoryLoading, setPadHistoryLoading] = useState(false);
  const [padInsight, setPadInsight] = useState<string | null>(null);
  const [padInsightLoading, setPadInsightLoading] = useState(false);
  const [padGoodExamples, setPadGoodExamples] = useState<
    Array<{ slotKey: string; insightText: string }>
  >([]);
  const [coverageMode, setCoverageMode] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [assignConfirmed, setAssignConfirmed] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [sweeperOpen, setSweeperOpen] = useState(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

  const closeSide = anchor === "left" ? "left" : "right";
  const railSide = anchor === "left" ? "right" : "left";
  const portalStyle = usePortalPlacementStyle(hostId, anchor);
  const usePortal = !!hostId && !!portalStyle;

  useEffect(() => {
    setCoverageMode(false);
    setAssignMode(false);
    setAssignConfirmed(false);
    setPadInsight(null);
    setPadInsightLoading(false);
    setPadGoodExamples([]);
    setTaskInput("");
    setSweeperOpen(false);
  }, [slotKey]);

  useEffect(() => {
    if (!a.tmId) {
      setPadHistory(null);
      setPadHistoryLoading(false);
      return;
    }
    setPadHistoryLoading(true);
    getTmPlacementHistory(a.tmId, 90)
      .then((h) => {
        setPadHistory(h);
        setPadHistoryLoading(false);
      })
      .catch(() => {
        setPadHistory(null);
        setPadHistoryLoading(false);
      });
  }, [slotKey, a.tmId]);

  const handlePickTm = useCallback(
    (tm: TmEntry) => {
      if (!onAssign) return;
      onAssign(slotKey, tm.tmId, tm.tmName);
      setAssignConfirmed(true);
      setTimeout(() => {
        setAssignMode(false);
        setAssignConfirmed(false);
      }, 700);
    },
    [slotKey, onAssign],
  );

  const handleAddTask = () => {
    const lbl = taskInput.trim();
    if (!lbl || !onAddTask) return;
    setTaskInput("");
    void onAddTask(slotKey, lbl);
    setTimeout(() => taskInputRef.current?.focus(), 0);
  };

  const showTmPicker = onAssign && (!a.tmId || assignMode);
  const currentIso = nightIsoFromDate(selectedDay.date);
  const spreadKeys = getSpreadPlacementKeys(padHistory, PLACEMENT_SPREAD_NIGHTS, currentIso);
  const placedSet = new Set(spreadKeys);

  const rrLocs = RR_DEFS.flatMap((d) => {
    const tmId = a?.tmId;
    const rawGender =
      members?.find((m: any) => m.id === tmId || m.tmId === tmId || m.tm_id === tmId)?.gender ?? null;
    const g = normalizeGender(rawGender);
    const sides: { ui: string; label: string }[] = [];
    if (!g || g === "M") sides.push({ ui: `MRR${d.num}`, label: `${d.num}M` });
    if (!g || g === "F") sides.push({ ui: `WRR${d.num}`, label: `${d.num}W` });
    return sides;
  });

  const auxLocs = auxDefs
    .filter((d) => !d.key.startsWith("SP"))
    .map((d) => ({
      ui: d.key,
      label: formatPlacementUiLabel(d.key, d.label || d.key),
    }));

  const getPillAccent = (ui: string): string => {
    if (/^Z\d+$/.test(ui)) return getZoneColor(ui);
    if (ui.startsWith("MRR") || ui.startsWith("WRR")) {
      return getRRAccent(parseInt(ui.replace(/\D/g, ""), 10) || 1);
    }
    return getAuxAccent(ui);
  };

  const rrCount = spreadKeys.filter((k) => k.startsWith("MRR") || k.startsWith("WRR")).length;
  const zoneCount = spreadKeys.filter((k) => /^Z\d+$/.test(k)).length;
  const z9Days = getDaysSinceForKey(padHistory, "Z9", currentIso);
  const z9srDays = getDaysSinceForKey(padHistory, "Z9SR", currentIso);

  const last5Sequence = getLastPlacementSequence(padHistory, LAST5_COUNT, currentIso);
  const last5Pills: Array<string | null> = [...last5Sequence];
  while (last5Pills.length < LAST5_COUNT) last5Pills.push(null);

  const tmMember = a.tmId
    ? members.find(
        (m: { id?: string; tmId?: string; tm_id?: string }) =>
          m.id === a.tmId || m.tmId === a.tmId || m.tm_id === a.tmId,
      )
    : undefined;

  const boardNeighborSummary = Object.entries(assignments)
    .filter(([k, v]) => k !== slotKey && v?.tmName)
    .slice(0, 16)
    .map(([k, v]) => `${k}:${v.tmName}`)
    .join(", ");

  const timesInSpread = spreadKeys.filter((k) => k === slotKey).length;
  const slotHistorySummary = a.tmId
    ? timesInSpread > 0
      ? `${timesInSpread}× in last ${PLACEMENT_SPREAD_NIGHTS} nights; in last-5 trail: ${last5Sequence.includes(slotKey) ? "yes" : "no"}`
      : `Not in last ${PLACEMENT_SPREAD_NIGHTS}-night spread`
    : undefined;

  const buildInsightContext = () => ({
    rationale: prov.rationale as string | undefined,
    fairnessSignals: prov.fairnessSignals as Record<string, number | string> | undefined,
    recentPlacements: last5Sequence.filter(Boolean).join(" → ") || undefined,
    slotSpecificHistory: slotHistorySummary,
    currentContext: boardNeighborSummary || undefined,
    tmAttributes: tmMember
      ? {
          gravePool: tmMember.gravePool ?? tmMember.grave_pool,
          isAMOverlap: !!(tmMember.isAMOverlap ?? tmMember.is_am_overlap),
          isPMOverlap: !!(tmMember.isPMOverlap ?? tmMember.is_pm_overlap),
        }
      : undefined,
    priorGoodExamples: padGoodExamples.slice(-3),
    suggestedCandidates: !a.tmName
      ? [...scheduledUnassigned, ...(allEligibleTms || [])]
          .slice(0, 8)
          .map((t) => t.tmName)
          .join(", ")
      : undefined,
    tmName: a.tmName,
  });

  const padEl = (
    <div
      className={`placement-pad ${usePortal ? "fixed" : anchorClass(anchor)} z-[60] flex h-auto max-h-none flex-col rounded-2xl border border-black/[0.07] bg-white/98 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28),0_0_0_1px_rgba(255,255,255,0.6)_inset] backdrop-blur-sm`}
      style={usePortal ? portalStyle! : { width: PAD_W }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Accent rail */}
      <div
        className="absolute top-3 h-10 w-[3px] rounded-full"
        style={{
          [railSide]: -1,
          background: accent,
          boxShadow: `0 0 10px ${accent}66`,
        }}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100/80 text-neutral-400 text-sm hover:bg-neutral-200/80 hover:text-neutral-600"
        style={{ [closeSide]: 8 }}
        aria-label="Close"
      >
        ×
      </button>

      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 pr-10">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: a.tmName ? accent : "rgba(0,0,0,0.08)", color: a.tmName ? "#fff" : "#999" }}
          >
            {a.tmName ? a.tmName[0].toUpperCase() : "–"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
              {label}
            </div>
            <div className="truncate text-[15px] font-bold tracking-tight text-neutral-900">
              {a.tmName || "Unassigned"}
            </div>
          </div>
          {a.breakGroup != null && a.breakGroup > 0 && (
            <div className="shrink-0 text-center">
              <div className="text-[7px] font-bold uppercase tracking-widest text-neutral-400">Brk</div>
              <div
                className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ background: accent, border: `1px solid ${accent}` }}
              >
                {a.breakGroup}
              </div>
            </div>
          )}
        </div>

        <div className="mx-3 border-t border-black/[0.06]" />

        {showTmPicker ? (
          <div className="px-2.5 py-2">
            <TmPicker
              tms={scheduledUnassigned}
              allTms={allEligibleTms}
              currentTmName={a.tmId ? a.tmName : undefined}
              onPick={handlePickTm}
              onAddOnCall={
                onAddOnCall
                  ? (tm) => { void onAddOnCall(tm.tmId, tm.tmName); }
                  : undefined
              }
              onCancel={a.tmId ? () => setAssignMode(false) : undefined}
              confirmed={assignConfirmed}
              accent={accent}
              isDark={false}
            />
          </div>
        ) : coverageMode ? (
          <InlineCoverage
            sourceKey={slotKey}
            auxDefs={auxDefs}
            onPick={async (tgt) => {
              if (onAddCoverage) await onAddCoverage(slotKey, tgt);
              setCoverageMode(false);
            }}
            onCancel={() => setCoverageMode(false)}
          />
        ) : (
          <div className="flex flex-col">
            {!a.tmName && (
              <div className="px-3 pt-2 pb-1 space-y-2">
                <button
                  type="button"
                  disabled={isCurrentNightLocked}
                  onClick={() => setAssignMode(true)}
                  className="w-full rounded-lg py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Assign team member
                </button>
                {onRequestEngineInsight && (
                  <div className="rounded-lg border border-black/[0.05] bg-neutral-50/80 px-2.5 py-2">
                    <SectionLabel>Who fits here</SectionLabel>
                    <p className="mt-1 text-[9px] leading-snug text-neutral-500">
                      Scheduled + eligible TMs only. Tap for xAI ranking.
                    </p>
                    <button
                      type="button"
                      disabled={padInsightLoading}
                      onClick={async (e) => {
                        e.stopPropagation();
                        setPadInsight(null);
                        setPadInsightLoading(true);
                        try {
                          const insight = await onRequestEngineInsight(
                            slotKey,
                            buildInsightContext(),
                          );
                          setPadInsight(insight || "No suggestions.");
                        } catch {
                          setPadInsight("Suggestions unavailable.");
                        } finally {
                          setPadInsightLoading(false);
                        }
                      }}
                      className="mt-1.5 rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 py-0.5 text-[9px] font-semibold text-blue-600 hover:bg-blue-100/80 disabled:opacity-60"
                    >
                      {padInsightLoading ? "Thinking…" : "xAI suggest assignee"}
                    </button>
                    {padInsight && (
                      <p className="mt-1.5 text-[9px] leading-snug text-neutral-600">{padInsight}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tasks */}
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-center justify-between mb-1.5">
                <SectionLabel>
                  Tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
                </SectionLabel>
                {onAssignSweeper && (
                  <button
                    type="button"
                    onClick={() => setSweeperOpen((v) => !v)}
                    className="rounded-md border border-black/[0.08] bg-neutral-50 px-2 py-0.5 text-[9px] font-semibold text-neutral-500 hover:bg-neutral-100"
                  >
                    Sweeper
                  </button>
                )}
              </div>

              {sweeperOpen && onAssignSweeper && (
                <div className="mb-1.5 flex flex-col gap-1">
                  {["Sweep 5/8/HL", "Sweep 9/10/SR"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        void onAssignSweeper(slotKey, opt);
                        setSweeperOpen(false);
                      }}
                      className="rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-left text-[10px] font-semibold text-amber-700 hover:bg-amber-100/80"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {tasks.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-neutral-50/90 px-2 py-1.5"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-sm"
                        style={{ background: t.color ?? accent }}
                      />
                      <span className="flex-1 truncate text-[11px] font-medium text-neutral-800">
                        {t.taskLabel}
                      </span>
                      {onRemoveTask && (
                        <button
                          type="button"
                          onClick={() => onRemoveTask(slotKey, t.taskLabel)}
                          className="text-neutral-400 hover:text-neutral-600 text-xs leading-none px-0.5"
                          aria-label={`Remove ${t.taskLabel}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {onAddTask && (
                <div className="flex gap-1.5">
                  <input
                    ref={taskInputRef}
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTask();
                      }
                    }}
                    placeholder="Add a task…"
                    disabled={isCurrentNightLocked}
                    className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/[0.06]"
                  />
                  {taskInput.trim() && (
                    <button
                      type="button"
                      onClick={handleAddTask}
                      className="shrink-0 rounded-lg px-2.5 text-[10px] font-bold text-white"
                      style={{ background: accent }}
                    >
                      Add
                    </button>
                  )}
                </div>
              )}
            </div>

            {a.tmName && (
              <div className="border-t border-black/[0.05] px-3 py-2.5">
                {padHistoryLoading ? (
                  <p className="text-[10px] text-neutral-400">Loading placement history…</p>
                ) : (
                  <>
                    <SectionLabel>Placement matrix</SectionLabel>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
                      <span>
                        <span className="font-semibold" style={{ color: accent }}>
                          RR
                        </span>{" "}
                        <span className="font-bold text-neutral-800">{rrCount}</span>
                      </span>
                      <span className="text-neutral-300">|</span>
                      <span>
                        <span className="font-semibold text-neutral-400">Zone</span>{" "}
                        <span className="font-bold text-neutral-800">{zoneCount}</span>
                      </span>
                      <span className="text-neutral-300">|</span>
                      <span>
                        <span className="font-semibold" style={{ color: Z9_STAT_RED }}>
                          Z9
                        </span>{" "}
                        <span className="font-bold text-neutral-800 tabular-nums">{z9Days}</span>
                      </span>
                      <span>
                        <span className="font-semibold" style={{ color: Z9_STAT_RED }}>
                          Z9SR
                        </span>{" "}
                        <span className="font-bold text-neutral-800 tabular-nums">{z9srDays}</span>
                      </span>
                    </div>

                    <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                      Last 30 Spread
                    </p>

                    <div className="grid grid-cols-5 gap-1">
                      {ZONE_DEFS.map((z) => (
                        <PlacementCell
                          key={z.key}
                          label={z.key}
                          placed={placedSet.has(z.key)}
                          accent={getZoneColor(z.key)}
                          title={z.key}
                        />
                      ))}
                    </div>

                    {rrLocs.length > 0 && (
                      <div
                        className="mt-1 grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${Math.min(rrLocs.length, 5)}, 1fr)` }}
                      >
                        {rrLocs.map((loc) => (
                          <PlacementCell
                            key={loc.ui}
                            label={loc.label}
                            placed={placedSet.has(loc.ui)}
                            accent={getPillAccent(loc.ui)}
                            title={loc.ui}
                          />
                        ))}
                      </div>
                    )}

                    {auxLocs.length > 0 && (
                      <div
                        className="mt-1 grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${Math.min(auxLocs.length, 5)}, 1fr)` }}
                      >
                        {auxLocs.map((loc) => (
                          <PlacementCell
                            key={loc.ui}
                            label={loc.label}
                            placed={placedSet.has(loc.ui)}
                            accent={getPillAccent(loc.ui)}
                            title={loc.ui}
                          />
                        ))}
                      </div>
                    )}

                    <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                      Last 5
                    </p>
                    <div className="grid grid-cols-5 gap-1">
                      {last5Pills.map((ui, i) => {
                        if (!ui) {
                          return (
                            <span
                              key={`empty-${i}`}
                              className="flex h-[22px] items-center justify-center rounded-md border border-dashed border-black/[0.08] bg-transparent text-[9px] text-neutral-300"
                            >
                              —
                            </span>
                          );
                        }
                        const pillAccent = getPillAccent(ui);
                        const pillLabel = formatPlacementUiLabel(ui);
                        return (
                          <span
                            key={`${ui}-${i}`}
                            title={ui}
                            className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-bold tabular-nums"
                            style={{
                              background: `${pillAccent}22`,
                              border: `1px solid ${pillAccent}55`,
                              color: pillAccent,
                            }}
                          >
                            {pillLabel}
                          </span>
                        );
                      })}
                    </div>

                    <div className="mt-3 pt-2 border-t border-black/[0.05]">
                      <SectionLabel>Insight</SectionLabel>
                      <p className="mt-1 text-[10px] leading-snug text-neutral-600">
                        {hasProv && prov.rationale
                          ? prov.rationale
                          : "Placed for rotation balance and coverage."}
                      </p>
                      {prov.fairnessSignals &&
                        typeof prov.fairnessSignals === "object" && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {Object.entries(prov.fairnessSignals)
                              .slice(0, 6)
                              .map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded-md border border-black/[0.06] bg-neutral-100/90 px-1.5 py-0.5 font-mono text-[8px] text-neutral-600"
                                >
                                  {k}: {String(v)}
                                </span>
                              ))}
                          </div>
                        )}
                      {onRequestEngineInsight && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              setPadInsight(null);
                              setPadInsightLoading(true);
                              try {
                                const insight = await onRequestEngineInsight(
                                  slotKey,
                                  buildInsightContext(),
                                );
                                setPadInsight(insight || "No additional insight.");
                              } catch {
                                setPadInsight("Insight unavailable.");
                              } finally {
                                setPadInsightLoading(false);
                              }
                            }}
                            className="rounded-full border border-blue-200/80 bg-blue-50/80 px-2.5 py-0.5 text-[9px] font-semibold text-blue-600 hover:bg-blue-100/80 disabled:opacity-60"
                            disabled={padInsightLoading}
                          >
                            {padInsightLoading ? "Thinking…" : "xAI deeper insight"}
                          </button>
                          {padInsight && (
                            <>
                              <p className="mt-1.5 rounded-lg border border-black/[0.06] bg-neutral-50/90 px-2 py-1.5 text-[9px] leading-snug text-neutral-600">
                                {padInsight}
                              </p>
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                                  Train
                                </span>
                                <button
                                  type="button"
                                  title="Good — use as example for next insights this session"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPadGoodExamples((prev) =>
                                      [...prev, { slotKey, insightText: padInsight }].slice(-3),
                                    );
                                  }}
                                  className="rounded-md border border-black/[0.06] bg-white px-1.5 py-0.5 text-[10px] hover:bg-neutral-50"
                                >
                                  👍
                                </button>
                                <button
                                  type="button"
                                  title="Discard this insight"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPadInsight(null);
                                  }}
                                  className="rounded-md border border-black/[0.06] bg-white px-1.5 py-0.5 text-[10px] hover:bg-neutral-50"
                                >
                                  👎
                                </button>
                                {padGoodExamples.length > 0 && (
                                  <span className="text-[8px] text-neutral-400">
                                    +{padGoodExamples.length} rated
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!showTmPicker && !coverageMode && (
        <div className="grid grid-cols-4 gap-1 border-t border-black/[0.06] bg-neutral-50/50 p-1.5 shrink-0">
          {(
            [
              { label: a.isLocked ? "Locked" : "Lock", onClick: () => onToggleLock?.(slotKey), variant: "default" as const },
              { label: "Clear", onClick: () => onLiveUnassign?.(slotKey), variant: "danger" as const },
              { label: "Coverage", onClick: () => setCoverageMode(true), variant: "default" as const },
              { label: "Swap", onClick: () => setAssignMode(true), variant: "default" as const },
            ] as const
          ).map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={isCurrentNightLocked}
              onClick={btn.onClick}
              className={`h-7 rounded-lg text-[9px] font-semibold tracking-tight disabled:opacity-40 ${
                btn.variant === "danger"
                  ? "border border-red-200/80 bg-red-50 text-red-600 hover:bg-red-100/80"
                  : "border border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(padEl, document.body);
  }
  return padEl;
};

export default PlacementPad;
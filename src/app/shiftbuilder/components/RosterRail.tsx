"use client";

import React from "react";
import VirtualRosterList from "./VirtualRosterList";
import { BuilderLoadingLine } from "./builderPrimitives";
import RosterItem from "./RosterItem";
import { 
  useAssignments, 
  useRosterSectionExpanded, 
  useGraveOnly, 
  useRosterSearch,
  useShiftBuilderStore 
} from "../store/useShiftBuilderStore";

export interface RosterRailProps {
  // Core data (narrow day-specific slice)
  realRoster: any[];
  graveRoster: any[];
  assignments?: Record<string, any>; // optional — prefer store selector (3.4)
  assignedThisNight: Set<string>;
  scheduledTmIdsTonight: Set<string>;
  calledOffIds: Set<string>;

  // View + filter state (controlled by orchestrator / useRosterPanels)
  // These are now optional — RosterRail prefers narrow Zustand selectors (3.4)
  graveOnly?: boolean;
  rosterSearch?: string;
  isDark: boolean;
  isCurrentNightLocked: boolean;
  canEditAssignments: boolean;

  // Overlap labels (pre-computed in parent for the current day)
  amOverlapDayName?: string;
  amOverlapDateNum?: number;
  selectedDay: { name: string; dateNum: number };

  // Expanded state + filter setters are now handled via Zustand selectors/actions inside RosterRail (3.4).
  // The props below are kept temporarily for any external callers during transition.
  setGraveOnly?: (v: boolean) => void;
  setRosterSearch?: (v: string) => void;

  // Live / drag context if needed inside items
  live?: any;

  /** True only on cold load — avoids "Loading roster" flash when keepPreviousData holds prior day. */
  isRosterLoading?: boolean;
}

/**
 * RosterRail
 *
 * Isolated, memoized owner of the entire left floating roster rail content.
 * Symmetric win to ShiftBuilderBoard for day-switch + assignment-drag perf on iPad.
 *
 * - Receives only the narrow data it needs for the current day + UI state.
 * - Owns the heavy filtering + sectioning logic (the old giant IIFE).
 * - All VirtualRosterList + RosterItem usage lives here.
 * - Parent orchestrator no longer re-renders this subtree on unrelated board changes.
 *
 * Sacred contracts preserved: exact section order, emphasis colors, scheduled-unplaced
 * grouping, GRAVE filter behavior, search, expand/collapse persistence (via props),
 * drag & drop targets.
 */
const RosterRail = React.memo(function RosterRail({
  realRoster,
  graveRoster,
  assignments: assignmentsProp,
  assignedThisNight,
  scheduledTmIdsTonight,
  calledOffIds,
  graveOnly: graveOnlyProp,
  rosterSearch: rosterSearchProp,
  isDark,
  isCurrentNightLocked,
  canEditAssignments,
  amOverlapDayName,
  amOverlapDateNum,
  selectedDay,
  setGraveOnly: setGraveOnlyProp,
  setRosterSearch: setRosterSearchProp,
  isRosterLoading = false,
}: RosterRailProps) {
  // 3.4 — Narrow Zustand subscriptions (primary). Only re-renders when these exact slices change.
  const assignments = useAssignments() ?? assignmentsProp ?? {};
  const graveOnly = useGraveOnly() ?? graveOnlyProp ?? true;
  const rosterSearch = useRosterSearch() ?? rosterSearchProp ?? '';

  // Expanded sections via individual selectors (fine-grained)
  const otherTmsExpanded = useRosterSectionExpanded('otherTms');
  const calledOffExpanded = useRosterSectionExpanded('calledOff');
  const deployedExpanded = useRosterSectionExpanded('deployed');
  const pmOverlapsExpanded = useRosterSectionExpanded('pmOverlaps');
  const amOverlapsExpanded = useRosterSectionExpanded('amOverlaps');
  const portersExpanded = useRosterSectionExpanded('porters');
  const scheduledGravesExpanded = useRosterSectionExpanded('scheduledGraves');
  const scheduledPMExpanded = useRosterSectionExpanded('scheduledPM');
  const scheduledAMExpanded = useRosterSectionExpanded('scheduledAM');

  // Store-backed setters (3.4) — always read fresh value for functional updates.
  const setOtherTmsExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.otherTms;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('otherTms', next);
    setGraveOnlyProp?.(useShiftBuilderStore.getState().rosterUI.graveOnly);
  };
  const setCalledOffExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.calledOff;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('calledOff', next);
  };
  const setDeployedExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.deployed;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('deployed', next);
  };
  const setPmOverlapsExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.pmOverlaps;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('pmOverlaps', next);
  };
  const setAmOverlapsExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.amOverlaps;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('amOverlaps', next);
  };
  const setPortersExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.porters;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('porters', next);
  };
  const setScheduledGravesExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.scheduledGraves;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('scheduledGraves', next);
  };
  const setScheduledPMExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.scheduledPM;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('scheduledPM', next);
  };
  const setScheduledAMExpanded = (v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded.scheduledAM;
    const next = typeof v === 'function' ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded('scheduledAM', next);
  };

  const setGraveOnly = (v: boolean) => {
    useShiftBuilderStore.getState().setGraveOnly(v);
    setGraveOnlyProp?.(v);
  };
  const setRosterSearch = (v: string) => {
    useShiftBuilderStore.getState().setRosterSearch(v);
    setRosterSearchProp?.(v);
  };
  // Local derived filtering (was the giant IIFE in the monolith — now scoped here)
  const rawRoster = graveOnly ? graveRoster : realRoster;

  const sourceRoster = React.useMemo(() => rawRoster.map((tm: any) => ({
    ...tm,
    isOnSchedule: assignedThisNight.has(tm.id),
  })), [rawRoster, assignedThisNight]);

  const isPorter = React.useCallback((tm: any) => (tm.primarySection || '').toLowerCase().includes('porter'), []);

  const calledOff = React.useMemo(() => sourceRoster.filter((t: any) => calledOffIds.has(t.id)), [sourceRoster, calledOffIds]);
  const notCalledOff = React.useMemo(() => sourceRoster.filter((t: any) => !calledOffIds.has(t.id)), [sourceRoster, calledOffIds]);

  const {
    onThisNight,
    alreadyDeployed,
    porters,
    pmOverlaps,
    amOverlaps,
    regularGravePool,
    scheduledUnplacedGraves,
    scheduledUnplacedPM,
    scheduledUnplacedAM,
    pmSwingLabel,
    amDayShiftLabel,
  } = React.useMemo(() => {
    let onThisNight: any[] = [];
    let alreadyDeployed: any[] = [];
    let porters: any[] = [];
    let pmOverlaps: any[] = [];
    let amOverlaps: any[] = [];
    let regularGravePool: any[] = [];
    let scheduledUnplacedGraves: any[] = [];
    let scheduledUnplacedPM: any[] = [];
    let scheduledUnplacedAM: any[] = [];
    let pmSwingLabel = '';
    let amDayShiftLabel = '';

    if (graveOnly) {
      onThisNight = notCalledOff.filter((t: any) => t.isOnSchedule);
      alreadyDeployed = notCalledOff.filter((t: any) => t.isOnWeek && !t.isOnSchedule);

      const notAssignedThisNight = notCalledOff.filter((t: any) => !t.isOnSchedule);
      const hasScheduleData = scheduledTmIdsTonight.size > 0;
      const scheduledUnplaced = hasScheduleData
        ? notAssignedThisNight.filter((t: any) => scheduledTmIdsTonight.has(t.id))
        : [];
      const scheduledUnplacedIds = new Set(scheduledUnplaced.map((t: any) => t.id));

      scheduledUnplacedGraves = scheduledUnplaced.filter((t: any) => !isPorter(t) && t.gravePool === 'Full');
      scheduledUnplacedPM = scheduledUnplaced.filter((t: any) => t.isPMOverlap);
      scheduledUnplacedAM = scheduledUnplaced.filter((t: any) => t.isAMOverlap && !t.isPMOverlap);

      pmSwingLabel = `${selectedDay.name.slice(0, 3)} ${selectedDay.dateNum} swing (until 1am)`;
      amDayShiftLabel = `${amOverlapDayName?.slice(0, 3) || ''} ${amOverlapDateNum || ''} day shift (5am)`;

      const remaining = hasScheduleData
        ? notAssignedThisNight.filter((t: any) => !scheduledUnplacedIds.has(t.id))
        : notAssignedThisNight;

      porters = remaining.filter((t: any) => isPorter(t));
      const nonPorters = remaining.filter((t: any) => !isPorter(t));
      pmOverlaps = nonPorters.filter((t: any) => t.isPMOverlap);
      amOverlaps = nonPorters.filter((t: any) => t.isAMOverlap && !t.isPMOverlap);
      regularGravePool = nonPorters.filter((t: any) => !t.isPMOverlap && !t.isAMOverlap);
    } else {
      onThisNight = notCalledOff.filter((t: any) => t.isOnSchedule);
      regularGravePool = notCalledOff.filter((t: any) => !t.isOnSchedule);
    }

    return {
      onThisNight, alreadyDeployed, porters, pmOverlaps, amOverlaps, regularGravePool,
      scheduledUnplacedGraves, scheduledUnplacedPM, scheduledUnplacedAM,
      pmSwingLabel, amDayShiftLabel,
    };
  }, [graveOnly, notCalledOff, scheduledTmIdsTonight, selectedDay, amOverlapDayName, amOverlapDateNum, isPorter]);

  const filterTerm = rosterSearch.trim().toLowerCase();

  const filteredCalledOff = React.useMemo(() => filterTerm
    ? calledOff.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm))
    : calledOff, [calledOff, filterTerm]);

  const filteredOnThisNight = React.useMemo(() => filterTerm
    ? onThisNight.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : onThisNight, [onThisNight, filterTerm]);

  const filteredDeployed = React.useMemo(() => filterTerm
    ? alreadyDeployed.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : alreadyDeployed, [alreadyDeployed, filterTerm]);

  const filteredPorters = React.useMemo(() => filterTerm
    ? porters.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : porters, [porters, filterTerm]);

  const filteredPMOverlaps = React.useMemo(() => filterTerm
    ? pmOverlaps.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : pmOverlaps, [pmOverlaps, filterTerm]);

  const filteredAMOverlaps = React.useMemo(() => filterTerm
    ? amOverlaps.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : amOverlaps, [amOverlaps, filterTerm]);

  const filteredRegularGrave = React.useMemo(() => filterTerm
    ? regularGravePool.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : regularGravePool, [regularGravePool, filterTerm]);

  const filteredSchedGraves = React.useMemo(() => filterTerm
    ? scheduledUnplacedGraves.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : scheduledUnplacedGraves, [scheduledUnplacedGraves, filterTerm]);

  const filteredSchedPM = React.useMemo(() => filterTerm
    ? scheduledUnplacedPM.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : scheduledUnplacedPM, [scheduledUnplacedPM, filterTerm]);

  const filteredSchedAM = React.useMemo(() => filterTerm
    ? scheduledUnplacedAM.filter((tm: any) => tm.name.toLowerCase().includes(filterTerm) || tm.id.toLowerCase().includes(filterTerm) || (tm.primarySection || "").toLowerCase().includes(filterTerm))
    : scheduledUnplacedAM, [scheduledUnplacedAM, filterTerm]);

  const hasAnyScheduledUnplaced = scheduledTmIdsTonight.size > 0 && (filteredSchedGraves.length > 0 || filteredSchedPM.length > 0 || filteredSchedAM.length > 0);

  return (
    <>
      {/* Header + count (moved inside rail for full isolation) */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-baseline gap-2">
          <div className="font-bold tracking-[1.5px] text-[11px]" style={{ color: isDark ? '#9CA3AF' : '#6B7280' }}>
            GRAVE ROSTER
          </div>
          <div className="flex-1 h-px bg-[#E5E5E7] dark:bg-[#3A3A3C]" />
        </div>
        <div className="text-[10px] text-[var(--ios-label-tertiary)] dark:text-[var(--ios-label-tertiary)] mt-0.5 tracking-[0.2px]">
          {graveOnly
            ? `11pm–6:55am eligible pool — ${graveRoster.length} TMs`
            : "All active TMs • Drag to any slot"}
        </div>
      </div>

      {/* Unified filter strip */}
      <div className="px-4 pb-3 flex-shrink-0 space-y-2">
        <div className="relative">
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder={graveOnly ? "Search GRAVE pool…" : "Search team members…"}
            className="w-full bg-[var(--ios-background-secondary)] dark:bg-[var(--ios-background-secondary)] dark:text-[var(--ios-label)] border border-[var(--ios-gray-4)] dark:border-[var(--ios-gray-3)] rounded-[3px] pl-8 pr-3 py-1.5 text-[12px] placeholder:text-[var(--ios-label-tertiary)] dark:placeholder:text-[#636366] focus:outline-none focus:border-[var(--ios-gray-4)] dark:focus:border-[var(--ios-gray-3)] transition-colors"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          />
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ios-label-tertiary)]">
            <span className="ms" style={{ fontSize: 14, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>search</span>
          </div>
        </div>

        <div className="flex border border-[var(--ios-gray-4)] dark:border-[var(--ios-gray-3)] rounded-[4px] overflow-hidden text-[11px] font-medium shadow-sm bg-[var(--ios-background-secondary)] dark:bg-[var(--ios-background-secondary)]">
          <button
            onClick={() => setGraveOnly(false)}
            className={`sb-interactive flex-1 px-3 py-1.5 ${
              !graveOnly ? "bg-[var(--ios-label)] text-[var(--ios-white)] shadow-inner" : isDark ? "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-5)]" : "text-[var(--ios-label-secondary)] hover:bg-[var(--ios-gray-6)]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setGraveOnly(true)}
            className={`sb-interactive flex-1 px-3 py-1.5 border-l border-[#D1D1D6] dark:border-[#3A3A3C] ${
              graveOnly ? "bg-[var(--ios-label)] text-[var(--ios-white)] shadow-inner" : isDark ? "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-5)]" : "text-[var(--ios-label-secondary)] hover:bg-[var(--ios-gray-6)]"
            }`}
            title="Only TMs with grave_pool availability for 11pm–6:55am"
          >
            GRAVE only
          </button>
        </div>
        {graveOnly && (
          <div className="text-[9px] text-[#8E8E93] px-1 tracking-[0.3px]">
            Filtered to TMs marked for grave rotations
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 pb-8 space-y-1.5">
        {isRosterLoading && realRoster.length === 0 && (
          <BuilderLoadingLine className="!mt-0 text-xs px-2 py-1">Loading roster</BuilderLoadingLine>
        )}

        {/* 0. Called Off */}
        {filteredCalledOff.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setCalledOffExpanded(v => !v)}
              aria-expanded={calledOffExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-orange)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-orange)] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: calledOffExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                Called Off
              </span>
              <span className="tabular-nums">{filteredCalledOff.length}</span>
            </button>
            {calledOffExpanded && filteredCalledOff.map((tm: any) => (
              <div key={tm.id} className="px-2 py-1 mx-1 my-0.5 rounded-md bg-orange-50/60 border border-orange-200/60 flex items-center gap-2 text-[12px]">
                <span className="line-through text-orange-700/80 font-medium truncate flex-1">
                  {tm.name || tm.fullName || tm.id}
                </span>
                <span className="text-[9px] uppercase tracking-[0.6px] text-orange-600/70 font-semibold">off</span>
              </div>
            ))}
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
          </>
        )}

        {/* 0b. Scheduled Tonight — Not Yet Placed */}
        {graveOnly && hasAnyScheduledUnplaced && (
          <>
            <div className="flex items-center gap-2 px-1 pt-2 pb-0.5">
              <div className="flex-1 h-px bg-amber-500/25" />
              <span className="text-[9px] uppercase tracking-[1.2px] text-amber-600/80 font-semibold whitespace-nowrap">On Schedule — Not Placed</span>
              <div className="flex-1 h-px bg-amber-500/25" />
            </div>

            {filteredSchedGraves.length > 0 && (
              <>
                <button type="button" onClick={() => setScheduledGravesExpanded(v => !v)} aria-expanded={scheduledGravesExpanded}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledGravesExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                    Graves
                  </span>
                  <span className="tabular-nums">{filteredSchedGraves.length}{filterTerm ? ` / ${scheduledUnplacedGraves.length}` : ""}</span>
                </button>
                {scheduledGravesExpanded && (
                  <VirtualRosterList items={filteredSchedGraves} estimateSize={42} overscan={6} useParentScroll
                    getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "scheduled", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
                )}
              </>
            )}

            {filteredSchedPM.length > 0 && (
              <>
                <button type="button" onClick={() => setScheduledPMExpanded(v => !v)} aria-expanded={scheduledPMExpanded}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledPMExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                    PM Overlaps ({pmSwingLabel})
                  </span>
                  <span className="tabular-nums">{filteredSchedPM.length}{filterTerm ? ` / ${scheduledUnplacedPM.length}` : ""}</span>
                </button>
                {scheduledPMExpanded && filteredSchedPM.map((tm: any) => {
                  const isAssigned = assignedThisNight.has(tm.id);
                  return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="scheduled" isLocked={isCurrentNightLocked} canEdit={canEditAssignments} />;
                })}
              </>
            )}

            {filteredSchedAM.length > 0 && (
              <>
                <button type="button" onClick={() => setScheduledAMExpanded(v => !v)} aria-expanded={scheduledAMExpanded}
                  className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors">
                  <span className="flex items-center gap-1.5">
                    <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledAMExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                    AM Overlaps ({amDayShiftLabel})
                  </span>
                  <span className="tabular-nums">{filteredSchedAM.length}{filterTerm ? ` / ${scheduledUnplacedAM.length}` : ""}</span>
                </button>
                {scheduledAMExpanded && filteredSchedAM.map((tm: any) => {
                  const isAssigned = assignedThisNight.has(tm.id);
                  return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="scheduled" isLocked={isCurrentNightLocked} canEdit={canEditAssignments} />;
                })}
              </>
            )}

            <div className="h-px bg-amber-500/20 mx-1 my-1" />
          </>
        )}

        {/* 1. Already Deployed */}
        {graveOnly && filteredOnThisNight.length > 0 && (
          <>
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
            <button type="button" onClick={() => setDeployedExpanded(v => !v)} aria-expanded={deployedExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-label-tertiary)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-label)] transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: deployedExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                Already Deployed
              </span>
              <span className="tabular-nums">{filteredOnThisNight.length}{filterTerm ? ` / ${onThisNight.length}` : ""}</span>
            </button>
            {deployedExpanded && (
              <VirtualRosterList items={filteredOnThisNight} estimateSize={42} overscan={6} useParentScroll
                getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "off", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
            )}
          </>
        )}

        {/* 2. Porters */}
        {graveOnly && filteredPorters.length > 0 && (
          <>
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
            <button type="button" onClick={() => setPortersExpanded(v => !v)} aria-expanded={portersExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-label-tertiary)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-label)] transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: portersExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                Porters
              </span>
              <span className="tabular-nums">{filteredPorters.length}{filterTerm ? ` / ${porters.length}` : ""}</span>
            </button>
            {portersExpanded && (
              <VirtualRosterList items={filteredPorters} estimateSize={42} overscan={6} useParentScroll
                getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "off", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
            )}
          </>
        )}

        {/* 3. AM Overlaps */}
        {graveOnly && filteredAMOverlaps.length > 0 && (
          <>
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
            <button type="button" onClick={() => setAmOverlapsExpanded(v => !v)} aria-expanded={amOverlapsExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-label-tertiary)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-label)] transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: amOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                AM Overlaps (in 5:00–5:30am)
              </span>
              <span className="tabular-nums">{filteredAMOverlaps.length}{filterTerm ? ` / ${amOverlaps.length}` : ""}</span>
            </button>
            {amOverlapsExpanded && (
              <VirtualRosterList items={filteredAMOverlaps} estimateSize={42} overscan={6} useParentScroll
                getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "off", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
            )}
          </>
        )}

        {/* 4. PM Overlaps */}
        {graveOnly && filteredPMOverlaps.length > 0 && (
          <>
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
            <button type="button" onClick={() => setPmOverlapsExpanded(v => !v)} aria-expanded={pmOverlapsExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-label-tertiary)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-label)] transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: pmOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                PM Overlaps (out at 1:00am)
              </span>
              <span className="tabular-nums">{filteredPMOverlaps.length}{filterTerm ? ` / ${pmOverlaps.length}` : ""}</span>
            </button>
            {pmOverlapsExpanded && (
              <VirtualRosterList items={filteredPMOverlaps} estimateSize={42} overscan={6} useParentScroll
                getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "off", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
            )}
          </>
        )}

        {/* 5. Not Scheduled — Regular GRAVE Pool */}
        {filteredRegularGrave.length > 0 && (
          <>
            <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
            <button type="button" onClick={() => setOtherTmsExpanded(v => !v)} aria-expanded={otherTmsExpanded}
              className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[var(--ios-label-tertiary)] font-semibold px-1 pt-2 pb-0.5 hover:text-[var(--ios-label)] transition-colors">
              <span className="flex items-center gap-1.5">
                <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: otherTmsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                Not Scheduled
              </span>
              <span className="tabular-nums">{filteredRegularGrave.length}{filterTerm ? ` / ${regularGravePool.length}` : ""}</span>
            </button>
            {otherTmsExpanded && (
              <VirtualRosterList items={filteredRegularGrave} estimateSize={42} overscan={8} useParentScroll
                getItemProps={(tm) => ({ tm, isAssigned: assignedThisNight.has(tm.id), emphasis: "off", isLocked: isCurrentNightLocked, canEdit: canEditAssignments })} />
            )}
          </>
        )}

        {filterTerm && filteredOnThisNight.length === 0 && filteredPorters.length === 0 && filteredAMOverlaps.length === 0 && filteredPMOverlaps.length === 0 && filteredRegularGrave.length === 0 && (
          <div className="text-xs text-[#8E8E93] px-2 py-2">No matches for “{rosterSearch}”</div>
        )}
      </div>
    </>
  );
});

export default RosterRail;

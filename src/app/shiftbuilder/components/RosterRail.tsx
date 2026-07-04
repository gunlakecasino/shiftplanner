"use client";

import React from "react";
import VirtualRosterList from "./VirtualRosterList";
import { BuilderLoadingLine } from "./builderPrimitives";
import {
  filterGravesScheduleRosterByBand,
  type GravesScheduleRosterRow,
} from "@/lib/shiftbuilder/gravesDefaultSchedule";
import {
  boardTmId,
  buildTmLookupIndex,
  collectPlacedTmIds,
  isTmPlacedTonight,
  resolveTmFromLookup,
} from "@/lib/shiftbuilder/tmIdentity";
import {
  useAssignments,
  useDraftAssignments,
  useRosterSectionExpanded,
  useGraveOnly,
  useRosterSearch,
  useShiftBuilderStore,
} from "../store/useShiftBuilderStore";

export interface RosterRailProps {
  /** Canonical pool from graves_default_schedule (+ night_on_call) for tonight. */
  scheduleRoster: GravesScheduleRosterRow[];
  /** Placed tonight (committed + draft + live) — used to seamlessly filter
   * already-placed TMs out of the visible roster (unplaced scheduled lists only).
   */
  placedTmIds: Set<string> | string[];
  /** Profile rows for resolving placed TMs missing from the schedule slice. */
  profileRoster?: Array<{
    id?: string;
    name?: string;
    fullName?: string;
    primarySection?: string | null;
    gravePool?: string | null;
    isFullGrave?: boolean;
    isPMOverlap?: boolean;
    isAMOverlap?: boolean;
  }>;
  scheduledTmIdsTonight: Set<string>;
  calledOffIds: Set<string>;
  isDark: boolean;
  isCurrentNightLocked: boolean;
  canEditAssignments: boolean;
  /** Remove TM from Called Off — returns them to the assignable pool (slots stay cleared). */
  onUnmarkCalledOff?: (tmId: string, tmName: string) => void | Promise<void>;
  /** Unplace a TM that is already on the board (from the Placed section). Provides explicit remove from roster. */
  onUnplaceTm?: (tmId: string, tmName: string) => void | Promise<void>;
  amOverlapDayName?: string;
  amOverlapDateNum?: number;
  selectedDay: { name: string; dateNum: number };
  isRosterLoading?: boolean;
}

function MsIcon({
  name,
  size = 12,
  fill = 0,
  className,
}: {
  name: string;
  size?: number;
  fill?: 0 | 1;
  className?: string;
}) {
  return (
    <span
      className={`ms ${className ?? ""}`}
      style={{
        fontSize: size,
        fontVariationSettings: `"FILL" ${fill}, "wght" 400, "opsz" 20`,
      }}
    >
      {name}
    </span>
  );
}

function RosterSectionHeader({
  label,
  count,
  total,
  expanded,
  onToggle,
  tone = "muted",
}: {
  label: string;
  count: number;
  total?: number;
  expanded: boolean;
  onToggle: () => void;
  tone?: "gold" | "placed" | "warn" | "muted";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`sb-roster-section__btn sb-interactive ${
        tone === "gold" ? "sb-roster-section__btn--gold" : tone === "placed" ? "sb-roster-section__btn--placed" : ""
      }`}
    >
      <span className="sb-roster-section__left min-w-0">
        <MsIcon
          name="chevron_right"
          className={`sb-roster-section__chevron ${expanded ? "sb-roster-section__chevron--open" : ""}`}
        />
        <span
          className={`sb-roster-section__label truncate ${
            tone === "gold"
              ? "sb-roster-section__label--gold"
              : tone === "placed"
                ? "sb-roster-section__label--placed"
                : tone === "warn"
                  ? "sb-roster-section__label--warn"
                  : "sb-roster-section__label--muted"
          }`}
        >
          {label}
        </span>
      </span>
      <span
        className={`sb-roster-section__count ${
          tone === "gold"
            ? "sb-roster-section__count--gold"
            : tone === "placed"
              ? "sb-roster-section__count--placed"
              : tone === "warn"
                ? "sb-roster-section__count--warn"
                : "sb-roster-section__count--muted"
        }`}
      >
        {count}
        {total !== undefined && total !== count ? ` / ${total}` : ""}
      </span>
    </button>
  );
}

function rowFromLookupEntry(entry: Record<string, unknown>): GravesScheduleRosterRow {
  const id = boardTmId(entry as { id?: string; tmId?: string; tm_id?: string });
  return {
    id,
    name: String(entry.name || entry.fullName || id),
    fullName: (entry.fullName as string) || undefined,
    primarySection: (entry.primarySection as string) ?? null,
    gravePool: (entry.gravePool as string) ?? null,
    gender: (entry.gender as string) ?? null,
    isFullGrave: !!(entry.isFullGrave ?? entry.isFullGraveTonight),
    isPMOverlap: !!(entry.isPMOverlap ?? entry.isPMOverlapTonight),
    isAMOverlap: !!(entry.isAMOverlap ?? entry.isAMOverlapTonight),
  };
}

const RosterRail = React.memo(function RosterRail({
  scheduleRoster,
  placedTmIds: placedTmIdsProp,
  profileRoster = [],
  scheduledTmIdsTonight,
  calledOffIds,
  isDark,
  isCurrentNightLocked,
  canEditAssignments,
  onUnmarkCalledOff,
  onUnplaceTm,
  amOverlapDayName,
  amOverlapDateNum,
  selectedDay,
  isRosterLoading = false,
}: RosterRailProps) {
  const [unmarkingId, setUnmarkingId] = React.useState<string | null>(null);
  const [unplacingId, setUnplacingId] = React.useState<string | null>(null);
  const canUnmarkCalledOff =
    canEditAssignments && !isCurrentNightLocked && !!onUnmarkCalledOff;
  const canUnplace =
    canEditAssignments && !isCurrentNightLocked && !!onUnplaceTm;
  const graveOnly = useGraveOnly();
  const rosterSearch = useRosterSearch();
  const storeAssignments = useAssignments() ?? {};
  const storeDraftAssignments = useDraftAssignments() ?? {};

  const placedTmIds = React.useMemo(() => {
    const source = Array.isArray(placedTmIdsProp) ? placedTmIdsProp : Array.from(placedTmIdsProp);
    const merged = new Set(source);
    collectPlacedTmIds(storeAssignments, storeDraftAssignments).forEach((id) => merged.add(id));
    return merged;
  }, [placedTmIdsProp, storeAssignments, storeDraftAssignments]);

  const identityLookup = React.useMemo(
    () => buildTmLookupIndex([...scheduleRoster, ...profileRoster]),
    [scheduleRoster, profileRoster],
  );

  const calledOffExpanded = useRosterSectionExpanded("calledOff");
  const scheduledGravesExpanded = useRosterSectionExpanded("scheduledGraves");
  const scheduledPMExpanded = useRosterSectionExpanded("scheduledPM");
  const scheduledAMExpanded = useRosterSectionExpanded("scheduledAM");
  const placedExpanded = useRosterSectionExpanded("placed");

  type ExpandedKey = keyof ReturnType<typeof useShiftBuilderStore.getState>["rosterUI"]["expanded"];

  const setSection = (key: ExpandedKey, v: boolean | ((prev: boolean) => boolean)) => {
    const current = useShiftBuilderStore.getState().rosterUI.expanded[key];
    const next = typeof v === "function" ? v(current) : v;
    useShiftBuilderStore.getState().setRosterSectionExpanded(key, next);
  };

  const setGraveOnly = (v: boolean) => {
    useShiftBuilderStore.getState().setGraveOnly(v);
  };

  const setRosterSearch = (v: string) => {
    useShiftBuilderStore.getState().setRosterSearch(v);
  };

  /** Band-filtered schedule pool for unplaced TMs.
   * Placed TMs are completely removed from the roster (not shown in any list),
   * so they cannot be (re)placed from the roster. They only affect the header stats.
   */
  const rawPool = React.useMemo(() => {
    return filterGravesScheduleRosterByBand(scheduleRoster, graveOnly);
  }, [scheduleRoster, graveOnly]);

  const isPlaced = React.useCallback(
    (tm: GravesScheduleRosterRow) => isTmPlacedTonight(tm, placedTmIds, identityLookup),
    [placedTmIds, identityLookup],
  );

  const sourceRoster = React.useMemo(
    () =>
      rawPool.map((tm) => ({
        ...tm,
        isPlaced: isPlaced(tm),
      })),
    [rawPool, isPlaced],
  );

  const unplacedCount = React.useMemo(
    () => sourceRoster.filter((t) => !t.isPlaced && !calledOffIds.has(t.id)).length,
    [sourceRoster, calledOffIds],
  );

  const isPorter = React.useCallback(
    (tm: GravesScheduleRosterRow) => (tm.primarySection || "").toLowerCase().includes("porter"),
    [],
  );

  const calledOff = React.useMemo(
    () => sourceRoster.filter((t) => calledOffIds.has(t.id)),
    [sourceRoster, calledOffIds],
  );
  const notCalledOff = React.useMemo(
    () => sourceRoster.filter((t) => !calledOffIds.has(t.id)),
    [sourceRoster, calledOffIds],
  );

  /** Full list of placed TMs (from schedule pool + resolved profiles).
   * Shown in a separate collapsed "Placed" section (glass popup roster).
   * Excluded from the main unplaced selectable lists.
   * Remove button (visible on expand/hover) unplaces via parent handler.
   */
  const placedList = React.useMemo(() => {
    const list: GravesScheduleRosterRow[] = [];
    const seen = new Set<string>();

    for (const t of sourceRoster) {
      if (t.isPlaced && !calledOffIds.has(t.id) && !seen.has(t.id)) {
        list.push(t);
        seen.add(t.id);
      }
    }

    for (const pid of placedTmIds) {
      if (seen.has(pid)) continue;
      const resolved = resolveTmFromLookup(identityLookup, pid);
      if (resolved) {
        const row = rowFromLookupEntry(resolved);
        if (!calledOffIds.has(row.id) && !seen.has(row.id)) {
          list.push(row);
          seen.add(row.id);
        }
      }
    }
    return list;
  }, [sourceRoster, placedTmIds, identityLookup, calledOffIds]);

  const placedCount = React.useMemo(() => placedList.length, [placedList]);

  const {
    scheduledUnplacedGraves,
    scheduledUnplacedPM,
    scheduledUnplacedAM,
    pmSwingLabel,
    amDayShiftLabel,
  } = React.useMemo(() => {
    const notAssignedThisNight = notCalledOff.filter((t) => !t.isPlaced);

    const scheduledUnplaced = notAssignedThisNight.filter((t) => {
      if (scheduledTmIdsTonight.size === 0) return true;
      if (scheduledTmIdsTonight.has(t.id)) return true;
      for (const sid of scheduledTmIdsTonight) {
        const resolved = resolveTmFromLookup(identityLookup, sid);
        if (resolved && boardTmId(resolved) === t.id) return true;
      }
      return false;
    });

    const scheduledUnplacedGraves = scheduledUnplaced.filter(
      (t) => !isPorter(t) && t.isFullGrave && !t.isPMOverlap && !t.isAMOverlap,
    );
    const scheduledUnplacedPM = scheduledUnplaced.filter((t) => t.isPMOverlap);
    const scheduledUnplacedAM = scheduledUnplaced.filter(
      (t) => t.isAMOverlap && !t.isPMOverlap,
    );

    const pmSwingLabel = `${selectedDay.name.slice(0, 3)} ${selectedDay.dateNum} swing (until 1am)`;
    const amDayShiftLabel = `${amOverlapDayName?.slice(0, 3) || ""} ${amOverlapDateNum || ""} day shift (5am)`;

    return {
      scheduledUnplacedGraves,
      scheduledUnplacedPM,
      scheduledUnplacedAM,
      pmSwingLabel,
      amDayShiftLabel,
    };
  }, [
    notCalledOff,
    scheduledTmIdsTonight,
    selectedDay,
    amOverlapDayName,
    amOverlapDateNum,
    isPorter,
    identityLookup,
  ]);

  const filterTerm = rosterSearch.trim().toLowerCase();

  const matchesSearch = React.useCallback(
    (tm: GravesScheduleRosterRow) => {
      if (!filterTerm) return true;
      return (
        tm.name.toLowerCase().includes(filterTerm) ||
        tm.id.toLowerCase().includes(filterTerm) ||
        (tm.primarySection || "").toLowerCase().includes(filterTerm)
      );
    },
    [filterTerm],
  );

  const filteredCalledOff = React.useMemo(
    () => (filterTerm ? calledOff.filter(matchesSearch) : calledOff),
    [calledOff, filterTerm, matchesSearch],
  );
  const filteredSchedGraves = React.useMemo(
    () =>
      filterTerm ? scheduledUnplacedGraves.filter(matchesSearch) : scheduledUnplacedGraves,
    [scheduledUnplacedGraves, filterTerm, matchesSearch],
  );
  const filteredSchedPM = React.useMemo(
    () => (filterTerm ? scheduledUnplacedPM.filter(matchesSearch) : scheduledUnplacedPM),
    [scheduledUnplacedPM, filterTerm, matchesSearch],
  );
  const filteredSchedAM = React.useMemo(
    () => (filterTerm ? scheduledUnplacedAM.filter(matchesSearch) : scheduledUnplacedAM),
    [scheduledUnplacedAM, filterTerm, matchesSearch],
  );

  const filteredPlaced = React.useMemo(
    () => (filterTerm ? placedList.filter(matchesSearch) : placedList),
    [placedList, filterTerm, matchesSearch],
  );

  const hasAnyScheduledUnplaced =
    filteredSchedGraves.length > 0 ||
    filteredSchedPM.length > 0 ||
    filteredSchedAM.length > 0;

  const itemProps = React.useCallback(
    (tm: GravesScheduleRosterRow, emphasis: "on" | "off" | "scheduled") => ({
      tm,
      isAssigned: isPlaced(tm),
      emphasis,
      isLocked: isCurrentNightLocked,
      canEdit: canEditAssignments,
    }),
    [isPlaced, isCurrentNightLocked, canEditAssignments],
  );

  const scheduleEmpty = !isRosterLoading && scheduleRoster.length === 0;
  const deployTotal = placedCount + unplacedCount;
  const placementPct = deployTotal > 0 ? Math.round((placedCount / deployTotal) * 100) : 0;
  const scheduledBandCount = graveOnly
    ? filterGravesScheduleRosterByBand(scheduleRoster, true).length
    : scheduleRoster.length;
  const listEstimate = 48;

  return (
    <>
      <header className="sb-roster-header">
        <div className="sb-roster-header__title-row">
          <div className="sb-roster-header__glyph" aria-hidden>
            <MsIcon name="groups" size={13} fill={1} />
          </div>
          <span className="sb-roster-header__title">Grave Roster</span>
          <div className="sb-roster-header__line" />
        </div>
        <p className="sb-roster-header__subtitle">
          {graveOnly
            ? `Graves band · ${scheduledBandCount} on tonight's sheet`
            : `Graves Default Schedule · ${scheduleRoster.length} scheduled`}
        </p>
        {(placedCount > 0 || unplacedCount > 0) && (
          <>
            <div className="sb-roster-stats">
              <span className="sb-roster-stat sb-roster-stat--placed">
                <span className="sb-roster-stat__dot" />
                {placedCount} placed
              </span>
              <span className="sb-roster-stat sb-roster-stat--pending">
                <span className="sb-roster-stat__dot" />
                {unplacedCount} to place
              </span>
            </div>
            <div className="sb-roster-progress" aria-hidden>
              <div className="sb-roster-progress__fill" style={{ width: `${placementPct}%` }} />
            </div>
          </>
        )}
      </header>

      <div className="sb-roster-controls">
        <div className="sb-roster-search-wrap">
          <input
            type="text"
            value={rosterSearch}
            onChange={(e) => setRosterSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="sb-roster-search sb-interactive"
            style={{ fontFamily: "var(--font-geist-sans)" }}
          />
          <div className="sb-roster-search__icon">
            <MsIcon name="search" size={14} />
          </div>
        </div>

        <div className="sb-roster-segment" role="group" aria-label="Schedule band filter">
          <button
            type="button"
            onClick={() => setGraveOnly(false)}
            className={`sb-roster-segment__btn sb-interactive ${!graveOnly ? "sb-roster-segment__btn--active" : ""}`}
          >
            All bands
          </button>
          <button
            type="button"
            onClick={() => setGraveOnly(true)}
            className={`sb-roster-segment__btn sb-interactive ${graveOnly ? "sb-roster-segment__btn--active" : ""}`}
            title="Only TMs on the Graves band for tonight"
          >
            Graves only
          </button>
        </div>
        {graveOnly && (
          <p className="sb-roster-filter-hint">Showing full-grave band from Graves Default Schedule</p>
        )}
      </div>

      <div className="sb-roster-body">
        {isRosterLoading && scheduleRoster.length === 0 && (
          <BuilderLoadingLine className="!mt-0 text-xs px-2 py-1">
            Loading roster
          </BuilderLoadingLine>
        )}

        {scheduleEmpty && (
          <div className="sb-roster-empty">
            No TMs on Graves Default Schedule for tonight. Edit the sheet at{" "}
            <a href="/shiftbuilder/team?tab=schedule" className="sb-gold-text underline">
              Graves Schedule
            </a>
            .
          </div>
        )}

        {hasAnyScheduledUnplaced && (
          <section className="sb-roster-section">
            <div className="sb-roster-banner">
              <div className="flex-1 h-px sb-gold-rule" />
              <span className="sb-roster-banner__label">On Sheet — Not Placed</span>
              <div className="flex-1 h-px sb-gold-rule" />
            </div>

            {filteredSchedGraves.length > 0 && (
              <div className="sb-roster-section">
                <RosterSectionHeader
                  label="Graves"
                  count={filteredSchedGraves.length}
                  total={filterTerm ? scheduledUnplacedGraves.length : undefined}
                  expanded={scheduledGravesExpanded}
                  onToggle={() => setSection("scheduledGraves", (v) => !v)}
                  tone="gold"
                />
                {scheduledGravesExpanded && (
                  <VirtualRosterList
                    items={filteredSchedGraves}
                    estimateSize={listEstimate}
                    overscan={6}
                    useParentScroll
                    getItemProps={(tm) => itemProps(tm, "scheduled")}
                  />
                )}
              </div>
            )}

            {!graveOnly && filteredSchedPM.length > 0 && (
              <div className="sb-roster-section">
                <RosterSectionHeader
                  label={`PM · ${pmSwingLabel}`}
                  count={filteredSchedPM.length}
                  total={filterTerm ? scheduledUnplacedPM.length : undefined}
                  expanded={scheduledPMExpanded}
                  onToggle={() => setSection("scheduledPM", (v) => !v)}
                  tone="gold"
                />
                {scheduledPMExpanded && (
                  <VirtualRosterList
                    items={filteredSchedPM}
                    estimateSize={listEstimate}
                    overscan={6}
                    useParentScroll
                    getItemProps={(tm) => itemProps(tm, "scheduled")}
                  />
                )}
              </div>
            )}

            {!graveOnly && filteredSchedAM.length > 0 && (
              <div className="sb-roster-section">
                <RosterSectionHeader
                  label={`AM · ${amDayShiftLabel}`}
                  count={filteredSchedAM.length}
                  total={filterTerm ? scheduledUnplacedAM.length : undefined}
                  expanded={scheduledAMExpanded}
                  onToggle={() => setSection("scheduledAM", (v) => !v)}
                  tone="gold"
                />
                {scheduledAMExpanded && (
                  <VirtualRosterList
                    items={filteredSchedAM}
                    estimateSize={listEstimate}
                    overscan={6}
                    useParentScroll
                    getItemProps={(tm) => itemProps(tm, "scheduled")}
                  />
                )}
              </div>
            )}
          </section>
        )}

        {/* Placed section — collapsed by default ("column").
            Shows every placed TM so user always sees who is working.
            Expand to reveal "remove" buttons that unplace the TM.
            These TMs are excluded from the selectable unplaced lists above. */}
        {filteredPlaced.length > 0 && (
          <section className="sb-roster-section">
            <div className="sb-roster-divider" />
            <RosterSectionHeader
              label="Placed"
              count={filteredPlaced.length}
              expanded={placedExpanded}
              onToggle={() => setSection("placed", (v) => !v)}
              tone="placed"
            />
            {placedExpanded &&
              filteredPlaced.map((tm) => {
                const displayName = tm.name || tm.fullName || tm.id;
                const busy = unplacingId === tm.id;
                return (
                  <div key={tm.id} className="sb-roster-called-chip sb-roster-placed-item">
                    <span className="sb-roster-called-chip__name">{displayName}</span>
                    {canUnplace ? (
                      <button
                        type="button"
                        className="sb-roster-called-chip__restore sb-interactive"
                        disabled={busy}
                        title={`Remove ${displayName} from the schedule (unplace)`}
                        aria-label={`Remove ${displayName} from schedule`}
                        onClick={() => {
                          if (busy || !onUnplaceTm) return;
                          setUnplacingId(tm.id);
                          void Promise.resolve(onUnplaceTm(tm.id, displayName))
                            .catch(() => {})
                            .finally(() => {
                              setUnplacingId((current) => (current === tm.id ? null : current));
                            });
                        }}
                      >
                        {busy ? "…" : "remove"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
          </section>
        )}

        {filteredCalledOff.length > 0 && (
          <section className="sb-roster-section">
            <div className="sb-roster-divider" />
            <RosterSectionHeader
              label="Called Off"
              count={filteredCalledOff.length}
              expanded={calledOffExpanded}
              onToggle={() => setSection("calledOff", (v) => !v)}
              tone="warn"
            />
            {calledOffExpanded &&
              filteredCalledOff.map((tm) => {
                const displayName = tm.name || tm.fullName || tm.id;
                const busy = unmarkingId === tm.id;
                return (
                  <div key={tm.id} className="sb-roster-called-chip">
                    <span className="sb-roster-called-chip__name">{displayName}</span>
                    <span className="sb-roster-called-chip__badge">off</span>
                    {canUnmarkCalledOff ? (
                      <button
                        type="button"
                        className="sb-roster-called-chip__restore sb-interactive"
                        disabled={busy}
                        title="Return to tonight's assignable pool"
                        aria-label={`Restore ${displayName} to assignable roster`}
                        onClick={() => {
                          if (busy) return;
                          setUnmarkingId(tm.id);
                          void Promise.resolve(onUnmarkCalledOff!(tm.id, displayName))
                            .catch(() => {})
                            .finally(() => {
                              setUnmarkingId((current) => (current === tm.id ? null : current));
                            });
                        }}
                      >
                        {busy ? "…" : "Restore"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
          </section>
        )}

        {filterTerm &&
          filteredCalledOff.length === 0 &&
          !hasAnyScheduledUnplaced && (
            <div className="sb-roster-empty">No matches for “{rosterSearch}”</div>
          )}

        {!filterTerm && !hasAnyScheduledUnplaced && filteredCalledOff.length === 0 && filteredPlaced.length === 0 && (
          <div className="sb-roster-empty">No TMs to place or placed on this sheet.</div>
        )}
      </div>
    </>
  );
});

export default RosterRail;
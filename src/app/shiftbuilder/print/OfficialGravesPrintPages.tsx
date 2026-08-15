import React from "react";
import {
  AUX_ROLE_COLORS,
  BREAK_GROUP_OVERLAPS,
  RR_DEFS,
  SB_ZONE_6_ACCENT,
  SB_ZONE_6_INK,
  ZONE_DEFS,
  ZONE_VISUAL_ORDER,
  cardAccentInk,
  coverageBarBg,
  getOverlapAccent,
  getRRAccent,
  getZoneColor,
} from "@/lib/shiftbuilder/constants";
import {
  buildCoveredByIndex,
  formatSecondaryZonePrimaryLabel,
  formatCoveragePositionLabel,
  formatCoverageSideLabel,
  getSlotCoverageLabel,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";
import type { PrintSideTask } from "@/lib/shiftbuilder/printSideTasks";
import { buildOverlapRows } from "./buildPrintDaySnapshot";
import { hasPrintAssigneeName, printAssigneeName } from "./printAssigneeName";
import type { PrintDaySnapshot, PrintOverlapRow, PrintPreviewPageProps } from "./printPreviewTypes";
import {
  EDITABLE_PDF_TM_SOURCE_ATTR,
  EditablePdfTmFieldAnchor,
} from "./editablePdfFields";
import {
  buildOfficialTaskRows,
  isOfficialZoneCardDense,
  solveOfficialDeploymentTracks,
  solveOfficialZoneRowTracks,
  type OfficialZoneCardLoad,
} from "./officialZoneRowLayout";
import { AsOfTimestamp } from "./AsOfTimestamp";
import { GoldenPlanningNotesPanel } from "./GoldenPrintComponents";

const PAGE_TASK_ROWS = 8;
const PAGE_TASK_ROWS_FOR_TALL_OVERLAPS = 7;
const TALL_OVERLAP_TASK_LINE_THRESHOLD = 4;
const PAGE_ONE_TASK_PREVIEW = 3;

export function configuredOfficialAuxDefs(
  auxDefs: PrintDaySnapshot["auxDefs"],
): PrintDaySnapshot["auxDefs"] {
  return auxDefs.filter(
    (def) => def.role !== "blank" || !!def.label?.trim(),
  );
}

export function officialAuxCardGridShape(auxCardCount: number): {
  columns: number;
  rows: number;
} {
  // The AUX rail owns the three tracks immediately beside Side Tasks. Keep up
  // to five configured cards on one full-width row so they meet that panel
  // instead of wrapping early and leaving a blank pocket between sections.
  const columns = Math.max(1, Math.min(5, auxCardCount));
  return {
    columns,
    rows: Math.max(1, Math.ceil(auxCardCount / columns)),
  };
}

export function pageTaskRowsForOverlapRows(rows: PrintOverlapRow[]): number {
  return rows
    .flatMap((row) => row.slots)
    .some((slot) => slot.tasks.filter((task) => !task.isCoverage).length >= TALL_OVERLAP_TASK_LINE_THRESHOLD)
    ? PAGE_TASK_ROWS_FOR_TALL_OVERLAPS
    : PAGE_TASK_ROWS;
}

const APPROVED_ACCENT_INK: Record<string, string> = {
  "#ffcc00": "#7a5a00",
  "#ff3b30": "#b42318",
  "#ff2d55": "#a90e3d",
  [SB_ZONE_6_ACCENT.toLowerCase()]: SB_ZONE_6_INK,
  "#007aff": "#0057b8",
  "#a2845e": "#6f5438",
  "#34c759": "#176b32",
};

function approvedAccentInk(accent: string): string {
  return APPROVED_ACCENT_INK[accent.toLowerCase()] ?? cardAccentInk(accent);
}

function GravesZoneSheetHeader({
  snapshot,
  weekDayDefs,
  pageLabel,
  printedAt,
  includeTimestamp,
}: {
  snapshot: PrintDaySnapshot;
  weekDayDefs: PrintPreviewPageProps["weekDayDefs"];
  pageLabel: string;
  printedAt?: string;
  includeTimestamp?: boolean;
}) {
  const { day, dayIndex } = snapshot;
  return (
    <header className="sb-approved-header">
      <div className="sb-approved-date-tile">
        <span className="sb-graves-date-weekday" style={{ color: day.color }}>
          {day.name.slice(0, 3).toUpperCase()}
        </span>
        <span className="sb-graves-date-number">{day.dateNum}</span>
      </div>

      <div className="sb-approved-title-block">
        <div className="sb-graves-title">GRAVES ZONE SHEET</div>
        <div className="sb-approved-header-detail">
          <span className="sb-approved-page-chip">{pageLabel}</span>
          <span className="sb-graves-week-context">
            {day.monthYear.toUpperCase()} - DAY {dayIndex + 1} OF 7
          </span>
        </div>
      </div>
      <div className="sb-approved-week-strip" aria-label="Weekday strip">
        {weekDayDefs.map((def, index) => {
          const active = index === dayIndex;
          return (
            <span
              key={`${def.short}-${index}`}
              className={`sb-approved-weekday ${active ? "is-active" : ""}`}
              style={active ? { background: day.color } : undefined}
            >
              {def.name.slice(0, 2).toUpperCase()}
            </span>
          );
        })}
      </div>
      {includeTimestamp && printedAt ? (
        <AsOfTimestamp
          value={printedAt}
          shiftDay={day}
          className="sb-approved-as-of"
        />
      ) : null}
    </header>
  );
}

function ApprovedSectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="sb-approved-section-header">
      <span className="sb-approved-section-label">{label}</span>
      <span className="sb-approved-section-rule" />
      {count > 0 ? <span className="sb-approved-section-count">ASSIGNED {count}</span> : null}
    </div>
  );
}

function ApprovedStatusHeader({
  label,
  statuses,
}: {
  label: string;
  statuses: Array<{ label: string; count: number; tone?: "open" | "available" }>;
}) {
  const visible = statuses.filter((status) => status.count > 0);
  return (
    <div className="sb-approved-section-header">
      <span className="sb-approved-section-label">{label}</span>
      <span className="sb-approved-section-rule" />
      <span className="sb-approved-statuses">
        {visible.map((status) => (
          <span key={status.label} className={`sb-approved-section-count ${status.tone ? `is-${status.tone}` : ""}`}>
            {status.label} {status.count}
          </span>
        ))}
      </span>
    </div>
  );
}

function SideTasksSummaryCard({ tasks }: { tasks: PrintSideTask[] }) {
  const active = tasks.filter((task) => !task.completed);
  const rows = active.length <= PAGE_ONE_TASK_PREVIEW ? active : active.slice(0, 2);

  return (
    <div className="sb-approved-side-task-card">
      <div className="sb-side-task-summary-header">
        <span>SIDE TASKS</span>
        {active.length > 0 ? (
          <span className="sb-side-task-summary-link">{active.length} ACTIVE</span>
        ) : null}
      </div>
      <div className="sb-side-task-summary-rows">
        {rows.map((task, index) => (
          <div key={task.id} className="sb-side-task-summary-row">
            <span className="sb-side-task-summary-number">{index + 1}</span>
            <span className="sb-side-task-summary-title">{task.title}</span>
            <span className={`sb-side-task-summary-assignee ${!task.assigneeName ? "is-open" : ""}`}>
              {task.assigneeName ?? "OPEN"}
            </span>
          </div>
        ))}
        {active.length > PAGE_ONE_TASK_PREVIEW ? (
          <div className="sb-side-task-summary-overflow">+{active.length - 2} MORE</div>
        ) : null}
        <div className="sb-side-task-summary-blank-list" aria-label="Three blank side task lines">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="sb-side-task-summary-blank-row">
              <span className="sb-side-task-summary-blank-bullet" aria-hidden>•</span>
              <span className="sb-side-task-summary-blank-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function taskLabels(snapshot: PrintDaySnapshot, slotKey: string): string[] {
  return (snapshot.tasksBySlot[slotKey] ?? [])
    .filter((task) => !task.isCoverage)
    .map((task) => task.taskLabel?.trim())
    .filter((label): label is string => !!label);
}

function coverageFooterLabel(
  targetKey: string,
  entry: CoveredByEntry,
  covererCount: number,
  auxDefs: PrintDaySnapshot["auxDefs"],
): string {
  if (targetKey.startsWith("Z")) {
    return `ZONE ${formatCoveragePositionLabel(targetKey, entry.side, covererCount)}`;
  }
  const aux = auxDefs.find((def) => def.key === targetKey);
  if (aux?.role === "z9sr") return "ZONE 9 SMOKING ROOM";
  if (aux?.role === "admin") return "ADMIN";
  if (aux?.locations?.[0]?.trim()) return aux.locations[0].trim().toUpperCase();
  if (aux?.label?.trim()) return aux.label.trim().toUpperCase();
  return getSlotCoverageLabel(targetKey).toUpperCase();
}

function buildCoverageTargetsBySource(
  coveredByIndex: Record<string, CoveredByEntry[]>,
  auxDefs: PrintDaySnapshot["auxDefs"],
) {
  const result: Record<string, string[]> = {};
  Object.entries(coveredByIndex).forEach(([targetKey, entries]) => {
    entries.forEach((entry) => {
      const label = coverageFooterLabel(targetKey, entry, entries.length, auxDefs);
      result[entry.sourceKey] = [...new Set([...(result[entry.sourceKey] ?? []), label])];
    });
  });
  return result;
}

function ApprovedAssignmentCard({
  slotKey,
  label,
  accent,
  snapshot,
  coveredBy = [],
  coverageTargets = [],
  compact = false,
  auxMini = false,
  hideTasks = false,
  blankWhenEmpty = true,
}: {
  slotKey: string;
  label: string;
  accent: string;
  snapshot: PrintDaySnapshot;
  coveredBy?: CoveredByEntry[];
  coverageTargets?: string[];
  compact?: boolean;
  auxMini?: boolean;
  hideTasks?: boolean;
  blankWhenEmpty?: boolean;
}) {
  const assignment = snapshot.assignments[slotKey] ?? {};
  const assignedName = printAssigneeName(assignment.tmName, assignment.tmId);
  const isCovered = !assignedName && coveredBy.length > 0;
  const nameRows = assignedName
    ? [{ name: assignedName, primaryZoneLabel: null }]
    : coveredBy.map((entry) => ({
        name:
          coveredBy.length > 1 && entry.side
            ? `${formatCoverageSideLabel(slotKey, entry.side)} ${entry.tmName}`
            : entry.tmName,
        primaryZoneLabel: formatSecondaryZonePrimaryLabel(
          slotKey,
          entry.sourceKey,
        ),
      }));
  const names = nameRows.map((row) => row.name);
  const breakGroup = assignedName
    ? assignment.breakGroup
    : coveredBy.length === 1
      ? snapshot.assignments[coveredBy[0].sourceKey]?.breakGroup
      : 0;
  const tasks = hideTasks ? [] : taskLabels(snapshot, slotKey);
  const empty = names.length === 0;
  const showOpenWork = empty && !blankWhenEmpty && tasks.length > 0;
  const footer = coverageTargets.join(" / ");
  const footerText =
    footer === "ZONE 9 SMOKING ROOM" ? `AND ${footer}` : `ALSO COVERS ${footer}`;
  const dense = isOfficialZoneCardDense({
    slotKey,
    names,
    tasks,
    hasFooter: !!footer,
    compact,
  });
  const ink = approvedAccentInk(accent);
  const coverageBg = coverageBarBg(accent);
  const hasEditableTmField = Boolean(assignedName) || coveredBy.length === 0;

  return (
    <div
      className={`sb-approved-assignment-card ${compact ? "is-compact" : ""} ${auxMini ? "is-aux-mini" : ""} ${empty ? "is-empty" : ""} ${dense ? "is-dense" : ""} ${isCovered ? "is-covered" : ""} ${showOpenWork ? "is-open-work" : ""} ${footer ? "has-footer" : ""}`.trim()}
      style={{
        ["--approved-accent" as string]: accent,
        ["--approved-ink" as string]: ink,
        ["--approved-coverage" as string]: coverageBg,
      }}
      data-slot-key={slotKey}
    >
      <div className="sb-approved-card-accent" />
      <div className="sb-approved-card-header">
        <span>{label}</span>
        {breakGroup && names.length === 1 ? (
          <span className="sb-approved-break-pill">
            {breakGroup === BREAK_GROUP_OVERLAPS ? "OL" : `B${breakGroup}`}
          </span>
        ) : null}
      </div>
      <div className="sb-approved-card-body">
        {hasEditableTmField ? (
          <EditablePdfTmFieldAnchor
            slotKey={slotKey}
            value={assignedName}
            fontSizePx={auxMini ? 12 : compact ? 18 : 19}
            textAlign={auxMini ? "right" : "left"}
            style={auxMini
              ? {
                  left: 7,
                  right: 7,
                  top: "50%",
                  height: 16,
                  transform: "translateY(-50%)",
                }
              : { left: 9, right: 9, top: 4, height: compact ? 21 : 23 }}
          />
        ) : null}
        {showOpenWork ? (
          <span
            className="sb-approved-open-work"
            {...EDITABLE_PDF_TM_SOURCE_ATTR}
          >
            OPEN WORK
          </span>
        ) : null}
        {names.length > 0 ? (
          <div
            className={`sb-approved-card-names ${names.length > 1 ? "is-multiple" : ""}`}
            {...(assignedName ? EDITABLE_PDF_TM_SOURCE_ATTR : {})}
          >
            {nameRows.map((row) => (
              <div key={`${row.name}-${row.primaryZoneLabel ?? ""}`}>
                <span>{row.name}</span>
                {row.primaryZoneLabel ? (
                  <span className="sb-approved-card-primary-zone">
                    {row.primaryZoneLabel}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {tasks.length > 0 ? (
          <div className="sb-approved-card-tasks">
            {buildOfficialTaskRows(slotKey, tasks).map((row, rowIndex) => {
              return (
                <div
                  key={`${row.tasks.join("|")}-${rowIndex}`}
                  className={row.tasks.length > 1 ? "sb-approved-subtask-row" : undefined}
                  data-task-depth={row.depth || undefined}
                >
                  {row.tasks.map((task) => (
                    <span key={task}>- {task}</span>
                  ))}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {footer ? <div className="sb-approved-card-footer">{footerText}</div> : null}
    </div>
  );
}

export function OfficialGravesDeploymentPage({
  snapshot,
  weekDayDefs,
  printedAt,
  includeTimestamp,
}: Omit<PrintPreviewPageProps, "view">) {
  const coveredByIndex = buildCoveredByIndex(
    snapshot.assignments,
    snapshot.tasksBySlot,
    snapshot.auxDefs,
  );
  const coverageTargetsBySource = buildCoverageTargetsBySource(
    coveredByIndex,
    snapshot.auxDefs,
  );
  const zoneLoads = ZONE_VISUAL_ORDER.map((slotKey): OfficialZoneCardLoad => {
    const assignment = snapshot.assignments[slotKey] ?? {};
    const assignedName = printAssigneeName(assignment.tmName, assignment.tmId);
    const coveredBy = coveredByIndex[slotKey] ?? [];
    const names = assignedName
      ? [assignedName]
      : coveredBy.map((entry) =>
          coveredBy.length > 1 && entry.side
            ? `${formatCoverageSideLabel(slotKey, entry.side)} ${entry.tmName}`
            : entry.tmName,
        );

    return {
      slotKey,
      names,
      tasks: taskLabels(snapshot, slotKey),
      hasFooter: (coverageTargetsBySource[slotKey]?.length ?? 0) > 0,
    };
  });
  const zoneRowTracks = solveOfficialZoneRowTracks(
    zoneLoads.slice(0, 5),
    zoneLoads.slice(5),
  );
  const restroomSlotKeys = ["W", "M"].flatMap((side) =>
    RR_DEFS.map((def) => `${side}RR${def.num}`),
  );
  const restroomLoads = restroomSlotKeys.map(
    (slotKey): OfficialZoneCardLoad => {
      const assignment = snapshot.assignments[slotKey] ?? {};
      const assignedName = printAssigneeName(
        assignment.tmName,
        assignment.tmId,
      );
      const coveredBy = coveredByIndex[slotKey] ?? [];
      const names = assignedName
        ? [assignedName]
        : coveredBy.map((entry) =>
            coveredBy.length > 1 && entry.side
              ? `${formatCoverageSideLabel(slotKey, entry.side)} ${entry.tmName}`
              : entry.tmName,
          );

      return {
        slotKey,
        names,
        tasks: taskLabels(snapshot, slotKey),
        hasFooter: (coverageTargetsBySource[slotKey]?.length ?? 0) > 0,
        compact: true,
      };
    },
  );
  const zoneAssigned = ZONE_DEFS.filter(
    (def) =>
      hasPrintAssigneeName(
        snapshot.assignments[def.key]?.tmName,
        snapshot.assignments[def.key]?.tmId,
      ) || coveredByIndex[def.key]?.length,
  ).length;
  const restroomAssigned = RR_DEFS.reduce(
    (count, def) =>
      count +
      (hasPrintAssigneeName(
        snapshot.assignments[`WRR${def.num}`]?.tmName,
        snapshot.assignments[`WRR${def.num}`]?.tmId,
      ) || coveredByIndex[`WRR${def.num}`]?.length ? 1 : 0) +
      (hasPrintAssigneeName(
        snapshot.assignments[`MRR${def.num}`]?.tmName,
        snapshot.assignments[`MRR${def.num}`]?.tmId,
      ) || coveredByIndex[`MRR${def.num}`]?.length ? 1 : 0),
    0,
  );
  const auxDefs = configuredOfficialAuxDefs(snapshot.auxDefs);
  const auxGridShape = officialAuxCardGridShape(auxDefs.length);
  const auxAssigned = auxDefs.filter(
    (def) =>
      hasPrintAssigneeName(
        snapshot.assignments[def.key]?.tmName,
        snapshot.assignments[def.key]?.tmId,
      ) || coveredByIndex[def.key]?.length,
  ).length;
  const auxiliaryLoads = auxDefs.map(
    (def): OfficialZoneCardLoad => {
      const assignment = snapshot.assignments[def.key] ?? {};
      const assignedName = printAssigneeName(
        assignment.tmName,
        assignment.tmId,
      );
      const coveredBy = coveredByIndex[def.key] ?? [];

      return {
        slotKey: def.key,
        names: assignedName
          ? [assignedName]
          : coveredBy.map((entry) => entry.tmName),
        tasks: [],
        hasFooter: (coverageTargetsBySource[def.key]?.length ?? 0) > 0,
        compact: true,
      };
    },
  );
  const deploymentTracks = solveOfficialDeploymentTracks({
    zoneRows: [zoneLoads.slice(0, 5), zoneLoads.slice(5)],
    restroomRows: [restroomLoads.slice(0, 5), restroomLoads.slice(5)],
    auxiliaryCards: auxiliaryLoads,
    auxiliaryRows: auxGridShape.rows,
  });

  return (
    <div className="print-artboard sb-graves-sheet" data-print-view="deployment" data-print-variant="official">
      <GravesZoneSheetHeader
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        pageLabel="ASSIGNMENTS"
        printedAt={printedAt}
        includeTimestamp={includeTimestamp}
      />
      <div
        className="sb-approved-deployment-body"
        style={{ gridTemplateRows: deploymentTracks.cssValue }}
      >
        <section className="sb-approved-zones-section">
          <ApprovedSectionHeader label="ZONES" count={zoneAssigned} />
          <div
            className="sb-approved-zones-grid"
            style={{ gridTemplateRows: zoneRowTracks.cssValue }}
          >
            {ZONE_VISUAL_ORDER.map((slotKey) => {
              const def = ZONE_DEFS.find((zone) => zone.key === slotKey)!;
              return (
                <ApprovedAssignmentCard
                  key={slotKey}
                  slotKey={slotKey}
                  label={def.label}
                  accent={getZoneColor(slotKey)}
                  snapshot={snapshot}
                  coveredBy={coveredByIndex[slotKey]}
                  coverageTargets={coverageTargetsBySource[slotKey]}
                />
              );
            })}
          </div>
        </section>

        <section className="sb-approved-restrooms-section">
          <ApprovedSectionHeader label="RESTROOMS" count={restroomAssigned} />
          <div
            className="sb-approved-restrooms-grid"
            style={{
              gridTemplateRows: deploymentTracks.restroomRows.cssValue,
            }}
          >
            {["W", "M"].flatMap((side) => RR_DEFS.map((def) => {
              const slotKey = `${side}RR${def.num}`;
              return (
                <ApprovedAssignmentCard
                  key={slotKey}
                  slotKey={slotKey}
                  label={`${def.label} ${side === "W" ? "WOMEN" : "MEN"}`}
                  accent={getRRAccent(def.num)}
                  snapshot={snapshot}
                  coveredBy={coveredByIndex[slotKey]}
                  coverageTargets={coverageTargetsBySource[slotKey]}
                  compact
                />
              );
            }))}
          </div>
        </section>

        <section className="sb-approved-aux-section">
          <ApprovedSectionHeader label="AUXILIARY" count={auxAssigned} />
          <div className="sb-approved-aux-grid">
            <div
              className="sb-approved-aux-card-grid"
              style={{
                gridTemplateColumns: `repeat(${auxGridShape.columns}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${auxGridShape.rows}, minmax(0, 1fr))`,
              }}
            >
              {auxDefs.map((def) => (
                <ApprovedAssignmentCard
                  key={def.key}
                  slotKey={def.key}
                  label={def.role === "z9sr" ? "ZONE 9 SMOKING ROOM" : (def.label || def.locations?.[0] || def.key).toUpperCase()}
                  accent={def.role !== "blank" ? AUX_ROLE_COLORS[def.role] : "#9ca3af"}
                  snapshot={snapshot}
                  coveredBy={coveredByIndex[def.key]}
                  coverageTargets={coverageTargetsBySource[def.key]}
                  compact
                  auxMini
                  hideTasks
                  blankWhenEmpty={def.role === "admin" || def.role === "z9sr"}
                />
              ))}
            </div>
            <SideTasksSummaryCard tasks={snapshot.sideTasks ?? []} />
          </div>
        </section>
      </div>
    </div>
  );
}

function OfficialOverlapCard({ slot }: { slot: PrintOverlapRow["slots"][number] }) {
  const accent = getOverlapAccent(slot.key);
  const regularTasks = slot.tasks.filter((task) => !task.isCoverage);
  const tmName = printAssigneeName(slot.tmName, slot.tmId);
  const assigned = !!tmName;
  const openWork = !assigned && regularTasks.length > 0;
  const blank = !assigned && regularTasks.length === 0;
  return (
    <div
      className={`sb-graves-overlap-card ${openWork ? "is-open-work" : ""}`.trim()}
      style={{ ["--card-accent" as string]: accent }}
      data-slot-key={slot.key}
    >
      <div className="sb-graves-overlap-accent" style={{ background: openWork ? "#a16207" : accent }} />
      <div className="sb-graves-overlap-body" style={{ position: "relative" }}>
        <EditablePdfTmFieldAnchor
          slotKey={slot.key}
          value={tmName}
          fontSizePx={15}
          style={{ left: 7, right: 7, top: 4, height: 18 }}
        />
        {blank ? null : (
          <>
            <div
              className={`sb-graves-overlap-name ${openWork ? "is-open" : ""}`}
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
            >
              {tmName || "OPEN WORK"}
            </div>
            <div className="sb-approved-overlap-tasks">
              {regularTasks.map((task) => <div key={task.id}>- {task.label}</div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OfficialOverlapsSection({ rows, snapshot }: { rows: PrintOverlapRow[]; snapshot: PrintDaySnapshot }) {
  const slots = rows.flatMap((row) => row.slots);
  const assigned = slots.filter((slot) => printAssigneeName(slot.tmName, slot.tmId)).length;
  const openWork = slots.filter(
    (slot) => !printAssigneeName(slot.tmName, slot.tmId) && slot.tasks.some((task) => !task.isCoverage),
  ).length;
  return (
    <section className="overlaps-section sb-graves-overlaps-section">
      <ApprovedStatusHeader
        label="OVERLAP COVERAGE"
        statuses={[
          { label: "ASSIGNED", count: assigned },
          { label: "OPEN WORK", count: openWork, tone: "open" },
        ]}
      />
      <div className="sb-graves-overlap-rows">
        {rows.map((row) => (
          <div key={row.key} className="sb-graves-overlap-row">
            <div className="sb-graves-overlap-row-meta">
              <span className="sb-graves-overlap-day" style={{ color: row.headerColor }}>
                {row.dayName.toUpperCase()} {(() => {
                  const date = new Date(snapshot.day.date);
                  if (row.key === "AM") date.setDate(date.getDate() + 1);
                  return date.toLocaleDateString([], { month: "short" }).toUpperCase();
                })()} {row.dateNum}
              </span>
              <span className="sb-graves-overlap-time">{row.key === "PM" ? "11 PM - 1 AM" : "5 AM - 7 AM"}</span>
            </div>
            <div className="sb-graves-overlap-grid">
              {row.slots.map((slot) => (
                <OfficialOverlapCard key={slot.key} slot={slot} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OfficialGravesTasksPage({
  snapshot,
  weekDayDefs,
  printedAt,
  includeTimestamp,
}: Omit<PrintPreviewPageProps, "view">) {
  const overlapRows = buildOverlapRows(snapshot);
  const overlapDensity =
    pageTaskRowsForOverlapRows(overlapRows) < PAGE_TASK_ROWS ? "tall" : "normal";

  return (
    <div
      className="print-artboard sb-graves-sheet"
      data-print-view="breaks"
      data-print-variant="official"
      data-overlap-density={overlapDensity}
    >
      <GravesZoneSheetHeader
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        pageLabel="TASKS & OVERLAPS"
        printedAt={printedAt}
        includeTimestamp={includeTimestamp}
      />
      <div className="sb-graves-tasks-body">
        <section className="sb-official-notes-projects-events">
          <GoldenPlanningNotesPanel />
        </section>
        <OfficialOverlapsSection rows={overlapRows} snapshot={snapshot} />
      </div>
    </div>
  );
}

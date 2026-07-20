import React from "react";
import {
  RR_DEFS,
  ZONE_DEFS,
  ZONE_VISUAL_ORDER,
  cardAccentInk,
  getOverlapAccent,
  isGoldAccent,
} from "@/lib/shiftbuilder/constants";
import { buildCoveredByIndex, type CoveredByEntry } from "@/lib/shiftbuilder/coverageHelpers";
import { multiPersonCoverageSourceKeys } from "@/lib/shiftbuilder/printCoverage";
import type { PrintSideTask } from "@/lib/shiftbuilder/printSideTasks";
import {
  GoldenAuxCard,
  GoldenRRPrintGrid,
  GoldenSectionHeader,
  GoldenTaskList,
  GoldenZoneCard,
  toTaskLines,
} from "./GoldenPrintComponents";
import { buildOverlapRows, slotShowsFilled } from "./buildPrintDaySnapshot";
import type { PrintDaySnapshot, PrintOverlapRow, PrintPreviewPageProps } from "./printPreviewTypes";

const PAGE_TASK_ROWS = 8;
const PAGE_ONE_TASK_PREVIEW = 3;
const ZONE_ROW_1 = ZONE_VISUAL_ORDER.slice(0, 5);
const ZONE_ROW_2 = ZONE_VISUAL_ORDER.slice(5);

function formatAsOf(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = date
    .toLocaleDateString([], { month: "short", day: "numeric" })
    .toUpperCase()
    .replace(".", "");
  const time = date
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .toUpperCase()
    .replace(/\s+/g, " ");
  return `AS OF ${day} · ${time}`;
}

function formatCompletedTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s+/g, " ");
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
    <header className="sb-graves-header sheet-header">
      <div className="sb-graves-date-tile" style={{ borderColor: day.color }}>
        <span className="sb-graves-date-weekday" style={{ color: day.color }}>
          {day.short.toUpperCase()}
        </span>
        <span className="sb-graves-date-number">{day.dateNum}</span>
      </div>

      <div className="sb-graves-header-main">
        <div className="sb-graves-title">GRAVES ZONE SHEET</div>
        <div className="sb-graves-week-context">
          {day.monthYear.toUpperCase()} · DAY {dayIndex + 1} OF 7
        </div>
        <div className="sb-graves-week-strip" aria-label="Weekday strip">
          {weekDayDefs.map((def, index) => {
            const active = index === dayIndex;
            return (
              <span
                key={`${def.short}-${index}`}
                className="sb-graves-weekday"
                style={active ? { background: def.color, color: "#fff", borderColor: def.color } : undefined}
              >
                {def.short.slice(0, 3).toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>

      <div className="sb-graves-header-meta">
        <div className="sb-graves-page-label">{pageLabel}</div>
        {includeTimestamp && printedAt ? (
          <div className="sb-graves-as-of">{formatAsOf(printedAt)}</div>
        ) : null}
      </div>
    </header>
  );
}

function sectionCount(count: number): string | undefined {
  return count > 0 ? `${count} ASSIGNED` : undefined;
}

function SideTasksSummaryCard({ tasks }: { tasks: PrintSideTask[] }) {
  const active = tasks.filter((task) => !task.completed).slice(0, PAGE_ONE_TASK_PREVIEW);
  const rows: Array<PrintSideTask | null> = [
    ...active,
    ...Array.from({ length: Math.max(0, PAGE_ONE_TASK_PREVIEW - active.length) }, () => null),
  ];

  return (
    <div className="assignment-card sb-assignment-card sb-side-task-summary-card">
      <div className="sb-side-task-summary-accent" />
      <div className="sb-side-task-summary-header">
        <span>✦</span>
        <span>SIDE TASKS</span>
        <span className="sb-side-task-summary-link">SEE PAGE 2</span>
      </div>
      <div className="sb-side-task-summary-rows">
        {rows.map((task, index) => (
          <div key={task?.id ?? `blank-${index}`} className="sb-side-task-summary-row">
            <span className="sb-side-task-summary-number">{index + 1}</span>
            <span className="sb-side-task-summary-title">{task?.title ?? ""}</span>
            <span className={`sb-side-task-summary-assignee ${task && !task.assigneeName ? "is-open" : ""}`}>
              {task ? task.assigneeName ?? "OPEN WORK" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficialAuxSection({
  snapshot,
  coveredByIndex,
  suppressBreakPillKeys,
}: {
  snapshot: PrintDaySnapshot;
  coveredByIndex: Record<string, CoveredByEntry[]>;
  suppressBreakPillKeys: Set<string>;
}) {
  const auxDefs = snapshot.auxDefs.filter((def) => def.role !== "blank" || !!def.label?.trim());
  const assignedCount = auxDefs.filter((def) => snapshot.assignments[def.key]?.tmName).length;

  return (
    <section className="sb-builder-section sb-print-section sb-print-section-aux sb-graves-aux-section">
      <GoldenSectionHeader label="AUXILIARY" count={sectionCount(assignedCount)} />
      <div
        className="sb-graves-aux-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(auxDefs.length + 1, 1)}, minmax(0, 1fr))` }}
      >
        {auxDefs.map((def) => {
          const assignment = snapshot.assignments[def.key] || {};
          const fixedBlankRole = def.role === "admin" || def.role === "z9sr";
          return (
            <div key={def.key} className="relative h-full min-h-0" data-slot-key={def.key}>
              <GoldenAuxCard
                def={def}
                tmName={assignment.tmName}
                breakGroup={assignment.breakGroup ?? 0}
                tasks={toTaskLines(snapshot.tasksBySlot[def.key])}
                empty={!slotShowsFilled(def.key, snapshot.assignments)}
                coveredBy={coveredByIndex[def.key]}
                suppressBreakPill={suppressBreakPillKeys.has(def.key)}
                emptyLabel={fixedBlankRole ? null : "OPEN WORK"}
                showTasksWhenEmpty={!fixedBlankRole}
              />
            </div>
          );
        })}
        <SideTasksSummaryCard tasks={snapshot.sideTasks ?? []} />
      </div>
    </section>
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
  const suppressBreakPillKeys = multiPersonCoverageSourceKeys(coveredByIndex);
  const zoneAssigned = ZONE_DEFS.filter((def) => snapshot.assignments[def.key]?.tmName).length;
  const restroomAssigned = RR_DEFS.reduce(
    (count, def) =>
      count +
      (snapshot.assignments[`WRR${def.num}`]?.tmName ? 1 : 0) +
      (snapshot.assignments[`MRR${def.num}`]?.tmName ? 1 : 0),
    0,
  );

  const renderZoneRow = (keys: string[]) => (
    <div className="sb-graves-zone-row">
      {keys.map((slotKey) => {
        const assignment = snapshot.assignments[slotKey] || {};
        return (
          <div key={slotKey} className="relative h-full min-h-0" data-slot-key={slotKey}>
            <GoldenZoneCard
              slotKey={slotKey}
              tmName={assignment.tmName}
              breakGroup={assignment.breakGroup ?? 0}
              tasks={toTaskLines(snapshot.tasksBySlot[slotKey])}
              empty={!slotShowsFilled(slotKey, snapshot.assignments)}
              coveredBy={coveredByIndex[slotKey]}
              suppressBreakPill={suppressBreakPillKeys.has(slotKey)}
              showEmptyLabel={false}
              showTasksWhenEmpty={false}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="print-artboard sb-graves-sheet" data-print-view="deployment" data-print-variant="official">
      <GravesZoneSheetHeader
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        pageLabel="ASSIGNMENTS"
        printedAt={printedAt}
        includeTimestamp={includeTimestamp}
      />
      <div className="sb-graves-deployment-body">
        <section className="sb-builder-section sb-print-section sb-print-section-zones sb-graves-zones-section">
          <GoldenSectionHeader label="ZONES" count={sectionCount(zoneAssigned)} />
          <div className="sb-graves-zones-grid">
            {renderZoneRow(ZONE_ROW_1)}
            {renderZoneRow(ZONE_ROW_2)}
          </div>
        </section>

        <section className="sb-builder-section sb-print-section sb-print-section-rr sb-graves-restrooms-section">
          <GoldenSectionHeader label="RESTROOMS" count={sectionCount(restroomAssigned)} />
          <div className="sb-graves-restrooms-grid">
            <GoldenRRPrintGrid
              assignments={snapshot.assignments}
              tasksBySlot={snapshot.tasksBySlot}
              coveredByIndex={coveredByIndex}
              suppressBreakPillKeys={suppressBreakPillKeys}
              showEmptyLabels={false}
              showTasksWhenEmpty={false}
            />
          </div>
        </section>

        <OfficialAuxSection
          snapshot={snapshot}
          coveredByIndex={coveredByIndex}
          suppressBreakPillKeys={suppressBreakPillKeys}
        />
      </div>
    </div>
  );
}

function CompletedCheckbox({ completed }: { completed: boolean }) {
  return <span className={`sb-side-task-checkbox ${completed ? "is-complete" : ""}`}>{completed ? "✓" : ""}</span>;
}

function SideTaskRegister({ tasks }: { tasks: PrintSideTask[] }) {
  const visible = tasks.slice(0, PAGE_TASK_ROWS);
  const rows: Array<PrintSideTask | null> = [
    ...visible,
    ...Array.from({ length: Math.max(0, PAGE_TASK_ROWS - visible.length) }, () => null),
  ];

  return (
    <section className="sb-side-task-register">
      <GoldenSectionHeader label="SIDE TASKS / PROJECTS" />
      <div className="sb-side-task-table">
        <div className="sb-side-task-table-header">
          <span>#</span>
          <span>TASK / PROJECT</span>
          <span>ASSIGNED TO</span>
          <span className="is-centered">COMPLETED</span>
          <span>COMPLETED BY</span>
          <span>TIME</span>
        </div>
        {rows.map((task, index) => (
          <div key={task?.id ?? `blank-${index}`} className="sb-side-task-table-row">
            <span className="sb-side-task-index">{index + 1}</span>
            <span className="sb-side-task-title">{task?.title ?? ""}</span>
            <span className={`sb-side-task-assignee ${task && !task.assigneeName ? "is-open" : ""}`}>
              {task ? task.assigneeName ?? "OPEN WORK" : ""}
            </span>
            <span className="sb-side-task-completed-cell">
              <CompletedCheckbox completed={task?.completed === true} />
            </span>
            <span>{task?.completedByName ?? ""}</span>
            <span className="sb-side-task-time">{task ? formatCompletedTime(task.completedAt) : ""}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotesChangesBand({ notes }: { notes?: string }) {
  return (
    <section className="sb-graves-notes-band">
      <div className="sb-graves-notes-label">NOTES / CHANGES</div>
      <div className="sb-graves-notes-lines">
        {notes?.trim() ? <div className="sb-graves-notes-prefill">{notes.trim()}</div> : null}
        <div />
        <div />
      </div>
    </section>
  );
}

function OfficialOverlapCard({ slot }: { slot: PrintOverlapRow["slots"][number] }) {
  const accent = getOverlapAccent(slot.key);
  const regularTasks = slot.tasks.filter((task) => !task.isCoverage);
  const open = !slot.tmName?.trim();
  return (
    <div
      className={`assignment-card sb-assignment-card sb-graves-overlap-card ${open ? "empty sb-card-empty" : ""}`}
      style={{ ["--card-accent" as string]: accent }}
      data-slot-key={slot.key}
    >
      <div
        className={`sb-graves-overlap-accent ${isGoldAccent(accent) ? "sb-accent-stripe--gold" : ""}`}
        style={{ background: accent }}
      />
      <div className="sb-graves-overlap-body">
        <div
          className={`sb-graves-overlap-name ${open ? "is-open" : ""}`}
          style={{ color: open ? cardAccentInk(accent) : undefined }}
        >
          {slot.tmName || "OPEN WORK"}
        </div>
        <GoldenTaskList tasks={regularTasks} hasTM={!open} dense />
      </div>
    </div>
  );
}

function OfficialOverlapsSection({ rows }: { rows: PrintOverlapRow[] }) {
  return (
    <section className="overlaps-section sb-graves-overlaps-section">
      <GoldenSectionHeader label="OVERLAPS" />
      <div className="sb-graves-overlap-rows">
        {rows.map((row) => (
          <div key={row.key} className="sb-graves-overlap-row">
            <div className="sb-graves-overlap-row-meta">
              <span className="sb-graves-overlap-date" style={{ color: row.headerColor }}>
                {row.dateNum}
              </span>
              <span className="sb-graves-overlap-day">{row.dayName}</span>
              <span className="sb-graves-overlap-time">{row.time}</span>
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
  includeShiftNotes = true,
}: Omit<PrintPreviewPageProps, "view">) {
  return (
    <div className="print-artboard sb-graves-sheet" data-print-view="breaks" data-print-variant="official">
      <GravesZoneSheetHeader
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        pageLabel="TASKS & OVERLAPS"
        printedAt={printedAt}
        includeTimestamp={includeTimestamp}
      />
      <div className={`sb-graves-tasks-body ${includeShiftNotes ? "" : "sb-graves-tasks-body--no-notes"}`.trim()}>
        <SideTaskRegister tasks={snapshot.sideTasks ?? []} />
        {includeShiftNotes ? <NotesChangesBand notes={snapshot.notes} /> : null}
        <OfficialOverlapsSection rows={buildOverlapRows(snapshot)} />
      </div>
    </div>
  );
}

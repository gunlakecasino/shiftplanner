import React from "react";
import {
  AUX_ROLE_COLORS,
  RR_DEFS,
  ZONE_DEFS,
  ZONE_VISUAL_ORDER,
  cardAccentInk,
  getOverlapAccent,
  getRRAccent,
  getZoneColor,
} from "@/lib/shiftbuilder/constants";
import {
  buildCoveredByIndex,
  formatCoverageSideLabel,
  getSlotCoverageLabel,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";
import type { PrintSideTask } from "@/lib/shiftbuilder/printSideTasks";
import { buildOverlapRows } from "./buildPrintDaySnapshot";
import type { PrintDaySnapshot, PrintOverlapRow, PrintPreviewPageProps } from "./printPreviewTypes";

const PAGE_TASK_ROWS = 8;
const PAGE_ONE_TASK_PREVIEW = 3;

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
  return `AS OF ${day} - ${time}`;
}

const APPROVED_ACCENT_INK: Record<string, string> = {
  "#ffcc00": "#7a5a00",
  "#ff3b30": "#b42318",
  "#ff2d55": "#a90e3d",
  "#007aff": "#0057b8",
  "#a2845e": "#6f5438",
  "#34c759": "#176b32",
};

function approvedAccentInk(accent: string): string {
  return APPROVED_ACCENT_INK[accent.toLowerCase()] ?? cardAccentInk(accent);
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
      <div className="sb-approved-as-of">
        <span>AS OF</span>
        <strong>{includeTimestamp && printedAt ? formatAsOf(printedAt).replace(/^AS OF\s+/, "") : ""}</strong>
      </div>
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
          <span className="sb-side-task-summary-link">{active.length} ACTIVE - P2</span>
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
          <div className="sb-side-task-summary-overflow">+{active.length - 2} MORE ON PAGE 2</div>
        ) : null}
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
  auxDefs: PrintDaySnapshot["auxDefs"],
): string {
  if (targetKey.startsWith("Z") && entry.side) {
    return `ZONE ${formatCoverageSideLabel(targetKey, entry.side)}`;
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
      const label = coverageFooterLabel(targetKey, entry, auxDefs);
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
  blankWhenEmpty = true,
}: {
  slotKey: string;
  label: string;
  accent: string;
  snapshot: PrintDaySnapshot;
  coveredBy?: CoveredByEntry[];
  coverageTargets?: string[];
  compact?: boolean;
  blankWhenEmpty?: boolean;
}) {
  const assignment = snapshot.assignments[slotKey] ?? {};
  const isCovered = !assignment.tmName?.trim() && coveredBy.length > 0;
  const names = assignment.tmName?.trim()
    ? [assignment.tmName.trim()]
    : coveredBy.map((entry) =>
        entry.side ? `${formatCoverageSideLabel(slotKey, entry.side)} ${entry.tmName}` : entry.tmName,
      );
  const breakGroup = assignment.tmName?.trim()
    ? assignment.breakGroup
    : coveredBy.length === 1
      ? snapshot.assignments[coveredBy[0].sourceKey]?.breakGroup
      : 0;
  const tasks = taskLabels(snapshot, slotKey);
  const empty = names.length === 0;
  const showOpenWork = empty && !blankWhenEmpty && tasks.length > 0;
  const footer = coverageTargets.join(" / ");
  const footerText =
    footer === "ZONE 9 SMOKING ROOM" ? `AND ${footer}` : `ALSO COVERS ${footer}`;
  const dense =
    !!footer &&
    (tasks.length >= (compact ? 3 : 4) || (names.length > 1 && tasks.length >= 2));
  const ink = approvedAccentInk(accent);

  return (
    <div
      className={`sb-approved-assignment-card ${compact ? "is-compact" : ""} ${dense ? "is-dense" : ""} ${isCovered ? "is-covered" : ""} ${showOpenWork ? "is-open-work" : ""} ${footer ? "has-footer" : ""}`.trim()}
      style={{ ["--approved-accent" as string]: accent, ["--approved-ink" as string]: ink }}
      data-slot-key={slotKey}
    >
      <div className="sb-approved-card-accent" />
      <div className="sb-approved-card-header">
        <span>{label}</span>
        {breakGroup && names.length === 1 ? <span className="sb-approved-break-pill">B{breakGroup}</span> : null}
      </div>
      <div className="sb-approved-card-body">
        {showOpenWork ? <span className="sb-approved-open-work">OPEN WORK</span> : null}
        {names.length > 0 ? (
          <div className={`sb-approved-card-names ${names.length > 1 ? "is-multiple" : ""}`}>
            {names.map((name) => <div key={name}>{name}</div>)}
          </div>
        ) : null}
        {tasks.length > 0 ? (
          <div className="sb-approved-card-tasks">
            {tasks.map((task, index) => <div key={`${task}-${index}`}>- {task}</div>)}
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
  const zoneAssigned = ZONE_DEFS.filter(
    (def) => snapshot.assignments[def.key]?.tmName || coveredByIndex[def.key]?.length,
  ).length;
  const restroomAssigned = RR_DEFS.reduce(
    (count, def) =>
      count +
      (snapshot.assignments[`WRR${def.num}`]?.tmName || coveredByIndex[`WRR${def.num}`]?.length ? 1 : 0) +
      (snapshot.assignments[`MRR${def.num}`]?.tmName || coveredByIndex[`MRR${def.num}`]?.length ? 1 : 0),
    0,
  );
  const auxDefs = snapshot.auxDefs
    .filter((def) => def.role !== "blank" || !!def.label?.trim())
    .slice(0, 3);
  const auxAssigned = auxDefs.filter(
    (def) => snapshot.assignments[def.key]?.tmName || coveredByIndex[def.key]?.length,
  ).length;

  return (
    <div className="print-artboard sb-graves-sheet" data-print-view="deployment" data-print-variant="official">
      <GravesZoneSheetHeader
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        pageLabel="ASSIGNMENTS"
        printedAt={printedAt}
        includeTimestamp={includeTimestamp}
      />
      <div className="sb-approved-deployment-body">
        <section className="sb-approved-zones-section">
          <ApprovedSectionHeader label="ZONES" count={zoneAssigned} />
          <div className="sb-approved-zones-grid">
            {ZONE_VISUAL_ORDER.map((slotKey) => (
              <ApprovedAssignmentCard
                key={slotKey}
                slotKey={slotKey}
                label={`ZONE ${slotKey.slice(1)}`}
                accent={getZoneColor(slotKey)}
                snapshot={snapshot}
                coveredBy={coveredByIndex[slotKey]}
                coverageTargets={coverageTargetsBySource[slotKey]}
              />
            ))}
          </div>
        </section>

        <section className="sb-approved-restrooms-section">
          <ApprovedSectionHeader label="RESTROOMS" count={restroomAssigned} />
          <div className="sb-approved-restrooms-grid">
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
                blankWhenEmpty={def.role === "admin" || def.role === "z9sr"}
              />
            ))}
            <SideTasksSummaryCard tasks={snapshot.sideTasks ?? []} />
          </div>
        </section>
      </div>
      <div className="sb-approved-footer">
        <span>SHEETBUILDER - GLCR GRAVE SHIFT</span>
        <span>PAGE 1 OF 2</span>
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
      <ApprovedStatusHeader
        label="SIDE TASKS / PROJECTS"
        statuses={[
          { label: "CAPACITY", count: PAGE_TASK_ROWS },
          { label: "ENTRIES", count: visible.length },
          { label: "OPEN WORK", count: visible.filter((task) => !task.assigneeName && !task.completed).length, tone: "open" },
        ]}
      />
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
  const assigned = !!slot.tmName?.trim();
  const openWork = !assigned && regularTasks.length > 0;
  const available = !assigned && regularTasks.length === 0;
  return (
    <div
      className={`sb-graves-overlap-card ${openWork ? "is-open-work" : ""} ${available ? "is-available" : ""}`.trim()}
      style={{ ["--card-accent" as string]: accent }}
      data-slot-key={slot.key}
    >
      <div className="sb-graves-overlap-accent" style={{ background: openWork ? "#a16207" : accent }} />
      <div className="sb-graves-overlap-body">
        {available ? (
          <div className="sb-graves-overlap-available">
            <strong>AVAILABLE</strong>
            <span>NO WORK ASSIGNED</span>
          </div>
        ) : (
          <>
            <div className={`sb-graves-overlap-name ${openWork ? "is-open" : ""}`}>
              {slot.tmName || "OPEN WORK"}
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
  const assigned = slots.filter((slot) => slot.tmName?.trim()).length;
  const openWork = slots.filter((slot) => !slot.tmName?.trim() && slot.tasks.some((task) => !task.isCoverage)).length;
  const available = slots.length - assigned - openWork;
  return (
    <section className="overlaps-section sb-graves-overlaps-section">
      <ApprovedStatusHeader
        label="OVERLAP COVERAGE"
        statuses={[
          { label: "ASSIGNED", count: assigned },
          { label: "OPEN WORK", count: openWork, tone: "open" },
          { label: "AVAILABLE", count: available, tone: "available" },
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
        <OfficialOverlapsSection rows={buildOverlapRows(snapshot)} snapshot={snapshot} />
      </div>
      <div className="sb-approved-footer">
        <span>SHEETBUILDER - GLCR GRAVE SHIFT</span>
        <span>PAGE 2 OF 2</span>
      </div>
    </div>
  );
}

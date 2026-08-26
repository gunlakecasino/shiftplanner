import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  ZONE_DEFS,
  RR_DEFS,
  ZONE_VISUAL_ORDER,
  ZONE_ICONS,
  RR_ICONS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  getAuxIcon,
  cardAccentInk,
  isGoldAccent,
  coverageBarBg,
  getOverlapAccent,
  overlapSlotLabel,
  COVERAGE_BAR_FONT_SIZE_PRINT,
  COVERAGE_BAR_H,
  BREAK_GROUP_FILTERS,
  BREAK_GROUP_OVERLAPS,
  breakGroupLabel,
  breakHeaderMark,
} from "@/lib/shiftbuilder/constants";
import type { PrintTaskLine } from "./printPreviewTypes";
import { TaskMarkerLabel } from "../components/TaskMarkerLabel";
import { TASK_LABEL_COLOR, TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import {
  taskHierarchyDepth,
  taskHierarchyFontSizePx,
} from "@/lib/shiftbuilder/taskHierarchy";
import {
  formatCoverageSideLabel,
  formatSecondaryZonePrimaryLabel,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";
import { CoveredByPrintLabel } from "@/app/shiftbuilder/components/assignmentCardChrome";
import { DropZonesCard } from "@/app/shiftbuilder/components/DropZonesCard";
import {
  resolveDropZones,
  type DropZonesResolution,
} from "@/lib/shiftbuilder/dropZones";
import {
  EDITABLE_PDF_TM_SOURCE_ATTR,
  EditablePdfTmFieldAnchor,
} from "./editablePdfFields";
import { AsOfTimestamp } from "./AsOfTimestamp";
import { buildOfficialTaskRows } from "./officialZoneRowLayout";
import { trailLabelMatchesSlotKey } from "@/lib/shiftbuilder/rotation/placementPadHelpers";
import { CardVectorMark } from "../components/CardVectorMark";
import { parseCardVector, type CardVector } from "@/lib/shiftbuilder/cardVectors";

type CoveredScale = "zone" | "rr" | "aux";

function GoldenCardVector({ vector }: { vector?: CardVector | null }) {
  const parsed = parseCardVector(vector);
  if (!parsed) return null;
  return (
    <div className="sb-golden-card-vector">
      <CardVectorMark vector={parsed} size="golden" />
    </div>
  );
}

function GoldenCoveredByBlock({
  coveredBy,
  targetSlotKey,
  scale,
}: {
  coveredBy: CoveredByEntry[];
  targetSlotKey?: string;
  scale: CoveredScale;
}) {
  const zoneRows =
    scale === "zone" && targetSlotKey
      ? coveredBy.map((entry) => ({
          name:
            coveredBy.length > 1 && entry.side
              ? `${formatCoverageSideLabel(targetSlotKey, entry.side)} ${entry.tmName}`
              : entry.tmName,
          primaryZoneLabel: formatSecondaryZonePrimaryLabel(
            targetSlotKey,
            entry.sourceKey,
          ),
        }))
      : [];
  const showPrimaryZoneContext = zoneRows.some(
    (row) => row.primaryZoneLabel !== null,
  );

  if (showPrimaryZoneContext) {
    return (
      <div className="sb-golden-covered-zone-lines">
        {zoneRows.map((row) => (
          <div
            key={`${row.name}-${row.primaryZoneLabel ?? ""}`}
            className="sb-golden-covered-zone-line"
          >
            <span className="sb-golden-covered-zone-name">{row.name}</span>
            {row.primaryZoneLabel ? (
              <span className="sb-golden-covered-zone-primary">
                {row.primaryZoneLabel}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <CoveredByPrintLabel
      coveredBy={coveredBy}
      targetSlotKey={targetSlotKey}
      scale={scale}
    />
  );
}

const WEEK_LETTERS = ["F", "S", "S", "M", "T", "W", "T"] as const;

export function GoldenBreakPill({ value }: { value: number }) {
  const isOff = value === 0;
  const isOl = value === BREAK_GROUP_OVERLAPS;
  return (
    <span
      className={`sb-golden-break-num shrink-0 select-none leading-none tabular-nums inline-flex items-center justify-center rounded-full ${
        isOff ? "sb-golden-break-num--off" : "sb-golden-break-num--on"
      } ${isOl ? "sb-golden-break-num--ol" : ""}`}
      style={{
        fontFamily: "var(--font-atkinson)",
        minWidth: isOl ? 25 : 19,
        height: 16,
        padding: isOl ? "0 5px" : "0 4px",
        background: isOff ? "#ECECEF" : "#1C1C1E",
        color: isOff ? "#8E8E93" : "#FFFFFF",
        border: isOff ? "1px solid #D1D1D6" : "1px solid #1C1C1E",
        fontSize: isOl ? 8.5 : 9.5,
        fontWeight: 800,
      }}
      aria-hidden={isOff}
    >
      {breakHeaderMark(value)}
    </span>
  );
}

export function GoldenTaskRow({
  task,
  hasTM,
  slotKey,
}: {
  task: PrintTaskLine;
  hasTM: boolean;
  slotKey?: string;
}) {
  const textColor = hasTM ? TASK_LABEL_COLOR.primary : TASK_LABEL_COLOR.secondary;
  const hierarchyDepth = slotKey ? taskHierarchyDepth(slotKey, task.label) : 0;
  const fontSizePx = taskHierarchyFontSizePx(
    task.textStyle?.fontSizePx ?? TASK_LABEL_SIZE_PX.print,
    hierarchyDepth,
  );
  const renderedTextStyle = task.textStyle?.fontSizePx
    ? { ...task.textStyle, fontSizePx: undefined }
    : task.textStyle;
  return (
    <div
      className="sb-list-row relative flex items-start gap-1.5 rounded px-1 -mx-0.5 py-0 leading-[1.05]"
      data-task-depth={hierarchyDepth || undefined}
      style={{ fontSize: fontSizePx }}
    >
      <div data-task-label className="min-w-0 flex-1 leading-[1.05]">
        <TaskMarkerLabel
          label={task.label}
          color={task.color}
          markerType={task.markerType}
          textStyle={renderedTextStyle}
          isPrintPreview
          fontSize={`${fontSizePx}px`}
          textColor={textColor}
          className="block rounded-sm font-bold py-px min-w-0 max-w-full"
          // Wrap overflow onto a new indented line (no "…"). Matches builder hanging indent.
          hanging={{ textIndent: "-1em", paddingLeft: "1em" }}
        />
      </div>
    </div>
  );
}

export function GoldenTaskList({
  tasks,
  hasTM,
  slotKey,
  dense = false,
}: {
  tasks: PrintTaskLine[];
  hasTM: boolean;
  slotKey?: string;
  dense?: boolean;
}) {
  if (!tasks.length) return null;
  const textColor = hasTM
    ? `text-[${TASK_LABEL_COLOR.primary}]`
    : `text-[${TASK_LABEL_COLOR.secondary}]`;
  const fontSize = dense
    ? `var(--sb-print-task-dense-px, ${TASK_LABEL_SIZE_PX.printDense}px)`
    : `var(--sb-print-task-px, ${TASK_LABEL_SIZE_PX.print}px)`;
  const rowPlan = buildOfficialTaskRows(
    slotKey,
    tasks.map((task) => task.label),
  );
  const taskRows = rowPlan.map((row, rowIndex) => {
    const taskIndex = rowPlan
      .slice(0, rowIndex)
      .reduce((count, precedingRow) => count + precedingRow.tasks.length, 0);
    return tasks.slice(taskIndex, taskIndex + row.tasks.length);
  });

  return (
    <div
      className={`sb-golden-task-list flex flex-col justify-start shrink-0 ${dense ? "sb-golden-task-list--dense" : ""} ${textColor}`}
      style={{
        fontFamily: "var(--font-atkinson)",
        fontSize,
        fontWeight: "var(--sb-print-task-weight, 700)",
        lineHeight: "var(--sb-print-task-leading, 1.15)",
        gap: "var(--sb-print-task-gap, 2px)",
        // Content-sized: cards/rows grow so every task prints (no min-h-0 clip).
        minHeight: "auto",
        overflow: "visible",
      }}
    >
      {taskRows.map((rowTasks, rowIndex) => {
        if (rowTasks.length === 1) {
          const task = rowTasks[0];
          return (
            <GoldenTaskRow
              key={task.id}
              task={task}
              hasTM={hasTM}
              slotKey={slotKey}
            />
          );
        }
        return (
          <div
            key={`${rowTasks.map((task) => task.id).join("|")}-${rowIndex}`}
            className="sb-golden-subtask-row"
          >
            {rowTasks.map((task) => (
              <GoldenTaskRow
                key={task.id}
                task={task}
                hasTM={hasTM}
                slotKey={slotKey}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function GoldenPlacementTrail({
  labels,
  matchSlotKey,
}: {
  labels?: string[];
  matchSlotKey?: string;
}) {
  const recent = labels?.slice(0, 3) ?? [];
  if (recent.length === 0) return null;

  return (
    <div
      className="sb-golden-placement-trail"
      aria-label={`Recent placements: ${recent.join(", ")}`}
      title={`Last ${recent.length} placements (newest first): ${recent.join(" → ")}`}
    >
      {recent.map((label, index) => {
        const isRepeat = Boolean(
          matchSlotKey && trailLabelMatchesSlotKey(label, matchSlotKey),
        );
        return (
          <React.Fragment key={`${label}-${index}`}>
            {index > 0 ? <span aria-hidden>·</span> : null}
            <span
              className={`sb-golden-placement-trail-item ${isRepeat ? "is-repeat" : ""}`.trim()}
              data-placement-repeat={isRepeat ? "true" : undefined}
            >
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function GoldenCoverageBar({
  label,
  color,
  offset = 0,
  roundedBottom = true,
}: {
  label: string;
  color: string;
  offset?: number;
  roundedBottom?: boolean;
}) {
  const bg = coverageBarBg(color || "#6B7280");
  const displayLabel = /^and\s+/i.test(label)
    ? `Also covers ${label.replace(/^and\s+/i, "")}`
    : label;
  return (
    <div
      className="sb-coverage-bar group flex items-center justify-between px-2 select-none"
      style={{
        position: "absolute",
        bottom: offset,
        left: 0,
        right: 0,
        background: bg,
        borderRadius: roundedBottom ? "0 0 3px 3px" : 0,
        paddingTop: 3,
        paddingBottom: 3,
        zIndex: 2,
        borderTop: "1px solid rgba(255,255,255,0.25)",
        height: COVERAGE_BAR_H,
        minHeight: COVERAGE_BAR_H,
      }}
      title={displayLabel}
    >
      <span
        className="text-white font-extrabold uppercase tracking-[0.6px] leading-none truncate"
        style={{
          fontSize: "var(--sb-print-coverage-font-px, " + COVERAGE_BAR_FONT_SIZE_PRINT + "px)",
          fontFamily: "var(--font-atkinson)",
        }}
      >
        {displayLabel}
      </span>
    </div>
  );
}

function GoldenCoverageStack({
  tasks,
  color,
}: {
  tasks: PrintTaskLine[];
  color: string;
}) {
  const coverageTasks = tasks.filter((t) => t.isCoverage);
  if (!coverageTasks.length) return null;
  return (
    <>
      {coverageTasks.map((task, index) => (
        <GoldenCoverageBar
          key={task.id}
          label={task.label}
          color={color}
          offset={index * COVERAGE_BAR_H}
          roundedBottom={index === 0}
        />
      ))}
    </>
  );
}

export function toTaskLines(
  tasks: NightSlotTask[] | PrintTaskLine[] | undefined,
  options?: { omitDefaultTasks?: boolean },
): PrintTaskLine[] {
  const lines = (tasks ?? []).map((t) => ({
    id: t.id,
    label: "taskLabel" in t ? t.taskLabel : t.label,
    color: t.color ?? null,
    markerType: ("markerType" in t ? t.markerType : null) ?? null,
    textStyle: "textStyle" in t ? t.textStyle ?? null : null,
    isCoverage: Boolean(t.isCoverage),
  }));
  if (options?.omitDefaultTasks) {
    return lines.filter((line) => line.isCoverage);
  }
  return lines;
}

export function GoldenZoneCard({
  slotKey,
  tmName,
  breakGroup = 0,
  tasks,
  empty,
  coveredBy,
  placementTrail,
  cardVector,
  suppressBreakPill = false,
  showEmptyLabel = true,
  showTasksWhenEmpty = true,
  onClick,
  onMouseDown,
  onContextMenu,
  ...rest
}: {
  slotKey: string;
  tmName?: string | null;
  breakGroup?: number;
  tasks: PrintTaskLine[];
  empty?: boolean;
  coveredBy?: CoveredByEntry[];
  placementTrail?: string[];
  cardVector?: CardVector | null;
  suppressBreakPill?: boolean;
  showEmptyLabel?: boolean;
  showTasksWhenEmpty?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const def = ZONE_DEFS.find((d) => d.key === slotKey)!;
  const color = getZoneColor(slotKey);
  const ink = cardAccentInk(color);
  const icon = ZONE_ICONS[slotKey] ?? "●";
  const isEmpty = empty || !tmName?.trim();
  const isCovered = isEmpty && Boolean(coveredBy?.length);
  const regular = tasks.filter((t) => !t.isCoverage);
  const coverageCount = tasks.filter((t) => t.isCoverage).length;
  const coveragePad = coverageCount > 0 ? coverageCount * COVERAGE_BAR_H + 8 : 12;
  const hasEditableTmField = Boolean(tmName?.trim()) || !coveredBy?.length;

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col h-full rounded-[3px] ${
        isEmpty ? "empty sb-card-empty" : ""
      } ${isCovered ? "covered sb-card-covered" : ""}`}
      style={{ ["--card-accent" as string]: color }}
      data-slot-key={slotKey}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      {...rest}
    >
      <div
        className={`h-[3px] w-full shrink-0 ${isGoldAccent(color) ? "sb-accent-stripe--gold" : ""}`}
        style={{ background: color }}
      />
      <div
        className="flex items-center justify-between gap-1 px-2 pt-1.5 pb-1.5"
        style={{ borderBottom: `1px solid ${color}22` }}
      >
        <div className="flex items-center gap-1.5 leading-none min-w-0" style={{ color: ink }}>
          <span className="text-[12px] leading-none">{icon}</span>
          <span
            className="font-extrabold tracking-[0.4px] uppercase truncate"
            style={{
              fontSize: 10.5,
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
            }}
          >
            {def.label}
          </span>
        </div>
        {!isEmpty && !suppressBreakPill ? <GoldenBreakPill value={breakGroup} /> : null}
      </div>
      <div
        className="sb-golden-card-body relative flex flex-col flex-1 min-h-0 px-3 pt-2"
        style={{ paddingBottom: coveragePad }}
      >
        {hasEditableTmField ? (
          <EditablePdfTmFieldAnchor
            slotKey={slotKey}
            value={tmName}
            fontSizePx={21}
            style={{ left: 12, right: 12, top: 7, height: 26 }}
          />
        ) : null}
        {isEmpty ? (
          coveredBy && coveredBy.length > 0 ? (
            <GoldenCoveredByBlock coveredBy={coveredBy} targetSlotKey={slotKey} scale="zone" />
          ) : showEmptyLabel ? (
            <div
              className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] px-1 py-[1px]"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
            >
              <span className="sb-unassigned-primary">— Unassigned —</span>
            </div>
          ) : null
        ) : (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.35px] text-[#111] truncate px-1 py-[1px] inline-block"
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
              style={{
                fontSize: 21,
                lineHeight: 1,
                fontFamily: "var(--font-atkinson)",
                fontWeight: 700,
              }}
            >
              {tmName}
            </span>
            <GoldenCardVector vector={cardVector} />
            <GoldenPlacementTrail labels={placementTrail} matchSlotKey={slotKey} />
            <GoldenTaskList tasks={regular} hasTM slotKey={slotKey} />
          </>
        )}
        {isEmpty ? <GoldenCardVector vector={cardVector} /> : null}
        {isEmpty && showTasksWhenEmpty && regular.length > 0 ? (
          <GoldenTaskList tasks={regular} hasTM={isCovered} slotKey={slotKey} />
        ) : null}
      </div>
      <GoldenCoverageStack tasks={tasks} color={color} />
    </div>
  );
}

export function GoldenRRSide({
  slotKey,
  headerLabel,
  icon,
  accentColor,
  tmName,
  breakGroup,
  tasks,
  empty,
  coveredBy,
  placementTrail,
  cardVector,
  suppressBreakPill = false,
  showEmptyLabel = true,
  showTasksWhenEmpty = true,
}: {
  slotKey: string;
  headerLabel: string;
  icon: string;
  accentColor: string;
  tmName?: string | null;
  breakGroup: number;
  tasks: PrintTaskLine[];
  empty: boolean;
  coveredBy?: CoveredByEntry[];
  placementTrail?: string[];
  cardVector?: CardVector | null;
  suppressBreakPill?: boolean;
  showEmptyLabel?: boolean;
  showTasksWhenEmpty?: boolean;
}) {
  const regular = tasks.filter((t) => !t.isCoverage);
  const coverageCount = tasks.filter((t) => t.isCoverage).length;
  const coveragePad = coverageCount > 0 ? coverageCount * COVERAGE_BAR_H + 8 : 6;
  const isEmpty = empty || !tmName?.trim();
  const ink = cardAccentInk(accentColor);
  const hasEditableTmField = Boolean(tmName?.trim()) || !coveredBy?.length;

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col rounded-[3px] h-full ${
        isEmpty ? "empty sb-card-empty" : ""
      }`}
      style={{ ["--card-accent" as string]: accentColor }}
      data-slot-key={slotKey}
    >
      <div
        className={`h-[3px] w-full shrink-0 ${isGoldAccent(accentColor) ? "sb-accent-stripe--gold" : ""}`}
        style={{ background: accentColor }}
      />
      <div
        className="flex items-center justify-between gap-1 px-2 pt-0.5 pb-0.5 leading-none"
        style={{ color: ink, borderBottom: `1px solid ${accentColor}33` }}
      >
        <div className="flex items-center gap-1 leading-none min-w-0" style={{ color: ink }}>
          <span className="text-[11px] leading-none">{icon}</span>
          <span
            className="font-extrabold tracking-[0.4px] uppercase truncate"
            style={{
              fontSize: 10.5,
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
            }}
          >
            {headerLabel}
          </span>
        </div>
        {!isEmpty && !suppressBreakPill ? <GoldenBreakPill value={breakGroup} /> : null}
      </div>
      <div
        className="sb-golden-card-body relative flex flex-col flex-1 min-h-0 px-2 pt-1.5"
        style={{ paddingBottom: coveragePad }}
      >
        {hasEditableTmField ? (
          <EditablePdfTmFieldAnchor
            slotKey={slotKey}
            value={tmName}
            fontSizePx={18}
            style={{ left: 8, right: 8, top: 5, height: 22 }}
          />
        ) : null}
        {isEmpty ? (
          coveredBy && coveredBy.length > 0 ? (
            <GoldenCoveredByBlock coveredBy={coveredBy} targetSlotKey={slotKey} scale="rr" />
          ) : showEmptyLabel ? (
            <div
              className="unassigned-label text-[10.5px] tracking-[0.3px] px-1 py-[1px]"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
            >
              <span className="sb-unassigned-primary">— Unassigned —</span>
            </div>
          ) : null
        ) : (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.3px] text-[#111] truncate px-1 py-[1px] inline-block"
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
              style={{
                fontSize: 18,
                lineHeight: 1.02,
                fontFamily: "var(--font-atkinson)",
                fontWeight: 700,
              }}
            >
              {tmName}
            </span>
            <GoldenCardVector vector={cardVector} />
            <GoldenPlacementTrail labels={placementTrail} matchSlotKey={slotKey} />
          </>
        )}
        {isEmpty ? <GoldenCardVector vector={cardVector} /> : null}
        {!isEmpty || showTasksWhenEmpty ? (
          <GoldenTaskList tasks={regular} hasTM={!isEmpty} dense />
        ) : null}
      </div>
      <GoldenCoverageStack tasks={tasks} color={accentColor} />
    </div>
  );
}

export function GoldenRRColumn({
  rrNum,
  wAssignment,
  mAssignment,
  wTasks,
  mTasks,
  coveredByIndex = {},
  cardVectorW,
  cardVectorM,
}: {
  rrNum: number;
  wAssignment: { tmName?: string | null; breakGroup?: number };
  mAssignment: { tmName?: string | null; breakGroup?: number };
  wTasks: PrintTaskLine[];
  mTasks: PrintTaskLine[];
  coveredByIndex?: Record<string, CoveredByEntry[]>;
  cardVectorW?: CardVector | null;
  cardVectorM?: CardVector | null;
}) {
  const def = RR_DEFS.find((r) => r.num === rrNum)!;
  const color = getRRAccent(rrNum);
  const icon = RR_ICONS[rrNum] ?? "●";
  const wKey = `WRR${rrNum}`;
  const mKey = `MRR${rrNum}`;
  const wEmpty = !wAssignment.tmName;
  const mEmpty = !mAssignment.tmName;

  return (
    <div
      className={`relative overflow-hidden grid grid-rows-2 gap-1 h-full ${wEmpty && mEmpty ? "empty" : ""}`}
      style={{ ["--card-accent" as string]: color }}
      data-slot-key={`RR${rrNum}`}
    >
      <GoldenRRSide
        slotKey={wKey}
        headerLabel={`${def.label} WOMEN'S`}
        icon={icon}
        accentColor={color}
        tmName={wAssignment.tmName}
        breakGroup={wAssignment.breakGroup ?? 0}
        tasks={wTasks}
        empty={wEmpty}
        coveredBy={coveredByIndex[wKey]}
        cardVector={cardVectorW}
      />
      <GoldenRRSide
        slotKey={mKey}
        headerLabel={`${def.label} MEN'S`}
        icon={icon}
        accentColor={color}
        tmName={mAssignment.tmName}
        breakGroup={mAssignment.breakGroup ?? 0}
        tasks={mTasks}
        empty={mEmpty}
        coveredBy={coveredByIndex[mKey]}
        cardVector={cardVectorM}
      />
    </div>
  );
}

/** Two-row RR grid: women's row then men's — equalizes heights across columns. */
export function GoldenRRPrintGrid({
  assignments,
  tasksBySlot,
  coveredByIndex = {},
  suppressBreakPillKeys,
  showEmptyLabels = true,
  showTasksWhenEmpty = true,
  placementTrailsByTmId = {},
  cardVectors = {},
  omitDefaultTasks = false,
}: {
  assignments: Record<string, { tmId?: string; tmName?: string | null; breakGroup?: number }>;
  tasksBySlot: Record<string, NightSlotTask[] | PrintTaskLine[] | undefined>;
  coveredByIndex?: Record<string, CoveredByEntry[]>;
  suppressBreakPillKeys?: Set<string>;
  showEmptyLabels?: boolean;
  showTasksWhenEmpty?: boolean;
  placementTrailsByTmId?: Record<string, string[]>;
  cardVectors?: Record<string, CardVector>;
  omitDefaultTasks?: boolean;
}) {
  const toLines = (key: string): PrintTaskLine[] =>
    toTaskLines(tasksBySlot[key] as NightSlotTask[] | PrintTaskLine[] | undefined, {
      omitDefaultTasks,
    });

  return (
    <>
      {RR_DEFS.map((def) => {
        const wKey = `WRR${def.num}`;
        const a = assignments[wKey] || {};
        const color = getRRAccent(def.num);
        const icon = RR_ICONS[def.num] ?? "●";
        return (
          <div key={wKey} className="relative h-full min-h-0 flex flex-col" data-slot-key={wKey}>
            <GoldenRRSide
              slotKey={wKey}
              headerLabel={`${def.label} WOMEN'S`}
              icon={icon}
              accentColor={color}
              tmName={a.tmName}
              breakGroup={a.breakGroup ?? 0}
              tasks={toLines(wKey)}
              empty={!a.tmName}
              coveredBy={coveredByIndex[wKey]}
              placementTrail={a.tmId ? placementTrailsByTmId[a.tmId] : undefined}
              cardVector={cardVectors[wKey]}
              suppressBreakPill={suppressBreakPillKeys?.has(wKey)}
              showEmptyLabel={showEmptyLabels}
              showTasksWhenEmpty={showTasksWhenEmpty}
            />
          </div>
        );
      })}
      {RR_DEFS.map((def) => {
        const mKey = `MRR${def.num}`;
        const a = assignments[mKey] || {};
        const color = getRRAccent(def.num);
        const icon = RR_ICONS[def.num] ?? "●";
        return (
          <div key={mKey} className="relative h-full min-h-0 flex flex-col" data-slot-key={mKey}>
            <GoldenRRSide
              slotKey={mKey}
              headerLabel={`${def.label} MEN'S`}
              icon={icon}
              accentColor={color}
              tmName={a.tmName}
              breakGroup={a.breakGroup ?? 0}
              tasks={toLines(mKey)}
              empty={!a.tmName}
              coveredBy={coveredByIndex[mKey]}
              placementTrail={a.tmId ? placementTrailsByTmId[a.tmId] : undefined}
              cardVector={cardVectors[mKey]}
              suppressBreakPill={suppressBreakPillKeys?.has(mKey)}
              showEmptyLabel={showEmptyLabels}
              showTasksWhenEmpty={showTasksWhenEmpty}
            />
          </div>
        );
      })}
    </>
  );
}

export function GoldenAuxCard({
  def,
  tmName,
  breakGroup = 0,
  tasks,
  empty,
  coveredBy,
  placementTrail,
  cardVector,
  suppressBreakPill = false,
  emptyLabel = "— Unassigned —",
  showTasksWhenEmpty = true,
}: {
  def: AuxDef;
  tmName?: string | null;
  breakGroup?: number;
  tasks: PrintTaskLine[];
  empty?: boolean;
  coveredBy?: CoveredByEntry[];
  placementTrail?: string[];
  cardVector?: CardVector | null;
  suppressBreakPill?: boolean;
  /** null leaves an unassigned card visually blank. */
  emptyLabel?: string | null;
  showTasksWhenEmpty?: boolean;
}) {
  const role = def.role ?? "blank";
  const isBlank = role === "blank" && !def.label;
  const color = getAuxAccent(def.key, role);
  const ink = isBlank ? "#9CA3AF" : cardAccentInk(color);
  const icon = getAuxIcon(def.key, role);
  const isEmpty = (empty || !tmName?.trim()) && !isBlank;
  const hasEditableTmField =
    !isBlank && (Boolean(tmName?.trim()) || !coveredBy?.length);
  // Aux cards never show coverage banners (builder AuxCard filters isCoverage out).
  const regular = tasks.filter((t) => !t.isCoverage);
  const bodyPadBottom = 8;

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col h-full rounded-[3px] ${
        isEmpty ? "empty sb-card-empty" : ""
      } ${isBlank ? "sb-aux-blank" : ""}`}
      style={{ ["--card-accent" as string]: color }}
      data-slot-key={def.key}
      data-aux-role={role}
    >
      <div
        className={`h-[3px] w-full shrink-0 ${!isBlank && isGoldAccent(color) ? "sb-accent-stripe--gold" : ""}`}
        style={{ background: isBlank ? "#D1D5DB" : color }}
      />
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${isBlank ? "#E5E7EB" : `${color}33`}` }}
      >
        {isBlank && !def.label ? (
          <div className="flex items-center gap-1 leading-none min-w-0 text-[#9CA3AF]">
            <span className="text-[14px] leading-none shrink-0 font-light">+</span>
            <span
              className="font-semibold tracking-[0.3px] uppercase truncate"
              style={{ fontSize: 9, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              Set role
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color: ink }}>
            <span className="text-[11px] leading-none shrink-0">{icon}</span>
            <span
              className="font-extrabold tracking-[0.4px] uppercase truncate"
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              }}
            >
              {def.label || def.key}
            </span>
          </div>
        )}
        {!isBlank && !isEmpty && !suppressBreakPill ? <GoldenBreakPill value={breakGroup} /> : null}
      </div>
      <div
        className="sb-golden-card-body relative flex flex-col flex-1 min-h-0 px-2 pt-1.5 overflow-visible"
        style={{ paddingBottom: bodyPadBottom }}
      >
        {hasEditableTmField ? (
          <EditablePdfTmFieldAnchor
            slotKey={def.key}
            value={tmName}
            fontSizePx={18}
            style={{ left: 8, right: 8, top: 5, height: 22 }}
          />
        ) : null}
        {isEmpty ? (
          coveredBy && coveredBy.length > 0 ? (
            <GoldenCoveredByBlock coveredBy={coveredBy} targetSlotKey={def.key} scale="aux" />
          ) : emptyLabel ? (
            <div
              className="unassigned-label text-[10.5px] tracking-[0.3px] px-1 py-[1px] flex items-center justify-center flex-1"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
            >
              <span className="sb-unassigned-primary">{emptyLabel}</span>
            </div>
          ) : null
        ) : !isBlank ? (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.35px] text-[#111] truncate px-1 py-[1px] inline-block"
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
              style={{
                fontSize: 18,
                lineHeight: 1.02,
                fontFamily: "var(--font-atkinson)",
                fontWeight: 700,
              }}
            >
              {tmName}
            </span>
            <GoldenCardVector vector={cardVector} />
            <GoldenPlacementTrail labels={placementTrail} matchSlotKey={def.key} />
            <GoldenTaskList tasks={regular} hasTM dense />
          </>
        ) : null}
        {isEmpty ? <GoldenCardVector vector={cardVector} /> : null}
        {isEmpty && showTasksWhenEmpty && regular.length > 0 ? (
          <GoldenTaskList tasks={regular} hasTM={false} dense />
        ) : null}
      </div>
    </div>
  );
}

export function GoldenOverlapSlot({
  slotKey,
  tmName,
  tasks,
  cardVector,
}: {
  slotKey: string;
  tmName?: string | null;
  tasks: PrintTaskLine[];
  cardVector?: CardVector | null;
}) {
  const accent = getOverlapAccent(slotKey);
  const ink = cardAccentInk(accent);
  const label = overlapSlotLabel(slotKey);
  const isEmpty = !tmName?.trim();
  const regular = tasks.filter((t) => !t.isCoverage);
  const coverageCount = tasks.filter((t) => t.isCoverage).length;
  const coveragePad = coverageCount > 0 ? coverageCount * COVERAGE_BAR_H + 8 : 8;

  return (
    <div
      className={`assignment-card sb-assignment-card sb-golden-overlap-card relative overflow-hidden flex flex-col h-full rounded-[3px] ${
        isEmpty ? "empty sb-card-empty" : ""
      }`}
      style={{ ["--card-accent" as string]: accent }}
      data-slot-key={slotKey}
    >
      <div
        className={`h-[3px] w-full shrink-0 ${isGoldAccent(accent) ? "sb-accent-stripe--gold" : ""}`}
        style={{ background: accent }}
      />
      <div
        className="flex items-center gap-1 px-2 pt-1 pb-1 leading-none min-w-0"
        style={{ color: ink, borderBottom: `1px solid ${accent}33` }}
      >
        <span className="text-[10px] leading-none shrink-0">◆</span>
        <span
          className="font-bold tracking-[0.02em] truncate"
          style={{
            fontSize: 9.5,
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="sb-golden-card-body relative flex flex-col flex-1 min-h-0 px-2 pt-1.5"
        style={{ paddingBottom: coveragePad }}
      >
        <EditablePdfTmFieldAnchor
          slotKey={slotKey}
          value={tmName}
          fontSizePx={16}
          style={{ left: 8, right: 8, top: 5, height: 20 }}
        />
        {isEmpty ? (
          <div
            className="unassigned-label text-[9.5px] tracking-[0.3px] px-1 py-[1px] flex items-center justify-center flex-1"
            style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            {...EDITABLE_PDF_TM_SOURCE_ATTR}
          >
            <span className="sb-unassigned-primary">— Unassigned —</span>
          </div>
        ) : (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.3px] text-[#111] truncate px-1 py-[1px] inline-block"
              {...EDITABLE_PDF_TM_SOURCE_ATTR}
              style={{
                fontSize: 16,
                lineHeight: 1.05,
                fontFamily: "var(--font-atkinson)",
                fontWeight: 700,
              }}
            >
              {tmName}
            </span>
            <GoldenCardVector vector={cardVector} />
            <GoldenTaskList tasks={regular} hasTM dense />
          </>
        )}
        {isEmpty ? <GoldenCardVector vector={cardVector} /> : null}
        {isEmpty && regular.length > 0 ? (
          <GoldenTaskList tasks={regular} hasTM={false} dense />
        ) : null}
      </div>
      <GoldenCoverageStack tasks={tasks} color={accent} />
    </div>
  );
}

export function GoldenDeploymentHeader({
  day,
  dayIndex,
  weekDayDefs,
  breakCounts,
  activeBreakGroup = 1,
  printedAt,
  includeTimestamp = true,
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
  breakCounts: Record<1 | 2 | 3 | 4, number>;
  activeBreakGroup?: 1 | 2 | 3 | 4;
  printedAt?: string;
  includeTimestamp?: boolean;
}) {
  return (
    <div className="sheet-header flex-shrink-0 pb-1 mb-1 flex items-stretch justify-between w-full">
      <div className="flex items-end gap-3 min-w-0">
        <div
          className="font-black tabular-nums leading-[0.78] text-[#1C1C1E]"
          style={{
            fontSize: 58,
            letterSpacing: "-3px",
            fontFamily: "var(--font-atkinson)",
          }}
        >
          {day.dateNum}
        </div>
        <div className="-mb-0.5 flex flex-col min-w-0">
          <div
            className="font-bold leading-none"
            style={{
              color: day.color,
              fontSize: 26,
              letterSpacing: "-0.8px",
              fontFamily: "var(--font-atkinson)",
            }}
          >
            {day.name}
          </div>
          <div className="text-[11px] mt-0.5 leading-none text-[#4B5563]">
            {day.monthYear} · Day {dayIndex + 1} of 7
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]"
              style={{ fontFamily: "var(--font-atkinson)" }}
            >
              BREAKS
            </span>
            <div className="flex gap-[2px]">
              {BREAK_GROUP_FILTERS.map((g) => (
                <div
                  key={g}
                  className={`${g === 4 ? "min-w-[16px] px-0.5" : "w-[14px]"} h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums bg-[#1C1C1E] text-white`}
                  style={{ fontFamily: "var(--font-atkinson)" }}
                >
                  {breakCounts[g] > 0 ? breakCounts[g] : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1.5">
        <div className="flex gap-[2px]">
          {weekDayDefs.map((def, i) => {
            const isActive = i === dayIndex;
            return (
              <div
                key={i}
                className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px]"
                style={{
                  background: isActive ? def.color : "transparent",
                  color: isActive ? "#fff" : "#6B7280",
                  fontFamily: "var(--font-atkinson)",
                }}
              >
                {WEEK_LETTERS[i]}
              </div>
            );
          })}
        </div>
        {includeTimestamp && printedAt && (
          <AsOfTimestamp value={printedAt} shiftDay={day} />
        )}
      </div>
    </div>
  );
}

export function GoldenBreaksHeader({
  day,
  dayIndex,
  weekDayDefs,
  breakCounts,
  inRotationCount,
  printedAt,
  includeTimestamp = true,
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
  breakCounts: Record<1 | 2 | 3 | 4, number>;
  inRotationCount: number;
  printedAt?: string;
  includeTimestamp?: boolean;
}) {
  return (
    <div className="sheet-header flex-shrink-0 pb-1 mb-1 flex items-stretch justify-between w-full">
      <div className="flex items-end gap-3 min-w-0">
        <div
          className="font-black tabular-nums leading-[0.78]"
          style={{
            fontSize: 58,
            letterSpacing: "-4px",
            color: "transparent",
            WebkitTextStroke: "1.5px #1C1C1E",
            fontFamily: "var(--font-atkinson)",
          }}
        >
          {day.dateNum}
        </div>
        <div className="-mb-0.5 flex flex-col min-w-0">
          <div
            className="font-bold leading-none text-[#1C1C1E]"
            style={{
              fontSize: 26,
              letterSpacing: "-0.8px",
              fontFamily: "var(--font-atkinson)",
            }}
          >
            Break Sheet
          </div>
          <div className="text-[11px] mt-0.5 leading-none text-[#4B5563]">
            {day.name} · {day.monthYear}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[10px] font-bold tabular-nums text-[#111]">{inRotationCount}</span>
            <span
              className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]"
              style={{ fontFamily: "var(--font-atkinson)" }}
            >
              IN ROTATION
            </span>
            <span
              className="text-[8.5px] font-bold tracking-[1px] ml-1.5 text-[#1C1C1E]"
              style={{ fontFamily: "var(--font-atkinson)" }}
            >
              BREAKS
            </span>
            <div className="flex gap-[2px]">
              {BREAK_GROUP_FILTERS.map((g) => (
                <div
                  key={g}
                  className={`${g === 4 ? "min-w-[16px] px-0.5" : "w-[14px]"} h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums bg-[#1C1C1E] text-white`}
                  style={{ fontFamily: "var(--font-atkinson)" }}
                >
                  {breakCounts[g] > 0 ? breakCounts[g] : ""}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1.5">
        {includeTimestamp && printedAt && (
          <AsOfTimestamp value={printedAt} shiftDay={day} />
        )}
        <div className="flex gap-[2px]">
          {weekDayDefs.map((def, i) => {
            const isActive = i === dayIndex;
            return (
              <div
                key={i}
                className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px]"
                style={{
                  background: isActive ? def.color : "transparent",
                  color: isActive ? "#fff" : "#6B7280",
                  fontFamily: "var(--font-atkinson)",
                }}
              >
                {WEEK_LETTERS[i]}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GoldenShiftNotesBand({
  notes,
  blankLines = 4,
}: {
  notes?: string;
  blankLines?: number;
}) {
  const trimmed = notes?.trim() ?? "";
  return (
    <div
      className="golden-shift-notes-band flex-shrink-0 border border-[#E5E5E7] rounded-[3px] bg-[#FAFAFB] px-2.5 py-1.5"
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      <div className="text-[8px] font-extrabold tracking-[1.2px] uppercase text-[#6B7280] mb-1">
        Shift Notes
      </div>
      {trimmed ? (
        <div className="text-[9px] leading-[1.35] text-[#374151] whitespace-pre-wrap mb-1 max-h-[36px] overflow-hidden">
          {trimmed}
        </div>
      ) : null}
      <div className="space-y-[4px]">
        {Array.from({ length: blankLines }, (_, i) => (
          <div key={i} className="golden-shift-notes-line h-[12px] border-b border-[#D1D5DB]" />
        ))}
      </div>
    </div>
  );
}

function GoldenPlanningNotesColumn({
  label,
  children,
  className = "",
}: {
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`golden-planning-notes-column flex flex-col min-h-0 min-w-0 h-full border-r border-[#E5E5E7] last:border-r-0 ${className}`}
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      <div className="golden-planning-notes-column-header flex-shrink-0 px-2 py-1 border-b border-[#E5E5E7] bg-[#F3F4F6]">
        <span className="text-[8px] font-extrabold tracking-[1.2px] uppercase text-[#6B7280]">
          {label}
        </span>
      </div>
      <div className="golden-planning-notes-column-body flex flex-col flex-1 min-h-0 px-2 py-1.5 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function GoldenPlanningNotesPanel({
  dropZones,
}: {
  dropZones?: DropZonesResolution;
}) {
  const resolved = dropZones ?? resolveDropZones(null, null);

  return (
    <div className="golden-planning-notes-panel flex flex-col flex-1 min-h-0 border border-[#E5E5E7] rounded-[3px] bg-[#FAFAFB] overflow-hidden">
      <div className="golden-planning-notes-panel-grid grid flex-1 min-h-0 grid-cols-[minmax(0,1.4fr)_192px_minmax(0,1fr)]">
        <GoldenPlanningNotesColumn label="Notes" />
        <div className="golden-drop-zones-slot flex items-center justify-center min-w-0 h-full">
          <DropZonesCard resolution={resolved} />
        </div>
        <GoldenPlanningNotesColumn label="Events" />
      </div>
    </div>
  );
}

export function GoldenBreaksPlanningHeader({
  day,
  dayIndex,
  weekDayDefs,
  includeTimestamp,
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
  includeTimestamp?: boolean;
}) {
  return (
    <div className="sheet-header flex-shrink-0 pb-1 mb-1 flex items-stretch justify-between w-full">
      <div className="flex items-end gap-3 min-w-0">
        <div
          className="font-black tabular-nums leading-[0.78]"
          style={{
            fontSize: 58,
            letterSpacing: "-4px",
            color: "transparent",
            WebkitTextStroke: "1.5px #1C1C1E",
            fontFamily: "var(--font-atkinson)",
          }}
        >
          {day.dateNum}
        </div>
        <div className="-mb-0.5 flex flex-col min-w-0">
          <div
            className="font-bold leading-none text-[#1C1C1E]"
            style={{
              fontSize: 26,
              letterSpacing: "-0.8px",
              fontFamily: "var(--font-atkinson)",
            }}
          >
            Aux · Overlaps · Notes
          </div>
          <div className="text-[11px] mt-0.5 leading-none text-[#4B5563]">
            {day.name} · {day.monthYear} · Planning sheet 2 of 2
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1.5">
        <div
          className="text-[9.5px] font-bold tracking-[1.2px] uppercase text-[#1C1C1E]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          Planning Sheet
        </div>
        <div className="flex gap-[2px]">
          {weekDayDefs.map((def, i) => {
            const isActive = i === dayIndex;
            return (
              <div
                key={i}
                className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px]"
                style={{
                  background: isActive ? def.color : "transparent",
                  color: isActive ? "#fff" : "#6B7280",
                  fontFamily: "var(--font-atkinson)",
                }}
              >
                {WEEK_LETTERS[i]}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GoldenSectionHeader({
  label,
  count,
}: {
  label: string;
  count?: string;
}) {
  return (
    <div className="sheet-section-header">
      <span className="label">{label}</span>
      <div className="divider" />
      {count ? <span className="count">{count}</span> : null}
    </div>
  );
}

export { ZONE_VISUAL_ORDER };

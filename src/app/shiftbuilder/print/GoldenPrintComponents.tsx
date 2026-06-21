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
  COVERAGE_BAR_FONT_SIZE,
  COVERAGE_BAR_H,
  BREAK_GROUP_FILTERS,
  breakGroupLabel,
} from "@/lib/shiftbuilder/constants";
import type { PrintTaskLine } from "./printPreviewTypes";
import { TaskMarkerLabel } from "../components/TaskMarkerLabel";
import { formatCoveredByNames } from "@/lib/shiftbuilder/coverageHelpers";

type CoveredScale = "zone" | "rr" | "aux";

const GOLDEN_COVERED_LABEL: Record<CoveredScale, number> = { zone: 7.5, rr: 7, aux: 7 };
const GOLDEN_COVERED_NAME: Record<CoveredScale, number> = { zone: 18, rr: 14, aux: 14 };

function GoldenCoveredByBlock({
  coveredByNames,
  scale,
}: {
  coveredByNames: string[];
  scale: CoveredScale;
}) {
  return (
    <div className="sb-covered-by-print sb-covered-by-block flex flex-col min-w-0 w-full">
      <span
        className="sb-covered-by-label font-bold uppercase tracking-[0.22em] text-[#B0B0B8] px-1 py-[1px] inline-block"
        style={{
          fontSize: GOLDEN_COVERED_LABEL[scale],
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          lineHeight: 1.15,
        }}
      >
        Covered by
      </span>
      <span
        className="sb-covered-by-names font-bold tracking-[-0.35px] text-[#9CA3AF] px-1 py-[1px] inline-block leading-tight"
        style={{
          fontSize: GOLDEN_COVERED_NAME[scale],
          lineHeight: 1.08,
          fontFamily: "var(--font-bricolage, var(--font-atkinson))",
        }}
      >
        {formatCoveredByNames(coveredByNames)}
      </span>
    </div>
  );
}

const WEEK_LETTERS = ["F", "S", "S", "M", "T", "W", "T"] as const;

export function GoldenBreakPill({ value }: { value: number }) {
  const isOff = value === 0;
  return (
    <span
      className={`w-[18px] h-[14px] text-[9px] font-bold rounded-[2px] flex items-center justify-center select-none leading-none shrink-0 ${
        isOff ? "bg-[#9CA3AF] text-white" : "bg-[#1C1C1E] text-white"
      }`}
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    >
      {isOff ? "–" : breakGroupLabel(value)}
    </span>
  );
}

export function GoldenTaskRow({
  task,
  hasTM,
}: {
  task: PrintTaskLine;
  hasTM: boolean;
}) {
  const textColor = hasTM ? "#1f2937" : "#6B7280";
  return (
    <div className="sb-list-row relative flex items-start gap-1.5 rounded px-1 -mx-0.5 py-0 text-[9.5px] leading-[1.05]">
      <div data-task-label className="min-w-0 flex-1 leading-[1.05]">
        <TaskMarkerLabel
          label={task.label}
          color={task.color}
          markerType={task.markerType}
          textStyle={task.textStyle}
          isPrintPreview
          fontSize="9.5px"
          textColor={textColor}
          className="block rounded-sm font-medium py-px"
          hanging={{ textIndent: "0", paddingLeft: "0" }}
        />
      </div>
    </div>
  );
}

export function GoldenTaskList({
  tasks,
  hasTM,
  dense = false,
}: {
  tasks: PrintTaskLine[];
  hasTM: boolean;
  dense?: boolean;
}) {
  if (!tasks.length) return null;
  const textColor = hasTM ? "text-[#1f2937]" : "text-[#6B7280]";
  return (
    <div
      className={`sb-golden-task-list min-h-0 flex-1 flex flex-col justify-start gap-[2px] ${
        dense ? "text-[9px] leading-[1.08]" : "text-[9.5px] leading-[1.12]"
      } ${textColor}`}
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      {tasks.map((t) => (
        <GoldenTaskRow key={t.id} task={t} hasTM={hasTM} />
      ))}
    </div>
  );
}

export function GoldenCoverageBar({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  const bg = color || "#6B7280";
  return (
    <div
      className="sb-coverage-bar group flex items-center justify-between px-2 select-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: bg,
        borderRadius: "0 0 3px 3px",
        paddingTop: 3,
        paddingBottom: 3,
        zIndex: 2,
        borderTop: "1px solid rgba(255,255,255,0.25)",
        height: COVERAGE_BAR_H,
        minHeight: COVERAGE_BAR_H,
      }}
      title={label}
    >
      <span
        className="text-white font-extrabold uppercase tracking-[0.6px] leading-none truncate"
        style={{ fontSize: COVERAGE_BAR_FONT_SIZE, fontFamily: "var(--font-atkinson)" }}
      >
        {label}
      </span>
    </div>
  );
}

function toTaskLines(tasks: NightSlotTask[] | PrintTaskLine[] | undefined): PrintTaskLine[] {
  return (tasks ?? []).map((t) => ({
    id: t.id,
    label: "taskLabel" in t ? t.taskLabel : t.label,
    color: t.color ?? null,
    markerType: ("markerType" in t ? t.markerType : null) ?? null,
    textStyle: "textStyle" in t ? t.textStyle ?? null : null,
    isCoverage: Boolean(t.isCoverage),
  }));
}

export function GoldenZoneCard({
  slotKey,
  tmName,
  breakGroup = 0,
  tasks,
  empty,
  coveredByNames,
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
  coveredByNames?: string[];
} & React.HTMLAttributes<HTMLDivElement>) {
  const def = ZONE_DEFS.find((d) => d.key === slotKey)!;
  const color = getZoneColor(slotKey);
  const icon = ZONE_ICONS[slotKey] ?? "●";
  const isEmpty = empty || !tmName?.trim();
  const regular = tasks.filter((t) => !t.isCoverage);
  const coverage = tasks.find((t) => t.isCoverage);
  const coveragePad = coverage ? COVERAGE_BAR_H + 8 : 12;

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col h-full rounded-[3px] ${
        isEmpty ? "empty sb-card-empty" : ""
      }`}
      style={{ ["--card-accent" as string]: color }}
      data-slot-key={slotKey}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      {...rest}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: color }} />
      <div
        className="flex items-center justify-between gap-1 px-2 pt-1.5 pb-1.5"
        style={{ borderBottom: `1px solid ${color}22` }}
      >
        <div className="flex items-center gap-1.5 leading-none min-w-0" style={{ color }}>
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
        <GoldenBreakPill value={breakGroup} />
      </div>
      <div
        className="sb-golden-card-body flex flex-col flex-1 min-h-0 px-3 pt-2"
        style={{ paddingBottom: coveragePad }}
      >
        {isEmpty ? (
          coveredByNames && coveredByNames.length > 0 ? (
            <GoldenCoveredByBlock coveredByNames={coveredByNames} scale="zone" />
          ) : (
            <div
              className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] px-1 py-[1px]"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              <span className="sb-unassigned-primary">— Unassigned —</span>
            </div>
          )
        ) : (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.35px] text-[#111] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize: 21,
                lineHeight: 1,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {tmName}
            </span>
            <GoldenTaskList tasks={regular} hasTM />
          </>
        )}
        {isEmpty && regular.length > 0 ? (
          <GoldenTaskList tasks={regular} hasTM={false} />
        ) : null}
      </div>
      {coverage ? (
        <GoldenCoverageBar label={coverage.label} color={coverage.color || "#6B7280"} />
      ) : null}
    </div>
  );
}

function GoldenRRSide({
  slotKey,
  headerLabel,
  icon,
  accentColor,
  tmName,
  breakGroup,
  tasks,
  empty,
  coveredByNames,
}: {
  slotKey: string;
  headerLabel: string;
  icon: string;
  accentColor: string;
  tmName?: string | null;
  breakGroup: number;
  tasks: PrintTaskLine[];
  empty: boolean;
  coveredByNames?: string[];
}) {
  const regular = tasks.filter((t) => !t.isCoverage);
  const coverage = tasks.find((t) => t.isCoverage);
  const coveragePad = coverage ? COVERAGE_BAR_H + 8 : 6;
  const isEmpty = empty || !tmName?.trim();

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col rounded-[3px] flex-1 ${
        isEmpty ? "empty sb-card-empty" : ""
      }`}
      style={{ ["--card-accent" as string]: accentColor }}
      data-slot-key={slotKey}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: accentColor }} />
      <div
        className="flex items-center justify-between gap-1 px-2 pt-0.5 pb-0.5 leading-none"
        style={{ color: accentColor, borderBottom: `1px solid ${accentColor}33` }}
      >
        <div className="flex items-center gap-1 leading-none min-w-0" style={{ color: accentColor }}>
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
        <GoldenBreakPill value={breakGroup} />
      </div>
      <div
        className="sb-golden-card-body flex flex-col flex-1 min-h-0 px-2 pt-1.5"
        style={{ paddingBottom: coveragePad }}
      >
        {isEmpty ? (
          coveredByNames && coveredByNames.length > 0 ? (
            <GoldenCoveredByBlock coveredByNames={coveredByNames} scale="rr" />
          ) : (
            <div
              className="unassigned-label text-[10.5px] tracking-[0.3px] px-1 py-[1px]"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              <span className="sb-unassigned-primary">— Unassigned —</span>
            </div>
          )
        ) : (
          <span
            className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.3px] text-[#111] truncate px-1 py-[1px] inline-block"
            style={{
              fontSize: 18,
              lineHeight: 1.02,
              fontFamily: "var(--font-bricolage, var(--font-atkinson))",
            }}
          >
            {tmName}
          </span>
        )}
        <GoldenTaskList tasks={regular} hasTM={!isEmpty} dense />
      </div>
      {coverage ? (
        <GoldenCoverageBar label={coverage.label} color={coverage.color || "#6B7280"} />
      ) : null}
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
}: {
  rrNum: number;
  wAssignment: { tmName?: string | null; breakGroup?: number };
  mAssignment: { tmName?: string | null; breakGroup?: number };
  wTasks: PrintTaskLine[];
  mTasks: PrintTaskLine[];
  coveredByIndex?: Record<string, string[]>;
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
      className={`relative overflow-hidden flex flex-col gap-1 h-full ${wEmpty && mEmpty ? "empty" : ""}`}
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
        coveredByNames={coveredByIndex[wKey]}
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
        coveredByNames={coveredByIndex[mKey]}
      />
    </div>
  );
}

export function GoldenAuxCard({
  def,
  tmName,
  breakGroup = 0,
  tasks,
  empty,
  coveredByNames,
}: {
  def: AuxDef;
  tmName?: string | null;
  breakGroup?: number;
  tasks: PrintTaskLine[];
  empty?: boolean;
  coveredByNames?: string[];
}) {
  const role = def.role ?? "blank";
  const isBlank = role === "blank" && !def.label;
  const color = getAuxAccent(def.key, role);
  const icon = getAuxIcon(def.key, role);
  const isEmpty = (empty || !tmName?.trim()) && !isBlank;
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
      <div className="h-[3px] w-full shrink-0" style={{ background: isBlank ? "#D1D5DB" : color }} />
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
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color }}>
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
        {!isBlank ? <GoldenBreakPill value={breakGroup} /> : null}
      </div>
      <div
        className="sb-golden-card-body flex flex-col flex-1 min-h-0 px-2 pt-1.5"
        style={{ paddingBottom: bodyPadBottom }}
      >
        {isEmpty ? (
          coveredByNames && coveredByNames.length > 0 ? (
            <GoldenCoveredByBlock coveredByNames={coveredByNames} scale="aux" />
          ) : (
            <div
              className="unassigned-label text-[10.5px] tracking-[0.3px] px-1 py-[1px] flex items-center justify-center flex-1"
              style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              <span className="sb-unassigned-primary">— Unassigned —</span>
            </div>
          )
        ) : !isBlank ? (
          <>
            <span
              className="sb-golden-assignee-name shrink-0 font-bold tracking-[-0.35px] text-[#111] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize: 18,
                lineHeight: 1.02,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {tmName}
            </span>
            <GoldenTaskList tasks={regular} hasTM dense />
          </>
        ) : null}
        {isEmpty && regular.length > 0 ? (
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
}: {
  slotKey: string;
  tmName?: string | null;
  tasks: PrintTaskLine[];
}) {
  const isEmpty = !tmName?.trim();
  const regular = tasks.filter((t) => !t.isCoverage);

  return (
    <div
      className={`assignment-card sb-assignment-card relative border border-[#E5E5E7] rounded-[3px] bg-white min-h-[48px] px-2.5 py-1.5 h-full ${
        isEmpty ? "sb-card-empty" : ""
      }`}
      data-slot-key={slotKey}
    >
      {isEmpty ? (
        <div
          className="unassigned-label flex flex-col items-center text-[9.5px] tracking-[0.3px]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          <span className="sb-unassigned-primary px-1 py-[1px] inline-block">— Unassigned —</span>
        </div>
      ) : (
        <span
          className="font-bold tracking-[-0.2px] text-[#111] truncate px-1 py-[1px] inline-block"
          style={{ fontSize: 13, lineHeight: 1.1, fontFamily: "var(--font-atkinson)" }}
        >
          {tmName}
        </span>
      )}
      <GoldenTaskList tasks={regular} hasTM={!isEmpty} dense />
    </div>
  );
}

export function GoldenDeploymentHeader({
  day,
  dayIndex,
  weekDayDefs,
  breakCounts,
  activeBreakGroup = 1,
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
  breakCounts: Record<1 | 2 | 3 | 4, number>;
  activeBreakGroup?: 1 | 2 | 3 | 4;
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
        <div className="flex items-center gap-1.5">
          <span
            className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]"
            style={{ fontFamily: "var(--font-atkinson)" }}
          >
            GROUP
          </span>
          <div className="flex gap-[3px]">
            {BREAK_GROUP_FILTERS.map((g) => {
              const isActive = activeBreakGroup === g;
              return (
                <div
                  key={g}
                  className={`${g === 4 ? "min-w-[18px]" : "min-w-[15px]"} h-[15px] px-1 text-[9px] flex items-center justify-center font-bold rounded-[2px]`}
                  style={{
                    background: isActive ? "#1C1C1E" : "#E5E5E7",
                    color: isActive ? "#fff" : "#6B7280",
                    fontFamily: "var(--font-atkinson)",
                  }}
                >
                  {breakGroupLabel(g)}
                </div>
              );
            })}
          </div>
        </div>
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
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
  breakCounts: Record<1 | 2 | 3 | 4, number>;
  inRotationCount: number;
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
        <div
          className="text-[9.5px] font-bold tracking-[1.2px] uppercase text-[#1C1C1E]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          BY BREAK WAVE
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

export function GoldenPlanningHeaderBadge() {
  return (
    <div
      className="golden-planning-header-badge flex-shrink-0 mb-0.5 px-2 py-[2px] rounded-[2px] border border-[#D1D5DB] bg-[#F3F4F6] text-center"
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      <span className="text-[7.5px] font-extrabold tracking-[1.2px] uppercase text-[#4B5563]">
        Planning Worksheet — Not For Floor Distribution
      </span>
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

export function GoldenPlanningNotesPanel({ notes }: { notes?: string }) {
  const trimmed = notes?.trim() ?? "";
  return (
    <div className="golden-planning-notes-panel flex flex-col flex-1 min-h-0 border border-[#E5E5E7] rounded-[3px] bg-[#FAFAFB] overflow-hidden">
      <div
        className="golden-planning-notes-panel-title flex-shrink-0 px-2.5 py-1 border-b border-[#E5E5E7] bg-[#F3F4F6]"
        style={{ fontFamily: "var(--font-atkinson)" }}
      >
        <span className="text-[8px] font-extrabold tracking-[1.2px] uppercase text-[#6B7280]">
          Shift Planning Notes
        </span>
      </div>
      <div className="golden-planning-notes-panel-grid grid flex-1 min-h-0 grid-cols-[35%_40%_25%]">
        <GoldenPlanningNotesColumn label="Notes">
          {trimmed ? (
            <div className="golden-planning-notes-prefill flex-shrink-0 text-[9px] leading-[1.4] text-[#374151] whitespace-pre-wrap mb-1">
              {trimmed}
            </div>
          ) : null}
        </GoldenPlanningNotesColumn>
        <GoldenPlanningNotesColumn label="Projects" />
        <GoldenPlanningNotesColumn label="Events" />
      </div>
    </div>
  );
}

export function GoldenBreaksPlanningHeader({
  day,
  dayIndex,
  weekDayDefs,
}: {
  day: DayDef;
  dayIndex: number;
  weekDayDefs: DayDef[];
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

export function GoldenSheetFooter({
  versionLabel,
  pageLabel,
  printVariant = "official",
  nightStatus,
}: {
  versionLabel: string;
  pageLabel: string;
  printVariant?: "official" | "planning";
  nightStatus?: "published" | "draft";
}) {
  if (printVariant === "planning") {
    const statusLabel = nightStatus === "published" ? "PUBLISHED" : "UNPUBLISHED";
    return (
      <div
        className="sheet-footer flex-shrink-0 flex items-center justify-between gap-3 text-[9pt] leading-none tracking-[0.1px] pt-1 border-t border-[#E5E5E7] text-[#9CA3AF]"
        style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
      >
        <div className="min-w-0 truncate text-[9px] font-bold tracking-[0.8px] uppercase text-[#6B7280]">
          Planning · {statusLabel} · {versionLabel}
        </div>
        <div className="shrink-0 tabular-nums text-right">{pageLabel}</div>
      </div>
    );
  }

  return (
    <div
      className="sheet-footer flex-shrink-0 flex items-center justify-between gap-3 text-[9pt] leading-none tracking-[0.1px] pt-1 border-t border-[#E5E5E7] text-[#9CA3AF]"
      style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
    >
      <div className="min-w-0 truncate">
        <span className="font-bold tracking-[1px] text-[#1C1C1E]">SBS</span>
        <span className="mx-1 opacity-60">©</span>
        <span className="text-[#6B7280]">Weekly Zone Deployment Book</span>
        <span className="mx-1 opacity-40">—</span>
        <span className="font-semibold tracking-[1px] text-[#1C1C1E]">GRAVES</span>
      </div>
      <div className="shrink-0 tabular-nums">{versionLabel}</div>
      <div className="shrink-0 tabular-nums text-right">{pageLabel}</div>
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

export { toTaskLines, ZONE_VISUAL_ORDER };
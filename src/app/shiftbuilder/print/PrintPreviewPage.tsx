import React from "react";
import { ZONE_DEFS, RR_DEFS, BREAK_GROUP_OVERLAPS, breakGroupLabel } from "@/lib/shiftbuilder/constants";
import type { PrintPreviewPageProps } from "./printPreviewTypes";
import {
  GoldenAuxCard,
  GoldenBreaksHeader,
  GoldenBreaksPlanningHeader,
  GoldenDeploymentHeader,
  GoldenOverlapSlot,
  GoldenPlanningHeaderBadge,
  GoldenRRColumn,
  GoldenSectionHeader,
  GoldenSheetFooter,
  GoldenShiftNotesBand,
  GoldenZoneCard,
  toTaskLines,
  ZONE_VISUAL_ORDER,
} from "./GoldenPrintComponents";
import {
  buildBreaksWaves,
  buildOverlapRows,
  slotShowsFilled,
} from "./buildPrintDaySnapshot";
import { buildCoveredByIndex } from "@/lib/shiftbuilder/coverageHelpers";
import "./printPreview.css";

function filledCount(
  assignments: Record<string, { tmName?: string }>,
  keys: string[],
): number {
  return keys.filter((k) => assignments[k]?.tmName).length;
}

function AuxCardsSection({
  auxDefs,
  assignments,
  tasksBySlot,
  coveredByIndex,
  auxFilled,
  auxTotal,
  className = "",
}: {
  auxDefs: PrintPreviewPageProps["snapshot"]["auxDefs"];
  assignments: PrintPreviewPageProps["snapshot"]["assignments"];
  tasksBySlot: PrintPreviewPageProps["snapshot"]["tasksBySlot"];
  coveredByIndex: ReturnType<typeof buildCoveredByIndex>;
  auxFilled: number;
  auxTotal: number;
  className?: string;
}) {
  return (
    <section
      className={`sb-builder-section sb-print-section sb-print-section-aux min-h-0 flex flex-col ${className}`.trim()}
    >
      <GoldenSectionHeader label="AUXILIARY" count={`${auxFilled} / ${auxTotal} FILLED`} />
      <div
        className="sb-print-card-grid grid gap-1.5 flex-1 min-h-0 w-full"
        style={{
          gridTemplateColumns: `repeat(${Math.max(auxDefs.length, 1)}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {auxDefs.map((def) => {
          const a = assignments[def.key] || {};
          const isBlank = def.role === "blank" && !def.label;
          return (
            <div key={def.key} className="relative h-full" data-slot-key={def.key}>
              <GoldenAuxCard
                def={def}
                tmName={a.tmName}
                breakGroup={a.breakGroup ?? 0}
                tasks={toTaskLines(tasksBySlot[def.key])}
                empty={!isBlank && !slotShowsFilled(def.key, assignments)}
                coveredByNames={coveredByIndex[def.key]}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OverlapRowsSection({
  overlapRows,
  className = "",
}: {
  overlapRows: ReturnType<typeof buildOverlapRows>;
  className?: string;
}) {
  return (
    <section className={`sb-builder-section overlaps-section ${className}`.trim()}>
      <GoldenSectionHeader label="OVERLAPS" count="" />
      <div className="space-y-2">
        {overlapRows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline gap-2 pl-1 mb-0.5">
              <div
                className="font-black tabular-nums leading-none text-[22px] text-[#1C1C1E]"
                style={{ fontFamily: "var(--font-atkinson)" }}
              >
                {row.dateNum}
              </div>
              <div
                className="font-bold tracking-[-0.4px] leading-none text-[16px]"
                style={{ color: row.headerColor, fontFamily: "var(--font-atkinson)" }}
              >
                {row.dayName}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-[60px] flex-shrink-0 text-[10px] font-bold tracking-[0.4px] text-[#1C1C1E]"
                style={{ fontFamily: "var(--font-atkinson)" }}
              >
                {row.time}
              </div>
              <div className="flex-1 grid grid-cols-6 gap-1.5 min-w-0">
                {row.slots.map((slot) => (
                  <div key={slot.key} className="relative h-full">
                    <GoldenOverlapSlot
                      slotKey={slot.key}
                      tmName={slot.tmName}
                      tasks={slot.tasks}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PrintPreviewPage({
  view,
  snapshot,
  pageLabel,
  versionLabel,
  weekDayDefs,
  activeBreakGroup = 1,
  printVariant = "official",
  includeShiftNotes = true,
}: PrintPreviewPageProps) {
  const { day, assignments, auxDefs, tasksBySlot, breakCounts } = snapshot;
  const inRotationCount = breakCounts[1] + breakCounts[2] + breakCounts[3] + breakCounts[4];
  const isPlanning = printVariant === "planning";
  const variantAttr = isPlanning ? "planning" : "official";

  if (view === "breaks") {
    const overlapRows = buildOverlapRows(snapshot);

    if (isPlanning) {
      const coveredByIndex = buildCoveredByIndex(assignments, tasksBySlot, auxDefs);
      const auxFilled = auxDefs.filter(
        (d) => (d.role !== "blank" || !!d.label) && assignments[d.key]?.tmName,
      ).length;
      const auxTotal = auxDefs.filter((d) => d.role !== "blank" || !!d.label).length;

      return (
        <div className="print-artboard" data-print-view="breaks" data-print-variant={variantAttr}>
          <GoldenPlanningHeaderBadge />
          <GoldenBreaksPlanningHeader
            day={day}
            dayIndex={snapshot.dayIndex}
            weekDayDefs={weekDayDefs}
          />

          <div className="sb-breaks-planning-body flex flex-col w-full flex-1 min-h-0 overflow-hidden gap-1">
            <OverlapRowsSection
              overlapRows={overlapRows}
              className="sb-planning-overlaps-block flex-shrink-0 pt-1"
            />
            <AuxCardsSection
              auxDefs={auxDefs}
              assignments={assignments}
              tasksBySlot={tasksBySlot}
              coveredByIndex={coveredByIndex}
              auxFilled={auxFilled}
              auxTotal={auxTotal}
              className="sb-planning-aux-block flex-1 min-h-0 mb-0"
            />
            {includeShiftNotes ? (
              <GoldenShiftNotesBand notes={snapshot.notes} blankLines={4} />
            ) : null}
          </div>

          <GoldenSheetFooter
            versionLabel={versionLabel}
            pageLabel={pageLabel}
            printVariant="planning"
            nightStatus={snapshot.nightStatus}
          />
        </div>
      );
    }

    const waves = buildBreaksWaves(snapshot);

    return (
      <div className="print-artboard" data-print-view="breaks" data-print-variant={variantAttr}>
        <GoldenBreaksHeader
          day={day}
          dayIndex={snapshot.dayIndex}
          weekDayDefs={weekDayDefs}
          breakCounts={breakCounts}
          inRotationCount={inRotationCount}
        />

        <div className="flex flex-col w-full flex-1 min-h-0 overflow-hidden">
          <div className="sb-breaks-wave-grid grid grid-cols-4 gap-1 mb-1.5 flex-1 min-h-0 w-full">
            {waves.map((w) => {
              const isOlWave = w.wave === BREAK_GROUP_OVERLAPS;
              const waveColor =
                w.wave === 1
                  ? "#1a2332"
                  : w.wave === 2
                    ? "#5a6b7d"
                    : isOlWave
                      ? "#0EA5E9"
                      : "#c8d3dc";
              const byCat = (cat: string) => w.people.filter((p) => p.category === cat);
              return (
                <div
                  key={w.wave}
                  className="border border-[#E5E5E7] rounded-[3px] bg-white overflow-hidden flex flex-col h-full min-h-0"
                  style={{ borderTop: `3px solid ${waveColor}` }}
                >
                  <div className="px-3 pt-2 pb-1 flex items-end gap-2.5 border-b border-[#F2F2F4]">
                    <div
                      className="font-black tabular-nums leading-none text-[#1C1C1E]"
                      style={{
                        fontSize: 42,
                        letterSpacing: "-2px",
                        fontFamily: "var(--font-atkinson)",
                      }}
                    >
                      {breakGroupLabel(w.wave)}
                    </div>
                    <div className="-mb-0.5">
                      <div
                        className="font-extrabold tracking-[1px] uppercase leading-none text-[#1C1C1E]"
                        style={{ fontSize: 13, fontFamily: "var(--font-atkinson)" }}
                      >
                        {isOlWave ? "Overlaps" : `Break ${w.wave}`}
                      </div>
                      <div className="text-[10px] text-[#6B7280] mt-0.5">
                        {w.people.length} people
                      </div>
                    </div>
                  </div>
                  <div className="px-2 pb-1 pt-1 space-y-1 text-[9px]">
                    {(["zone", "rr", "aux", "overlap"] as const).map((cat) => {
                      const items = byCat(cat);
                      if (!items.length) return null;
                      const label =
                        cat === "zone"
                          ? "ZONES"
                          : cat === "rr"
                            ? "RESTROOMS"
                            : cat === "overlap"
                              ? "OVERLAPS"
                              : "AUXILIARY";
                      return (
                        <div key={cat}>
                          <div className="flex items-center gap-1 mb-1">
                            <span
                              className="text-[#6B7280] font-bold tracking-[1.2px] uppercase text-[7.5px]"
                              style={{ fontFamily: "var(--font-atkinson)" }}
                            >
                              {label}
                            </span>
                            <div className="flex-1 h-px bg-[#E5E7EB]" />
                          </div>
                          <div className="space-y-1">
                            {items.map((p) => (
                              <div key={p.slotKey} className="flex items-center gap-1.5">
                                <div className="flex-1 border-b border-dashed border-[#C8C8CC] pb-px min-w-0">
                                  <div className="font-semibold text-[#111] truncate text-[9px] leading-tight">
                                    {p.tmName}
                                  </div>
                                </div>
                                <div
                                  className="text-[8.5px] font-extrabold tracking-[0.4px] px-1.5 py-px rounded-[2px] whitespace-nowrap border bg-white"
                                  style={{
                                    borderColor: p.accentColor,
                                    color: p.accentColor,
                                    fontFamily: "var(--font-atkinson)",
                                  }}
                                >
                                  {p.chipLabel}
                                </div>
                                <span className="text-[7.5px] text-[#9CA3AF] uppercase tracking-[0.5px] w-3 text-center">
                                  {p.sideLetter || ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <OverlapRowsSection overlapRows={overlapRows} className="mt-auto pt-1.5" />
        </div>

        <GoldenSheetFooter versionLabel={versionLabel} pageLabel={pageLabel} />
      </div>
    );
  }

  const zoneFilled = filledCount(
    assignments,
    ZONE_DEFS.map((z) => z.key),
  );
  const rrFilled = RR_DEFS.reduce((acc, d) => {
    const m = assignments[`MRR${d.num}`]?.tmName;
    const w = assignments[`WRR${d.num}`]?.tmName;
    return acc + (m ? 1 : 0) + (w ? 1 : 0);
  }, 0);
  const auxFilled = auxDefs.filter(
    (d) => (d.role !== "blank" || !!d.label) && assignments[d.key]?.tmName,
  ).length;
  const auxTotal = auxDefs.filter((d) => d.role !== "blank" || !!d.label).length;
  const coveredByIndex = buildCoveredByIndex(assignments, tasksBySlot, auxDefs);

  return (
    <div className="print-artboard" data-print-view="deployment" data-print-variant={variantAttr}>
      {isPlanning ? <GoldenPlanningHeaderBadge /> : null}
      <GoldenDeploymentHeader
        day={day}
        dayIndex={snapshot.dayIndex}
        weekDayDefs={weekDayDefs}
        breakCounts={breakCounts}
        activeBreakGroup={activeBreakGroup}
      />

      <div
        className={`sb-print-deployment-body flex flex-col w-full flex-1 min-h-0 overflow-hidden ${
          isPlanning ? "sb-print-deployment-body--planning-zones-rr" : ""
        }`}
      >
        <section
          className={`sb-builder-section sb-print-section sb-print-section-zones mb-1 min-h-0 flex flex-col ${
            isPlanning ? "flex-[6]" : "flex-[5]"
          }`}
        >
          <GoldenSectionHeader label="ZONES" count={`${zoneFilled} / 10 FILLED`} />
          <div
            className="sb-print-card-grid grid grid-cols-5 gap-1.5 flex-1 min-h-0 w-full"
            style={{ gridAutoRows: "minmax(0, 1fr)" }}
          >
            {ZONE_VISUAL_ORDER.map((zKey) => {
              const a = assignments[zKey] || {};
              const tasks = toTaskLines(tasksBySlot[zKey]);
              return (
                <div key={zKey} className="relative h-full" data-slot-key={zKey}>
                  <GoldenZoneCard
                    slotKey={zKey}
                    tmName={a.tmName}
                    breakGroup={a.breakGroup ?? 0}
                    tasks={tasks}
                    empty={!slotShowsFilled(zKey, assignments)}
                    coveredByNames={coveredByIndex[zKey]}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section
          className={`sb-builder-section sb-print-section sb-print-section-rr mb-1 min-h-0 flex flex-col ${
            isPlanning ? "flex-[5] mb-0" : "flex-[4]"
          }`}
        >
          <GoldenSectionHeader label="RESTROOMS" count={`${rrFilled} / 10 FILLED`} />
          <div
            className="sb-print-card-grid grid grid-cols-5 gap-1.5 flex-1 min-h-0 w-full"
            style={{ gridAutoRows: "minmax(0, 1fr)" }}
          >
            {RR_DEFS.map((def) => {
              const wKey = `WRR${def.num}`;
              const mKey = `MRR${def.num}`;
              return (
                <div key={def.num} className="relative h-full" data-slot-key={`RR${def.num}`}>
                  <GoldenRRColumn
                    rrNum={def.num}
                    wAssignment={assignments[wKey] || {}}
                    mAssignment={assignments[mKey] || {}}
                    wTasks={toTaskLines(tasksBySlot[wKey])}
                    mTasks={toTaskLines(tasksBySlot[mKey])}
                    coveredByIndex={coveredByIndex}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {!isPlanning ? (
          <AuxCardsSection
            auxDefs={auxDefs}
            assignments={assignments}
            tasksBySlot={tasksBySlot}
            coveredByIndex={coveredByIndex}
            auxFilled={auxFilled}
            auxTotal={auxTotal}
            className="mb-2 flex-[2]"
          />
        ) : null}
      </div>

      <GoldenSheetFooter
        versionLabel={versionLabel}
        pageLabel={pageLabel}
        printVariant={printVariant}
        nightStatus={snapshot.nightStatus}
      />
    </div>
  );
}

export default PrintPreviewPage;
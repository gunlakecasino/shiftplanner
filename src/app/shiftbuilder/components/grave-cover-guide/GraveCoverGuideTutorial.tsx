// v1.0 Release-Ready — UI frozen June 24 2026
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GUIDE_STEPS,
  INITIAL_BOARD,
  TUTORIAL_ZONE_ORDER,
  collectPlacedTms,
  countFilledZones,
  stepIndex,
  type GuideStepId,
  type TutorialBoard,
  type TutorialSlotKey,
  type TutorialTasks,
} from "./tutorialScenario";
import { TutorialZoneCard } from "./TutorialZoneCard";
import { TutorialPlacementPad } from "./TutorialPlacementPad";
import { TutorialTaskPad } from "./TutorialTaskPad";
import { TutorialRoster } from "./TutorialRoster";
import { TutorialNav } from "./TutorialNav";
import { getZoneColor } from "@/lib/shiftbuilder/constants";
import type { CoveredByEntry } from "@/lib/shiftbuilder/coverageHelpers";
import "../graveCoverGuideTutorial.css";

export const GRAVE_COVER_GUIDE_STORAGE_KEY = "shiftbuilder:grave-cover-guide-completed";

export type GraveCoverGuideTutorialProps = {
  open: boolean;
  isDark?: boolean;
  onClose: () => void;
  onFinish: () => void;
  onRequestPrint?: () => void;
};

export function markGraveCoverGuideCompleted(): void {
  try {
    localStorage.setItem(GRAVE_COVER_GUIDE_STORAGE_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function isGraveCoverGuideCompleted(): boolean {
  try {
    return localStorage.getItem(GRAVE_COVER_GUIDE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

type PadMode = "default" | "assign" | "coverage";

type PadState = {
  slotKey: TutorialSlotKey;
  mode: PadMode;
} | null;

const PAD_STEPS: GuideStepId[] = [
  "dblclick-z4",
  "mark-unavailable",
  "dblclick-empty-z4",
  "tap-assign",
  "pick-chen",
  "add-coverage",
];

export function GraveCoverGuideTutorial({
  open,
  isDark = false,
  onClose,
  onFinish,
  onRequestPrint,
}: GraveCoverGuideTutorialProps) {
  const [stepId, setStepId] = React.useState<GuideStepId>("intro");
  const [board, setBoard] = React.useState<TutorialBoard>(() => ({ ...INITIAL_BOARD }));
  const [tasks, setTasks] = React.useState<TutorialTasks>(() => ({} as TutorialTasks));
  const [calledOff, setCalledOff] = React.useState<Array<{ tmId: string; tmName: string }>>([]);
  const [pad, setPad] = React.useState<PadState>(null);
  const [taskPadSlot, setTaskPadSlot] = React.useState<TutorialSlotKey | null>(null);
  const [nightConfirmed, setNightConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStepId("intro");
    setBoard({ ...INITIAL_BOARD });
    setTasks({} as TutorialTasks);
    setCalledOff([]);
    setPad(null);
    setTaskPadSlot(null);
    setNightConfirmed(false);
  }, [open]);

  const step = GUIDE_STEPS[stepIndex(stepId)] ?? GUIDE_STEPS[0];
  const stepNumber = stepIndex(stepId) + 1;
  const filledCount = countFilledZones(board);

  const goTo = React.useCallback((id: GuideStepId) => {
    setStepId(id);
    if (!PAD_STEPS.includes(id) && id !== "add-task") {
      setPad(null);
    }
    if (id !== "add-task") setTaskPadSlot(null);
  }, []);

  const finish = React.useCallback(() => {
    markGraveCoverGuideCompleted();
    onFinish();
    onClose();
  }, [onClose, onFinish]);

  const openPad = (slotKey: TutorialSlotKey, mode: PadMode = "default") => {
    setPad({ slotKey, mode });
    setTaskPadSlot(null);
  };

  const handleZoneDoubleClick = (slotKey: TutorialSlotKey) => {
    if (stepId === "dblclick-z4" && slotKey === "Z4" && board.Z4) {
      openPad("Z4");
      setStepId("mark-unavailable");
      return;
    }
    if (stepId === "dblclick-empty-z4" && slotKey === "Z4" && !board.Z4) {
      openPad("Z4");
      setStepId("tap-assign");
      return;
    }
    if (stepId === "add-coverage" && slotKey === "Z4" && board.Z4) {
      openPad("Z4");
      return;
    }
  };

  const handleTaskZoneDoubleClick = (slotKey: TutorialSlotKey) => {
    if (stepId !== "add-task" || slotKey !== "Z4") return;
    setTaskPadSlot(slotKey);
    setPad(null);
  };

  const handleMarkUnavailable = () => {
    if (stepId !== "mark-unavailable" || !board.Z4) return;
    const tm = board.Z4;
    setBoard((prev) => ({ ...prev, Z4: null }));
    setCalledOff([{ tmId: tm.tmId, tmName: tm.tmName }]);
    setPad(null);
    goTo("review-called-off");
  };

  const handleAssignTap = () => {
    if (stepId !== "tap-assign") return;
    setPad({ slotKey: "Z4", mode: "assign" });
    goTo("pick-chen");
  };

  const handlePickChen = (tmId: string, tmName: string) => {
    if (stepId !== "pick-chen" || tmId !== "tm-chen") return;
    setBoard((prev) => ({
      ...prev,
      Z4: { tmId, tmName, breakGroup: 1 },
      Z8: null,
    }));
    setPad(null);
    goTo("add-coverage");
  };

  React.useEffect(() => {
    if (stepId === "add-coverage" && board.Z4) {
      setPad({ slotKey: "Z4", mode: "default" });
    }
  }, [stepId, board.Z4]);

  const handleCoverageTap = () => {
    if (stepId !== "add-coverage") return;
    setPad({ slotKey: "Z4", mode: "coverage" });
  };

  const handleCoveragePick = (target: TutorialSlotKey) => {
    if (stepId !== "add-coverage" || target !== "Z8") return;
    setTasks((prev) => ({
      ...prev,
      Z4: [
        ...(prev.Z4 ?? []),
        {
          id: "cov-z8",
          taskLabel: `And Zone ${target.slice(1)}`,
          color: getZoneColor(target),
          isCoverage: true,
          coverageTarget: target,
          coverageSide: "A" as const,
        },
      ],
    }));
    setPad(null);
    goTo("add-task");
  };

  const handleAddTask = (label: string) => {
    if (stepId !== "add-task" || !taskPadSlot) return;
    setTasks((prev) => ({
      ...prev,
      [taskPadSlot]: [
        ...(prev[taskPadSlot] ?? []),
        { id: `task-${Date.now()}`, taskLabel: label, color: getZoneColor(taskPadSlot) },
      ],
    }));
    setTaskPadSlot(null);
    goTo("complete");
  };

  const coveredByForSlot = React.useMemo(() => {
    const index: Partial<Record<TutorialSlotKey, CoveredByEntry[]>> = {};
    for (const sourceKey of TUTORIAL_ZONE_ORDER) {
      const assignment = board[sourceKey];
      if (!assignment) continue;
      for (const t of tasks[sourceKey] ?? []) {
        if (!t.isCoverage || !t.coverageTarget) continue;
        const target = t.coverageTarget;
        if (board[target]) continue;
        const entry: CoveredByEntry = {
          tmName: assignment.tmName,
          tmId: assignment.tmId,
          side: t.coverageSide ?? "A",
          sourceKey,
          taskLabel: t.taskLabel,
        };
        index[target] = [...(index[target] ?? []), entry];
      }
    }
    return index;
  }, [board, tasks]);

  const pickerOptions = React.useMemo(() => {
    const options: Array<{ tmId: string; tmName: string; subtitle?: string }> = [];
    if (board.Z8) {
      options.push({ tmId: board.Z8.tmId, tmName: board.Z8.tmName, subtitle: "On board · Z8" });
    }
    for (const tm of collectPlacedTms(board)) {
      if (tm.tmId === board.Z8?.tmId) continue;
      options.push({ tmId: tm.tmId, tmName: tm.tmName, subtitle: "Already placed tonight" });
    }
    return options;
  }, [board]);

  const canContinue = stepId === "intro" || stepId === "review-called-off" || stepId === "complete";

  const handleContinue = () => {
    if (stepId === "intro") goTo("confirm-night");
    else if (stepId === "review-called-off") goTo("dblclick-empty-z4");
    else if (stepId === "complete") finish();
  };

  const handleNightConfirm = () => {
    if (stepId !== "confirm-night") return;
    setNightConfirmed(true);
    goTo("dblclick-z4");
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="sb-guide-backdrop no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-guide-coach-title"
      onClick={onClose}
    >
      <div className={cn("sb-guide-frame", isDark && "sb-guide-frame--dark")} onClick={(e) => e.stopPropagation()}>
        <aside className="sb-guide-coach">
          <div className="sb-guide-coach__head">
            <div>
              <p className="sb-guide-coach__eyebrow">Step {stepNumber} of {GUIDE_STEPS.length}</p>
              <h2 id="sb-guide-coach-title" className="sb-guide-coach__title">{step.title}</h2>
            </div>
            <button type="button" className="sb-guide-coach__close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <p className="sb-guide-coach__body">{step.body}</p>
          {step.hint ? <p className="sb-guide-coach__hint">{step.hint}</p> : null}
          <div className="sb-guide-coach__reference">
            <p className="sb-guide-coach__ref-title">Live board controls</p>
            <ul>
              <li><strong>Mark unavailable</strong> — whole night (pad header)</li>
              <li><strong>Clear</strong> — one slot (pad footer)</li>
              <li><strong>Coverage</strong> — footer → <em>And Zone X</em> bar at card bottom</li>
              <li><strong>Tasks</strong> — tap/double-click lower task area (not coverage)</li>
              <li><strong>Covered by</strong> — shows on empty slots someone is covering</li>
            </ul>
          </div>
          <div className="sb-guide-coach__actions">
            {canContinue && (
              <button type="button" className="sb-guide-coach__primary" onClick={handleContinue}>
                {stepId === "complete" ? "Dismiss & use ShiftBuilder" : stepId === "intro" ? "Start scenario" : "Continue"}
              </button>
            )}
            {stepId === "complete" && onRequestPrint && (
              <button type="button" className="sb-guide-coach__secondary" onClick={onRequestPrint}>Open Print</button>
            )}
            <button type="button" className="sb-guide-coach__skip" onClick={finish}>Skip tutorial</button>
          </div>
        </aside>

        <div className="sb-guide-workspace builder-workspace">
          <TutorialNav
            highlightDay={stepId === "confirm-night" && !nightConfirmed}
            onDayConfirm={handleNightConfirm}
            isDark={isDark}
          />

          <div className="sb-guide-canvas-row">
            <div className="sb-guide-roster-slot">
              <TutorialRoster
                placed={collectPlacedTms(board)}
                calledOff={calledOff}
                highlightCalledOff={stepId === "review-called-off"}
              />
            </div>

            <div className="sb-guide-board-wrap sb-builder-stage">
              <section className="sb-builder-section">
                <div className="sheet-section-header sb-guide-section-header">
                  <span className="label">ZONES</span>
                  <div className="divider" />
                  <span className="sb-guide-fill-count">{filledCount} / 10 FILLED</span>
                </div>

                <div className="sb-builder-card-grid sb-guide-zone-grid">
                  {TUTORIAL_ZONE_ORDER.map((key) => (
                    <TutorialZoneCard
                      key={key}
                      slotKey={key}
                      assignment={board[key]}
                      tasks={tasks[key]}
                      coveredBy={coveredByForSlot[key]}
                      highlighted={
                        (stepId === "dblclick-z4" && key === "Z4" && !!board.Z4) ||
                        (stepId === "dblclick-empty-z4" && key === "Z4" && !board.Z4) ||
                        (stepId === "add-coverage" && key === "Z4") ||
                        (stepId === "add-task" && key === "Z4")
                      }
                      pulse={
                        (stepId === "dblclick-z4" && key === "Z4") ||
                        (stepId === "dblclick-empty-z4" && key === "Z4") ||
                        (stepId === "add-task" && key === "Z4")
                      }
                      highlightTaskZone={stepId === "add-task" && key === "Z4"}
                      onAssignZoneDoubleClick={handleZoneDoubleClick}
                      onTaskZoneDoubleClick={handleTaskZoneDoubleClick}
                    />
                  ))}
                </div>
              </section>

              {pad && (
                <div className="sb-guide-pad-anchor">
                  <TutorialPlacementPad
                    slotKey={pad.slotKey}
                    assignment={board[pad.slotKey]}
                    mode={pad.mode}
                    pickerOptions={pickerOptions}
                    highlightMark={stepId === "mark-unavailable"}
                    highlightAssign={stepId === "tap-assign"}
                    highlightCoverage={stepId === "add-coverage"}
                    highlightPickerTmId={stepId === "pick-chen" ? "tm-chen" : undefined}
                    onClose={() => setPad(null)}
                    onMarkUnavailable={handleMarkUnavailable}
                    onAssignTap={handleAssignTap}
                    onSwapTap={handleAssignTap}
                    onCoverageTap={handleCoverageTap}
                    onCoveragePick={handleCoveragePick}
                    onClear={() => {}}
                    onPickTm={handlePickChen}
                  />
                </div>
              )}

              {taskPadSlot && (
                <div className="sb-guide-pad-anchor">
                  <TutorialTaskPad
                    slotKey={taskPadSlot}
                    onAdd={handleAddTask}
                    onClose={() => setTaskPadSlot(null)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
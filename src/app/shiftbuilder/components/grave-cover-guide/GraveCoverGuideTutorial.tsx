"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GUIDE_STEPS,
  INITIAL_BOARD,
  TUTORIAL_FOCUS_ZONES,
  collectPlacedTms,
  stepIndex,
  type GuideStepId,
  type TutorialBoard,
  type TutorialSlotKey,
} from "./tutorialScenario";
import { TutorialZoneCard } from "./TutorialZoneCard";
import { TutorialPlacementPad } from "./TutorialPlacementPad";
import { TutorialRoster } from "./TutorialRoster";
import { TutorialNav } from "./TutorialNav";
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

type PadState = {
  slotKey: TutorialSlotKey;
  mode: "default" | "assign";
} | null;

function advanceFrom(step: GuideStepId): GuideStepId | null {
  const idx = stepIndex(step);
  if (idx < 0 || idx >= GUIDE_STEPS.length - 1) return null;
  return GUIDE_STEPS[idx + 1].id;
}

export function GraveCoverGuideTutorial({
  open,
  isDark = false,
  onClose,
  onFinish,
  onRequestPrint,
}: GraveCoverGuideTutorialProps) {
  const [stepId, setStepId] = React.useState<GuideStepId>("intro");
  const [board, setBoard] = React.useState<TutorialBoard>(() => ({ ...INITIAL_BOARD }));
  const [calledOff, setCalledOff] = React.useState<Array<{ tmId: string; tmName: string }>>([]);
  const [pad, setPad] = React.useState<PadState>(null);
  const [nightConfirmed, setNightConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStepId("intro");
    setBoard({ ...INITIAL_BOARD });
    setCalledOff([]);
    setPad(null);
    setNightConfirmed(false);
  }, [open]);

  const step = GUIDE_STEPS[stepIndex(stepId)] ?? GUIDE_STEPS[0];
  const stepNumber = stepIndex(stepId) + 1;

  const goTo = React.useCallback((id: GuideStepId) => {
    setStepId(id);
    if (id !== "dblclick-z4" && id !== "dblclick-empty-z4" && id !== "mark-unavailable" && id !== "tap-assign" && id !== "pick-chen") {
      setPad(null);
    }
  }, []);

  const finish = React.useCallback(() => {
    markGraveCoverGuideCompleted();
    onFinish();
    onClose();
  }, [onClose, onFinish]);

  const openPad = (slotKey: TutorialSlotKey, mode: "default" | "assign" = "default") => {
    setPad({ slotKey, mode });
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
      Z4: { tmId, tmName },
      Z8: null,
    }));
    setPad(null);
    goTo("complete");
  };

  const pickerOptions = React.useMemo(() => {
    const options: Array<{ tmId: string; tmName: string; subtitle?: string }> = [];
    if (board.Z8) {
      options.push({
        tmId: board.Z8.tmId,
        tmName: board.Z8.tmName,
        subtitle: "On board · Z8",
      });
    }
    for (const tm of collectPlacedTms(board)) {
      if (tm.tmId === board.Z8?.tmId) continue;
      options.push({ tmId: tm.tmId, tmName: tm.tmName, subtitle: "Already placed tonight" });
    }
    return options;
  }, [board]);

  const placedForRoster = collectPlacedTms(board);

  const canContinue =
    stepId === "intro" ||
    stepId === "review-called-off" ||
    stepId === "complete";

  const handleContinue = () => {
    if (stepId === "intro") {
      goTo("confirm-night");
      return;
    }
    if (stepId === "review-called-off") {
      goTo("dblclick-empty-z4");
      return;
    }
    if (stepId === "complete") {
      finish();
    }
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
      <div
        className={cn("sb-guide-frame", isDark && "sb-guide-frame--dark")}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="sb-guide-coach">
          <div className="sb-guide-coach__head">
            <div>
              <p className="sb-guide-coach__eyebrow">
                Step {stepNumber} of {GUIDE_STEPS.length}
              </p>
              <h2 id="sb-guide-coach-title" className="sb-guide-coach__title">
                {step.title}
              </h2>
            </div>
            <button type="button" className="sb-guide-coach__close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <p className="sb-guide-coach__body">{step.body}</p>
          {step.hint ? <p className="sb-guide-coach__hint">{step.hint}</p> : null}

          <div className="sb-guide-coach__reference">
            <p className="sb-guide-coach__ref-title">Real controls (same as live board)</p>
            <ul>
              <li>
                <strong>Mark unavailable</strong> — whole night, all slots
              </li>
              <li>
                <strong>Clear</strong> — one slot only
              </li>
              <li>
                <strong>Restore</strong> — roster Called Off chip
              </li>
              <li>
                <strong>Assign / Swap</strong> — placement pad
              </li>
            </ul>
          </div>

          <div className="sb-guide-coach__actions">
            {canContinue && (
              <button type="button" className="sb-guide-coach__primary" onClick={handleContinue}>
                {stepId === "complete" ? "Dismiss & use ShiftBuilder" : stepId === "intro" ? "Start scenario" : "Continue"}
              </button>
            )}
            {stepId === "complete" && onRequestPrint && (
              <button type="button" className="sb-guide-coach__secondary" onClick={onRequestPrint}>
                Open Print
              </button>
            )}
            <button type="button" className="sb-guide-coach__skip" onClick={finish}>
              Skip tutorial
            </button>
          </div>
        </aside>

        <div className="sb-guide-workspace builder-workspace">
          <div className="sb-guide-workspace__label">Practice board — same layout as ShiftBuilder</div>

          <TutorialNav
            highlightDay={stepId === "confirm-night" && !nightConfirmed}
            onDayConfirm={handleNightConfirm}
            isDark={isDark}
          />

          <div className="sb-guide-stage">
            <div className="sb-builder-stage sb-guide-board">
              <div className="sb-builder-card-grid sb-guide-card-grid">
                {TUTORIAL_FOCUS_ZONES.map((key) => (
                  <TutorialZoneCard
                    key={key}
                    slotKey={key}
                    assignment={board[key]}
                    highlighted={
                      (stepId === "dblclick-z4" && key === "Z4" && !!board.Z4) ||
                      (stepId === "dblclick-empty-z4" && key === "Z4" && !board.Z4)
                    }
                    pulse={
                      (stepId === "dblclick-z4" && key === "Z4") ||
                      (stepId === "dblclick-empty-z4" && key === "Z4")
                    }
                    onAssignZoneDoubleClick={handleZoneDoubleClick}
                  />
                ))}
              </div>

              {pad && (
                <div className="sb-guide-pad-anchor">
                  <TutorialPlacementPad
                    slotKey={pad.slotKey}
                    assignment={board[pad.slotKey]}
                    mode={pad.mode}
                    pickerOptions={pickerOptions}
                    highlightMark={stepId === "mark-unavailable"}
                    highlightAssign={stepId === "tap-assign"}
                    highlightPickerTmId={stepId === "pick-chen" ? "tm-chen" : undefined}
                    onClose={() => setPad(null)}
                    onMarkUnavailable={handleMarkUnavailable}
                    onAssignTap={handleAssignTap}
                    onSwapTap={() => {
                      if (!board[pad.slotKey]) handleAssignTap();
                    }}
                    onClear={() => {}}
                    onPickTm={handlePickChen}
                  />
                </div>
              )}
            </div>

            <TutorialRoster
              placed={placedForRoster}
              calledOff={calledOff}
              highlightCalledOff={stepId === "review-called-off"}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
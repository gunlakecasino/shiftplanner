"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "./graveCoverGuideTutorial.css";

export const GRAVE_COVER_GUIDE_STORAGE_KEY = "shiftbuilder:grave-cover-guide-completed";

const TOTAL_STEPS = 8;

const STEP_LABELS = [
  "1 Welcome + Quick Start",
  "2 Sign In & Night",
  "3 Screen Tour",
  "4 The 3 Key Buttons",
  "5 No Replacements Reality",
  "6 Reshuffle in Action",
  "7 Swap & Panel Demo",
  "8 Finish Strong",
] as const;

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
    /* ignore quota / private mode */
  }
}

export function isGraveCoverGuideCompleted(): boolean {
  try {
    return localStorage.getItem(GRAVE_COVER_GUIDE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function SlideWelcome({
  quickStartDone,
  onQuickStartTap,
  onStartTour,
}: {
  quickStartDone: Set<string>;
  onQuickStartTap: (id: string) => void;
  onStartTour: () => void;
}) {
  const items = [
    { id: "sign-in", label: "Sign In" },
    { id: "pick-night", label: "Pick Night" },
    { id: "reshuffle", label: "Reshuffle" },
    { id: "done", label: "Done" },
  ];

  return (
    <>
      <h2>Welcome to Grave Shift Coverage</h2>
      <p className="sb-cover-guide-lead">
        Most nights there are <strong>no extra people</strong>. You move people already on the board.
      </p>
      <div className="sb-cover-guide-warning">
        Start on the deployment board, not the roster — Scheduled / unplaced is often empty on grave.
      </div>
      <div className="sb-cover-guide-grid-4">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn("sb-cover-guide-chip", quickStartDone.has(item.id) && "is-done")}
            onClick={() => onQuickStartTap(item.id)}
          >
            {quickStartDone.has(item.id) ? "✓ " : ""}
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="sb-cover-guide-sim-btn" onClick={onStartTour}>
        Start 60-Second Tour →
      </button>
    </>
  );
}

function SlideSignInNight({
  nightConfirmed,
  onConfirmNight,
}: {
  nightConfirmed: boolean;
  onConfirmNight: () => void;
}) {
  return (
    <>
      <h3>Sign in + pick the correct night</h3>
      <div className="sb-cover-guide-mock-bar">
        Top bar → <span className="sb-cover-guide-pill">Mon Tue Wed</span> ← / → Calendar
      </div>
      <p className="sb-cover-guide-warning" style={{ marginTop: 14 }}>
        Always double-check the date — it is the #1 mistake.
      </p>
      <button type="button" className="sb-cover-guide-outline-btn" onClick={onConfirmNight}>
        {nightConfirmed ? "✓ Tonight confirmed" : "Simulate: confirm tonight"}
      </button>
      {nightConfirmed && (
        <div className="sb-cover-guide-feedback">Night confirmed. You are editing the right grave shift.</div>
      )}
    </>
  );
}

function SlideScreenTour({
  openedCards,
  onOpenCard,
}: {
  openedCards: Set<string>;
  onOpenCard: (id: string) => void;
}) {
  const cards = [
    { id: "z4", label: "Z4", sub: "Called off", calledOff: true },
    { id: "rr", label: "RR Women", sub: null, calledOff: false },
    { id: "aux", label: "AUX", sub: null, calledOff: false },
  ];

  return (
    <>
      <h3>Screen tour — tap the cards</h3>
      <div className="sb-cover-guide-grid-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={cn(
              "sb-cover-guide-zone",
              card.calledOff && "is-called-off",
              openedCards.has(card.id) && "is-opened",
            )}
            onClick={() => onOpenCard(card.id)}
          >
            {openedCards.has(card.id) ? "Opened ✓" : card.label}
            {!openedCards.has(card.id) && card.sub && (
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 4 }}>{card.sub}</div>
            )}
          </button>
        ))}
      </div>
      <p className="sb-cover-guide-note">
        Double-click the upper name area to open the placement panel. Double-click the lower task area for tasks.
      </p>
    </>
  );
}

function SlideThreeButtons({
  lastAction,
  onAction,
}: {
  lastAction: string | null;
  onAction: (action: string) => void;
}) {
  return (
    <>
      <h3>The only 3 buttons you need tonight</h3>
      <div className="sb-cover-guide-actions-row">
        <button
          type="button"
          className="sb-cover-guide-action-btn sb-cover-guide-action-btn--mark"
          onClick={() => onAction("mark")}
        >
          Mark unavailable (whole night)
        </button>
        <button
          type="button"
          className="sb-cover-guide-action-btn sb-cover-guide-action-btn--clear"
          onClick={() => onAction("clear")}
        >
          Clear (one slot only)
        </button>
        <button
          type="button"
          className="sb-cover-guide-action-btn sb-cover-guide-action-btn--restore"
          onClick={() => onAction("restore")}
        >
          Restore (from Called off)
        </button>
      </div>
      {lastAction === "mark" && (
        <div className="sb-cover-guide-feedback">Marked unavailable — removed from all slots, added to Called off.</div>
      )}
      {lastAction === "clear" && (
        <div className="sb-cover-guide-feedback">Cleared from one slot — TM stays available elsewhere.</div>
      )}
      {lastAction === "restore" && (
        <div className="sb-cover-guide-feedback">Restored — TM is assignable again. You still need to place them.</div>
      )}
    </>
  );
}

function SlideNoReplacements({
  decision,
  onDecision,
}: {
  decision: string;
  onDecision: (value: string) => void;
}) {
  return (
    <>
      <h3>Reality check — no replacements</h3>
      <select
        className="sb-cover-guide-select"
        value={decision}
        onChange={(e) => onDecision(e.target.value)}
      >
        <option value="A">A. Pull from lighter zone (most common)</option>
        <option value="B">B. Restore someone who showed up</option>
        <option value="C">C. Call admin (only big gaps)</option>
      </select>
      {decision === "A" && (
        <div className="sb-cover-guide-feedback">Correct — reshuffle from the board first. This is most nights.</div>
      )}
      {decision === "B" && (
        <div className="sb-cover-guide-feedback">Use when someone was marked off by mistake or showed up late.</div>
      )}
      {decision === "C" && (
        <div className="sb-cover-guide-feedback">Reserve for broken board issues or gaps too big to reshuffle.</div>
      )}
      <p className="sb-cover-guide-note" style={{ textAlign: "center", marginTop: 16 }}>
        It is normal to run lean. Do not panic-call admin for every thin zone.
      </p>
    </>
  );
}

function SlideReshuffle({ simulated, onSimulate }: { simulated: boolean; onSimulate: () => void }) {
  return (
    <>
      <h3>Reshuffle in action — try it</h3>
      <button type="button" className="sb-cover-guide-sim-btn" onClick={onSimulate}>
        Simulate: pull Z8 → Z4 → leave Z8 thin + add note
      </button>
      {simulated && (
        <div className="sb-cover-guide-feedback">
          Z8 moved to Z4. Z8 is thin. Note added for day shift. This is what happens on most call-off nights.
        </div>
      )}
      <p className="sb-cover-guide-note" style={{ textAlign: "center" }}>
        Swap or drag — do not wait for Scheduled / unplaced.
      </p>
    </>
  );
}

function SlideSwapPanel({
  panelOpened,
  dragDone,
  onOpenPanel,
  onDrag,
}: {
  panelOpened: boolean;
  dragDone: boolean;
  onOpenPanel: () => void;
  onDrag: () => void;
}) {
  return (
    <>
      <h3>Hands-on: Swap is king</h3>
      <div className="sb-cover-guide-panel-mock">
        Double-click a card →{" "}
        <button type="button" className="sb-cover-guide-swap-pill" onClick={onOpenPanel}>
          Swap
        </button>{" "}
        ← most-used button on call-off nights
      </div>
      {panelOpened && (
        <div className="sb-cover-guide-feedback">Placement panel opened — Swap is highlighted.</div>
      )}
      <button type="button" className="sb-cover-guide-outline-btn" onClick={onDrag}>
        {dragDone ? "✓ Drag complete" : "Try drag: move TM from Z8 to Z4"}
      </button>
      {dragDone && (
        <div className="sb-cover-guide-feedback">Nice — drag between cards works the same as Swap.</div>
      )}
    </>
  );
}

function SlideFinish({
  onFinish,
  onRequestPrint,
  signOutReminder,
  onSignOutReminder,
}: {
  onFinish: () => void;
  onRequestPrint?: () => void;
  signOutReminder: boolean;
  onSignOutReminder: () => void;
}) {
  return (
    <>
      <div className="sb-cover-guide-success">You are ready</div>
      <p className="sb-cover-guide-lead" style={{ textAlign: "center", marginTop: 12 }}>
        You know what a one-time coverer needs: mark off, reshuffle from the board, swap or drag, note thin zones.
      </p>
      <div className="sb-cover-guide-finish-row">
        <button type="button" className="sb-cover-guide-primary" onClick={onFinish}>
          Dismiss &amp; use ShiftBuilder
        </button>
        <button
          type="button"
          className="sb-cover-guide-secondary"
          onClick={() => {
            onSignOutReminder();
            onRequestPrint?.();
          }}
        >
          {signOutReminder ? "✓ Reminder set" : "Print sheet + sign-out reminder"}
        </button>
      </div>
      {signOutReminder && (
        <div className="sb-cover-guide-feedback" style={{ textAlign: "center" }}>
          Reminder: sign out from the account menu when you leave the ops station.
        </div>
      )}
      <p className="sb-cover-guide-note" style={{ textAlign: "center", marginTop: 16 }}>
        Gun Lake Casino — Operations / ShiftBuilder
      </p>
    </>
  );
}

export function GraveCoverGuideTutorial({
  open,
  isDark = false,
  onClose,
  onFinish,
  onRequestPrint,
}: GraveCoverGuideTutorialProps) {
  const [step, setStep] = React.useState(1);
  const [quickStartDone, setQuickStartDone] = React.useState<Set<string>>(() => new Set());
  const [nightConfirmed, setNightConfirmed] = React.useState(false);
  const [openedCards, setOpenedCards] = React.useState<Set<string>>(() => new Set());
  const [lastAction, setLastAction] = React.useState<string | null>(null);
  const [decision, setDecision] = React.useState("A");
  const [reshuffleSimulated, setReshuffleSimulated] = React.useState(false);
  const [panelOpened, setPanelOpened] = React.useState(false);
  const [dragDone, setDragDone] = React.useState(false);
  const [signOutReminder, setSignOutReminder] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setQuickStartDone(new Set());
    setNightConfirmed(false);
    setOpenedCards(new Set());
    setLastAction(null);
    setDecision("A");
    setReshuffleSimulated(false);
    setPanelOpened(false);
    setDragDone(false);
    setSignOutReminder(false);
  }, [open]);

  const finish = React.useCallback(() => {
    markGraveCoverGuideCompleted();
    onFinish();
    onClose();
  }, [onClose, onFinish]);

  const nextStep = React.useCallback(() => {
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }, []);

  const prevStep = React.useCallback(() => {
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const goTo = React.useCallback((n: number) => {
    setStep(Math.max(1, Math.min(TOTAL_STEPS, n)));
  }, []);

  const markUnderstood = React.useCallback(() => {
    nextStep();
  }, [nextStep]);

  if (!open || typeof document === "undefined") return null;

  const slide = (() => {
    switch (step) {
      case 1:
        return (
          <SlideWelcome
            quickStartDone={quickStartDone}
            onQuickStartTap={(id) => setQuickStartDone((prev) => new Set(prev).add(id))}
            onStartTour={nextStep}
          />
        );
      case 2:
        return (
          <SlideSignInNight
            nightConfirmed={nightConfirmed}
            onConfirmNight={() => setNightConfirmed(true)}
          />
        );
      case 3:
        return (
          <SlideScreenTour
            openedCards={openedCards}
            onOpenCard={(id) => setOpenedCards((prev) => new Set(prev).add(id))}
          />
        );
      case 4:
        return (
          <SlideThreeButtons lastAction={lastAction} onAction={setLastAction} />
        );
      case 5:
        return <SlideNoReplacements decision={decision} onDecision={setDecision} />;
      case 6:
        return (
          <SlideReshuffle
            simulated={reshuffleSimulated}
            onSimulate={() => setReshuffleSimulated(true)}
          />
        );
      case 7:
        return (
          <SlideSwapPanel
            panelOpened={panelOpened}
            dragDone={dragDone}
            onOpenPanel={() => setPanelOpened(true)}
            onDrag={() => setDragDone(true)}
          />
        );
      case 8:
      default:
        return (
          <SlideFinish
            onFinish={finish}
            onRequestPrint={onRequestPrint}
            signOutReminder={signOutReminder}
            onSignOutReminder={() => setSignOutReminder(true)}
          />
        );
    }
  })();

  return createPortal(
    <div
      className="sb-cover-guide-backdrop no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sb-cover-guide-heading"
      onClick={onClose}
    >
      <div
        className={cn("sb-cover-guide-shell", isDark && "sb-cover-guide-shell--dark")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sb-cover-guide-top">
          <div className="sb-cover-guide-brand">
            <div className="sb-cover-guide-mark" aria-hidden>
              SB
            </div>
            <h1 id="sb-cover-guide-heading" className="sb-cover-guide-title">
              Grave Cover Guide
            </h1>
          </div>
          <div className="sb-cover-guide-progress" aria-label="Tutorial progress">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => {
              const n = i + 1;
              return (
                <button
                  key={n}
                  type="button"
                  className={cn(
                    "sb-cover-guide-dot",
                    n === step && "is-active",
                    n < step && "is-done",
                  )}
                  onClick={() => goTo(n)}
                  aria-label={`Step ${n}`}
                  aria-current={n === step ? "step" : undefined}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <button type="button" className="sb-cover-guide-close" onClick={onClose} aria-label="Close guide">
            <X size={18} />
          </button>
        </header>

        <div className="sb-cover-guide-body">
          <nav className="sb-cover-guide-sidebar" aria-label="Tutorial steps">
            {STEP_LABELS.map((label, index) => {
              const n = index + 1;
              return (
                <button
                  key={label}
                  type="button"
                  className={cn("sb-cover-guide-step-btn", n === step && "is-current")}
                  onClick={() => goTo(n)}
                >
                  {label}
                </button>
              );
            })}
          </nav>
          <div className="sb-cover-guide-main">{slide}</div>
        </div>

        <footer className="sb-cover-guide-bottom">
          <button type="button" className="sb-cover-guide-understood" onClick={markUnderstood}>
            <Check size={16} strokeWidth={2.5} />
            I got this
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="sb-cover-guide-nav-btn"
              onClick={prevStep}
              disabled={step <= 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="sb-cover-guide-nav-btn sb-cover-guide-nav-btn--next"
              onClick={step >= TOTAL_STEPS ? finish : nextStep}
            >
              {step >= TOTAL_STEPS ? "Finish" : "Next step →"}
            </button>
          </div>
          <button type="button" className="sb-cover-guide-skip" onClick={finish}>
            Skip tutorial
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
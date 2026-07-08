"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * A calm, premium loading state shown while a placement engine computes.
 *
 * The hero is an abstract deployment grid that solves itself in a diagonal
 * light-wave — a nod to the night board being filled slot by slot. It's used
 * for blocking runs that otherwise give no feedback (the week engine closes
 * the More menu the moment it starts, so there's nothing to watch).
 *
 * Monochrome by design: gold is the Draft covenant, teal is Projects. The life
 * here comes from motion, not hue — so it never claims either semantic color.
 * All animation lives in globals.css (`.sb-engine-*`) and honors
 * prefers-reduced-motion.
 */

const GRID_COLS = 10; // a nod to the board's ten zones
const GRID_ROWS = 4;
const CELL_PX = 14;
/** Seconds of phase offset per anti-diagonal — sets the wave's travel speed. */
const WAVE_STEP = 0.09;
/** How long each phase line lingers before the next fades in. */
const PHASE_MS = 1600;

// The class-level backdrop-filter is dropped by the build (Turbopack/Lightning
// CSS), so the frosted glass is applied inline — the same pattern the rest of
// the app's velvet-glass surfaces use.
const SCRIM_BLUR = "blur(12px) saturate(115%)";
const GLASS_BLUR = "var(--sb-glass-blur)";

const DEFAULT_PHASES = [
  "Reading the roster",
  "Scoring coverage",
  "Weighing fairness",
  "Balancing rotation",
  "Finalizing placements",
];

// Client-only gate (the overlay portals to document.body). useSyncExternalStore
// keeps SSR rendering null and the client rendering the portal with no
// hydration mismatch — and no set-state-in-effect.
const noopSubscribe = () => () => {};
function useIsClient() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export interface EngineRunningOverlayProps {
  open: boolean;
  /** Big line — what's happening. */
  title?: string;
  /** Quiet, slowly-cycling steps beneath the title. Pass one for a static line. */
  phases?: string[];
  /** Accessible announcement; defaults to the title. */
  label?: string;
}

export function EngineRunningOverlay({
  open,
  title = "Composing the week",
  phases = DEFAULT_PHASES,
  label,
}: EngineRunningOverlayProps) {
  // Portal to <body> so the fixed scrim escapes the board canvas's transformed /
  // backdrop-filtered ancestors — otherwise `inset: 0` resolves against that
  // tiny containing block and the overlay collapses to the top of the screen.
  const isClient = useIsClient();

  if (!isClient) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="sb-engine-scrim"
          role="status"
          aria-live="polite"
          aria-label={label ?? title}
          style={{ backdropFilter: SCRIM_BLUR, WebkitBackdropFilter: SCRIM_BLUR }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* The card is its own component so it remounts each run — phase state
              starts fresh at "Reading the roster" without a reset effect. */}
          <EngineRunningCard title={title} phases={phases} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function EngineRunningCard({ title, phases }: { title: string; phases: string[] }) {
  const reduceMotion = useReducedMotion();
  const [phaseIdx, setPhaseIdx] = React.useState(0);

  // Cycle the phase line while the run is active. Reduced motion (or a single
  // phase) never starts the timer, so it pins to the first line.
  React.useEffect(() => {
    if (reduceMotion || phases.length <= 1) return;
    const id = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % phases.length);
    }, PHASE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, phases.length]);

  const cells = React.useMemo(() => {
    const out: Array<{ delay: number }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        out.push({ delay: (r + c) * WAVE_STEP });
      }
    }
    return out;
  }, []);

  const phaseText = phases[phaseIdx] ?? phases[0] ?? "";

  return (
    <motion.div
      className="sb-engine-card"
      style={{ backdropFilter: GLASS_BLUR, WebkitBackdropFilter: GLASS_BLUR }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.96 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.9 }}
    >
      <div className="sb-engine-stage">
        <div className="sb-engine-halo" aria-hidden="true" />
        <div
          className="sb-engine-grid"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_PX}px)` }}
        >
          {cells.map((cell, i) => (
            <span
              key={i}
              className="sb-engine-cell"
              style={reduceMotion ? undefined : { animationDelay: `${cell.delay}s` }}
            />
          ))}
        </div>
      </div>

      <div className="sb-engine-copy">
        <p className="sb-engine-title">{title}</p>
        <div className="sb-engine-phase-wrap">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phaseText}
              className="sb-engine-phase"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {phaseText}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="sb-engine-bar" aria-hidden="true">
        <span />
      </div>
    </motion.div>
  );
}

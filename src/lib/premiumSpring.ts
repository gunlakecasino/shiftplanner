import type { Transition } from "framer-motion";

/**
 * Apple-level premium spring constants for ShiftBuilder builder view (interactive mode only).
 * NEVER used in print-preview or PDF paths. All consumers must guard with isBuilderDeployment / !isPrintPreview / showDigitalAssists.
 *
 * Refinements:
 * - Slight stiffness bump for snappier premium snap (still soft).
 * - Reduced motion support: use useReducedMotion() from framer and fall back to reduced variants for a11y.
 */
export const premiumSpring = {
  type: "spring",
  stiffness: 420,
  damping: 30,
  mass: 0.85,
} as const satisfies Transition;

// For prefers-reduced-motion (use with useReducedMotion() hook in consumers)
export const premiumSpringReduced = {
  type: "tween",
  duration: 0.18,
  ease: [0.25, 0.1, 0.25, 1],
} as const satisfies Transition;

/** Full entrance for grid cards, sections, etc. */
export const premiumEntrance = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: premiumSpring,
};
export const premiumEntranceReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: premiumSpringReduced,
};

/** Card/container lift + tap squash. */
export const premiumHoverLift = {
  whileHover: { y: -3, scale: 1.015, transition: premiumSpring },
  whileTap: { scale: 0.985, transition: { ...premiumSpring, stiffness: 500, damping: 20 } },
};

/** Builder grid hosts — shadow-only hover (no scale) to avoid zoom jitter inside the scaled canvas. */
export const premiumBuilderCardHost = {
  // Framer makes gesture-enabled divs keyboard-focusable by default. The card
  // already exposes deliberate assignee/task controls, so keep this visual
  // animation wrapper out of the tab order.
  tabIndex: -1,
  whileTap: { scale: 0.995, transition: { ...premiumSpring, stiffness: 500, damping: 24 } },
};

/** Staggered entrance delay for lists/grids. */
export const premiumStagger = (index: number) => ({
  transition: { ...premiumSpring, delay: 0.02 + index * 0.025 },
});

/** Reusable for buttons, nav pills, small controls (consistent scale + opacity). */
export const premiumButton = {
  whileHover: { scale: 1.08, opacity: 0.95, transition: premiumSpring },
  whileTap: { scale: 0.88, transition: { ...premiumSpring, stiffness: 500, damping: 18 } },
};

/** Subtle directional shift for chevrons/arrows (used in nav). */
export const premiumChevronShift = (dir: -1 | 1) => ({
  whileHover: { x: dir * 1.5, transition: { ...premiumSpring, stiffness: 500, damping: 28 } },
});

/** Quick tap squash for icons/small affordances. */
export const premiumTap = {
  whileTap: { scale: 0.96, transition: { ...premiumSpring, stiffness: 600, damping: 15 } },
};

/** Simple presence for toolbars, chips, transient UI (pairs with AnimatePresence). */
export const premiumPresence = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: premiumSpring,
};
export const premiumPresenceReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: premiumSpringReduced,
};

/**
 * Day-navigation crossfade for builder assignment cards only.
 * Opacity tween (no y/scale) — springs + exit animations fight CSS grid equalize and read choppy.
 */
export const premiumDaySwitchTween = {
  type: "tween",
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
} as const satisfies Transition;

export const premiumDaySwitchEnter = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: premiumDaySwitchTween,
};
export const premiumDaySwitchEnterReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: premiumSpringReduced,
};

/** Tight stagger cap — ripple without a long trailing cascade. */
export const premiumDaySwitchStagger = (index: number) => ({
  transition: {
    ...premiumDaySwitchTween,
    delay: Math.min(index, 5) * 0.008,
  },
});
export const premiumDaySwitchStaggerReduced = (index: number) => ({
  transition: {
    ...premiumSpringReduced,
    delay: Math.min(index, 5) * 0.006,
  },
});

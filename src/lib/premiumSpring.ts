import type { Transition } from "framer-motion";

/**
 * Apple-level premium spring constants for ShiftBuilder builder view (interactive mode only).
 * NEVER used in print-preview or PDF paths.
 */
export const premiumSpring = {
  type: "spring",
  stiffness: 380,
  damping: 28,
  mass: 0.9,
} as const satisfies Transition;

export const premiumEntrance = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: premiumSpring,
};

export const premiumHoverLift = {
  whileHover: { y: -3, scale: 1.015, transition: premiumSpring },
  whileTap: { scale: 0.985, transition: { ...premiumSpring, stiffness: 500, damping: 20 } },
};

export const premiumStagger = (index: number) => ({
  transition: { ...premiumSpring, delay: 0.02 + index * 0.025 },
});

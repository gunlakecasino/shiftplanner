import { Transition } from "framer-motion";

// Shared Apple-level spring for premium feel in ShiftBuilder UI rebuild (non-print areas only).
// For card entrances, hovers, taps, badges, etc. in the main deploy/breaks/overlaps pages.
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
  whileHover: { y: -2, scale: 1.01, transition: premiumSpring },
  whileTap: { scale: 0.985, transition: { ...premiumSpring, stiffness: 500, damping: 20 } },
};

export const premiumStagger = (i: number) => ({
  transition: { ...premiumSpring, delay: 0.02 + i * 0.025 },
});

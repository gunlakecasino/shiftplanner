"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { premiumSpring } from "@/lib/premiumSpring";
import { BREAK_GROUP_OVERLAPS } from "@/lib/shiftbuilder/constants";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

/** Coin-edge notch ring — reads as divotted even at card-header scale. */
function BreakImprintNotches({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10.1"
        stroke="currentColor"
        strokeWidth="0.65"
        opacity="0.3"
      />
      <circle
        cx="12"
        cy="12"
        r="9.15"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeDasharray="5.35 2.05"
        strokeLinecap="butt"
        transform="rotate(11.25 12 12)"
      />
    </svg>
  );
}

function BreakImprintMark({ value }: { value: number }) {
  if (value === 0) {
    return <span className="sb-break-imprint-dash" aria-hidden />;
  }
  if (value === BREAK_GROUP_OVERLAPS) {
    return <span className="sb-break-imprint-ol" aria-hidden>OL</span>;
  }
  return <span className="sb-break-imprint-num" aria-hidden>{value}</span>;
}

// BreakBadge: 0 = off (faint notch), 1/2/3/OL = grey debossed imprint.
// Cycle via nextBreakGroup: 1 → 2 → 3 → OL → – → 1.
const BreakBadge = React.memo(function BreakBadge({
  value,
  onCycle,
  size = "md",
  kioskSize = false,
}: {
  value: number;
  onCycle: () => void;
  size?: "sm" | "md";
  kioskSize?: boolean;
}) {
  const tablet = isTabletTouchDevice();
  const isOl = value === BREAK_GROUP_OVERLAPS;
  const imprintSize = tablet
    ? size === "sm"
      ? "sb-break-imprint--tablet-sm"
      : "sb-break-imprint--tablet-md"
    : size === "sm"
      ? "sb-break-imprint--sm"
      : "sb-break-imprint--md";

  const label =
    value === 0
      ? "Off the break sheet — tap to cycle"
      : isOl
        ? "Overlaps break group — tap to cycle"
        : `Break Group ${value} — tap to cycle`;
  const isOff = value === 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "sb-interactive sb-break-badge-btn sb-kiosk-action inline-flex items-center justify-center shrink-0",
        kioskSize && "sb-break-badge-kiosk",
        tablet || kioskSize ? "min-h-11 min-w-11 p-2" : "-m-1.5 p-1.5",
      )}
      title={label}
      aria-label={label}
    >
      <motion.span
        className={cn(
          "sb-break-imprint",
          imprintSize,
          isOff ? "sb-break-imprint--off" : "sb-break-imprint--active",
          kioskSize && "sb-break-imprint--kiosk",
        )}
        transition={premiumSpring}
        whileHover={{ scale: 1.06, transition: premiumSpring }}
        whileTap={{ scale: 0.94, transition: { ...premiumSpring, stiffness: 600, damping: 15 } }}
      >
        <BreakImprintNotches className="sb-break-imprint-svg" />
        <span className="sb-break-imprint-face">
          <BreakImprintMark value={value} />
        </span>
      </motion.span>
    </button>
  );
});

export default BreakBadge;
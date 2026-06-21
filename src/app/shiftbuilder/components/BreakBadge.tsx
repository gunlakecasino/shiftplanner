"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { premiumSpring } from "@/lib/premiumSpring";
import { BREAK_GROUP_OVERLAPS } from "@/lib/shiftbuilder/constants";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

function BreakImprintMark({ value }: { value: number }) {
  if (value === 0) {
    return <span className="sb-break-imprint-dash" aria-hidden>–</span>;
  }
  if (value === BREAK_GROUP_OVERLAPS) {
    return <span className="sb-break-imprint-ol" aria-hidden>OL</span>;
  }
  if (value === 1) {
    return (
      <span className="sb-break-imprint-dots sb-break-imprint-dots--1" aria-hidden>
        <span className="sb-break-imprint-dot" />
      </span>
    );
  }
  if (value === 2) {
    return (
      <span className="sb-break-imprint-dots sb-break-imprint-dots--2" aria-hidden>
        <span className="sb-break-imprint-dot" />
        <span className="sb-break-imprint-dot" />
      </span>
    );
  }
  return (
    <span className="sb-break-imprint-dots sb-break-imprint-dots--3" aria-hidden>
      <span className="sb-break-imprint-dot" />
      <span className="sb-break-imprint-dot" />
      <span className="sb-break-imprint-dot" />
    </span>
  );
}

// BreakBadge: 0 = off ("–"), 1/2/3 = dotted wave imprint, 4 = overlaps ("OL").
// Cycle via nextBreakGroup: 1 → 2 → 3 → OL → – → 1.
const BreakBadge = React.memo(function BreakBadge({
  value,
  onCycle,
  size = "md",
  accentColor,
  kioskSize = false,
}: {
  value: number;
  onCycle: () => void;
  size?: "sm" | "md";
  /** Zone accent tint for debossed imprint ring + dots */
  accentColor?: string;
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

  const imprintStyle = accentColor
    ? ({
        ["--break-imprint-accent" as string]: accentColor,
      } as React.CSSProperties)
    : undefined;

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
        style={imprintStyle}
        transition={premiumSpring}
        whileHover={{ scale: 1.06, transition: premiumSpring }}
        whileTap={{ scale: 0.94, transition: { ...premiumSpring, stiffness: 600, damping: 15 } }}
      >
        <span className="sb-break-imprint-ring" aria-hidden />
        <span className="sb-break-imprint-face">
          <BreakImprintMark value={value} />
        </span>
      </motion.span>
    </button>
  );
});

export default BreakBadge;
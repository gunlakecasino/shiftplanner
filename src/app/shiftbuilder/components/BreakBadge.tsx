"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { premiumSpring } from "@/lib/premiumSpring";
import { BREAK_GROUP_OVERLAPS, breakHeaderMark } from "@/lib/shiftbuilder/constants";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

// BreakBadge: header-style break mark (1/2/3/OL/–). Display-only on the
// deployment board; Sudo Card Defaults may still opt into cycling.
const BreakBadge = React.memo(function BreakBadge({
  value,
  onCycle,
  size = "md",
  kioskSize = false,
}: {
  value: number;
  onCycle?: () => void;
  size?: "sm" | "md";
  kioskSize?: boolean;
}) {
  const tablet = isTabletTouchDevice();
  const isOl = value === BREAK_GROUP_OVERLAPS;
  const isOff = value === 0;

  const displayLabel =
    value === 0
      ? "Off the break sheet"
      : isOl
        ? "Overlaps break group"
        : `Break Group ${value}`;
  const label = onCycle ? `${displayLabel} — tap to cycle` : displayLabel;

  const sizeClass =
    tablet || kioskSize
      ? size === "sm"
        ? "sb-break-header-num--tablet-sm"
        : "sb-break-header-num--tablet-md"
      : size === "sm"
        ? "sb-break-header-num--sm"
        : "sb-break-header-num--md";

  const badgeClass = cn(
    "sb-break-badge-btn sb-break-header-num sb-kiosk-action inline-flex items-center justify-center shrink-0",
    onCycle && "sb-interactive",
    sizeClass,
    isOff ? "sb-break-header-num--off" : "sb-break-header-num--on",
    isOl && "sb-break-header-num--ol",
    kioskSize && "sb-break-header-num--kiosk",
    tablet || kioskSize ? "min-h-11 min-w-11 p-2" : "-m-1 p-1",
  );
  const mark = (
    <motion.span
      className="leading-none"
      transition={premiumSpring}
      whileHover={onCycle ? { scale: 1.04, transition: premiumSpring } : undefined}
      whileTap={onCycle ? { scale: 0.96, transition: { ...premiumSpring, stiffness: 600, damping: 15 } } : undefined}
    >
      {breakHeaderMark(value)}
    </motion.span>
  );

  if (!onCycle) {
    return (
      <span className={badgeClass} title={label} aria-label={label}>
        {mark}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={badgeClass}
      title={label}
      aria-label={label}
    >
      {mark}
    </button>
  );
});

export default BreakBadge;

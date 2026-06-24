"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { premiumSpring } from "@/lib/premiumSpring";
import { BREAK_GROUP_OVERLAPS, breakHeaderMark } from "@/lib/shiftbuilder/constants";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

// BreakBadge: header-style break mark (1/2/3/OL/–). Tap to cycle.
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
  const isOff = value === 0;

  const label =
    value === 0
      ? "Off the break sheet — tap to cycle"
      : isOl
        ? "Overlaps break group — tap to cycle"
        : `Break Group ${value} — tap to cycle`;

  const sizeClass =
    tablet || kioskSize
      ? size === "sm"
        ? "sb-break-header-num--tablet-sm"
        : "sb-break-header-num--tablet-md"
      : size === "sm"
        ? "sb-break-header-num--sm"
        : "sb-break-header-num--md";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onCycle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "sb-interactive sb-break-badge-btn sb-break-header-num sb-kiosk-action inline-flex items-center justify-center shrink-0",
        sizeClass,
        isOff ? "sb-break-header-num--off" : "sb-break-header-num--on",
        isOl && "sb-break-header-num--ol",
        kioskSize && "sb-break-header-num--kiosk",
        tablet || kioskSize ? "min-h-11 min-w-11 p-2" : "-m-1 p-1",
      )}
      title={label}
      aria-label={label}
    >
      <motion.span
        className="leading-none"
        transition={premiumSpring}
        whileHover={{ scale: 1.04, transition: premiumSpring }}
        whileTap={{ scale: 0.96, transition: { ...premiumSpring, stiffness: 600, damping: 15 } }}
      >
        {breakHeaderMark(value)}
      </motion.span>
    </button>
  );
});

export default BreakBadge;
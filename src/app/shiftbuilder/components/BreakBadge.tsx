"use client";

import React from "react";
import { motion } from "framer-motion";
import { premiumSpring, premiumHoverLift } from "@/lib/premiumSpring";
import { breakGroupLabel, BREAK_GROUP_OVERLAPS } from "@/lib/shiftbuilder/constants";

// BreakBadge: 0 = off ("–"), 1/2/3 = waves, 4 = overlaps ("OL").
// Cycle via nextBreakGroup: 1 → 2 → 3 → OL → – → 1.
const BreakBadge = React.memo(function BreakBadge({ value, onCycle, size = "md" }: { value: number; onCycle: () => void; size?: "sm" | "md" }) {
  const isOl = value === BREAK_GROUP_OVERLAPS;
  const visual = isOl
    ? size === "sm"
      ? "w-[20px] h-[14px] text-[8px]"
      : "w-[24px] h-[16px] text-[9px]"
    : size === "sm"
      ? "w-[18px] h-[14px] text-[9px]"
      : "w-[22px] h-[16px] text-[10.5px]";
  const display = breakGroupLabel(value);
  const label =
    value === 0
      ? "Off the break sheet — tap to cycle"
      : isOl
        ? "Overlaps break group — tap to cycle"
        : `Break Group ${value} — tap to cycle`;
  const isOff = value === 0;

  const spanClass = `${visual} ${isOff ? "bg-[#9CA3AF] dark:bg-[#48484A]" : "bg-[#1C1C1E] dark:bg-[#E5E5E7] dark:text-[#1C1C1E]"} text-white font-bold rounded-[2px] flex items-center justify-center select-none leading-none`;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="sb-interactive -m-1.5 p-1.5 inline-flex items-center justify-center shrink-0"
      title={label}
      aria-label={label}
    >
      <motion.span
        className={spanClass}
        style={{ fontFamily: 'var(--font-ui, var(--font-inter-tight), system-ui)' }}
        {...premiumHoverLift}
        transition={premiumSpring}
        whileTap={{ scale: 0.92, transition: { ...premiumSpring, stiffness: 600, damping: 15 } }}
      >
        {display}
      </motion.span>
    </button>
  );
});

export default BreakBadge;
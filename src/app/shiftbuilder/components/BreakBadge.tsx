"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { premiumSpring, premiumHoverLift } from "@/lib/premiumSpring";
import { breakGroupLabel, BREAK_GROUP_OVERLAPS } from "@/lib/shiftbuilder/constants";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

// BreakBadge: 0 = off ("–"), 1/2/3 = waves, 4 = overlaps ("OL").
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
  /** Zone accent tint for /today kiosk break dots */
  accentColor?: string;
  kioskSize?: boolean;
}) {
  const tablet = isTabletTouchDevice();
  const isOl = value === BREAK_GROUP_OVERLAPS;
  const visual = tablet
    ? isOl
      ? size === "sm"
        ? "w-[30px] h-[22px] text-[10px]"
        : "w-[34px] h-[24px] text-[11px]"
      : size === "sm"
        ? "w-[28px] h-[22px] text-[11px]"
        : "w-[32px] h-[24px] text-[12px]"
    : isOl
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

  const spanClass = cn(
    "sb-break-badge-visual",
    visual,
    isOff ? "bg-[#9CA3AF] dark:bg-[#48484A]" : "bg-[#1C1C1E] dark:bg-[#E5E5E7] dark:text-[#1C1C1E]",
    "text-white font-bold rounded-[2px] flex items-center justify-center select-none leading-none",
    kioskSize && "sb-break-badge-kiosk-pill",
  );

  const pillStyle =
    !isOff && accentColor
      ? { background: accentColor, color: "#fff" }
      : undefined;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
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
        className={spanClass}
        style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui)", ...pillStyle }}
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
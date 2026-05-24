"use client";

import React from "react";

// BreakBadge: value 0 (or missing) = off the break sheet ("–") for this shift.
// Values 1/2/3 = the break wave. Cycle order 1→2→3→–→1. "-" deletes the DB record.
// Hit area extends beyond the visible glyph via padding+negative-margin so the
// chip stays at Golden-density visually but is comfortably tappable on iPad
// (28×24 effective hit area, satisfies the 24pt-minimum guidance for dense UI).
const BreakBadge: React.FC<{ value: number; onCycle: () => void; size?: "sm" | "md" }> = ({ value, onCycle, size = "md" }) => {
  const visual = size === "sm" ? "w-[18px] h-[14px] text-[9px]" : "w-[22px] h-[16px] text-[10.5px]";
  const label = value === 0 ? "Off the break sheet — tap to cycle" : `Break Group ${value} — tap to cycle`;
  const isOff = value === 0;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="-m-1.5 p-1.5 inline-flex items-center justify-center shrink-0"
      title={label}
      aria-label={label}
    >
      <span
        className={`${visual} ${isOff ? "bg-[#9CA3AF]" : "bg-[#1C1C1E]"} text-white font-bold rounded-[2px] flex items-center justify-center select-none leading-none`}
        style={{ fontFamily: 'var(--font-atkinson)' }}
      >
        {isOff ? "–" : value}
      </span>
    </button>
  );
};

export default BreakBadge;

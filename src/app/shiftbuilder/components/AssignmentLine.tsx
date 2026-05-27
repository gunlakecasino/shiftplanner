"use client";

import React from "react";

// Dashed assignment line — TM name rides on top, or empty when unfilled.
const AssignmentLine: React.FC<{
  tmName?: string | null;
  placeholder?: string;
  size?: "sm" | "md";
  isLocked?: boolean;
  loading?: boolean;
}> = ({ tmName, placeholder = "", size = "md", isLocked = false, loading = false }) => {
  const text = size === "sm" ? "text-[9px]" : "text-[11px]";
  if (loading) {
    return (
      <div className={`border-b border-dashed border-[#B0B0B6] pb-[1px] ${text} leading-tight`}>
        <span className="inline-block h-[10px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
      </div>
    );
  }
  return (
    <div className={`border-b border-dashed border-[#B0B0B6] pb-[1px] ${text} leading-tight truncate flex items-center gap-1 ${tmName ? "font-semibold text-[#111] dark:text-[#F2F2F4]" : "text-[#C8C8CC] dark:text-[#48484A]"}`}>
      {isLocked && tmName && (
        <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: size === "sm" ? 10 : 12, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
      )}
      <span className="truncate">{tmName || placeholder || " "}</span>
    </div>
  );
};

export default AssignmentLine;

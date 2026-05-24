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
        <svg width={size === "sm" ? 8 : 10} height={size === "sm" ? 8 : 10} viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
          <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
        </svg>
      )}
      <span className="truncate">{tmName || placeholder || " "}</span>
    </div>
  );
};

export default AssignmentLine;

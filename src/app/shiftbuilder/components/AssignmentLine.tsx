"use client";

import React from "react";
import { AssignmentSkeleton } from "./builderPrimitives";
import { MsIcon } from "./MsIcon";

// Dashed assignment line — TM name rides on top, or empty when unfilled.
const AssignmentLine = React.memo(function AssignmentLine({
  tmName,
  placeholder = "",
  size = "md",
  isLocked = false,
  loading = false,
}: {
  tmName?: string | null;
  placeholder?: string;
  size?: "sm" | "md";
  isLocked?: boolean;
  loading?: boolean;
}) {
  const text = size === "sm" ? "text-[9px]" : "text-[11px]";
  if (loading) {
    return (
      <div className={`border-b border-dashed border-[var(--ios-gray-4)] pb-[1px] ${text} leading-tight`}>
        <AssignmentSkeleton size="sm" />
      </div>
    );
  }
  return (
    <div className={`border-b border-dashed border-[var(--ios-gray-4)] pb-[1px] ${text} leading-tight truncate flex items-center gap-1 ${tmName ? "font-semibold text-[var(--ios-label)] dark:text-[#F2F2F4]" : "text-[var(--ios-gray-5)] dark:text-[#48484A]"}`}>
      {isLocked && tmName && (
        <MsIcon name="lock" className="shrink-0 text-[var(--ios-orange)]" aria-label="Locked" size={size === "sm" ? 10 : 12} fill={1} />
      )}
      <span className="truncate">{tmName || placeholder || " "}</span>
    </div>
  );
});

export default AssignmentLine;

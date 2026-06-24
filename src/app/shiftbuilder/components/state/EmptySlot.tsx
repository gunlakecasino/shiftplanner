"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type EmptySlotProps = {
  children: React.ReactNode;
  /** When true, shows a soft assign hint overlay (non-interactive). */
  empty: boolean;
  hint?: string;
  className?: string;
};

/**
 * Soft empty-slot hint wrapper — additive overlay only; does not replace UnassignedInvite.
 * pointer-events-none keeps existing click/drop handlers on the card intact.
 */
export function EmptySlot({
  children,
  empty,
  hint = "Assign TM",
  className = "",
}: EmptySlotProps) {
  return (
    <div className={cn("relative min-h-0", className)}>
      {children}
      {empty ? (
        <div
          className="sb-empty-slot-hint sb-empty-slot-hint--visible absolute inset-0 flex items-end justify-center pb-2 pointer-events-none no-print"
          aria-hidden="true"
        >
          <span className="sb-empty-slot-hint__text">{hint}</span>
        </div>
      ) : null}
    </div>
  );
}
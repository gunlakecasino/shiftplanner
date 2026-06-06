"use client";

import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import RosterItem, { type RosterItemProps } from "./RosterItem";

/**
 * VirtualRosterList — Phase 1 Performance Beast Mode
 *
 * Renders a (potentially very large) list of RosterItems inside a scroll container
 * using @tanstack/react-virtual. Only the items that are actually visible in the
 * viewport are rendered in the DOM.
 *
 * This is the single highest-leverage change for INP and main-thread work on
 * the ShiftBuilder roster rail when you have 40–70+ team members.
 *
 * Usage:
 *   <VirtualRosterList
 *     items={visibleTms}
 *     estimateSize={42}   // ~42px per row with current padding
 *     overscan={8}
 *     getItemProps={(tm) => ({ tm, isAssigned: ..., emphasis: "off" })}
 *   />
 */

interface VirtualRosterListProps {
  items: any[];
  estimateSize?: number;
  overscan?: number;
  getItemProps: (tm: any, index: number) => Omit<RosterItemProps, "tm"> & { tm: any };
  className?: string;
  emptyState?: React.ReactNode;
  /** If true, assumes it lives inside an already-scrolling parent (no internal overflow) */
  useParentScroll?: boolean;
}

export default function VirtualRosterList({
  items,
  estimateSize = 42,
  overscan = 6,
  getItemProps,
  className,
  emptyState,
  useParentScroll = false,
}: VirtualRosterListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => (useParentScroll ? parentRef.current?.parentElement ?? parentRef.current : parentRef.current),
    estimateSize: () => estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (items.length === 0) {
    return <>{emptyState}</>;
  }

  const containerClass = useParentScroll 
    ? (className ?? "w-full") 
    : (className ?? "flex-1 min-h-0 overflow-auto px-4 pb-8");

  return (
    <div
      ref={parentRef}
      className={containerClass}
      style={{ contain: "layout style" }}
    >
      {/* The big spacer that creates the scroll height */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {/* Only the visible window is actually mounted */}
        {virtualItems.map((virtualRow) => {
          const tm = items[virtualRow.index];
          const props = getItemProps(tm, virtualRow.index);

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translate3d(0, ${virtualRow.start}px, 0)`,
                willChange: "transform",
              }}
            >
              <RosterItem {...props} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

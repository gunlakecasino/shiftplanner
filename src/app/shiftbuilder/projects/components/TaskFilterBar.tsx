"use client";

import React from "react";
import { LayoutList, Kanban, Repeat, CalendarDays } from "lucide-react";

export type SmartFilter = "all" | "open" | "overdue" | "tonight" | "complete";
export type BoardView = "list" | "board" | "calendar" | "recurring";

const SMART_FILTERS: { id: SmartFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "tonight", label: "Due Tonight" },
  { id: "complete", label: "Complete" },
  { id: "all", label: "All" },
];

export function TaskFilterBar({
  smartFilter,
  onSmartFilterChange,
  view,
  onViewChange,
  overdueCount,
}: {
  smartFilter: SmartFilter;
  onSmartFilterChange: (f: SmartFilter) => void;
  view: BoardView;
  onViewChange: (v: BoardView) => void;
  overdueCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Smart filters describe instance state — only relevant to List/Board. */}
        {(view === "list" || view === "board") && SMART_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onSmartFilterChange(f.id)}
            className="relative rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors"
            style={{
              background: smartFilter === f.id ? "var(--sb-projects-accent)" : "var(--ios-gray-6)",
              color: smartFilter === f.id ? "white" : "var(--ios-label-secondary)",
            }}
          >
            {f.label}
            {f.id === "overdue" && overdueCount > 0 && (
              <span
                className="ml-1.5 tabular-nums"
                style={{ color: smartFilter === f.id ? "white" : "var(--sb-projects-overdue)" }}
              >
                {overdueCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border border-[var(--sb-settings-border-paper)] p-0.5">
        <button
          type="button"
          onClick={() => onViewChange("list")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
          style={{
            background: view === "list" ? "var(--ios-background-primary)" : "transparent",
            color: view === "list" ? "var(--ios-label)" : "var(--ios-label-tertiary)",
          }}
        >
          <LayoutList size={13} /> List
        </button>
        <button
          type="button"
          onClick={() => onViewChange("board")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
          style={{
            background: view === "board" ? "var(--ios-background-primary)" : "transparent",
            color: view === "board" ? "var(--ios-label)" : "var(--ios-label-tertiary)",
          }}
        >
          <Kanban size={13} /> Board
        </button>
        <button
          type="button"
          onClick={() => onViewChange("calendar")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
          style={{
            background: view === "calendar" ? "var(--ios-background-primary)" : "transparent",
            color: view === "calendar" ? "var(--ios-label)" : "var(--ios-label-tertiary)",
          }}
        >
          <CalendarDays size={13} /> Calendar
        </button>
        <button
          type="button"
          onClick={() => onViewChange("recurring")}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
          style={{
            background: view === "recurring" ? "var(--ios-background-primary)" : "transparent",
            color: view === "recurring" ? "var(--ios-label)" : "var(--ios-label-tertiary)",
          }}
        >
          <Repeat size={13} /> Recurring
        </button>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { CalendarDays, Kanban, LayoutList } from "lucide-react";

export type SmartFilter = "all" | "open" | "overdue" | "tonight" | "complete" | "my-floor" | "from-recap" | "staffing" | "compliance";
export type BoardView = "list" | "board" | "calendar" | "recurring" | "pools" | "defaults" | "planner";

const PRIMARY_FILTERS: { id: SmartFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "tonight", label: "Due Tonight" },
  { id: "complete", label: "Complete" },
  { id: "all", label: "All" },
];

const SAVED_FILTERS: { id: SmartFilter; label: string }[] = [
  { id: "my-floor", label: "My Floor Notes" },
  { id: "from-recap", label: "From Recaps" },
  { id: "staffing", label: "Staffing" },
  { id: "compliance", label: "Compliance / Training" },
];

const TOOL_VIEWS: { id: BoardView; label: string }[] = [
  { id: "recurring", label: "Recurring" },
  { id: "pools", label: "Pools" },
  { id: "defaults", label: "Defaults" },
  { id: "planner", label: "Planner" },
];

const primaryViews: Array<{
  id: BoardView;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: "list", label: "List", icon: LayoutList },
  { id: "board", label: "Board", icon: Kanban },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
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
  const isTaskView = view === "list" || view === "board";
  const selectedSavedFilter = SAVED_FILTERS.some((item) => item.id === smartFilter)
    ? smartFilter
    : "";
  const selectedToolView = TOOL_VIEWS.some((item) => item.id === view) ? view : "";

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      {isTaskView && (
        <div className="no-scrollbar flex w-full min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 lg:w-auto">
          {PRIMARY_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => onSmartFilterChange(filter.id)}
              className="relative shrink-0 rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors"
              style={{
                background: smartFilter === filter.id ? "var(--sb-projects-accent)" : "var(--ios-gray-6)",
                color: smartFilter === filter.id ? "white" : "var(--ios-label-secondary)",
              }}
            >
              {filter.label}
              {filter.id === "overdue" && overdueCount > 0 && (
                <span
                  className="ml-1.5 tabular-nums"
                  style={{ color: smartFilter === filter.id ? "white" : "var(--sb-projects-overdue)" }}
                >
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
          <select
            aria-label="Saved task filter"
            value={selectedSavedFilter}
            onChange={(event) => {
              if (event.target.value) onSmartFilterChange(event.target.value as SmartFilter);
            }}
            className="h-[27px] shrink-0 rounded-full border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-primary)] px-2.5 text-[11.5px] font-medium text-[var(--ios-label-secondary)] outline-none"
          >
            <option value="">Saved filters…</option>
            {SAVED_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>{filter.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex w-full min-w-0 items-center gap-1 lg:w-auto">
        <div className="flex min-w-0 items-center gap-0.5 rounded-lg border border-[var(--sb-settings-border-paper)] p-0.5">
          {primaryViews.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors"
              style={{
                background: view === id ? "var(--ios-background-primary)" : "transparent",
                color: view === id ? "var(--ios-label)" : "var(--ios-label-tertiary)",
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <select
          aria-label="Project tools"
          value={selectedToolView}
          onChange={(event) => {
            if (event.target.value) onViewChange(event.target.value as BoardView);
          }}
          className="h-[29px] min-w-0 flex-1 rounded-lg border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-primary)] px-2 text-[11.5px] font-medium text-[var(--ios-label-secondary)] outline-none lg:w-[112px] lg:flex-none"
        >
          <option value="">Tools…</option>
          {TOOL_VIEWS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

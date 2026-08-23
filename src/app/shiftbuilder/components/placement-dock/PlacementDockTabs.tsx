"use client";

import { cn } from "@/lib/utils";
import type { PlacementDockTab } from "./placementDockTypes";

const TABS: { id: PlacementDockTab; label: string }[] = [
  { id: "assign", label: "Assign" },
  { id: "tasks", label: "Tasks" },
  { id: "intel", label: "Intel" },
];

export function PlacementDockTabs({
  active,
  onChange,
}: {
  active: PlacementDockTab;
  onChange: (tab: PlacementDockTab) => void;
}) {
  return (
    <div
      className="placement-dock-tabs flex shrink-0 px-3"
      role="tablist"
      aria-label="Placement dock"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "sb-dock-tab sb-interactive flex-1 px-2 text-[13px] font-semibold tracking-tight",
            active === tab.id ? "sb-dock-tab--active" : "sb-dock-tab--idle",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
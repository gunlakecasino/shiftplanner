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
      className="placement-dock-tabs flex shrink-0 gap-1 border-b border-black/[0.06] px-3 py-2"
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
            "sb-interactive min-h-11 flex-1 rounded-xl px-3 text-[14px] font-semibold tracking-tight transition-colors",
            active === tab.id
              ? "bg-[#1C1C1E] text-white shadow-sm"
              : "bg-black/[0.04] text-neutral-600 hover:bg-black/[0.07]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
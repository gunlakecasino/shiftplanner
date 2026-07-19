"use client";

import { useState, useEffect } from "react";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

/**
 * Bundles floating panel open/close state for the roster rail and weekly overview.
 *
 * Roster filter, search, and section expand/collapse live in Zustand (rosterUI slice)
 * so RosterRail can subscribe narrowly without prop drilling.
 */
export function useRosterPanels() {
  // Floating roster rail open/close.
  // SheetBuilder's redesigned toolbar uses a compact roster dropdown as the
  // primary roster surface, so the legacy rail should never boot open from a
  // previously persisted browser state.
  const [rosterOpen, setRosterOpen] = useState<boolean>(false);
  useEffect(() => {
    if (isTabletTouchDevice()) {
      localStorage.removeItem("oms_roster_open_tablet");
    } else {
      localStorage.removeItem("oms_roster_open");
    }
  }, [rosterOpen]);

  // Modal / flyout toggles.
  const [xaiSphereOpen, setXaiSphereOpen] = useState(false);

  // Weekly Overview panel (live table). Persisted like roster (tablet/desktop split).
  const [weeklyOverviewOpen, setWeeklyOverviewOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (isTabletTouchDevice()) {
      const tabletSaved = localStorage.getItem("oms_weekly_overview_open_tablet");
      return tabletSaved === "true";
    }
    const saved = localStorage.getItem("oms_weekly_overview_open");
    return saved === null ? false : saved === "true";
  });
  useEffect(() => {
    if (isTabletTouchDevice()) {
      localStorage.setItem("oms_weekly_overview_open_tablet", String(weeklyOverviewOpen));
    } else {
      localStorage.setItem("oms_weekly_overview_open", String(weeklyOverviewOpen));
    }
  }, [weeklyOverviewOpen]);

  return {
    rosterOpen, setRosterOpen,
    xaiSphereOpen, setXaiSphereOpen,
    weeklyOverviewOpen, setWeeklyOverviewOpen,
  };
}

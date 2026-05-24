"use client";

import { useState, useEffect } from "react";

/**
 * Bundles all pure-UI expand/collapse panel state for the floating Roster rail,
 * plus the GRAVE-only filter, roster search, and command-palette open state.
 *
 * Nothing in here touches Supabase — all state is either ephemeral or
 * persisted to localStorage.
 */
export function useRosterPanels() {
  // "Other TMs" section collapsed by default; persisted across refreshes.
  const [otherTmsExpanded, setOtherTmsExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("oms_roster_other_expanded");
    return saved === "true";
  });
  useEffect(() => {
    localStorage.setItem("oms_roster_other_expanded", String(otherTmsExpanded));
  }, [otherTmsExpanded]);

  // Floating roster panel open/close; persisted across refreshes.
  const [rosterOpen, setRosterOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("oms_roster_open");
    return saved === null ? false : saved === "true";
  });
  useEffect(() => {
    localStorage.setItem("oms_roster_open", String(rosterOpen));
  }, [rosterOpen]);

  // Called-off section expand toggle.
  const [calledOffExpanded, setCalledOffExpanded] = useState(true);

  // Modal / flyout toggles.
  const [sudoOpen, setSudoOpen] = useState(false);
  const [xaiSphereOpen, setXaiSphereOpen] = useState(false);

  // Roster rail group expand/collapse defaults.
  const [deployedExpanded, setDeployedExpanded] = useState(false);
  const [pmOverlapsExpanded, setPmOverlapsExpanded] = useState(false);
  const [amOverlapsExpanded, setAmOverlapsExpanded] = useState(false);
  const [portersExpanded, setPortersExpanded] = useState(false);
  // Scheduled-tonight-unplaced groups default expanded (priority view).
  const [scheduledGravesExpanded, setScheduledGravesExpanded] = useState(true);
  const [scheduledPMExpanded, setScheduledPMExpanded] = useState(true);
  const [scheduledAMExpanded, setScheduledAMExpanded] = useState(true);

  // Roster text search.
  const [rosterSearch, setRosterSearch] = useState("");

  // GRAVE shift filter — when true only TMs with 11pm–6:55am availability show.
  // Default ON: very useful for operators building a grave deployment.
  const [graveOnly, setGraveOnly] = useState(true);

  // When the GRAVE filter is active, collapse sections that don't apply.
  useEffect(() => {
    if (graveOnly) {
      setDeployedExpanded(false);
      setPortersExpanded(false);
      setPmOverlapsExpanded(false);
      setAmOverlapsExpanded(false);
      setOtherTmsExpanded(false);
    }
  }, [graveOnly]);

  // Command palette open/close + optional slot/person context.
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkInitialContext, setCmdkInitialContext] = useState<{
    type: "slot" | "person";
    value: string;
  } | null>(null);

  return {
    otherTmsExpanded, setOtherTmsExpanded,
    rosterOpen, setRosterOpen,
    calledOffExpanded, setCalledOffExpanded,
    sudoOpen, setSudoOpen,
    xaiSphereOpen, setXaiSphereOpen,
    deployedExpanded, setDeployedExpanded,
    pmOverlapsExpanded, setPmOverlapsExpanded,
    amOverlapsExpanded, setAmOverlapsExpanded,
    portersExpanded, setPortersExpanded,
    scheduledGravesExpanded, setScheduledGravesExpanded,
    scheduledPMExpanded, setScheduledPMExpanded,
    scheduledAMExpanded, setScheduledAMExpanded,
    rosterSearch, setRosterSearch,
    graveOnly, setGraveOnly,
    cmdkOpen, setCmdkOpen,
    cmdkInitialContext, setCmdkInitialContext,
  };
}

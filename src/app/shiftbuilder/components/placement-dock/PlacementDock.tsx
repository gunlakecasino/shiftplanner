"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";
import { useReducedMotion } from "framer-motion";
import PlacementPad from "../PlacementPad";
import { getSlotMeta } from "../MarkerPad";
import { PlacementDockTabs } from "./PlacementDockTabs";
import type { PlacementDockProps, PlacementDockTab } from "./placementDockTypes";

function defaultTabForSlot(
  slotKey: string,
  assignments: PlacementDockProps["assignments"],
): PlacementDockTab {
  const a = assignments[slotKey];
  return a?.tmId || a?.tmName ? "tasks" : "assign";
}

export default function PlacementDock(props: PlacementDockProps) {
  const { slotKey, onClose, assignments } = props;
  const { label, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const reducedMotion = useReducedMotion();

  const [tab, setTab] = useState<PlacementDockTab>(() =>
    defaultTabForSlot(slotKey, assignments),
  );

  useEffect(() => {
    setTab(defaultTabForSlot(slotKey, assignments));
  }, [slotKey, assignments]);

  const dock = (
    <motion.aside
      className="placement-dock no-print"
      role="dialog"
      aria-label={`Placement dock — ${label}`}
      initial={reducedMotion ? false : { x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? undefined : { x: 24, opacity: 0 }}
      transition={reducedMotion ? premiumSpringReduced : premiumSpring}
    >
      {/* Dock header kept minimal; refined inner card in PlacementPad provides the beautiful visual */}
      <div className="placement-dock-header flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 py-3 bg-white/95">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>{label}</div>
          <div className="truncate text-[20px] font-bold tracking-tight text-neutral-900">{a.tmName || "Unassigned"}</div>
        </div>
        <button type="button" onClick={onClose} className="sb-interactive flex h-10 w-10 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100 text-lg text-neutral-500">×</button>
      </div>

      <PlacementDockTabs active={tab} onChange={setTab} />

      <div className="placement-dock-body min-h-0 flex-1 overflow-hidden">
        <PlacementPad
          {...props}
          anchor="right"
          presentation="dock"
          dockTab={tab}
          onDockTabChange={setTab}
        />
      </div>
    </motion.aside>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dock, document.body);
}
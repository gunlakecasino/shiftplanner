"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import PlacementPad from "../PlacementPad";
import { padDockPresence } from "../padMotion";
import type { PlacementDockProps, PlacementDockTab } from "./placementDockTypes";

function defaultTabForSlot(
  slotKey: string,
  assignments: PlacementDockProps["assignments"],
): PlacementDockTab {
  const a = assignments[slotKey];
  return a?.tmId || a?.tmName ? "tasks" : "assign";
}

export default function PlacementDock(props: PlacementDockProps) {
  const { slotKey, assignments } = props;
  const reducedMotion = useReducedMotion();

  const [tab, setTab] = useState<PlacementDockTab>(() =>
    defaultTabForSlot(slotKey, assignments),
  );

  useEffect(() => {
    setTab(defaultTabForSlot(slotKey, assignments));
  }, [slotKey, assignments]);

  const dockMotion = padDockPresence(reducedMotion);
  const dock = (
    <motion.aside
      className="placement-dock no-print"
      role="dialog"
      aria-label={`Placement dock — ${slotKey}`}
      initial={dockMotion.initial}
      animate={dockMotion.animate}
      exit={dockMotion.exit}
      transition={dockMotion.transition}
    >
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

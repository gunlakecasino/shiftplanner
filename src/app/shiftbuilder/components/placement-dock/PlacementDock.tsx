"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";
import { useReducedMotion } from "framer-motion";
import PlacementPad from "../PlacementPad";
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

  const dock = (
    <motion.aside
      className="placement-dock no-print"
      role="dialog"
      aria-label={`Placement dock — ${slotKey}`}
      initial={reducedMotion ? false : { x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reducedMotion ? undefined : { x: 24, opacity: 0 }}
      transition={reducedMotion ? premiumSpringReduced : premiumSpring}
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

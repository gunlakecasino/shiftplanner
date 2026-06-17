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
      <div className="placement-dock-header flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 py-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
          style={{ background: a.tmName ? accent : "rgba(0,0,0,0.08)", color: a.tmName ? "#fff" : "#999" }}
        >
          {a.tmName ? a.tmName[0].toUpperCase() : "–"}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: accent, fontFamily: "var(--font-atkinson)" }}
          >
            {label}
          </div>
          <div className="truncate text-[22px] font-bold tracking-tight text-neutral-900">
            {a.tmName || "Unassigned"}
          </div>
        </div>
        {a.breakGroup != null && a.breakGroup > 0 ? (
          <div className="shrink-0 text-center">
            <div className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">Brk</div>
            <div
              className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: accent, border: `1px solid ${accent}` }}
            >
              {a.breakGroup}
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="sb-interactive flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100/90 text-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700"
          aria-label="Close placement dock"
        >
          ×
        </button>
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
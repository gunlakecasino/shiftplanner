"use client";

import React, { useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DndContext } from "@dnd-kit/core";
import ZoneCard from "@/app/shiftbuilder/components/ZoneCard";
import RRCard from "@/app/shiftbuilder/components/RRCard";
import { IPAD_DESK_CLASS } from "@/lib/shiftbuilder/tabletDevice";
import { IpadDeskProvider } from "@/lib/shiftbuilder/useIpadDesk";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

/**
 * Visual QA fixture for the 13-inch iPad night desk.
 * Blocked in production by middleware (`/dev/`). Not a product surface.
 */
function task(
  id: string,
  slotKey: string,
  taskLabel: string,
  extra: Partial<NightSlotTask> = {},
): NightSlotTask {
  return {
    id,
    nightId: "fixture",
    slotKey,
    slotType: slotKey.startsWith("Z") ? "zone" : "rr",
    rrSide: slotKey.startsWith("W") ? "womens" : slotKey.startsWith("M") ? "mens" : null,
    taskLabel,
    catalogTaskId: null,
    sortOrder: 1,
    color: extra.color ?? null,
    isCoverage: extra.isCoverage ?? false,
    ...extra,
  };
}

const ZONE_DEFS = [
  { key: "Z5", label: "ZONE 5 + HIGH LIMITS" },
  { key: "Z7", label: "ZONE 7 + SMOKING ROOM" },
  { key: "Z1", label: "ZONE 1" },
];

const RR_DEFS = [
  { num: 1, label: "RR 1+2" },
  { num: 6, label: "RR 6" },
  { num: 7, label: "RR 7" },
  { num: 8, label: "RR 8" },
  { num: 10, label: "RR 10" },
];

const assignments: Record<string, { tmId: string; tmName: string }> = {
  Z5: { tmId: "tm_silvia", tmName: "Silvia Contreras" },
  Z7: { tmId: "tm_jessica", tmName: "Jessica Martinez" },
  Z1: { tmId: "tm_kaiden", tmName: "Kaiden" },
  WRR1: { tmId: "tm_nikki", tmName: "Nikki Holloway" },
  MRR1: { tmId: "tm_alec", tmName: "Alec Brennan" },
  WRR6: { tmId: "tm_amanda", tmName: "Amanda Castillo" },
  MRR6: { tmId: "tm_carter", tmName: "Carter" },
  WRR7: { tmId: "tm_jamie", tmName: "Jamie Rivera" },
  MRR8: { tmId: "tm_steve", tmName: "Steve" },
  WRR10: { tmId: "tm_darlene", tmName: "Darlene Thompson" },
  MRR10: { tmId: "tm_peter", tmName: "Peter" },
};

const selectedTasks: Record<string, NightSlotTask[]> = {
  Z5: [
    task("z5-c", "Z5", "AND RR 6", { isCoverage: true, color: "#C05A98" }),
    task("z5-t", "Z5", "High limit tables"),
  ],
  Z7: [task("z7-t", "Z7", "Pit 1 + 2")],
  WRR6: [task("w6-c", "WRR6", "AND ZONE 5", { isCoverage: true, color: "#ff3b30" })],
  MRR6: [task("m6-c", "MRR6", "AND ZONE 6", { isCoverage: true, color: "#C05A98" })],
  WRR1: [task("w1-c", "WRR1", "AND LOBBY", { isCoverage: true, color: "#ffcc00" })],
};

function IpadDeskFixtureInner() {
  const macDesk = useSearchParams().get("desk") === "mac";
  if (!macDesk && typeof document !== "undefined") {
    document.documentElement.setAttribute("data-sb-ipad-desk", "force");
    document.documentElement.classList.add(IPAD_DESK_CLASS);
    document.body.classList.add(IPAD_DESK_CLASS);
    if (window.matchMedia("(orientation: portrait)").matches) {
      document.documentElement.classList.add("sb-ipad-portrait");
    }
  }
  useLayoutEffect(() => {
    if (macDesk) {
      document.documentElement.removeAttribute("data-sb-ipad-desk");
      document.documentElement.classList.remove(IPAD_DESK_CLASS, "sb-ipad-portrait");
      document.body.classList.remove(IPAD_DESK_CLASS);
      return;
    }
    document.documentElement.setAttribute("data-sb-ipad-desk", "force");
    document.documentElement.classList.add(IPAD_DESK_CLASS);
    document.body.classList.add(IPAD_DESK_CLASS);
    document.documentElement.classList.toggle(
      "sb-ipad-portrait",
      window.matchMedia("(orientation: portrait)").matches,
    );
    const original = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query.includes("max-width: 1420px") || query.includes("min-width: 768px")) {
        return {
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return original(query);
    }) as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
      document.documentElement.removeAttribute("data-sb-ipad-desk");
      document.documentElement.classList.remove(IPAD_DESK_CLASS);
      document.body.classList.remove(IPAD_DESK_CLASS);
    };
  }, [macDesk]);

  return (
    <DndContext>
    <IpadDeskProvider value={!macDesk}>
      <div className={`sb-builder-shell sb-sheetbuilder-redesign sb-canvas-builder min-h-screen bg-[#F4F6FA]${macDesk ? "" : " sb-ipad-desk"}`}>
        <div className="sb-builder-stage sb-builder-live">
          <div className="builder-workspace p-5">
            <section className="sb-builder-section mb-5">
              <div className="sheet-section-header">
                <span className="label">ZONES</span>
              </div>
              <div className="sb-zone-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                {ZONE_DEFS.map((def) => (
                  <div key={def.key} className="sb-day-card-host" data-slot-key={def.key} style={{ minHeight: 176 }}>
                    <ZoneCard
                      def={def}
                      assignments={assignments}
                      selectedTasks={selectedTasks}
                      onCardClick={() => {}}
                      showDigitalAssists
                      showTaskBadge
                    />
                  </div>
                ))}
              </div>
            </section>
            <section className="sb-builder-section">
              <div className="sheet-section-header">
                <span className="label">RESTROOMS</span>
              </div>
              <div className="sb-rr-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                {RR_DEFS.map((def) => (
                  <div key={def.num} className="sb-day-card-host" data-slot-key={`RR${def.num}`} style={{ minHeight: 228 }}>
                    <RRCard
                      def={def}
                      assignments={assignments}
                      selectedTasks={selectedTasks}
                      onGenderClick={() => {}}
                      showDigitalAssists
                      showTaskBadge
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </IpadDeskProvider>
    </DndContext>
  );
}

export default function IpadDeskFixturePage() {
  return (
    <React.Suspense fallback={null}>
      <IpadDeskFixtureInner />
    </React.Suspense>
  );
}

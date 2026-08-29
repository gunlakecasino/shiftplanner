"use client";

import React, { useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DndContext } from "@dnd-kit/core";
import ZoneCard from "@/app/shiftbuilder/components/ZoneCard";
import RRCard from "@/app/shiftbuilder/components/RRCard";
import { IPAD_DESK_FORCE_ATTR, IPAD_DESK_FORCE_VALUE } from "@/lib/shiftbuilder/tabletDevice";
import { IpadDeskProvider } from "@/lib/shiftbuilder/useIpadDesk";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { CoveredByEntry } from "@/lib/shiftbuilder/coverageHelpers";

/**
 * Visual QA fixture for the 13-inch iPad night desk.
 * Blocked in production by middleware (`/dev/`). Not a product surface.
 * Forces the desk via data-sb-ipad-desk=force; the provider writes html.sb-ipad-desk.
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
  { key: "Z6", label: "ZONE 6" },
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

const coveredByIndex: Record<string, CoveredByEntry[]> = {
  Z6: [
    {
      tmName: "Carter",
      tmId: "tm_carter",
      sourceKey: "MRR6",
      taskLabel: "AND ZONE 6",
    },
  ],
  WRR8: [
    {
      tmName: "Jessica Martinez",
      tmId: "tm_jessica",
      sourceKey: "Z7",
      taskLabel: "AND Women's Restroom 8",
    },
  ],
};

function IpadDeskFixtureInner() {
  const macDesk = useSearchParams().get("desk") === "mac";
  useLayoutEffect(() => {
    if (macDesk) {
      document.documentElement.removeAttribute(IPAD_DESK_FORCE_ATTR);
      return;
    }
    document.documentElement.setAttribute(IPAD_DESK_FORCE_ATTR, IPAD_DESK_FORCE_VALUE);
    return () => {
      document.documentElement.removeAttribute(IPAD_DESK_FORCE_ATTR);
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
                      coveredBy={coveredByIndex[def.key]}
                      onCardClick={() => {}}
                      onRemoveTask={() => {}}
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
                      coveredByIndex={coveredByIndex}
                      onGenderClick={() => {}}
                      onRemoveTask={() => {}}
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

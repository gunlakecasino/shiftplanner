import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { PortraitPlannerPage } from "@/app/shiftbuilder/print/PortraitPlannerPage";
import { buildPortraitPlannerPages } from "@/app/shiftbuilder/print/buildPortraitPlannerModel";
import {
  buildCardVectorUiMap,
  CARD_VECTOR_IDS,
  isLegacySweeperTaskLabel,
  parseCardVector,
  visibleDeskSlotTasks,
} from "@/lib/shiftbuilder/cardVectors";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

describe("card vectors", () => {
  it("accepts only the three standing marks", () => {
    expect(CARD_VECTOR_IDS).toEqual(["sweep_9_10_sr", "sweep_5_8_hl", "laundry"]);
    expect(parseCardVector("sweep_5_8_hl")).toBe("sweep_5_8_hl");
    expect(parseCardVector("laundry")).toBe("laundry");
    expect(parseCardVector("sweep_9_10_sr")).toBe("sweep_9_10_sr");
    expect(parseCardVector("sweep_extra")).toBeNull();
    expect(parseCardVector("tm_profile")).toBeNull();
    expect(parseCardVector("")).toBeNull();
  });

  it("maps slot_defaults rows to UI slot keys, not TM ids", () => {
    const map = buildCardVectorUiMap([
      { slotKey: "rr_8", slotType: "rr", rrSide: "mens", cardVector: "sweep_5_8_hl" },
      { slotKey: "zone_3", slotType: "zone", rrSide: "", cardVector: "sweep_9_10_sr" },
      { slotKey: "admin", slotType: "aux", rrSide: "", cardVector: "laundry" },
      { slotKey: "overlap_pm_0", slotType: "overlap", rrSide: "", cardVector: null },
    ]);
    expect(map).toEqual({
      MRR8: "sweep_5_8_hl",
      Z3: "sweep_9_10_sr",
      ADM: "laundry",
    });
    expect(map.Drew).toBeUndefined();
  });

  it("hides leftover sweeper chips from desk task rows", () => {
    expect(isLegacySweeperTaskLabel("Sweep 5/8/HL")).toBe(true);
    expect(isLegacySweeperTaskLabel("Sweep 9/10/SR")).toBe(true);
    expect(visibleDeskSlotTasks([
      { taskLabel: "Sweep 5/8/HL" },
      { taskLabel: "Zone 8 Family Restroom" },
      { taskLabel: "Covering Z9", isCoverage: true },
    ]).map((t) => t.taskLabel)).toEqual(["Zone 8 Family Restroom"]);
  });
});

describe("planner vector mark", () => {
  const day: DayDef = {
    index: 0,
    name: "Tuesday",
    short: "Tue",
    dateNum: 25,
    monthYear: "August 2026",
    color: "#c43b18",
    meta: "11p – 7a",
    date: new Date(2026, 7, 25, 12),
    isToday: false,
  };

  it("prints the slot vector beside the name and never dumps default tasks", () => {
    const snapshot: PrintDaySnapshot = {
      dayIndex: 0,
      day,
      assignments: {
        MRR8: { tmId: "tm-drew", tmName: "Drew", breakGroup: 1 },
      },
      tasksBySlot: {
        MRR8: [
          { id: "t1", taskLabel: "Zone 8 Family Restroom", isCoverage: false } as never,
          { id: "t2", taskLabel: "Sweep 5/8/HL", isCoverage: false } as never,
        ],
      },
      auxDefs: [],
      amOverlapDayName: "Wednesday",
      amOverlapDateNum: 26,
      nextDayColor: "#006ec8",
      breakCounts: { 1: 1, 2: 0, 3: 0, 4: 0 },
      cardVectors: { MRR8: "sweep_5_8_hl" },
      scheduledRoster: [{ tmId: "tm-drew", name: "Drew", isFullGrave: true, isPMOverlap: false, isAMOverlap: false }],
    };

    const pages = buildPortraitPlannerPages(snapshot);
    expect(pages).toHaveLength(1);
    const card = pages[0].restrooms.find((row) => row.key === "MRR8");
    expect(card?.vector).toBe("sweep_5_8_hl");
    expect(card?.tmName).toBe("Drew");

    const html = renderToStaticMarkup(React.createElement(PortraitPlannerPage, { model: pages[0] }));
    expect(html).toContain("Drew");
    expect(html).toContain("/card-vectors/sweep-5-8-hl.svg");
    expect(html).not.toContain("Segoe Script");
    expect(html).not.toContain("Bradley Hand");
    expect(html).not.toContain("SweepInk");
    expect(html).not.toContain("Zone 8 Family Restroom");
    expect(html).not.toContain("Sweep 5/8/HL");
  });

  it("keeps the vector on an empty card after the TM leaves", () => {
    const snapshot: PrintDaySnapshot = {
      dayIndex: 0,
      day,
      assignments: {},
      tasksBySlot: {},
      auxDefs: [],
      amOverlapDayName: "Wednesday",
      amOverlapDateNum: 26,
      nextDayColor: "#006ec8",
      breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
      cardVectors: { MRR8: "sweep_5_8_hl" },
    };
    const pages = buildPortraitPlannerPages(snapshot);
    const card = pages[0].restrooms.find((row) => row.key === "MRR8");
    expect(card?.empty).toBe(true);
    expect(card?.vector).toBe("sweep_5_8_hl");
  });
});

describe("Brian's shipped vector artwork", () => {
  it("ships the three outlined files and never recreates ink as cursive text", () => {
    const sweep910 = readFileSync(join(process.cwd(), "public/card-vectors/sweep-9-10-sr.svg"), "utf8");
    const sweep58 = readFileSync(join(process.cwd(), "public/card-vectors/sweep-5-8-hl.svg"), "utf8");
    const laundry = readFileSync(join(process.cwd(), "public/card-vectors/laundry.svg"), "utf8");
    const mark = readFileSync(
      join(process.cwd(), "src/app/shiftbuilder/components/CardVectorMark.tsx"),
      "utf8",
    );
    const vectors = readFileSync(join(process.cwd(), "src/lib/shiftbuilder/cardVectors.ts"), "utf8");

    expect(sweep910).toContain('viewBox="0 0 100.96 16.2"');
    expect(sweep910).toContain("fill: #f15a29");
    expect(sweep910).toContain("<path");
    expect(sweep58).toContain('viewBox="0 0 99.64 14.63"');
    expect(sweep58).toContain("fill: #f15a29");
    expect(sweep58).toContain("<path");
    expect(laundry).toContain('viewBox="0 0 40.87 14.34"');
    expect(laundry).toContain("fill: #1c75bc");
    expect(laundry).toContain("BrianKillianInk-Regular");
    expect(laundry).toContain(">Laundry</tspan>");
    expect(laundry).not.toContain("Segoe Script");

    expect(vectors).toContain("/card-vectors/sweep-9-10-sr.svg");
    expect(vectors).toContain("/card-vectors/sweep-5-8-hl.svg");
    expect(vectors).toContain("/card-vectors/laundry.svg");
    expect(mark).toContain("CARD_VECTOR_SRC[vector]");
    expect(mark).not.toContain("SweepInk");
    expect(mark).not.toContain("LaundryInk");
    expect(mark).not.toContain("Segoe Script");
    expect(mark).not.toContain("Bradley Hand");
  });
});

describe("vector persistence contract", () => {
  it("stores the mark on slot_defaults, not tm_profiles", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260826_slot_defaults_card_vector.sql"),
      "utf8",
    );
    expect(migration).toContain("slot_defaults");
    expect(migration).toContain("card_vector");
    expect(migration).toContain("sweep_9_10_sr");
    expect(migration).toContain("sweep_5_8_hl");
    expect(migration).toContain("laundry");
    expect(migration).not.toContain("tm_profiles");

    const mutations = readFileSync(
      join(process.cwd(), "src/lib/shiftbuilder/slotDefaultsMutations.server.ts"),
      "utf8",
    );
    expect(mutations).toContain("setSlotCardVectorServer");
    expect(mutations).toContain("card_vector");
    expect(mutations).not.toMatch(/from\("tm_profiles"\)/);
  });

  it("lets the desk assign and clear a vector on the pad", () => {
    const pad = readFileSync(
      join(process.cwd(), "src/app/shiftbuilder/components/PlacementPad.tsx"),
      "utf8",
    );
    expect(pad).toContain("CardVectorPicker");
    expect(pad).toContain("onSetCardVector");
    expect(pad).not.toContain("Assign Sweeper");
    expect(pad).not.toContain("Sweep 5/8/HL");
  });
});

import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrintPreviewPage } from "@/app/shiftbuilder/print/PrintPreviewPage";
import { PortraitPlannerPage } from "@/app/shiftbuilder/print/PortraitPlannerPage";
import { buildPortraitPlannerPages } from "@/app/shiftbuilder/print/buildPortraitPlannerModel";
import { DropZonesCard } from "@/app/shiftbuilder/components/DropZonesCard";
import {
  DROP_ZONE_GROUPS,
  DROP_ZONE_PLATE_SRC,
  DROP_ZONE_PLATE_VIEWBOX,
  cycleDropZoneGroupFromGraveDate,
  dropZoneDiscSrc,
  parseDropZoneGroup,
  resolveDropZones,
} from "@/lib/shiftbuilder/dropZones";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

const day: DayDef = {
  index: 0,
  name: "Friday",
  short: "Fri",
  dateNum: 14,
  monthYear: "August 2026",
  color: "#c43b18",
  meta: "11p – 7a",
  date: new Date(2026, 7, 14, 12),
  isToday: false,
};

function snapshot(overrides: Partial<PrintDaySnapshot> = {}): PrintDaySnapshot {
  return {
    dayIndex: 0,
    day,
    assignments: {},
    tasksBySlot: {},
    auxDefs: [],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 15,
    nextDayColor: "#006ec8",
    breakCounts: { 1: 0, 2: 0, 3: 0, 4: 0 },
    ...overrides,
  };
}

describe("drop zone rotation", () => {
  it("keeps all three groups empty until Brian sends the lists", () => {
    expect(DROP_ZONE_GROUPS[1]).toEqual([]);
    expect(DROP_ZONE_GROUPS[2]).toEqual([]);
    expect(DROP_ZONE_GROUPS[3]).toEqual([]);
    expect(parseDropZoneGroup(2)).toBe(2);
    expect(parseDropZoneGroup(4)).toBeNull();
    expect(parseDropZoneGroup("laundry")).toBeNull();
  });

  it("cycles 1/2/3 from the grave date and lets an explicit night group win", () => {
    const a = cycleDropZoneGroupFromGraveDate("2026-08-14");
    const b = cycleDropZoneGroupFromGraveDate("2026-08-15");
    const c = cycleDropZoneGroupFromGraveDate("2026-08-16");
    expect([a, b, c].sort()).toEqual([1, 2, 3]);
    expect(new Set([a, b, c]).size).toBe(3);
    expect(cycleDropZoneGroupFromGraveDate("2026-08-17")).toBe(a);

    const explicit = resolveDropZones(3, "2026-08-14");
    expect(explicit.explicitGroup).toBe(3);
    expect(explicit.scheduledGroup).toBe(3);
    expect(explicit.usedFallback).toBe(false);
    expect(explicit.displayGroup).toBe(3);
    expect(explicit.zones).toEqual([]);

    const cycled = resolveDropZones(null, "2026-08-14");
    expect(cycled.explicitGroup).toBeNull();
    expect(cycled.scheduledGroup).toBe(a);
    expect(cycled.zones).toEqual([]);
  });
});

describe("drop zone artwork", () => {
  it("ships the plate and numbered discs as SVG files, not CSS circles", () => {
    const plate = readFileSync(join(process.cwd(), "public/drop-zones/dropZoneBox.svg"), "utf8");
    const dz03 = readFileSync(join(process.cwd(), "public/drop-zones/dz03.svg"), "utf8");
    const dz10 = readFileSync(join(process.cwd(), "public/drop-zones/dz10.svg"), "utf8");
    const card = readFileSync(
      join(process.cwd(), "src/app/shiftbuilder/components/DropZonesCard.tsx"),
      "utf8",
    );

    expect(plate).toContain('viewBox="0 0 192 74.84"');
    expect(plate).toContain("#ededed");
    expect(plate).toContain("DROP ZONES");
    expect(dz03).toContain('viewBox="0 0 46.9 46.9"');
    expect(dz03).toContain("#ff3b30");
    expect(dz10).toContain("#34c759");
    expect(DROP_ZONE_PLATE_SRC).toBe("/drop-zones/dropZoneBox.svg");
    expect(DROP_ZONE_PLATE_VIEWBOX).toEqual({ width: 192, height: 74.84 });
    expect(dropZoneDiscSrc(8)).toBe("/drop-zones/dz08.svg");
    expect(card).toContain("DROP_ZONE_PLATE_SRC");
    expect(card).toContain("dropZoneDiscSrc");
    expect(card).toContain("<img");
    expect(card).not.toContain("<circle");
    expect(card).not.toContain("DROP ZONES</");
  });
});

describe("Golden and desk drop zones card", () => {
  it("puts a blank DROP ZONES plate on Golden page 1 bottom-right, not page 2", () => {
    const pageOne = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "deployment",
        snapshot: snapshot({
          dropZones: resolveDropZones(1, "2026-08-14"),
        }),
        weekDayDefs: [day],
        printVariant: "official",
      }),
    );
    const pageTwo = renderToStaticMarkup(
      React.createElement(PrintPreviewPage, {
        view: "breaks",
        snapshot: snapshot({
          dropZones: resolveDropZones(1, "2026-08-14"),
        }),
        weekDayDefs: [day],
        printVariant: "official",
      }),
    );

    expect(pageOne).toContain("sb-approved-drop-zones-slot");
    expect(pageOne).toContain("/drop-zones/dropZoneBox.svg");
    expect(pageOne).not.toContain("/drop-zones/dz03.svg");
    expect(pageOne).not.toContain("/drop-zones/dz05.svg");
    expect(pageOne).not.toContain("/drop-zones/dz08.svg");
    expect(pageOne).not.toContain("/drop-zones/dz10.svg");
    expect(pageOne).toContain('data-drop-zone-group="1"');
    expect(pageOne).not.toContain("sb-side-task-summary-blank-row");
    expect(pageTwo).toContain(">Projects<");
    expect(pageTwo).not.toContain("/drop-zones/");
    expect(pageTwo).not.toContain("sb-approved-drop-zones-slot");
  });

  it("does not put drop zones on the portrait planner", () => {
    const pages = buildPortraitPlannerPages(
      snapshot({
        scheduledRoster: [{ tmId: "tm-1", name: "Alex", isFullGrave: true, isPMOverlap: false, isAMOverlap: false }],
      }),
    );
    const html = renderToStaticMarkup(
      React.createElement(PortraitPlannerPage, { model: pages[0] }),
    );
    expect(html).not.toContain("/drop-zones/");
    expect(html).not.toContain("DROP ZONES");
    expect(html).toContain("sb-planner-sheet");
  });

  it("keeps the same blank plate on the desk card", () => {
    const html = renderToStaticMarkup(
      React.createElement(DropZonesCard, {
        resolution: resolveDropZones(1, "2026-08-14"),
        showPicker: true,
      }),
    );
    expect(html).toContain("/drop-zones/dropZoneBox.svg");
    expect(html).not.toContain("/drop-zones/dz03.svg");
    expect(html).not.toContain("/drop-zones/dz10.svg");
    expect(html).toContain("sb-drop-zones-picker");
    expect(html).toContain('aria-label="Drop zone group"');
    expect(html).toContain('aria-label="DROP ZONES group 1"');
  });

  it("stores the group on nights, not a TM, and embeds the SVGs for Golden raster", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260826_nights_drop_zone_group.sql"),
      "utf8",
    );
    const mutations = readFileSync(
      join(process.cwd(), "src/lib/shiftbuilder/opsMutations.server.ts"),
      "utf8",
    );
    const raster = readFileSync(
      join(process.cwd(), "src/app/shiftbuilder/print/rasterPrep.ts"),
      "utf8",
    );
    const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");

    expect(migration).toContain("nights");
    expect(migration).toContain("drop_zone_group");
    expect(migration).not.toContain("tm_profiles");
    expect(mutations).toContain("saveNightDropZoneGroupServer");
    expect(mutations).toContain("drop_zone_group");
    expect(raster).toContain("img.sb-drop-zone-svg");
    expect(sw).toContain('url.pathname.startsWith("/drop-zones/")');
    expect(middleware).toContain("drop-zones");
  });
});

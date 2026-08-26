import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortraitPlannerPage } from "@/app/shiftbuilder/print/PortraitPlannerPage";
import {
  buildPlannerRoster,
  buildPlannerRosterGroups,
  buildPortraitPlannerPages,
  formatPlannerTrailLine,
  paginatePlannerRoster,
  paginatePlannerRosterGroups,
  plannerAuxLabel,
  plannerRosterBand,
  plannerSlotCode,
  plannerTrailLabels,
} from "@/app/shiftbuilder/print/buildPortraitPlannerModel";
import { rasterArtboardSizePx } from "@/app/shiftbuilder/print/rasterPrep";
import { assembleGoldenPrintPages } from "@/app/shiftbuilder/print/assemblePages";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "@/app/shiftbuilder/print/goldenConstants";
import { LETTER_PORTRAIT_PT, PLANNER_NOTES_FLOOR_PX, PLANNER_NOTES_MIN_PX, PLANNER_ROSTER_PER_PAGE, PORTRAIT_HEIGHT_PX, PORTRAIT_WIDTH_PX } from "@/app/shiftbuilder/print/portraitConstants";
import { plannerNotesBandPx, plannerRosterDensity, plannerRosterWriteinLines, printArtboardSizePx, printPageOrientation } from "@/app/shiftbuilder/print/printPageGeometry";
import {
  buildPrintQueue,
  countPrintPages,
  dayHasPrintPages,
} from "@/app/shiftbuilder/print/printConfigUtils";
import type { PrintConfig } from "@/app/shiftbuilder/components/PrintCommandCenter";
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

function snapshot(over: Partial<PrintDaySnapshot> = {}): PrintDaySnapshot {
  return {
    dayIndex: 0,
    day,
    assignments: {
      Z1: { tmId: "tm-jordan", tmName: "Jordan", breakGroup: 1 },
      MRR1: { tmId: "tm-morgan", tmName: "Morgan", breakGroup: 2 },
      AUX1: { tmId: "tm-admin", tmName: "Reese", breakGroup: 1 },
      "OL-PM-0": { tmId: "tm-alex", tmName: "Alex", breakGroup: 4 },
    },
    tasksBySlot: {},
    auxDefs: [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
      { key: "AUX3", role: "blank", label: "", locations: [] },
    ],
    amOverlapDayName: "Saturday",
    amOverlapDateNum: 15,
    nextDayColor: "#006ec8",
    breakCounts: { 1: 2, 2: 1, 3: 0, 4: 1 },
    scheduledRoster: [
      { tmId: "tm-jordan", name: "Jordan", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
      { tmId: "tm-alex", name: "Alex", isFullGrave: false, isPMOverlap: true, isAMOverlap: false },
      { tmId: "tm-sam", name: "Sam", isFullGrave: false, isPMOverlap: false, isAMOverlap: true },
      { tmId: "tm-morgan", name: "Morgan", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
      { tmId: "tm-admin", name: "Reese", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
    ],
    placementTrailsByTmId: {
      "tm-jordan": ["Z3", "RR8M", "ADMIN", "OL-PM", "Z9SR", "Z1"],
      "tm-alex": [],
    },
    ...over,
  };
}

describe("portrait planner model", () => {
  it("keeps Golden landscape metrics untouched", () => {
    expect(GOLDEN_WIDTH_PX).toBe(1056);
    expect(GOLDEN_HEIGHT_PX).toBe(816);
    expect(PORTRAIT_WIDTH_PX).toBe(816);
    expect(PORTRAIT_HEIGHT_PX).toBe(1056);
    expect(LETTER_PORTRAIT_PT).toEqual({ width: 612, height: 792 });
    expect(printArtboardSizePx("deploy")).toEqual({ width: 1056, height: 816 });
    expect(printArtboardSizePx("planner")).toEqual({ width: 816, height: 1056 });
    expect(printPageOrientation("deploy")).toBe("landscape");
    expect(printPageOrientation("planner")).toBe("portrait");
    expect(PLANNER_NOTES_MIN_PX).toBe(168);
    expect(PLANNER_NOTES_FLOOR_PX).toBe(56);
    expect(plannerNotesBandPx(8)).toBe(168);
    expect(plannerNotesBandPx(24)).toBe(72);
    expect(plannerNotesBandPx(32)).toBe(56);
    expect(plannerRosterDensity(24)).toBe("dense");
    expect(plannerRosterWriteinLines(24)).toBe(0);
  });

  it("maps overlap flags to PM / Graves / AM and treats unmarked as grave", () => {
    expect(plannerRosterBand({ isFullGrave: true })).toBe("grave");
    expect(plannerRosterBand({ isPMOverlap: true })).toBe("pm");
    expect(plannerRosterBand({ isAMOverlap: true })).toBe("am");
    expect(plannerRosterBand({})).toBe("grave");
  });

  it("groups the scheduled rail PM → Graves → AM with A–Z names inside each band", () => {
    const groups = buildPlannerRosterGroups(
      snapshot({
        scheduledRoster: [
          { tmId: "tm-zoe", name: "Zoe", isFullGrave: false, isPMOverlap: true, isAMOverlap: false },
          { tmId: "tm-amy", name: "Amy", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
          { tmId: "tm-ben", name: "Ben", isFullGrave: false, isPMOverlap: false, isAMOverlap: true },
          { tmId: "tm-cara", name: "Cara", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
        ],
      }),
    );
    expect(groups.map((group) => group.label)).toEqual(["PM", "Graves", "AM"]);
    expect(groups.map((group) => group.rows.map((row) => row.name))).toEqual([
      ["Zoe"],
      ["Amy", "Cara"],
      ["Ben"],
    ]);
    expect(buildPlannerRoster(snapshot({
      scheduledRoster: [
        { tmId: "tm-zoe", name: "Zoe", isFullGrave: false, isPMOverlap: true, isAMOverlap: false },
        { tmId: "tm-amy", name: "Amy", isFullGrave: true, isPMOverlap: false, isAMOverlap: false },
        { tmId: "tm-ben", name: "Ben", isFullGrave: false, isPMOverlap: false, isAMOverlap: true },
      ],
    })).map((row) => row.name)).toEqual(["Zoe", "Amy", "Ben"]);
  });

  it("attaches last-5 trails, leaves missing/empty quiet, and truncates extras", () => {
    expect(plannerTrailLabels(undefined, "tm-jordan")).toEqual([]);
    expect(plannerTrailLabels({}, "tm-jordan")).toEqual([]);
    expect(plannerTrailLabels({ "tm-jordan": [] }, "tm-jordan")).toEqual([]);
    expect(plannerTrailLabels({ "tm-jordan": ["Z3", "", "RR8M"] }, "tm-jordan")).toEqual([
      "Z3",
      "RR8M",
    ]);
    expect(
      plannerTrailLabels(
        { "tm-jordan": ["Z3", "RR8M", "ADMIN", "OL-PM", "Z9SR", "Z1"] },
        "tm-jordan",
      ),
    ).toEqual(["Z3", "RR8M", "ADMIN", "OL-PM", "Z9SR"]);
    expect(formatPlannerTrailLine(["Z3", "RR8M", "ADMIN"])).toBe("Z3 · RR8M · ADMIN");
    expect(formatPlannerTrailLine([])).toBe("");

    const roster = buildPlannerRoster(snapshot());
    expect(roster.find((row) => row.name === "Jordan")?.trail).toEqual([
      "Z3",
      "RR8M",
      "ADMIN",
      "OL-PM",
      "Z9SR",
    ]);
    expect(roster.find((row) => row.name === "Alex")?.trail).toEqual([]);
    expect(roster.find((row) => row.name === "Morgan")?.trail).toEqual([]);

    const z1 = buildPortraitPlannerPages(snapshot())[0].zones.find((card) => card.key === "Z1");
    expect(z1?.tmName).toBe("Jordan");
    expect(z1?.trail).toEqual(["Z3", "RR8M", "ADMIN", "OL-PM", "Z9SR"]);
    const open = buildPortraitPlannerPages(snapshot())[0].zones.find((card) => card.key === "Z5");
    expect(open?.empty).toBe(true);
    expect(open?.trail).toEqual([]);
  });

  it("uses short huddle codes instead of Golden long titles", () => {
    expect(plannerSlotCode("Z5")).toBe("Z5");
    expect(plannerSlotCode("Z10")).toBe("Z10");
    expect(plannerSlotCode("WRR7")).toBe("WRR7");
    expect(plannerSlotCode("MRR1")).toBe("MRR1");
    expect(plannerSlotCode("OL-PM-0")).toBe("PM 1");
    expect(plannerSlotCode("OL-AM-5")).toBe("AM 6");
    expect(plannerAuxLabel({ key: "AUX1", role: "admin", label: "ADMIN", locations: [] }, [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: [] },
    ])).toBe("ADM");
    expect(plannerAuxLabel({ key: "AUX2", role: "z9sr", label: "Z9 SR", locations: [] }, [
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: [] },
    ])).toBe("Z9SR");
    expect(plannerAuxLabel({ key: "AUX3", role: "blank", label: "", locations: [] }, [
      { key: "AUX3", role: "blank", label: "", locations: [] },
    ])).toBe("AUX");
  });

  it("builds a GDS roster and marks who is already placed", () => {
    const roster = buildPlannerRoster(snapshot());
    expect(roster.map((row) => row.name)).toEqual(["Alex", "Jordan", "Morgan", "Reese", "Sam"]);
    expect(roster.find((row) => row.name === "Alex")?.band).toBe("pm");
    expect(roster.find((row) => row.name === "Sam")?.band).toBe("am");
    expect(roster.find((row) => row.name === "Sam")?.placed).toBe(false);
    expect(roster.find((row) => row.name === "Jordan")?.placed).toBe(true);
  });

  it("keeps a full-night roster on one Letter portrait sheet", () => {
    const graves = Array.from({ length: 14 }, (_, i) => `Grave ${String(i + 1).padStart(2, "0")}`);
    const pms = Array.from({ length: 6 }, (_, i) => `PM ${i + 1}`);
    const ams = Array.from({ length: 4 }, (_, i) => `AM ${i + 1}`);
    const longRoster = [
      ...pms.map((name, i) => ({
        tmId: `tm-pm-${i}`,
        name,
        isFullGrave: false,
        isPMOverlap: true,
        isAMOverlap: false,
      })),
      ...graves.map((name, i) => ({
        tmId: `tm-grave-${i}`,
        name,
        isFullGrave: true,
        isPMOverlap: false,
        isAMOverlap: false,
      })),
      ...ams.map((name, i) => ({
        tmId: `tm-am-${i}`,
        name,
        isFullGrave: false,
        isPMOverlap: false,
        isAMOverlap: true,
      })),
    ];
    const models = buildPortraitPlannerPages(snapshot({ scheduledRoster: longRoster }));
    expect(models).toHaveLength(1);
    expect(models[0].pageCount).toBe(1);
    expect(models[0].roster).toHaveLength(24);
    expect(models[0].roster.map((row) => row.name)).toEqual(
      [...pms, ...graves, ...ams].sort((a, b) => {
        const band = (name: string) => (name.startsWith("PM") ? 0 : name.startsWith("Grave") ? 1 : 2);
        const bandCmp = band(a) - band(b);
        return bandCmp !== 0 ? bandCmp : a.localeCompare(b);
      }),
    );

    const html = renderToStaticMarkup(
      React.createElement(PortraitPlannerPage, { model: models[0] }),
    );
    expect(html).toContain('data-roster-density="dense"');
    expect(html).toContain("--sb-planner-notes-h:72px");
    expect(html).toContain("Huddle notes");
    for (const name of [...pms, ...graves, ...ams]) {
      expect(html).toContain(name);
    }
    expect(html).not.toContain("of 2");

    const packed = paginatePlannerRosterGroups(
      buildPlannerRosterGroups(snapshot({ scheduledRoster: longRoster })),
      PLANNER_ROSTER_PER_PAGE,
    );
    expect(packed).toHaveLength(1);
    expect(paginatePlannerRoster(longRoster.map((row) => row.name))).toHaveLength(1);
  });

  it("builds a blank-night workbook without crashing", () => {
    const models = buildPortraitPlannerPages(
      snapshot({
        assignments: {},
        scheduledRoster: [],
        placementTrailsByTmId: undefined,
      }),
    );
    expect(models).toHaveLength(1);
    expect(models[0].roster).toEqual([]);
    expect(models[0].rosterGroups.map((group) => [group.label, group.rows.length])).toEqual([
      ["PM", 0],
      ["Graves", 0],
      ["AM", 0],
    ]);
    expect(models[0].zones.every((card) => card.empty && card.trail.length === 0)).toBe(true);
  });

  it("keeps empty zone / RR / aux / overlap slots as open boxes", () => {
    const model = buildPortraitPlannerPages(snapshot())[0];
    expect(model.zones).toHaveLength(10);
    expect(model.restrooms).toHaveLength(10);
    expect(model.aux).toHaveLength(3);
    expect(model.overlaps.flatMap((row) => row.slots)).toHaveLength(12);
    expect(model.zones.filter((card) => card.empty).length).toBeGreaterThan(0);
    expect(model.aux.find((card) => card.key === "AUX3")?.empty).toBe(true);
    expect(model.zones.find((card) => card.key === "Z1")?.tmName).toBe("Jordan");
    expect(model.zones.find((card) => card.key === "Z5")?.label).toBe("Z5");
    expect(model.restrooms.find((card) => card.key === "MRR1")?.label).toBe("MRR1");
    expect(model.aux.find((card) => card.key === "AUX1")?.label).toBe("ADM");
    expect(model.aux.find((card) => card.key === "AUX3")?.label).toBe("AUX");
    expect(model.overlaps[0].slots[0].label).toBe("PM 1");
  });

  it("keeps the primary TM on the primary slot and marks dual coverage honestly", () => {
    const model = buildPortraitPlannerPages(
      snapshot({
        assignments: {
          Z6: {
            tmId: "tm-darlene",
            tmName: "Darlene",
            additionalCoverageSlots: ["Z7"],
          },
        },
      }),
    )[0];
    const z6 = model.zones.find((card) => card.key === "Z6");
    const z7 = model.zones.find((card) => card.key === "Z7");
    expect(z6?.tmName).toBe("Darlene");
    expect(z6?.empty).toBe(false);
    expect(z6?.covers).toEqual(["Z7"]);
    expect(z7?.tmName).toBeNull();
    expect(z7?.empty).toBe(true);
    expect(z7?.coveredVia).toBe("Z6");
  });

  it("does not invent a primary by moving a TM onto a covered slot", () => {
    const model = buildPortraitPlannerPages(
      snapshot({
        assignments: {
          Z7: { tmId: "tm-darlene", tmName: "Darlene" },
        },
      }),
    )[0];
    expect(model.zones.find((card) => card.key === "Z6")?.tmName).toBeNull();
    expect(model.zones.find((card) => card.key === "Z7")?.tmName).toBe("Darlene");
    expect(model.zones.find((card) => card.key === "Z6")?.coveredVia).toBeNull();
  });
});

describe("portrait planner page", () => {
  it("renders roster on the left and placement grids on the right", () => {
    const html = renderToStaticMarkup(
      React.createElement(PortraitPlannerPage, {
        model: buildPortraitPlannerPages(snapshot())[0],
      }),
    );

    expect(html).toContain('data-print-view="planner"');
    expect(html).toContain("sb-planner-roster");
    expect(html).toContain("Jordan");
    expect(html).toContain("Sam");
    expect(html).toContain("sb-planner-roster-group-head");
    expect(html).toContain(">PM<");
    expect(html).toContain(">Graves<");
    expect(html).toContain(">AM<");
    expect(html).toContain("Restrooms");
    expect(html).toContain("Zones");
    expect(html).toContain(">Aux<");
    expect(html).toContain("Overlaps");
    expect(html).toContain("sb-planner-slot-open");
    expect(html).toContain("sb-planner-slot-line");
    expect(html).toContain("sb-planner-trail");
    expect(html).toContain("Z3 · RR8M · ADMIN · OL-PM · Z9SR");
    expect(html).toContain("Planner");
    expect(html).toContain("Friday");
    expect(html).toContain("huddle worksheet");
    expect(html).toContain("Z5");
    expect(html).toContain("MRR1");
    expect(html).toContain("ADM");
    expect(html).not.toContain(">FG<");
    expect(html).not.toContain("sb-planner-roster-pill");
    expect(html).not.toContain("ZONE 5 + HIGH LIMITS");
    expect(html).not.toContain("ZONE 7 + SMOKING ROOM");
    expect(html).not.toContain("OPEN AUX");
    expect(html).not.toContain("Break");
    expect(html).not.toContain("WAVE");
    expect(html).toContain("sb-planner-notes");
    expect(html).toContain("Huddle notes");
    expect(html).toContain("sb-planner-notes-rules");
    expect(html).toContain("sb-planner-section-rr");
    expect(html).toContain("sb-planner-section-zones");
    expect(html).toContain("sb-planner-roster-writein");
    expect(html).toContain("sb-planner-roster-writein-row");
    expect(html).not.toContain("Passdown:");
    expect(html).not.toContain("TODO");
    expect(html).not.toContain("Chill Bar");
    expect(html).not.toContain("Red Tray Carts");
  });

  it("keeps write-in cells when the night is blank", () => {
    const html = renderToStaticMarkup(
      React.createElement(PortraitPlannerPage, {
        model: buildPortraitPlannerPages(
          snapshot({
            assignments: {},
            scheduledRoster: [],
            placementTrailsByTmId: undefined,
          }),
        )[0],
      }),
    );
    expect(html).toContain(">PM<");
    expect(html).toContain(">Graves<");
    expect(html).toContain(">AM<");
    expect(html).toContain("sb-planner-slot-line");
    expect(html).toContain("sb-planner-roster-writein-row");
    expect(html).toContain("Huddle notes");
    expect(html).not.toContain("No Graves schedule loaded");
  });

  it("prints dual coverage as a primary +cue and a via mark, not a second owner", () => {
    const html = renderToStaticMarkup(
      React.createElement(PortraitPlannerPage, {
        model: buildPortraitPlannerPages(
          snapshot({
            assignments: {
              Z6: {
                tmId: "tm-darlene",
                tmName: "Darlene",
                additionalCoverageSlots: ["Z7"],
              },
            },
          }),
        )[0],
      }),
    );
    expect(html).toContain("Darlene");
    expect(html).toContain("+Z7");
    expect(html).toContain("via Z6");
    expect(html.match(/Darlene/g)?.length).toBe(1);
  });
});

describe("portrait planner density css", () => {
  const previewCss = join(process.cwd(), "src/app/shiftbuilder/print/printPreview.css");
  const publicCss = join(process.cwd(), "public/shiftbuilder-print-preview.css");

  it("keeps preview and public print CSS byte-identical", () => {
    expect(readFileSync(publicCss, "utf8")).toBe(readFileSync(previewCss, "utf8"));
  });

  it("packs Letter portrait rhythm and reserves a ruled huddle-notes band", () => {
    const css = readFileSync(previewCss, "utf8");
    const planner = css.slice(css.indexOf("/* ── Portrait planner sheet"));

    expect(planner).toContain("padding: 14px 18px 12px !important;");
    expect(planner).toContain("min-height: 42px;");
    expect(planner).toContain("min-height: 18px;");
    expect(planner).toContain("gap: 6px;");
    expect(planner).toContain("flex: 1 1 auto;");
    expect(planner).toContain(".sb-planner-section-rr");
    expect(planner).toContain(".sb-planner-notes");
    expect(planner).toContain("flex: 0 1 var(--sb-planner-notes-h, 168px);");
    expect(planner).toContain("data-roster-density");
    expect(planner).toContain("min-height: 56px;");
    expect(planner).toContain("repeating-linear-gradient");
    expect(planner).toContain(".sb-planner-roster-group-head");
    expect(planner).toContain(".sb-planner-trail");
    expect(planner).toContain(".sb-planner-slot-line");
    expect(planner).not.toContain("min-height: 48px;");
    expect(planner).not.toContain("padding: 20px 22px 16px !important;");
    expect(planner).not.toContain("min-height: 21px;");
  });
});

describe("portrait planner raster sizing", () => {
  it("does not force Golden landscape metrics onto a planner artboard", () => {
    const planner = {
      getAttribute: (name: string) => (name === "data-print-view" ? "planner" : null),
      classList: { contains: (name: string) => name === "sb-planner-sheet" },
    } as unknown as HTMLElement;
    const golden = {
      getAttribute: () => "deployment",
      classList: { contains: () => false },
    } as unknown as HTMLElement;
    expect(rasterArtboardSizePx(planner)).toEqual({ width: 816, height: 1056 });
    expect(rasterArtboardSizePx(golden)).toEqual({ width: 1056, height: 816 });
  });
});

describe("planner print queue", () => {
  const days = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    name: `Day${i}`,
    short: `D${i}`,
    dateNum: 10 + i,
    monthYear: "Aug 2026",
    color: "#000",
    meta: "11p – 7a",
    date: new Date(2026, 7, 10 + i),
    isToday: false,
  })) as DayDef[];

  const config = (): PrintConfig => ({
    days: Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      printDeploy: i === 0,
      printBreaks: i === 0,
      printPlanner: i === 0,
      inOverview: false,
    })),
    pageOrder: "paired",
    margins: "narrow",
    includeOverview: false,
    overviewPosition: "last",
    includeCoverPage: false,
    coverPagePosition: "first",
    customQueueOrder: null,
    printVariant: "official",
    includeShiftNotes: true,
    planningBlankSlate: false,
    includeTimestamp: true,
    editableTmNames: false,
  });

  it("counts the planner as an optional page beside Golden", () => {
    const cfg = config();
    expect(countPrintPages(cfg.days)).toBe(3);
    expect(dayHasPrintPages(cfg.days[0])).toBe(true);
    const queue = buildPrintQueue(
      cfg.days,
      cfg.pageOrder,
      days,
      false,
      "last",
      false,
      "first",
      "official",
    );
    expect(queue.map((item) => item.id)).toEqual(["0-d", "0-b", "0-p"]);
    expect(queue[2].label).toContain("Planner");
  });

  it("assembles planner HTML after Golden pages for the night", () => {
    const cfg = config();
    const pages = assembleGoldenPrintPages({
      config: cfg,
      dayDefs: days,
      capturedPages: new Map([
        [
          0,
          {
            deployHTML: '<div class="print-artboard">D</div>',
            breaksHTML: '<div class="print-artboard">B</div>',
            plannerHTML: [
              '<div class="print-artboard sb-planner-sheet">P1</div>',
              '<div class="print-artboard sb-planner-sheet">P2</div>',
            ],
          },
        ],
      ]),
      activeDays: cfg.days.filter(dayHasPrintPages),
      coverHTML: null,
      overviewHTML: null,
    });
    expect(pages.map((page) => page.key)).toEqual(["0-d", "0-b", "0-p", "0-p2"]);
    expect(pages.map((page) => page.kind)).toEqual(["deploy", "breaks", "planner", "planner"]);
  });
});

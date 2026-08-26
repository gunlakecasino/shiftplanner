import React from "react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { buildDayDefs } from "@/lib/shiftbuilder/dateUtils";
import {
  configuredOfficialAuxDefs,
  OfficialGravesDeploymentPage,
  officialAuxCardGridShape,
} from "@/app/shiftbuilder/print/OfficialGravesPrintPages";
import type { PrintDaySnapshot } from "@/app/shiftbuilder/print/printPreviewTypes";

describe("official AUX print layout", () => {
  it("fits up to five configured AUX cards in one row beside DROP ZONES", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
      { key: "AUX3", role: "blank", label: "TRAINING", locations: [] },
      { key: "AUX4", role: "job_coach", label: "JOB COACH", locations: ["Job Coach"] },
      { key: "AUX5", role: "support", label: "SUPPORT 1", locations: ["Support"] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual([
      "AUX1",
      "AUX2",
      "AUX3",
      "AUX4",
      "AUX5",
    ]);
    expect(officialAuxCardGridShape(configured.length)).toEqual({
      columns: 5,
      rows: 1,
    });
  });

  it("wraps additional configured AUX cards after the five-column row", () => {
    expect(officialAuxCardGridShape(6)).toEqual({
      columns: 5,
      rows: 2,
    });
  });

  it("gives the adaptive AUX cards all available space before DROP ZONES", () => {
    [
      join(process.cwd(), "src/app/shiftbuilder/print/printPreview.css"),
      join(process.cwd(), "public/shiftbuilder-print-preview.css"),
    ].forEach((path) => {
      const css = readFileSync(path, "utf8");

      expect(css).toMatch(
        /\.sb-approved-aux-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 192px;/s,
      );
      expect(css).toMatch(
        /\.sb-approved-aux-card-grid\s*\{[^}]*grid-column:\s*1;[^}]*width:\s*100%;/s,
      );
      expect(css).toMatch(
        /\.sb-approved-drop-zones-slot\s*\{[^}]*grid-column:\s*2;/s,
      );
    });
  });

  it("centers AUX names on the left and omits AUX task text", () => {
    const friday = new Date(2026, 7, 14);
    const days = buildDayDefs(friday, friday);
    const auxTask: NightSlotTask = {
      id: "aux-task",
      nightId: "night-1",
      slotKey: "AUX1",
      slotType: "aux",
      rrSide: null,
      taskLabel: "THIS AUX TASK MUST NOT PRINT",
      catalogTaskId: null,
      sortOrder: 0,
      color: null,
      isCoverage: false,
    };
    const snapshot: PrintDaySnapshot = {
      dayIndex: 0,
      day: days[0],
      assignments: {
        AUX1: { tmId: "tm_zoey", tmName: "Zoey", breakGroup: 2 },
      },
      tasksBySlot: { AUX1: [auxTask] },
      auxDefs: [
        { key: "AUX1", role: "support", label: "SUPPORT 1", locations: [] },
      ],
      amOverlapDayName: "Saturday",
      amOverlapDateNum: 15,
      nextDayColor: days[1].color,
      breakCounts: { 1: 0, 2: 1, 3: 0, 4: 0 },
    };

    const html = renderToStaticMarkup(
      React.createElement(OfficialGravesDeploymentPage, {
        snapshot,
        weekDayDefs: days,
        includeTimestamp: false,
      }),
    );

    expect(html).toContain('data-pdf-slot-key="AUX1"');
    expect(html).toContain('data-pdf-text-align="left"');
    expect(html).toContain("<span>Zoey</span>");
    expect(html).not.toContain("THIS AUX TASK MUST NOT PRINT");

    [
      join(process.cwd(), "src/app/shiftbuilder/print/printPreview.css"),
      join(process.cwd(), "public/shiftbuilder-print-preview.css"),
    ].forEach((path) => {
      const css = readFileSync(path, "utf8");
      expect(css).toMatch(
        /\.sb-approved-assignment-card\.is-aux-mini \.sb-approved-card-body\s*\{[^}]*align-items:\s*center;/s,
      );
      expect(css).toMatch(
        /\.sb-approved-assignment-card\.is-aux-mini \.sb-approved-card-names\s*\{[^}]*text-align:\s*left;/s,
      );
    });
  });

  it("omits only truly unconfigured blank shells", () => {
    const auxDefs: AuxDef[] = [
      { key: "AUX1", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
      { key: "AUX2", role: "blank", label: "", locations: [] },
    ];

    const configured = configuredOfficialAuxDefs(auxDefs);

    expect(configured.map((def) => def.key)).toEqual(["AUX1"]);
    expect(officialAuxCardGridShape(configured.length)).toEqual({
      columns: 1,
      rows: 1,
    });
  });
});

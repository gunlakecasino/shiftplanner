import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { SeatCoverageFooter } from "@/app/shiftbuilder/components/CoverageBar";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const authCss = readFileSync(resolve(process.cwd(), "src/app/shiftbuilder/authGate.css"), "utf8");
const zoneCard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/ZoneCard.tsx"),
  "utf8",
);
const auxCard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/AuxCard.tsx"),
  "utf8",
);
const overlapSlot = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/OverlapSlot.tsx"),
  "utf8",
);
const draftPill = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/DraftStatusPill.tsx"),
  "utf8",
);
const confirm = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/ConfirmDialog.tsx"),
  "utf8",
);
const capture = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/CaptureDeskDialog.tsx"),
  "utf8",
);
const roster = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/RosterItem.tsx"),
  "utf8",
);

describe("SheetBuilder desk cohesion", () => {
  it("uses one card radius token and one control language", () => {
    expect(globalsCss).toContain("--sb-card-radius: 20px");
    expect(globalsCss).toContain("--sb-control-radius: 8px");
    expect(globalsCss).toContain(".sb-desk-control");
    expect(globalsCss).toContain(".sb-desk-dialog");
    expect(globalsCss).toContain(".sb-desk-overlay");
    expect(globalsCss).toContain("Desk cohesion — one product language");
    expect(zoneCard).toContain("sb-desk-seat");
    expect(auxCard).toContain("sb-desk-seat");
    expect(overlapSlot).toContain("sb-desk-seat");
    expect(zoneCard).not.toContain("rounded-xl");
    expect(auxCard).not.toContain("rounded-2xl");
    expect(auxCard).toContain('inviteSize="zone"');
    expect(auxCard).toContain('scale="zone"');
    expect(auxCard).not.toContain("nameSizeOverride");
    expect(globalsCss).toContain("--sb-invite-min-h-aux: 44px");
    expect(overlapSlot).not.toContain("rounded-xl");
  });

  it("keeps assign pulse / select / dim on the same motion family", () => {
    expect(globalsCss).toContain(".assignment-card.sb-card-assign-pulse");
    expect(globalsCss).toContain(".assignment-card.sb-card-selected");
    expect(globalsCss).toContain(".assignment-card.sb-card-peer-dimmed");
    expect(globalsCss).toContain("sb-dnd-settle-kf");
  });

  it("keeps Draft, confirm, and capture on paper — not glass or purple hover", () => {
    expect(draftPill).not.toContain("backdropFilter");
    expect(draftPill).not.toContain("var(--sb-glass)");
    expect(draftPill).not.toContain("var(--sb-optimize-ink)");
    expect(confirm).toContain("DESK_DIALOG");
    expect(confirm).not.toContain("backdropFilter");
    expect(capture).toContain("DESK_DIALOG");
    expect(globalsCss).not.toContain("#635bff");
    expect(globalsCss).not.toContain("#7357ff");
    expect(globalsCss).not.toContain("#4338ca");
    expect(roster).toContain("sb-desk-control");
    expect(roster).not.toContain("uppercase tracking-wide");
  });

  it("moves Help into More and keeps Draft pill off the toast corner", () => {
    const help = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/ShiftBuilderHelpButton.tsx"),
      "utf8",
    );
    const nav = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
      "utf8",
    );
    const client = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
      "utf8",
    );
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/layout.tsx"),
      "utf8",
    );
    expect(help).not.toContain("sb-help-fab");
    expect(help).toContain("sb-open-help");
    expect(nav).toContain("Help");
    expect(nav).toContain("sb-open-help");
    expect(globalsCss).toContain(".sb-desk-toasts");
    expect(globalsCss).toContain("Collision map");
    expect(client).toContain("sb-desk-toasts");
    expect(layout).toContain("offset={{ bottom: 88, right: 16 }}");
    expect(draftPill).toContain("Toasts stay bottom-right");
  });

  it("masks PIN field and loading shells with the same quiet motion", () => {
    expect(authCss).toContain("border-color var(--sb-motion-instant, 100ms)");
    expect(authCss).toContain("border-radius: var(--sb-card-radius, 20px)");
    expect(authCss).toContain(".sb-auth-primary:active:not(:disabled)");
  });

  it("uses one reserved coverage footer band across Zone / RR / Aux", () => {
    const coverageBar = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CoverageBar.tsx"),
      "utf8",
    );
    const rrCard = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/RRCard.tsx"),
      "utf8",
    );
    expect(coverageBar).toContain("export function SeatCoverageFooter");
    expect(zoneCard).toContain("SeatCoverageFooter");
    expect(auxCard).toContain("SeatCoverageFooter");
    expect(rrCard).toContain("SeatCoverageFooter");
    expect(globalsCss).toContain(".sb-coverage-footer--band");
    expect(globalsCss).toContain("width: 8px !important");
    expect(globalsCss).toContain("--sb-card-paper: #FFFFFF");
    expect(globalsCss).toContain("background: #1C1C1E");
  });

  it("quiets topbar Unpublished and labels Zones / Breaks / Overlaps sheets", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
      "utf8",
    );
    const client = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
      "utf8",
    );
    expect(nav).toContain("sb-sheet-view-pill");
    expect(nav).toMatch(/>\s*Zones\s*</);
    expect(nav).toMatch(/>\s*Breaks\s*</);
    expect(nav).toMatch(/>\s*Overlaps\s*</);
    expect(nav).not.toContain("sb-help-fab");
    expect(nav).toContain("sb-topbar-publish");
    expect(nav).toContain('background: draftSlotCount > 0 ? "#1C1C1E"');
    expect(nav).toContain("Drop zones ·");
    expect(client).not.toContain("<DropZonesCard");
    expect(client).not.toContain("showPicker");
    expect(globalsCss).toContain(".sb-drop-zones-picker");
    expect(globalsCss).toContain("display: none !important");
  });

  it("uses one Assign TM empty seat and one reserved covering row", () => {
    const chrome = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
      "utf8",
    );
    const coverageBar = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CoverageBar.tsx"),
      "utf8",
    );
    expect(zoneCard).toContain("isLiveEmptySeat");
    expect(zoneCard).not.toContain('? "Unassigned"');
    expect(zoneCard).not.toContain('displayName || "Unassigned"');
    expect(auxCard).toContain("coverageSlotsOf(a)");
    expect(chrome).toContain("Assign TM");
    expect(chrome).toContain("showDigitalAssists && onUnassignedClick");
    expect(coverageBar).toContain("sb-coverage-footer__row");
    expect(coverageBar).toContain("uniqueOutgoingCoverageTasks");
    expect(coverageBar).not.toContain("formatCoveredByRail");
    expect(globalsCss).toContain(".sb-coverage-footer__row");
    expect(globalsCss).toContain("Kit fidelity — locked desk anatomy");
    expect(globalsCss).toContain("background: #F4F6FA");
    expect(globalsCss).toContain("overflow: hidden !important");
  });

  it("compacts the topbar and keeps one sans ramp on live cards", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
      "utf8",
    );
    const coverageBar = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CoverageBar.tsx"),
      "utf8",
    );
    const vectors = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CardVectorMark.tsx"),
      "utf8",
    );
    expect(nav).toContain("sb-topbar-spacer");
    expect(nav).toContain("sb-topbar-day-strip flex items-center justify-start shrink-0");
    expect(nav).not.toContain("justify-around flex-1 px-1");
    expect(globalsCss).toContain("Kit fidelity pass 2");
    expect(globalsCss).toContain(".sb-topbar-spacer");
    expect(globalsCss).toContain("background: #1C1C1E !important");
    expect(globalsCss).toContain(".sb-card-vector-sans-label");
    expect(globalsCss).toContain("min-height: 132px !important");
    expect(nav).toContain("sb-night-action-pill--apply-idle");
    expect(globalsCss).toContain(".sb-night-action-pill--apply:disabled");
    expect(globalsCss).toContain(".sb-night-action-pill--apply-idle:disabled");
    expect(coverageBar).toContain('const railBg = "#EEF1F6"');
    expect(coverageBar).toContain('const railInk = "#334155"');
    expect(vectors).toContain("sb-card-vector-sans-label");
    expect(auxCard).toContain("sb-card-assign-zone shrink-0");
    expect(auxCard).not.toContain("{isUnsetBlank && !hasTM ? null : (");
  });

  it("keeps multi-coverage on one reserved footer chip row", () => {
    const coverageBar = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CoverageBar.tsx"),
      "utf8",
    );
    const ipadDesk = readFileSync(
      resolve(process.cwd(), "src/app/dev/ipad-desk/page.tsx"),
      "utf8",
    );
    expect(coverageBar).toContain("sb-coverage-footer__row");
    expect(coverageBar).toContain("uniqueOutgoingCoverageTasks");
    expect(coverageBar).not.toContain("sb-coverage-rail__label sb-coverage-bar-label font-semibold leading-none truncate");
    expect(globalsCss).toContain("One reserved footer, one chip row");
    expect(globalsCss).toMatch(
      /\.sb-coverage-footer__row[\s\S]{0,220}flex-wrap: nowrap/,
    );
    expect(globalsCss).toMatch(
      /\.sb-coverage-footer__row \.sb-coverage-bar\.sb-coverage-rail[\s\S]{0,400}width: auto !important/,
    );
    expect(globalsCss).toContain("flex: 0 0 auto !important");
    expect(globalsCss).toContain("html.sb-ipad-desk");
    expect(globalsCss).toContain("text-overflow: clip !important");
    expect(globalsCss).toContain("align-self: start !important");
    expect(globalsCss).toMatch(
      /\.sb-coverage-footer--empty[\s\S]{0,120}min-height: 14px !important/,
    );
    expect(ipadDesk).toContain("AND ZONE 6");
    expect(ipadDesk).toContain("AND Men's Restroom 7");
    expect(ipadDesk).toContain("SUPPORT 3");
    const taskRow = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/TaskRow.tsx"),
      "utf8",
    );
    expect(taskRow).toContain("Live desk keeps floor-sheet scale");
    expect(taskRow).toContain("Math.max(12, baseSizePx)");
    expect(taskRow).not.toContain("el.style.fontSize = `${shrinkSizePx}px`");
  });

  it("renders Drew/MEN'S 6 two-coverage as one footer chip row", () => {
    const task = (
      id: string,
      taskLabel: string,
    ): NightSlotTask => ({
      id,
      nightId: "fixture",
      slotKey: "MRR6",
      slotType: "rr",
      rrSide: "mens",
      taskLabel,
      catalogTaskId: null,
      sortOrder: 1,
      color: "#C05A98",
      isCoverage: true,
    });
    const html = renderToStaticMarkup(
      React.createElement(SeatCoverageFooter, {
        slotKey: "MRR6",
        outgoingTasks: [
          task("m6-c", "AND ZONE 6"),
          task("m6-c7", "AND Men's Restroom 7"),
        ],
        reserved: true,
      }),
    );
    expect(html.match(/sb-coverage-footer--band/g)).toHaveLength(1);
    expect(html.match(/sb-coverage-footer__row/g)).toHaveLength(1);
    expect(html).toContain("Covering Zone 6");
    expect(html).toMatch(/Covering Men(?:'|&#x27;)s 7/);
    const rowAt = html.indexOf("sb-coverage-footer__row");
    const firstRail = html.indexOf("sb-coverage-rail", rowAt);
    const secondRail = html.indexOf("sb-coverage-rail", firstRail + 1);
    expect(rowAt).toBeGreaterThan(-1);
    expect(firstRail).toBeGreaterThan(rowAt);
    expect(secondRail).toBeGreaterThan(firstRail);
    expect(html).not.toContain("sb-coverage-footer--empty");
    expect(html.match(/sb-coverage-footer /g)).toHaveLength(1);
  });

  it("keeps Team search as an icon, not a colliding search ligature", () => {
    const teamTab = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/sudo/TeamTab.tsx"),
      "utf8",
    );
    expect(teamTab).toContain('<MsIcon name="search" size={14} />');
    expect(teamTab).not.toContain(">search</span>");
    expect(teamTab).toContain('htmlFor="sb-team-roster-search"');
  });
});

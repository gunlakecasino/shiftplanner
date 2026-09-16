import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

  it("quiets topbar Unpublished and labels Zones / Breaks sheets", () => {
    const nav = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
      "utf8",
    );
    expect(nav).toContain("sb-sheet-view-pill");
    expect(nav).toContain(">Zones<");
    expect(nav).toContain(">Breaks<");
    expect(nav).not.toContain("sb-help-fab");
    expect(nav).toContain("sb-topbar-publish");
    expect(nav).toContain('background: draftSlotCount > 0 ? "#1C1C1E"');
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

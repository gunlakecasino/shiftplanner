import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const shiftBuilderClient = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
  "utf8",
);
const shiftBuilderBoard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/ShiftBuilderBoard.tsx"),
  "utf8",
);
const floatingNav = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
  "utf8",
);
const settingsConfig = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/settings/settingsConfig.ts"),
  "utf8",
);
const middleware = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");

describe("live board short-landscape viewport contract", () => {
  const compactStart = globalsCss.indexOf("/* Short landscape boards must fit");
  const compactEnd = globalsCss.indexOf("/* ==========================================================================\n   iPad Pro", compactStart);
  const compactCss = globalsCss.slice(compactStart, compactEnd);

  it("uses bounded card tracks so task content cannot push overlaps below the board", () => {
    expect(compactStart).toBeGreaterThan(-1);
    expect(compactEnd).toBeGreaterThan(compactStart);
    expect(compactCss).toContain("(max-height: 1300px)");
    expect(compactCss).toContain("grid-auto-rows: 132px !important");
    expect(compactCss).toContain("grid-auto-rows: 252px !important");
    expect(compactCss).toContain("grid-auto-rows: 96px !important");
    expect(compactCss).not.toContain("minmax(148px, auto)");
    expect(compactCss).not.toContain("minmax(262px, auto)");
    expect(compactCss).not.toContain("minmax(108px, auto)");
  });

  it("keeps the canvas as a vertical-scroll fallback", () => {
    const landscapeStart = globalsCss.indexOf("@media (orientation: landscape)");
    const landscapeCss = globalsCss.slice(landscapeStart, compactStart);

    expect(landscapeStart).toBeGreaterThan(-1);
    expect(landscapeCss).toContain("overflow-y: auto !important");
  });

  it("allows desktop wheel input to reach the board scroll owner", () => {
    expect(shiftBuilderClient).not.toContain('addEventListener("wheel"');
  });

  it("temporarily hides the rotation floater and the header Run Day action", () => {
    expect(shiftBuilderBoard).not.toContain("<RotationHealthFloater");
    expect(floatingNav).not.toContain("sb-run-day-btn");
  });
});

describe("SheetBuilder chrome slim (PR A)", () => {
  it("launchpad advertises Home / Team / Settings only", () => {
    expect(floatingNav).toContain("<strong>Home</strong>");
    expect(floatingNav).toContain("<strong>Team</strong>");
    expect(floatingNav).toContain("<strong>Settings</strong>");
    expect(floatingNav).not.toContain("<strong>Reports</strong>");
    expect(floatingNav).not.toContain("<strong>Projects</strong>");
  });

  it("More menu drops retired chrome", () => {
    expect(floatingNav).toContain("Graves Schedule");
    expect(floatingNav).toContain("Refresh Day");
    expect(floatingNav).toContain("Clear Day");
    expect(floatingNav).not.toContain(">Optimize Week<");
    expect(floatingNav).not.toContain("Grave Cover Guide");
    expect(floatingNav).not.toContain("Weekly View");
    expect(floatingNav).not.toContain("Week Health");
    expect(floatingNav).not.toContain("Request Work");
  });

  it("does not mount Timefold on the canvas client", () => {
    expect(shiftBuilderClient).not.toContain("TimefoldResultsSheet");
    expect(shiftBuilderClient).not.toContain("useTimefoldOptimize");
    expect(shiftBuilderClient).not.toContain("timefoldSheetOpen");
  });

  it("drops Batch Planner from settings tabs and redirects the legacy query", () => {
    expect(settingsConfig).not.toContain('id: "planner"');
    expect(settingsConfig).toContain("planner: \"engine\"");
    expect(settingsConfig).toContain('label: "Card Defaults"');
    expect(settingsConfig).toContain('label: "Engine Config"');
    expect(settingsConfig).toContain('label: "Users"');
    expect(settingsConfig).toContain('label: "Audit Log"');
  });

  it("prod-redirects /sheetbuilder/ai and /sheetbuilder/dev the same way as /shiftbuilder/ai", () => {
    expect(middleware).toContain('url.pathname.startsWith("/sheetbuilder/dev")');
    expect(middleware).toContain('url.pathname === "/sheetbuilder/ai"');
    expect(middleware).toContain('url.pathname === "/shiftbuilder/ai"');
  });
});

describe("SheetBuilder night actions (PR B)", () => {
  it("surfaces Engine, Draft, and Print as velvet glass pills", () => {
    expect(floatingNav).toContain("velvetGlassPillStyle");
    expect(floatingNav).toContain("sb-night-action-pill--engine");
    expect(floatingNav).toContain("sb-night-action-pill--draft");
    expect(floatingNav).toContain("sb-night-action-pill--print");
    expect(floatingNav).toContain("Running…");
    expect(floatingNav).toContain('"Engine"');
    expect(floatingNav).toContain(">Draft<");
    expect(floatingNav).toContain(">Print<");
    expect(floatingNav).toContain("aria-label=\"Night actions\"");
  });

  it("routes Apply through onSaveAllDraft only", () => {
    expect(floatingNav).toContain("onClick={onSaveAllDraft}");
    expect(floatingNav).not.toContain("onClick={() => {\n                      onSaveAllDraft();");
    expect(floatingNav).not.toContain("void applyDraft");
    expect(floatingNav).not.toContain("applyDraft(");
  });

  it("keeps More as maintenance: Clear / Refresh / official-flag / Graves Schedule", () => {
    expect(floatingNav).toContain("Maintenance");
    expect(floatingNav).toContain("Clear Day");
    expect(floatingNav).toContain("Refresh Day");
    expect(floatingNav).toContain("Graves Schedule");
    expect(floatingNav).toContain("Publish Day");
    expect(floatingNav).toContain("View Print Preview");
    expect(floatingNav).not.toContain("Run Day Placements");
    expect(floatingNav).not.toContain("Apply to Live");
    expect(floatingNav).not.toContain("Discard Draft");
    expect(floatingNav).not.toContain("Copy Tasks from Prior Week");
    expect(floatingNav).not.toContain("Apply Overlap Tasks");
  });

  it("does not invent a third accent palette", () => {
    expect(floatingNav).toContain("var(--sb-optimize-ink)");
    expect(floatingNav).toContain("var(--sb-gold-ink)");
    expect(floatingNav).not.toContain("--sb-night-accent");
    expect(floatingNav).not.toContain("#339CFF");
  });

  it("desk chrome gives the live artboard a paper sheet without touching Golden print", () => {
    expect(globalsCss).toContain(".sb-night-action-pill");
    expect(globalsCss).toContain("0 10px 28px -10px rgba(15, 23, 42, 0.22)");
    expect(globalsCss).toContain(".sb-sheetbuilder-redesign .sb-builder-fluid-viewport");
    expect(globalsCss).toContain("var(--sb-paper, #ffffff)");
    expect(globalsCss).not.toMatch(/\.print-artboard\s*\{[^}]*sb-paper-desk/);
  });
});

describe("SheetBuilder live undo toast (PR C)", () => {
  it("reuses Sonner + the existing history snapshot path", () => {
    expect(shiftBuilderClient).toContain("from \"@/lib/shiftbuilder/historyUndoToast\"");
    expect(shiftBuilderClient).toContain("runSharedHistoryUndo");
    expect(shiftBuilderClient).toContain("offerHistoryUndoToast");
    expect(shiftBuilderClient).toContain("performHistoryUndo");
    expect(shiftBuilderClient).toContain("shiftHistoryRef.current.undo()");
    expect(shiftBuilderClient).toContain('applyHistorySnapshotRef.current(snapshot, "Undo")');
    expect(shiftBuilderClient).toContain("performHistoryUndoRef.current()");
    expect(shiftBuilderClient).not.toContain("create table");
    expect(shiftBuilderClient).not.toContain("CREATE TABLE");
    expect(shiftBuilderClient).not.toMatch(/undoStack\s*=/);
  });

  it("offers Undo only after a successful live occupied swap persist", () => {
    expect(shiftBuilderClient).toContain("if (displacedTmId)");
    expect(shiftBuilderClient).toContain('offerPersistedHistoryUndoToastRef.current("Swapped")');
    expect(shiftBuilderClient).toContain("batchApplyDraftAssignments");
    expect(shiftBuilderClient).not.toMatch(/offerPersistedHistoryUndoToastRef\.current\("Swapped"\);[\s\S]{0,80}isDraftMode/);
  });

  it("offers Undo after a roster-drop unassign persist, not draft-only clears", () => {
    expect(shiftBuilderClient).toContain('unassign(a.fromSlot, { offerUndo: true })');
    expect(shiftBuilderClient).toContain("offerUndoAfterPersist");
    expect(shiftBuilderClient).toContain('offerPersistedHistoryUndoToastRef.current("Unassigned")');
    expect(shiftBuilderClient).toContain("onPersisted: offerUndoAfterPersist");
    expect(shiftBuilderClient).toContain("upsertDraftSlot(slotKey, { kind: \"clear\" })");
  });
});

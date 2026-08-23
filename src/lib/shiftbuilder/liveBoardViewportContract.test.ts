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
const defaultsTab = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/sudo/DefaultsTab.tsx"),
  "utf8",
);
const rrCard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/RRCard.tsx"),
  "utf8",
);
const auxCard = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/AuxCard.tsx"),
  "utf8",
);

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

describe("SheetBuilder desk refine + Projects retirement", () => {
  it("redirects retired Projects routes to the canvas", () => {
    expect(middleware).toContain('url.pathname.startsWith("/sheetbuilder/projects")');
    expect(middleware).toContain('url.pathname.startsWith("/shiftbuilder/projects")');
  });

  it("does not mount Projects pills, Timefold UI, or the Projects API on the canvas client", () => {
    expect(shiftBuilderClient).not.toContain("useBoardTaskSummary");
    expect(shiftBuilderClient).not.toContain("CardProjectPills");
    expect(shiftBuilderClient).not.toContain("/api/shiftbuilder/projects");
    expect(shiftBuilderClient).not.toContain("TimefoldResultsSheet");
    expect(shiftBuilderClient).not.toContain("useTimefoldOptimize");
  });

  it("keeps Engine / Draft / Print as one quiet velvet cluster without sparkle chrome", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("velvetGlassPillStyle");
    expect(floatingNav).toContain("sb-night-action-pill--engine");
    expect(floatingNav).toContain("sb-night-action-pill--draft");
    expect(floatingNav).toContain("sb-night-action-pill--print");
    expect(floatingNav).toContain('"Engine"');
    expect(floatingNav).toContain(">Draft<");
    expect(floatingNav).toContain(">Print<");
    expect(floatingNav).not.toContain("Sparkles");
    expect(floatingNav).toContain("aria-label=\"Night actions\"");
  });

  it("aligns desk chrome with Inter Tight and does not remap --font-ui off the builder shell", () => {
    expect(globalsCss).toContain("font-family: var(--font-ui, var(--font-inter-tight), system-ui)");
    expect(globalsCss).not.toMatch(/\.sb-builder-shell\.sb-canvas-builder \{[\s\S]*--font-ui: var\(--font-builder\)/);
    expect(globalsCss).not.toMatch(/\.sb-builder-shell\.sb-canvas-builder \{[\s\S]*--font-inter-tight: var\(--font-builder\)/);
  });

  it("edits standing OL defaults from Card Defaults, not a Projects app", () => {
    expect(defaultsTab).toContain("OverlapPoolDefaultsPanel");
    expect(defaultsTab).not.toContain("Projects → Defaults");
  });

  it("de-gimmicks idle zone cards — type + zone color, no demo orbs or kebab chrome", () => {
    const shiftCard = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/redesign/components/ShiftCard.tsx"),
      "utf8",
    );
    expect(shiftCard).not.toContain("MoreHorizontal");
    expect(shiftCard).not.toContain("ZONE_STATUS");
    expect(shiftCard).not.toContain("backgroundColor: `${accentColor}14`");
    expect(rrCard).not.toContain("rgba(0,122,255,0.12)");
    expect(auxCard).not.toContain("rgba(0,122,255,0.12)");
  });

  it("keeps empty cards and draft frames on paper, not optimize-blue glow", () => {
    expect(globalsCss).toContain("Empty slots — same paper as filled cards");
    expect(globalsCss).toContain("0 0 0 1px rgba(212, 168, 0, 0.32)");
    expect(globalsCss).not.toContain("0 0 0 1px rgba(51, 156, 255, 0.15)");
    expect(globalsCss).not.toMatch(
      /\.builder-workspace \.assignment-card\.sb-card-empty \{[\s\S]{0,280}backdrop-filter: blur/,
    );
  });
});

describe("SheetBuilder night actions (PR B)", () => {
  it("surfaces Engine, Draft, and Print as velvet glass pills", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("velvetGlassPillStyle");
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
    expect(globalsCss).toContain("0 8px 24px -16px rgba(15, 23, 42, 0.28)");
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

describe("SheetBuilder modern lightweight desk", () => {
  it("uses cool gray canvas, white cards, and keeps covering as inset chips", () => {
    expect(globalsCss).toContain("Modern lightweight desk — live board cards only");
    expect(globalsCss).toContain("--sb-card-paper: #FFFFFF");
    expect(globalsCss).toContain("--sb-paper: #F5F7F9");
    expect(globalsCss).toContain("sb-coverage-chip");
    expect(globalsCss).not.toContain("#F4EFE6");
    expect(globalsCss).not.toContain("#FBF7F0");
    expect(globalsCss).not.toContain("#E8E0D2");
    expect(globalsCss).not.toMatch(/\.print-artboard\s*\{[^}]*sb-card-paper/);
  });

  it("does not recolor uniform-code zone rails on the live desk", () => {
    const deskStart = globalsCss.indexOf("Modern lightweight desk — live board cards only");
    const deskCss = globalsCss.slice(deskStart);
    expect(deskCss).not.toMatch(/--sb-z1:\s*#C8960C/);
    expect(deskCss).not.toMatch(/--sb-z3:\s*#D93838/);
    expect(deskCss).not.toContain("6B5A3A");
    expect(deskCss).toContain("border-radius: 16px !important");
  });

  it("keeps redesign zone rails on the uniform code", () => {
    const tokens = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/redesign/tokens.ts"),
      "utf8",
    );
    expect(tokens).toContain('label: "#ffcc00"');
    expect(tokens).toContain('label: "#ff3b30"');
    expect(tokens).toContain('label: "#007aff"');
    expect(tokens).toContain('label: "#34c759"');
    expect(tokens).not.toContain('label: "#C8960C"');
    expect(tokens).not.toContain('label: "#D93838"');
  });

  it("quiets the header: velvet night actions, no dead bell, Published as text", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("velvetGlassPillStyle");
    expect(floatingNav).not.toContain("backdropFilter");
    expect(floatingNav).toContain('background: "#1E1F24"');
    expect(floatingNav).toContain('"Engine"');
    expect(floatingNav).toContain(">Draft<");
    expect(floatingNav).toContain(">Print<");
    expect(floatingNav).not.toContain("Bell");
    expect(floatingNav).not.toContain("sb-topbar-notification-btn");
    expect(floatingNav).toContain('"Published"');
    expect(floatingNav).not.toContain('"PUBLISHED"');
    expect(floatingNav).toContain("Overlap sheet");
  });
});

describe("SheetBuilder modern lightweight desk measured sit", () => {
  it("shares one section-label baseline and letter-spacing for ZONES and AUXILIARY", () => {
    expect(globalsCss).toContain("Modern lightweight desk — measured sit (live zds acceptance)");
    expect(globalsCss).toContain("padding: 0 10px 12px 12px !important");
    expect(globalsCss).toMatch(
      /\.sb-with-aux-sidebar > section:nth-child\(3\) \.sheet-section-header \.label \{[\s\S]*?letter-spacing: 0\.08em !important/,
    );
    expect(globalsCss).toContain("color: #64748B !important");
  });

  it("keeps covering chips inset and fades duty lists instead of mid-glyph clip", () => {
    const shiftCard = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/redesign/components/ShiftCard.tsx"),
      "utf8",
    );
    expect(shiftCard).toContain("sb-desk-card-tasks");
    expect(shiftCard).not.toContain("mt-auto min-w-0 flex flex-col gap-1");
    expect(globalsCss).toContain("mask-image: linear-gradient(180deg, #000 calc(100% - 14px), transparent)");
    expect(globalsCss).toContain(".assignment-card .sb-coverage-bar");
    expect(globalsCss).toMatch(
      /\.assignment-card \.sb-coverage-bar,[\s\S]*?position: relative !important/,
    );
  });

  it("keeps RR pills on the left axis and matches footer page padding to the SBS line", () => {
    expect(rrCard).toContain("sb-rr-meta-pills");
    expect(rrCard).toContain("flex-col items-start");
    expect(globalsCss).toContain("sb-rr-card-header .ml-auto");
    expect(globalsCss).toContain(".sb-builder-pinned-footer {\n  padding-left: 16px !important");
  });

  it("evens Engine/Draft/Print width and insets the roster badge off the glyph", () => {
    expect(floatingNav).toContain("minWidth: 68");
    expect(floatingNav).not.toContain("Bell");
    expect(globalsCss).toContain("min-width: 68px");
    expect(globalsCss).toContain(".sb-sheetbuilder-roster-alert {\n  top: 1px;\n  right: 1px");
    expect(globalsCss).toContain(".sb-month-status-diamond {\n  background: #34C759");
  });
});

describe("SheetBuilder canvas pride (RR / chips / overflow)", () => {
  it("uses honest gendered RR titles instead of truncated RR 6 WOMEN'S", () => {
    expect(rrCard).toContain("formatCanvasRrSideLabel");
    expect(rrCard).not.toContain("${def.label} WOMEN'S");
    expect(rrCard).not.toContain("${def.label} MEN'S");
    expect(rrCard).not.toContain("◆");
  });

  it("keeps coverage on the named restroom half and hides grey trail codes", () => {
    const chrome = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
      "utf8",
    );
    const coverageBar = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/CoverageBar.tsx"),
      "utf8",
    );
    expect(chrome).toContain("formatCanvasTrailChip");
    expect(chrome).toContain("formatCanvasRepeatReason");
    expect(chrome).toContain("sb-critical-repeat-mark");
    expect(chrome).toContain("Repeat");
    expect(chrome).not.toContain("rounded-full font-black");
    expect(coverageBar).toContain("formatCanvasCoverageChip");
    expect(coverageBar).not.toContain("replace(/^AND\\s+/i, '+ ')");
  });

  it("stacks covered-by with tasks and lets zone titles wrap", () => {
    const shiftCard = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/redesign/components/ShiftCard.tsx"),
      "utf8",
    );
    expect(shiftCard).not.toContain("grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]");
    expect(shiftCard).not.toContain("whitespace-nowrap");
    expect(shiftCard).not.toContain(">Tasks<");
    expect(globalsCss).toContain("Canvas pride — live board cards only");
    expect(globalsCss).toContain("sb-tm-trail-chip");
    expect(globalsCss).toContain("content: none !important");
  });
});

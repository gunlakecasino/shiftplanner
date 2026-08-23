import { existsSync, readFileSync } from "node:fs";
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

  it("keeps Draft / Print as one quiet velvet cluster without sparkle chrome", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("velvetGlassPillStyle");
    expect(floatingNav).not.toContain("sb-night-action-pill--engine");
    expect(floatingNav).toContain("sb-night-action-pill--draft");
    expect(floatingNav).toContain("sb-night-action-pill--print");
    expect(floatingNav).not.toContain('"Engine"');
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
  it("surfaces Draft and Print as velvet glass pills", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("velvetGlassPillStyle");
    expect(floatingNav).not.toContain("sb-night-action-pill--engine");
    expect(floatingNav).toContain("sb-night-action-pill--draft");
    expect(floatingNav).toContain("sb-night-action-pill--print");
    expect(floatingNav).not.toContain("Running…");
    expect(floatingNav).not.toContain('"Engine"');
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
    expect(floatingNav).not.toContain("var(--sb-optimize-ink)");
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
    expect(globalsCss).toContain("--sb-paper: #F4F6FA");
    expect(globalsCss).toContain("--sb-substrate-2: #EEF1F6");
    expect(globalsCss).toContain("Dock open — keep the cool desk");
    expect(globalsCss).toMatch(
      /body\.sb-tablet-dock-open \{[\s\S]*?--sb-substrate: #EEF1F6/,
    );
    expect(globalsCss).toContain(
      "body.sb-tablet-dock-open .builder-workspace,\nbody.sb-tablet-dock-open .sb-canvas-veil",
    );
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
    expect(deskCss).toContain("border-radius: 20px !important");
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
    expect(floatingNav).toContain('background: "#FFFFFF"');
    expect(floatingNav).not.toContain('"Engine"');
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
      /\.sb-with-aux-sidebar > section:nth-child\(3\) \.sheet-section-header \.label \{[\s\S]*?letter-spacing: 0\.04em !important/,
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

  it("evens Draft/Print width and insets the roster badge off the glyph", () => {
    expect(floatingNav).toContain("minWidth: 68");
    expect(floatingNav).not.toContain("Bell");
    expect(globalsCss).toContain("min-width: 68px");
    expect(globalsCss).toContain(".sb-sheetbuilder-roster-alert {\n  top: 1px;\n  right: 1px");
    expect(globalsCss).toContain(".sb-month-status-diamond {\n  background: #34C759");
  });
});

describe("SheetBuilder placement pad modern desk", () => {
  const padCssStart = globalsCss.indexOf("SheetBuilder placement pad — modern lightweight desk");
  const padCss = globalsCss.slice(padCssStart, padCssStart + 7000);
  const placementPad = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/PlacementPad.tsx"),
    "utf8",
  );
  const opsStatus = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/OpsStatusBar.tsx"),
    "utf8",
  );
  const dockTabs = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/placement-dock/PlacementDockTabs.tsx"),
    "utf8",
  );

  it("uses white / #F4F6FA surfaces and a thin uniform-code rail", () => {
    expect(padCssStart).toBeGreaterThan(-1);
    expect(padCss).toContain("background: #FFFFFF");
    expect(padCss).toContain("background: #F4F6FA");
    expect(padCss).toContain("width: 5px");
    expect(padCss).toContain("background: #007AFF !important");
    expect(padCss).not.toContain("radial-gradient(circle at top left");
    expect(padCss).not.toContain("linear-gradient(180deg, #f7f8fc");
    expect(padCss).not.toContain("#eef1f7");
    expect(globalsCss).not.toContain("backdrop-filter: blur(28px)");
    expect(globalsCss).not.toContain("backdrop-filter: blur(24px)");
  });

  it("keeps placement behavior and drops Sparkles / xAI chrome", () => {
    expect(placementPad).toContain("sb-sheetbuilder-placement-pad");
    expect(placementPad).toContain("TmPicker");
    expect(placementPad).toContain("Assign team member");
    expect(placementPad).toContain("Change team member");
    expect(placementPad).toContain('background: "#007AFF"');
    expect(placementPad).not.toContain("Sparkles");
    expect(placementPad).not.toContain("xAI insight");
    expect(placementPad).not.toMatch(/>\s*xAI\s*</);
    expect(placementPad).toContain("Fit details");
    expect(dockTabs).toContain("sb-dock-tab--active");
    expect(dockTabs).not.toContain("bg-[#1C1C1E]");
    expect(dockTabs).not.toContain("bg-[#007AFF]");
  });

  it("packs the TM picker and quiets amber / saturated score chrome", () => {
    const markerPad = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/MarkerPad.tsx"),
      "utf8",
    );
    expect(markerPad).toContain("sb-tm-picker-row");
    expect(markerPad).toContain("pickerFitChip");
    expect(markerPad).toContain("#E8F7EE");
    expect(markerPad).not.toContain("#b45309");
    expect(markerPad).not.toContain("rgba(245,158,11");
    expect(markerPad).not.toContain("minHeight: isTablet ? 56");
    expect(globalsCss).toContain("sb-tm-picker-search");
    expect(globalsCss).toContain("min-height: 36px");
    expect(globalsCss).toContain("sb-placement-pad-action-emphasis");
    expect(globalsCss).toContain("sb-placement-pad-action-clear");
    expect(globalsCss).toContain("top: calc(var(--sb-sheet-topbar-h, 54px) + 10px)");
    expect(padCss).toContain("font-size: 16px !important");
  });

  it("lights the roster drawer and SYNCED pill", () => {
    expect(globalsCss).toContain(".sb-sheetbuilder-roster-popover {\n  width: 360px;");
    expect(globalsCss).toMatch(
      /\.sb-sheetbuilder-roster-popover \{[\s\S]*?background: #FFFFFF/,
    );
    expect(globalsCss).not.toContain("background: #292936");
    expect(opsStatus).toContain("background: transparent !important");
    expect(opsStatus).toContain("color: #94A3B8 !important");
    expect(opsStatus).not.toContain("background: #1E1F24 !important");
    expect(opsStatus).not.toContain("color: #C8C4BA !important");
  });
});

describe("SheetBuilder chrome match (light topbar)", () => {
  const opsStatus = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/OpsStatusBar.tsx"),
    "utf8",
  );

  it("makes the topbar the same light product as the cool desk", () => {
    expect(floatingNav).toContain('background: "#FFFFFF"');
    expect(floatingNav).toContain('borderBottom: "1px solid #E6EAF0"');
    expect(floatingNav).toContain('chromeText = "#0F172A"');
    expect(floatingNav).toContain('mutedChromeText = "#64748B"');
    expect(floatingNav).toContain('background: "#F4F6FA"');
    expect(floatingNav).not.toContain('background: "#1E1F24"');
    expect(floatingNav).not.toContain("bg-[#1E1F24]");
    expect(floatingNav).not.toContain("bg-[#1d1d20]");
    expect(floatingNav).not.toContain("backdropFilter");
    expect(globalsCss).toContain("SheetBuilder chrome match — light topbar");
    expect(globalsCss).toContain(".sb-sheetbuilder-redesign .sb-sheetbuilder-topbar {\n  background: #FFFFFF !important;");
    expect(globalsCss).not.toContain("#F4EFE6");
    expect(globalsCss).not.toContain("#FBF7F0");
    expect(globalsCss).not.toContain("#E8E0D2");
  });

  it("keeps Draft / Print, date strip, Published, and account chrome", () => {
    expect(floatingNav).toContain("nightActionClusterStyle");
    expect(floatingNav).not.toContain("sb-night-action-pill--engine");
    expect(floatingNav).toContain("sb-night-action-pill--draft");
    expect(floatingNav).toContain("sb-night-action-pill--print");
    expect(globalsCss).toContain(".sb-night-action-pill:not(.sb-night-action-pill--split) {\n  flex: 0 0 auto;");
    expect(floatingNav).toContain("sb-topbar-day-strip");
    expect(floatingNav).toContain("sb-day-strip-btn--active");
    expect(floatingNav).toContain('borderBottom: "2px solid #0F172A"');
    expect(floatingNav).toContain('"Published"');
    expect(floatingNav).toContain("{userInitials}");
    expect(floatingNav).toContain("Account menu");
    expect(floatingNav).toContain("More actions");
  });

  it("softens empty Assign TM invites without touching filled-card type", () => {
    const chrome = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
      "utf8",
    );
    const shiftCard = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/redesign/components/ShiftCard.tsx"),
      "utf8",
    );
    expect(chrome).toContain("Assign TM");
    expect(chrome).toContain("font-medium tracking-[0.01em] text-[#94A3B8]");
    expect(chrome).not.toContain("Drop to assign");
    expect(chrome).not.toContain("south");
    expect(chrome).not.toContain("font-semibold tracking-[0.02em] text-[#64748B]");
    expect(shiftCard).toContain("<UnassignedInvite");
    expect(shiftCard).not.toContain("Drop to assign");
    expect(shiftCard).not.toContain("${accentColor}99");
    expect(globalsCss).toContain(".sb-unassigned-invite");
    expect(globalsCss).toContain("--sb-invite-min-h-zone: 44px");
    expect(globalsCss).toContain("background: transparent !important");
  });

  it("mutes SYNCED footer chrome so it does not compete with the board", () => {
    expect(opsStatus).toContain("font-size: 8px !important");
    expect(opsStatus).toContain("background: transparent !important");
    expect(opsStatus).toContain("color: #94A3B8 !important");
    expect(opsStatus).toContain("font-weight:500");
    expect(opsStatus).toContain("width:4px;height:4px");
    expect(opsStatus).not.toContain("background: #FFFFFF !important");
    expect(opsStatus).not.toContain("border: 1px solid #E6EAF0 !important");
    expect(globalsCss).toContain("#ops-status-bar");
  });
});

describe("SheetBuilder P0 unstocky motion", () => {
  const authGate = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/authGate.css"),
    "utf8",
  );
  const veil = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/state/dayCardContentVeil.ts"),
    "utf8",
  );
  const chrome = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
    "utf8",
  );
  const version = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/version.ts"),
    "utf8",
  );

  it("ships motion tokens and does not use transition:all on live cards", () => {
    expect(globalsCss).toContain("--sb-motion-instant: 100ms");
    expect(globalsCss).toContain("--sb-motion-quick: 170ms");
    expect(globalsCss).toContain("--sb-motion-move: 220ms");
    expect(globalsCss).toContain("contain: layout paint");
    expect(globalsCss).toContain("sb-dnd-settle");
    expect(globalsCss).toContain("sb-poll-hairline-pulse");
    expect(globalsCss).not.toMatch(/\.assignment-card \{[\s\S]{0,400}transition:\s*all/);
    expect(globalsCss).not.toMatch(/\.slot \{[\s\S]{0,280}transition:\s*all/);
    expect(globalsCss).not.toMatch(/\.btn \{[\s\S]{0,280}transition:\s*all/);
  });

  it("keeps card hosts on slot identity instead of day+slot remount keys", () => {
    expect(shiftBuilderBoard).not.toContain("key={`${dayTransitionKey}-${key}`}");
    expect(shiftBuilderBoard).not.toContain("key={`${dayTransitionKey}-${slotKey}`}");
    expect(shiftBuilderBoard).toContain("key={key}");
    expect(shiftBuilderBoard).toContain("key={slotKey}");
    expect(chrome).toContain("placementIdentityKey");
    expect(chrome).not.toContain("initial={{ opacity: 0, y: 6, scale: 0.93 }}");
  });

  it("day-switch paper is ≤220ms shared-axis, not a 1.75s canvas sweep", () => {
    expect(veil).toContain("export const DAY_CONTENT_VEIL_MS = 200");
    expect(veil).not.toContain("1750");
    expect(authGate).toContain("translateX(10px)");
    expect(authGate).not.toContain("filter: blur(12px)");
    expect(authGate).not.toContain("sb-day-sweep 1.5s");
    expect(authGate).toContain("content: none");
  });

  it("does not put Engine back in the header and bumps the patch version", () => {
    expect(floatingNav).not.toContain('"Engine"');
    expect(floatingNav).toContain(">Draft<");
    expect(floatingNav).toContain(">Print<");
    expect(version).toContain('"1.271"');
  });

  it("reserves the draft gold frame so breath does not remount the board", () => {
    expect(shiftBuilderClient).toContain("sb-draft-frame");
    expect(globalsCss).toContain(".sb-draft-frame,");
  });
});

describe("SheetBuilder P1 empty craft / pad / microstates / cmdk ghosts", () => {
  const placementPad = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/PlacementPad.tsx"),
    "utf8",
  );
  const tasksPad = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/TasksPad.tsx"),
    "utf8",
  );
  const padMotion = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/padMotion.ts"),
    "utf8",
  );
  const draftPill = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/DraftStatusPill.tsx"),
    "utf8",
  );
  const emptySlotPath = resolve(
    process.cwd(),
    "src/app/shiftbuilder/components/state/EmptySlot.tsx",
  );

  it("uses one quiet Assign TM invite and kills the drop-hint stack", () => {
    const chrome = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
      "utf8",
    );
    const primitives = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/builderPrimitives.tsx"),
      "utf8",
    );
    expect(chrome).toContain("Assign TM");
    expect(chrome).not.toContain("Drop to assign");
    expect(chrome).not.toContain("south");
    expect(primitives).not.toContain("UnassignedDropHint");
    expect(existsSync(emptySlotPath)).toBe(false);
    expect(globalsCss).toContain("--sb-invite-min-h-zone: 44px");
    expect(globalsCss).toContain("--sb-invite-min-h-rr: 32px");
  });

  it("does not ship a command palette or advertise Engine / R in header chrome", () => {
    expect(shiftBuilderClient).not.toContain("HeaderOverflow");
    expect(shiftBuilderClient).not.toContain("LazyCommandPalette");
    expect(shiftBuilderClient).not.toContain("Command Palette");
    expect(floatingNav).not.toContain("Run Engine");
    expect(floatingNav).not.toContain('"Engine"');
    expect(floatingNav).not.toContain(">⌘K<");
  });

  it("opens pads with shared ≤280ms motion that reverses and honors reduced motion", () => {
    expect(padMotion).toContain("PAD_MOTION_MS = 280");
    expect(padMotion).toContain("padFlyoutPresence");
    expect(padMotion).toContain("padOriginFromHost");
    expect(placementPad).toContain("padFlyoutPresence");
    expect(tasksPad).toContain("padFlyoutPresence");
    expect(tasksPad).not.toContain("scale: 0.96");
    expect(tasksPad).not.toContain("transition-all");
    expect(placementPad).not.toContain("transition-all");
  });

  it("gives Draft / Print / day-strip focus, pressed, and apply/print busy", () => {
    expect(floatingNav).toContain("printBusy");
    expect(floatingNav).toContain("draftApplyBusy");
    expect(floatingNav).toContain("Printing…");
    expect(floatingNav).toContain("APPLY_TO_LIVE_BUSY_LABEL");
    expect(draftPill).toContain("APPLY_TO_LIVE_BUSY_LABEL");
    expect(draftPill).toContain("aria-busy");
    expect(globalsCss).toContain(".sb-day-strip-btn:focus-visible");
    expect(globalsCss).toContain(".sb-night-action-pill:focus-visible");
    expect(globalsCss).toContain('.sb-night-action-pill[aria-busy="true"]');
    expect(shiftBuilderClient).toContain("setDraftApplyBusy");
    expect(shiftBuilderClient).toContain("await confirmDialog(");
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
    expect(chrome).toContain("Assign TM");
    expect(chrome).not.toContain("ASSIGN TM");
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
    expect(shiftCard).toContain("<UnassignedInvite");
    expect(shiftCard).not.toContain("ASSIGN TM");
    expect(shiftCard).not.toContain("grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]");
    expect(shiftCard).not.toContain("whitespace-nowrap");
    expect(shiftCard).not.toContain(">Tasks<");
    expect(globalsCss).toContain("Canvas pride — live board cards only");
    expect(globalsCss).toContain("sb-tm-trail-chip");
    expect(globalsCss).toContain("content: none !important");
  });
});

describe("SheetBuilder Wave 2 density / pad QA / Apply honesty", () => {
  const padMotion = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/padMotion.ts"),
    "utf8",
  );
  const confirmDialog = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/ConfirmDialog.tsx"),
    "utf8",
  );
  const weekHealth = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/WeekHealthTracker.tsx"),
    "utf8",
  );
  const draftPill = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/DraftStatusPill.tsx"),
    "utf8",
  );
  const qaNote = readFileSync(
    resolve(process.cwd(), "Agentic/QA/SHEETBUILDER_WAVE2_60FPS.md"),
    "utf8",
  );

  it("whispers 0 open on empty aux / swings / zone sections and keeps Assign TM", () => {
    expect(shiftBuilderBoard).toContain("sectionFillCopy");
    expect(shiftBuilderBoard).toContain('"0 open"');
    expect(auxCard).toContain("0 open");
    expect(auxCard).not.toContain("Set role");
    expect(globalsCss).toContain(".sb-quiet-open");
    expect(globalsCss).toContain("border-style: solid !important");
    const chrome = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/assignmentCardChrome.tsx"),
      "utf8",
    );
    expect(chrome).toContain("Assign TM");
    expect(chrome).toContain("sb-unassigned-invite");
    expect(chrome).toContain("w-full shrink-0");
  });

  it("hardens pad morph: shared origin, instant reduced-motion, neighbor compress + scrim", () => {
    expect(padMotion).toContain("PAD_MOTION_MS = 280");
    expect(padMotion).toContain("padInstant");
    expect(padMotion).toContain("duration: 0");
    expect(padMotion).not.toContain("x: 20");
    expect(shiftBuilderBoard).toContain("sb-pad-flyout-open");
    expect(shiftBuilderBoard).toContain("data-pad-active");
    expect(globalsCss).toContain("body.sb-pad-flyout-open .sb-builder-stage::after");
    expect(globalsCss).toContain("transform: scale(0.966)");
  });

  it("mops transition-all off desk Apply / pads / WeekHealth / confirm", () => {
    expect(confirmDialog).not.toContain("transition-all");
    expect(weekHealth).not.toContain("transition-all");
    expect(floatingNav).not.toContain("transition-all");
    expect(draftPill).not.toContain("transition-all");
  });

  it("keeps header and confirm Apply honest — same stakes, confirm still required", () => {
    expect(floatingNav).toContain("APPLY_TO_LIVE_CONFIRM_LABEL");
    expect(floatingNav).toContain("APPLY_TO_LIVE_OPEN_CONFIRM");
    expect(floatingNav).toContain("draftApplyConfirming");
    expect(floatingNav).toContain("aria-haspopup=\"dialog\"");
    expect(shiftBuilderClient).toContain("setDraftApplyConfirming");
    expect(shiftBuilderClient).toContain("await confirmDialog(");
    expect(shiftBuilderClient).toContain("APPLY_TO_LIVE_CONFIRM");
    expect(draftPill).toContain("APPLY_TO_LIVE_CONFIRM_LABEL");
    expect(draftPill).toContain("confirming");
  });

  it("documents 60fps Frontman QA when live PIN blocks filming", () => {
    expect(qaNote).toContain("day×5");
    expect(qaNote).toContain("drag×10");
    expect(qaNote).toContain("Draft×3");
    expect(qaNote).toContain("pad×5");
    expect(globalsCss).toContain("var(--sb-spring-snappy) both");
    expect(shiftBuilderBoard).toContain("key={key}");
    expect(shiftBuilderBoard).not.toContain("key={`${dayTransitionKey}");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveBoardGesture,
  beginLiveBoardSettle,
  cancelNightBoardQueries,
  endLiveBoardGesture,
  endLiveBoardSettle,
  isLiveBoardGestureActive,
  isLiveBoardSettling,
  nightBoardRefetchInterval,
  NIGHT_BOARD_POLL_MS,
  resetLiveBoardGesture,
  resumeHydratedBoardDayKey,
  setBoardAssignmentsDayKey,
  shouldApplyNightBoardQueryToStore,
  shouldRefetchNightBoardOnFocus,
  reconcileBoardAssignments,
  assignmentPlacementEqual,
} from "../liveCache";
import { placementIdentityKey } from "../boardMotion";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import {
  bindNightBoardAbortSignal,
  isNightBoardAbortError,
} from "../nightBoardAbort";
import {
  isSameSheetBuilderPathname,
  isSheetBuilderInternalHref,
} from "../sheetBuilderRouteHold";

const middleware = readFileSync(resolve(process.cwd(), "src/middleware.ts"), "utf8");
const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
const nightHandler = readFileSync(
  resolve(process.cwd(), "src/app/api/shiftbuilder/_handlers/night.ts"),
  "utf8",
);
const mutationsRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/shiftbuilder/mutations/route.ts"),
  "utf8",
);
const useCurrentNight = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/hooks/useCurrentNight.ts"),
  "utf8",
);
const useShiftData = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/hooks/useShiftData.ts"),
  "utf8",
);
const settingsShell = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/settings/SettingsShell.tsx"),
  "utf8",
);
const shiftBuilderClient = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
  "utf8",
);
const interactiveStage = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/InteractiveStage.tsx"),
  "utf8",
);
const canvasPage = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/page.tsx"),
  "utf8",
);
const shiftbuilderLoading = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/loading.tsx"),
  "utf8",
);
const sheetbuilderLoading = readFileSync(
  resolve(process.cwd(), "src/app/sheetbuilder/loading.tsx"),
  "utf8",
);
const authedShell = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/ShiftBuilderAuthenticatedShell.tsx"),
  "utf8",
);
const layout = readFileSync(resolve(process.cwd(), "src/app/shiftbuilder/layout.tsx"), "utf8");
const liveAssign = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/useLiveAssignments.ts"),
  "utf8",
);

describe("live board gesture — poll skip + pendingDrag", () => {
  afterEach(() => {
    resetLiveBoardGesture();
  });

  it("pauses the night-board poll while a drag gesture is active", () => {
    expect(nightBoardRefetchInterval(true)).toBe(NIGHT_BOARD_POLL_MS);
    expect(shouldRefetchNightBoardOnFocus(true)).toBe(true);
    expect(shouldApplyNightBoardQueryToStore()).toBe(true);

    beginLiveBoardGesture();
    expect(isLiveBoardGestureActive()).toBe(true);
    expect(nightBoardRefetchInterval(true)).toBe(false);
    expect(shouldRefetchNightBoardOnFocus(true)).toBe(false);
    expect(shouldApplyNightBoardQueryToStore()).toBe(false);

    endLiveBoardGesture();
    expect(isLiveBoardGestureActive()).toBe(false);
    expect(nightBoardRefetchInterval(true)).toBe(NIGHT_BOARD_POLL_MS);
  });

  it("treats pendingDrag as an active gesture even after endLiveBoardGesture", () => {
    useShiftBuilderStore.getState().setPendingDrag({
      fromSlot: "Z1",
      tmId: "tm-1",
      tmName: "Ada",
    });
    expect(isLiveBoardGestureActive()).toBe(true);
    expect(nightBoardRefetchInterval(true)).toBe(false);

    resetLiveBoardGesture();
    expect(useShiftBuilderStore.getState().pendingDrag).toBeNull();
    expect(isLiveBoardGestureActive()).toBe(false);
  });

  it("never polls when the surface opts out (Settings)", () => {
    expect(nightBoardRefetchInterval(false)).toBe(false);
    expect(shouldRefetchNightBoardOnFocus(false)).toBe(false);
  });

  it("keeps poll paused until persist settle (server ack), not just pointer-up", () => {
    beginLiveBoardGesture();
    beginLiveBoardSettle();
    endLiveBoardGesture();
    expect(isLiveBoardSettling()).toBe(true);
    expect(isLiveBoardGestureActive()).toBe(true);
    expect(nightBoardRefetchInterval(true)).toBe(false);
    expect(shouldApplyNightBoardQueryToStore()).toBe(false);

    endLiveBoardSettle();
    expect(isLiveBoardSettling()).toBe(false);
    expect(nightBoardRefetchInterval(true)).toBe(NIGHT_BOARD_POLL_MS);
  });

  it("resumes hydration from the already-painted night so remount is not cold", () => {
    setBoardAssignmentsDayKey("2026-08-23");
    expect(resumeHydratedBoardDayKey("2026-08-23")).toBe("2026-08-23");
    expect(resumeHydratedBoardDayKey("2026-08-24")).toBeNull();
    setBoardAssignmentsDayKey(null);
  });

  it("cancelNightBoardQueries drops core + secondary + legacy night keys", () => {
    const cancelQueries = vi.fn();
    cancelNightBoardQueries({ cancelQueries } as never);
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ["nightCore"] });
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ["nightSecondary"] });
    expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ["night"] });
  });
});

describe("night-board abort — stale fetch after route change", () => {
  it("aborts the timeout controller when TanStack cancels the query", () => {
    const external = new AbortController();
    const bound = bindNightBoardAbortSignal(60_000, external.signal);
    expect(bound.signal.aborted).toBe(false);
    external.abort();
    expect(bound.signal.aborted).toBe(true);
    expect(bound.wasTimeout()).toBe(false);
    bound.cleanup();
  });

  it("does not treat operator cancel as a timeout", () => {
    const external = new AbortController();
    const bound = bindNightBoardAbortSignal(5, external.signal);
    external.abort();
    expect(bound.wasTimeout()).toBe(false);
    bound.cleanup();
  });

  it("recognizes AbortError so policy fail-closed cannot wipe the board", () => {
    const abort = new DOMException("Aborted", "AbortError");
    expect(isNightBoardAbortError(abort)).toBe(true);
    expect(isNightBoardAbortError(new Error("Night core timed out"))).toBe(false);
  });
});

describe("live board cache + nav contracts", () => {
  it("prod interactive shells are no-store (no s-maxage / SWR)", () => {
    expect(middleware).toContain('pathname.startsWith("/sheetbuilder")');
    expect(middleware).toContain('pathname.startsWith("/shiftbuilder")');
    expect(middleware).toContain("private, no-cache, no-store, must-revalidate");
    expect(middleware).not.toContain("stale-while-revalidate=300");
    expect(middleware).not.toContain("s-maxage=60");
  });

  it("night APIs and mutations advertise no-store", () => {
    expect(nightHandler).toContain(
      '"Cache-Control": "private, no-cache, no-store, must-revalidate"',
    );
    expect(mutationsRoute).toContain(
      '"Cache-Control": "private, no-cache, no-store, must-revalidate"',
    );
    expect(nextConfig).toContain('source: "/api/shiftbuilder/:path*"');
    expect(nextConfig).toContain("private, no-cache, no-store, must-revalidate");
  });

  it("caches card-vectors for a week and print CSS immutable, without caching HTML/API", () => {
    const cardVectorsBlock = nextConfig.slice(
      nextConfig.indexOf('source: "/card-vectors/:path*"'),
      nextConfig.indexOf('source: "/shiftbuilder-print-preview.css"'),
    );
    expect(cardVectorsBlock).toContain("public, max-age=604800");
    expect(cardVectorsBlock).not.toContain("immutable");
    expect(nextConfig).toContain('source: "/shiftbuilder-print-preview.css"');
    expect(nextConfig).toContain("public, max-age=31536000, immutable");
    expect(middleware).toContain("card-vectors");
    expect(middleware).toContain("drop-zones");
    expect(middleware).toContain("shiftbuilder-print-preview");
    expect(middleware).toContain('pathname.startsWith("/sheetbuilder")');
    expect(middleware).toContain('pathname.startsWith("/shiftbuilder")');
    expect(middleware).toContain('pathname === "/"');
    expect(middleware).toContain("private, no-cache, no-store, must-revalidate");
  });

  it("canvas poll skips during drag; Settings does not poll the night board", () => {
    expect(useCurrentNight).toContain("nightBoardRefetchInterval");
    expect(useCurrentNight).toContain("shouldRefetchNightBoardOnFocus");
    expect(useCurrentNight).toContain("queryFn: ({ signal })");
    expect(useCurrentNight).toContain("poll?: boolean");
    expect(useCurrentNight).not.toContain('refetchOnMount: "always"');
    expect(settingsShell).toContain("useCurrentNight(selectedDay, { poll: false })");
  });

  it("hydration does not wait on background refetch and skips mid-drag", () => {
    expect(useShiftData).toContain("shouldApplyNightBoardQueryToStore");
    expect(useShiftData).toContain("if (currentNight.isCorePlaceholder) return");
    expect(useShiftData).not.toContain("if (queryColdLoading || currentNight.isCoreFetching) return");
  });

  it("drag start pauses poll; cancel/unmount clears pendingDrag overlays", () => {
    expect(shiftBuilderClient).toContain("beginLiveBoardGesture()");
    expect(shiftBuilderClient).toContain("endLiveBoardGesture()");
    expect(shiftBuilderClient).toContain("resetLiveBoardGesture()");
    expect(shiftBuilderClient).toContain("cancelNightBoardQueries");
    expect(shiftBuilderClient).toContain("beginLiveBoardSettle()");
    expect(shiftBuilderClient).toContain("onDragCancel={onDragCancel}");
    expect(interactiveStage).toContain("onDragCancel={onDragCancel}");
    expect(interactiveStage).toContain("activationConstraint: { distance: coarse ? 12 : 4 }");
    expect(liveAssign).toContain("beginLiveBoardSettle()");
    expect(liveAssign).toContain("endLiveBoardSettle()");
  });
});

describe("continuity acceptance — hold previous UI, never replace the board", () => {
  it("route loaders return null instead of a skeleton shell", () => {
    expect(shiftbuilderLoading).toContain("return null");
    expect(shiftbuilderLoading).not.toContain("BuilderLoadingShell");
    expect(sheetbuilderLoading).toContain("return null");
    expect(canvasPage).toContain("loading: () => null");
    expect(canvasPage).not.toContain("BuilderArtboardSkeletonPreview");
  });

  it("canvas remount does not fade in from empty via sb-content-enter", () => {
    expect(authedShell).not.toContain("sb-content-enter");
    expect(settingsShell).not.toContain("sb-content-enter");
    expect(useShiftData).toContain("resumeHydratedBoardDayKey");
  });

  it("layout holds the outgoing paint until the next view is ready", () => {
    expect(layout).toContain("SheetBuilderRouteContinuity");
    expect(shiftBuilderClient).toContain("data-sb-route-ready");
    expect(settingsShell).toContain("data-sb-route-ready");
  });

  it("classifies SheetBuilder internal hrefs and same-path tab changes", () => {
    expect(isSheetBuilderInternalHref("/sheetbuilder/settings", "https://ops.example")).toBe(true);
    expect(isSheetBuilderInternalHref("/shiftbuilder/team", "https://ops.example")).toBe(true);
    expect(isSheetBuilderInternalHref("https://other.example/sheetbuilder", "https://ops.example")).toBe(
      false,
    );
    vi.stubGlobal("location", { pathname: "/sheetbuilder/settings", origin: "https://ops.example" });
    expect(isSameSheetBuilderPathname("/sheetbuilder/settings?tab=engine")).toBe(true);
    expect(isSameSheetBuilderPathname("/sheetbuilder")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("P0 unstocky — poll reconcile + stable placement keys", () => {
  it("keeps unchanged slot object identity when poll data matches", () => {
    const ada = { tmId: "tm-1", tmName: "Ada", isLocked: false, breakGroup: 2 };
    const current = { Z1: ada, Z2: { tmId: "tm-2", tmName: "Bo", breakGroup: 1 } };
    const incoming = {
      Z1: { tmId: "tm-1", tmName: "Ada", isLocked: false, breakGroup: 2 },
      Z2: { tmId: "tm-2", tmName: "Bo", breakGroup: 1 },
    };
    const { next, changed } = reconcileBoardAssignments(current, incoming);
    expect(changed).toBe(false);
    expect(next).toBe(current);
    expect(next.Z1).toBe(ada);
  });

  it("patches only the slots that actually moved", () => {
    const ada = { tmId: "tm-1", tmName: "Ada", breakGroup: 1 };
    const current = { Z1: ada, Z2: { tmId: "tm-2", tmName: "Bo", breakGroup: 1 } };
    const incoming = {
      Z1: { tmId: "tm-1", tmName: "Ada", breakGroup: 1 },
      Z2: { tmId: "tm-9", tmName: "Cy", breakGroup: 3 },
    };
    const { next, changed } = reconcileBoardAssignments(current, incoming);
    expect(changed).toBe(true);
    expect(next.Z1).toBe(ada);
    expect(next.Z2.tmId).toBe("tm-9");
    expect(assignmentPlacementEqual(current.Z2, incoming.Z2)).toBe(false);
  });

  it("uses the same identity key for assigned and draft of the same TM", () => {
    expect(placementIdentityKey({ kind: "assigned", tmId: "tm-1", tmName: "Ada" })).toBe("tm:tm-1");
    expect(
      placementIdentityKey({ kind: "draft", proposedTmId: "tm-1", proposedName: "Ada" }),
    ).toBe("tm:tm-1");
  });

  it("applies same-day poll with reconcile instead of wiping the grid", () => {
    expect(useShiftData).toContain("reconcileBoardAssignments");
    expect(useShiftData).toContain("pulseBoardPollHairline");
    expect(useShiftData).toContain("Same-day poll / refetch");
  });
});

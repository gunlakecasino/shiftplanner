import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLiveBoardGesture,
  cancelNightBoardQueries,
  endLiveBoardGesture,
  isLiveBoardGestureActive,
  nightBoardRefetchInterval,
  NIGHT_BOARD_POLL_MS,
  resetLiveBoardGesture,
  shouldApplyNightBoardQueryToStore,
  shouldRefetchNightBoardOnFocus,
} from "../liveCache";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import {
  bindNightBoardAbortSignal,
  isNightBoardAbortError,
} from "../nightBoardAbort";

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
    expect(shiftBuilderClient).toContain("onDragCancel={onDragCancel}");
    expect(interactiveStage).toContain("onDragCancel={onDragCancel}");
    expect(interactiveStage).toContain("activationConstraint: { distance: coarse ? 12 : 4 }");
  });
});

/**
 * Lightweight tablet / iPad smoke checks — pure helpers (no Playwright needed).
 * Device QA still required for real Safari glass + Split View.
 */
import { describe, expect, it, afterEach, vi } from "vitest";

function stubMatchMedia(map: Record<string, boolean>) {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({
      matches: !!map[q],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      media: q,
    }),
    visualViewport: {
      width: 1024,
      height: 700,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    innerWidth: 1024,
    innerHeight: 768,
  });
  if (typeof globalThis.DOMRect === "undefined") {
    // @ts-expect-error polyfill
    globalThis.DOMRect = class DOMRect {
      x: number; y: number; width: number; height: number;
      constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x; this.y = y; this.width = width; this.height = height;
      }
      get top() { return this.y; }
      get left() { return this.x; }
      get bottom() { return this.y + this.height; }
      get right() { return this.x + this.width; }
    };
  }
}

describe("tablet smoke — interaction mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("Split View coarse pointer still single-taps pads", async () => {
    stubMatchMedia({
      "(pointer: coarse)": true,
      "(pointer: coarse) and (min-width: 768px)": false,
      "(hover: none)": true,
    });
    const {
      isCoarsePointerDevice,
      isTabletTouchDevice,
      padUsesSingleTap,
    } = await import("../tabletDevice");
    expect(isCoarsePointerDevice()).toBe(true);
    expect(isTabletTouchDevice()).toBe(false);
    expect(padUsesSingleTap()).toBe(true);
  });

  it("bottom-edge popover flips up inside visual viewport", async () => {
    stubMatchMedia({ "(pointer: coarse)": true });
    // re-stub with visualViewport after module isolation
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
      visualViewport: {
        width: 1024,
        height: 700,
        offsetTop: 0,
        offsetLeft: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      innerWidth: 1024,
      innerHeight: 900,
    });
    const { placeFixedPopover } = await import("../viewportLock");
    const anchor = new DOMRect(40, 640, 140, 70);
    const placed = placeFixedPopover(anchor, 240, 380, { preferBelow: true });
    expect(placed.flippedUp).toBe(true);
    expect(placed.top).toBeGreaterThanOrEqual(0);
    expect((placed.maxHeight ?? 380) + placed.top).toBeLessThanOrEqual(708);
  });

  it("dock stage inset is nonzero for coarse layout helpers", async () => {
    stubMatchMedia({
      "(pointer: coarse)": true,
      "(pointer: coarse) and (min-width: 768px)": true,
    });
    const { placementDockStageRightInset, PLACEMENT_DOCK_WIDTH_PX } =
      await import("../tabletDevice");
    expect(placementDockStageRightInset()).toBeGreaterThanOrEqual(PLACEMENT_DOCK_WIDTH_PX);
  });
});

describe("tablet smoke — long press vs drag thresholds", () => {
  it("exports hierarchy: move-cancel < drag distance; coarse delay > tap", async () => {
    // PointerSensor coarse distance = 12 (InteractiveStage)
    // Hierarchy: move > cancel px drops long-press; drag starts at 12px.
    const { LONG_PRESS_MOVE_TOLERANCE_PX, LONG_PRESS_MS_COARSE, LONG_PRESS_MS_FINE } =
      await import("../useCardLongPress");
    const DRAG_DISTANCE_COARSE = 12;
    expect(LONG_PRESS_MOVE_TOLERANCE_PX).toBeLessThan(DRAG_DISTANCE_COARSE);
    expect(LONG_PRESS_MS_COARSE).toBeGreaterThan(LONG_PRESS_MS_FINE);
    expect(LONG_PRESS_MS_COARSE).toBeGreaterThanOrEqual(600);
  });
});

describe("tablet smoke — pad presentation contract", () => {
  it("padUsesSingleTap is also true on a fine-pointer desktop", async () => {
    stubMatchMedia({
      "(pointer: coarse)": false,
      "(pointer: coarse) and (min-width: 768px)": false,
      "(hover: none)": false,
    });
    const { padUsesSingleTap, isTabletTouchDevice } = await import("../tabletDevice");
    expect(padUsesSingleTap()).toBe(true);
    expect(isTabletTouchDevice()).toBe(false);
  });

  it("placementDockStageRightInset is zero on fine pointer desktop", async () => {
    stubMatchMedia({
      "(pointer: coarse)": false,
      "(pointer: coarse) and (min-width: 768px)": false,
      "(hover: none)": false,
    });
    const { placementDockStageRightInset } = await import("../tabletDevice");
    expect(placementDockStageRightInset()).toBe(0);
  });
});

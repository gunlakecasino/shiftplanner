import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/**
 * Node environment — stub visualViewport before importing the module under test.
 */
function stubViewport(opts: {
  innerW: number;
  innerH: number;
  vvW: number;
  vvH: number;
  offsetTop?: number;
  offsetLeft?: number;
}) {
  vi.stubGlobal("window", {
    innerWidth: opts.innerW,
    innerHeight: opts.innerH,
    visualViewport: {
      width: opts.vvW,
      height: opts.vvH,
      offsetTop: opts.offsetTop ?? 0,
      offsetLeft: opts.offsetLeft ?? 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    matchMedia: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  });
  // DOMRect polyfill for Node
  if (typeof globalThis.DOMRect === "undefined") {
    // @ts-expect-error test polyfill
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

describe("placeFixedPopover (iPad / visualViewport)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("flips above when anchor is near the bottom of the visual viewport", async () => {
    stubViewport({ innerW: 1024, innerH: 768, vvW: 1024, vvH: 700 });
    const { placeFixedPopover } = await import("../viewportLock");
    const anchor = new DOMRect(100, 620, 120, 80);
    const placed = placeFixedPopover(anchor, 240, 400, { preferBelow: true });
    expect(placed.flippedUp).toBe(true);
    expect(placed.top + (placed.maxHeight ?? 400)).toBeLessThanOrEqual(700 + 8);
    expect(placed.top).toBeGreaterThanOrEqual(0);
  });

  it("stays below when there is room under the card", async () => {
    stubViewport({ innerW: 1024, innerH: 768, vvW: 1024, vvH: 700 });
    const { placeFixedPopover } = await import("../viewportLock");
    const anchor = new DOMRect(100, 40, 120, 60);
    const placed = placeFixedPopover(anchor, 240, 200, { preferBelow: true });
    expect(placed.flippedUp).toBe(false);
    expect(placed.top).toBeGreaterThanOrEqual(anchor.bottom);
  });

  it("clamps left so the menu does not overflow the right edge", async () => {
    stubViewport({ innerW: 1024, innerH: 768, vvW: 1024, vvH: 700 });
    const { placeFixedPopover } = await import("../viewportLock");
    const anchor = new DOMRect(900, 100, 100, 50);
    const placed = placeFixedPopover(anchor, 240, 200, { preferBelow: true });
    expect(placed.left + 240).toBeLessThanOrEqual(1024);
    expect(placed.left).toBeGreaterThanOrEqual(0);
  });
});

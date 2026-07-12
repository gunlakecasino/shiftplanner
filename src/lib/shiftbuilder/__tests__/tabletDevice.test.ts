import { describe, expect, it, afterEach, vi } from "vitest";

function stubMatchMedia(map: Record<string, boolean>) {
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({
      matches: !!map[q],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      media: q,
    }),
    ontouchstart: map["ontouch"] ? null : undefined,
  });
}

describe("tabletDevice interaction helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("isCoarsePointerDevice is true for Split View widths (no min-width gate)", async () => {
    stubMatchMedia({
      "(pointer: coarse)": true,
      "(pointer: coarse) and (min-width: 768px)": false, // Split View
    });
    const { isCoarsePointerDevice, isTabletTouchDevice } = await import("../tabletDevice");
    expect(isCoarsePointerDevice()).toBe(true);
    expect(isTabletTouchDevice()).toBe(false);
  });

  it("isTabletTouchDevice requires coarse + tablet width", async () => {
    stubMatchMedia({
      "(pointer: coarse)": true,
      "(pointer: coarse) and (min-width: 768px)": true,
    });
    const { isTabletTouchDevice, isCoarsePointerDevice } = await import("../tabletDevice");
    expect(isCoarsePointerDevice()).toBe(true);
    expect(isTabletTouchDevice()).toBe(true);
  });

  it("desktop fine pointer is not coarse", async () => {
    stubMatchMedia({
      "(pointer: coarse)": false,
      "(pointer: coarse) and (min-width: 768px)": false,
      "(hover: none)": false,
    });
    const { isCoarsePointerDevice, isTabletTouchDevice } = await import("../tabletDevice");
    expect(isCoarsePointerDevice()).toBe(false);
    expect(isTabletTouchDevice()).toBe(false);
  });
});

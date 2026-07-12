import { describe, expect, it } from "vitest";
import {
  canonicalizeDefaultSlotKey,
  canonicalOverlapPoolSlotKey,
  isOverlapPoolSlotKey,
  overlapPoolBand,
  overlapPoolGroupKey,
  overlapPoolLabel,
} from "../overlapPoolDefaults";

describe("overlapPoolBand", () => {
  it("detects indexed and bare AM/PM keys", () => {
    expect(overlapPoolBand("overlap_am_0")).toBe("am");
    expect(overlapPoolBand("overlap_am_5")).toBe("am");
    expect(overlapPoolBand("overlap_pm_3")).toBe("pm");
    expect(overlapPoolBand("overlap_am")).toBe("am");
    expect(overlapPoolBand("overlap_pm")).toBe("pm");
  });

  it("rejects non-pool keys", () => {
    expect(overlapPoolBand("zone_1")).toBeNull();
    expect(overlapPoolBand("admin")).toBeNull();
    expect(overlapPoolBand("rr_1_2")).toBeNull();
    expect(overlapPoolBand("overlap_xx_0")).toBeNull();
    expect(overlapPoolBand("")).toBeNull();
  });
});

describe("canonical write buckets", () => {
  it("maps any AM/PM pool key to _0", () => {
    expect(canonicalizeDefaultSlotKey("overlap_am_3")).toBe("overlap_am_0");
    expect(canonicalizeDefaultSlotKey("overlap_pm_5")).toBe("overlap_pm_0");
    expect(canonicalizeDefaultSlotKey("overlap_am")).toBe("overlap_am_0");
    expect(canonicalizeDefaultSlotKey("overlap_pm_0")).toBe("overlap_pm_0");
  });

  it("leaves zone/RR/AUX keys alone", () => {
    expect(canonicalizeDefaultSlotKey("zone_4")).toBe("zone_4");
    expect(canonicalizeDefaultSlotKey("rr_6")).toBe("rr_6");
    expect(canonicalizeDefaultSlotKey("admin")).toBe("admin");
  });

  it("exposes explicit band helpers", () => {
    expect(canonicalOverlapPoolSlotKey("am")).toBe("overlap_am_0");
    expect(canonicalOverlapPoolSlotKey("pm")).toBe("overlap_pm_0");
    expect(isOverlapPoolSlotKey("overlap_pm_1")).toBe(true);
    expect(isOverlapPoolSlotKey("trash_1")).toBe(false);
    expect(overlapPoolGroupKey("am")).toBe("overlap_pool_am");
    expect(overlapPoolLabel("pm")).toBe("PM Overlap Pool");
  });
});

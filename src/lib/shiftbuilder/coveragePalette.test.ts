import { describe, expect, it } from "vitest";
import {
  SB_ZONE_1_COVERAGE,
  SB_ZONE_6_ACCENT,
  SB_ZONE_6_INK,
  coverageBarBg,
  getRRAccent,
  getZoneColor,
} from "./constants";
import { getSlotAccentColor } from "./coverageHelpers";
import { mapNightTasksToUiKeys } from "./mapNightTasksToUiKeys";

function whiteContrast(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2];
  return 1.05 / (luminance + 0.05);
}

describe("Zone 1 and Zone 6 coverage palette", () => {
  it("uses one subdued orchid accent for Zone 6 and both RR6 cards", () => {
    expect(getZoneColor("Z6")).toBe(SB_ZONE_6_ACCENT);
    expect(getRRAccent(6)).toBe(SB_ZONE_6_ACCENT);
    expect(getSlotAccentColor("WRR6")).toBe(SB_ZONE_6_ACCENT);
    expect(getSlotAccentColor("MRR6")).toBe(SB_ZONE_6_ACCENT);
  });

  it("uses matching, print-legible banner tones for Zones 1 and 6", () => {
    expect(coverageBarBg(getZoneColor("Z1"))).toBe(SB_ZONE_1_COVERAGE);
    expect(coverageBarBg(getRRAccent(1))).toBe(SB_ZONE_1_COVERAGE);
    expect(coverageBarBg(getZoneColor("Z6"))).toBe(SB_ZONE_6_INK);
    expect(coverageBarBg(getRRAccent(6))).toBe(SB_ZONE_6_INK);
    expect(whiteContrast(SB_ZONE_1_COVERAGE)).toBeGreaterThanOrEqual(4.5);
    expect(whiteContrast(SB_ZONE_6_INK)).toBeGreaterThanOrEqual(4.5);
  });

  it("projects coverage tasks with the exact source-card accent", () => {
    const mapped = mapNightTasksToUiKeys([], [], {
      MRR1: {
        tmId: "drew",
        tmName: "Drew",
        additionalCoverageSlots: ["Z1"],
      },
      WRR6: {
        tmId: "amanda",
        tmName: "Amanda",
        additionalCoverageSlots: ["Z6"],
      },
    });

    expect(mapped.MRR1?.[0]).toMatchObject({
      taskLabel: "And Zone 1",
      color: getRRAccent(1),
      isCoverage: true,
    });
    expect(mapped.WRR6?.[0]).toMatchObject({
      taskLabel: "And Zone 6",
      color: getRRAccent(6),
      isCoverage: true,
    });
  });
});

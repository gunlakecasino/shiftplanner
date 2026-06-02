/**
 * schedules.test.ts
 *
 * Tests for the canonical single-source-of-truth schedule resolver.
 * These tests should include the exact real-world cases the operator has verified
 * (especially Alec on Sundays being OFF in the Sudo Weekly Roster).
 */

// @ts-nocheck — vitest types not in main tsc path for Railway build; tests run separately via vitest
import { describe, it, expect } from "vitest";
import { getTmShiftForNight, getScheduledTmsForNight } from "./schedules";

// NOTE: These are integration-style tests that hit the real DB.
// For pure unit tests, mock the Supabase client inside schedules.ts.

describe("Canonical Schedule Resolver (schedules.ts)", () => {
  it("should treat Alec as OFF on a verified Sunday (2026-05-31 example)", async () => {
    // This test documents the exact case the operator has manually verified in Sudo.
    const sunday = new Date("2026-05-31T12:00:00");

    const shift = await getTmShiftForNight("alec-uuid-here", sunday); // TODO: replace with real UUID

    // Expected: the canonical resolver must return OFF for this combination
    expect(shift.label).toBe("OFF");
  });

  it("should correctly classify the five watched TMs on known problem nights", async () => {
    const watched = ["Alec", "Daryl", "Jason", "Nikki", "Sam"];
    const testDate = new Date("2026-05-31T12:00:00");

    const result = await getScheduledTmsForNight(testDate);

    const namesInScheduled = result.allScheduled.map((t: any) => t.name.toLowerCase());

    watched.forEach(name => {
      const isPresent = namesInScheduled.some((n: string) => n.includes(name.toLowerCase()));
      // After the canonical resolver is correct, these should be false on problem nights
      expect(isPresent).toBe(false); // Update expectation once real data is confirmed
    });
  });

  it("should return consistent role partitions", async () => {
    const date = new Date("2026-05-31T12:00:00");
    const result = await getScheduledTmsForNight(date);

    // Basic sanity: partitions should be subsets of allScheduled
    expect(result.fullGraveScheduled.length + result.pmOverlapScheduled.length + result.amOverlapScheduled.length)
      .toBeLessThanOrEqual(result.allScheduled.length);
  });
});
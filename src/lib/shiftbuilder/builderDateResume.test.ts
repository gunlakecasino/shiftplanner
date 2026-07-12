import { describe, expect, it } from "vitest";
import {
  resolveResumeShiftDate,
  resolveResumeWeekStart,
} from "./builderDateResume";
import { formatLocalDateISO, startOfShiftWeek } from "./dateUtils";

describe("resolveResumeShiftDate", () => {
  // Friday 2026-07-10 12:00 local-ish via UTC noon
  const friJul10 = new Date("2026-07-10T16:00:00.000Z");

  it("uses current shift date when nothing saved", () => {
    const d = resolveResumeShiftDate(null, friJul10);
    expect(formatLocalDateISO(d)).toBe(formatLocalDateISO(resolveResumeShiftDate("", friJul10)));
  });

  it("restores a day in the same shift week", () => {
    // Week Fri Jul 10 – Thu Jul 16; save Sunday Jul 12
    const d = resolveResumeShiftDate("2026-07-12", friJul10);
    expect(formatLocalDateISO(d)).toBe("2026-07-12");
  });

  it("restores within last 7 days even if prior week", () => {
    // Save Thu Jul 9 (prior week) while "now" is Fri Jul 10 → delta 1 day
    const d = resolveResumeShiftDate("2026-07-09", friJul10);
    expect(formatLocalDateISO(d)).toBe("2026-07-09");
  });

  it("snaps to today when saved date is ancient", () => {
    const d = resolveResumeShiftDate("2026-05-01", friJul10);
    const today = resolveResumeShiftDate(null, friJul10);
    expect(formatLocalDateISO(d)).toBe(formatLocalDateISO(today));
  });

  it("week start matches resume date week", () => {
    const ws = resolveResumeWeekStart("2026-07-12", friJul10);
    expect(formatLocalDateISO(ws)).toBe(formatLocalDateISO(startOfShiftWeek(new Date("2026-07-12T12:00:00"))));
  });
});

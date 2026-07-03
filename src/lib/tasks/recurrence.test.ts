import { describe, it, expect } from "vitest";
import { computeNextDueDate, type RecurrenceRule } from "./recurrence";

// Weekday anchors used below (all UTC): 2026-01-01 is a Thursday.
//   01-01 Thu(4)  01-02 Fri(5)  01-03 Sat(6)  01-04 Sun(0)
//   01-05 Mon(1)  01-06 Tue(2)  01-07 Wed(3)  01-08 Thu(4)

function rule(partial: Partial<RecurrenceRule>): RecurrenceRule {
  return { recurrenceType: "daily", recurrenceDays: null, advanceDays: 1, ...partial };
}

describe("computeNextDueDate — daily / custom", () => {
  it("daily advances by one day by default", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "daily" }), "2026-01-01")).toBe("2026-01-02");
  });

  it("daily honors advanceDays > 1", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "daily", advanceDays: 3 }), "2026-01-01")).toBe("2026-01-04");
  });

  it("custom is an N-day cadence like daily", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "custom", advanceDays: 5 }), "2026-01-01")).toBe("2026-01-06");
  });

  it("clamps a zero/negative advance up to 1", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "daily", advanceDays: 0 }), "2026-01-01")).toBe("2026-01-02");
  });

  it("rolls across a month boundary", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "daily" }), "2026-01-31")).toBe("2026-02-01");
  });

  it("rolls across a year boundary", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "daily" }), "2026-12-31")).toBe("2027-01-01");
  });
});

describe("computeNextDueDate — weekly", () => {
  it("finds the next matching weekday strictly after the from-date", () => {
    // From Thu 01-01, next Monday is 01-05.
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: [1] }), "2026-01-01")).toBe("2026-01-05");
  });

  it("never returns the from-date itself (advances a full week on same weekday)", () => {
    // From Thu 01-01 with Thursday selected → the following Thursday, not today.
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: [4] }), "2026-01-01")).toBe("2026-01-08");
  });

  it("picks the nearest of several selected weekdays", () => {
    // From Mon 01-05 with Mon+Thu → Thu 01-08 is nearest ahead.
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: [1, 4] }), "2026-01-05")).toBe("2026-01-08");
  });

  it("wraps into the next week when the from-date is past every selected day", () => {
    // From Sat 01-03 with Monday selected → Mon 01-05.
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: [1] }), "2026-01-03")).toBe("2026-01-05");
  });

  it("returns null when no weekdays are configured", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: [] }), "2026-01-01")).toBeNull();
    expect(computeNextDueDate(rule({ recurrenceType: "weekly", recurrenceDays: null }), "2026-01-01")).toBeNull();
  });
});

describe("computeNextDueDate — biweekly", () => {
  // Biweekly has no separate anchor column in the schema; each generation
  // computes from the previous occurrence, so a single-weekday rule advances
  // a clean two weeks.
  it("advances two weeks for a single weekday", () => {
    // From Mon 01-05 → Mon 01-19 (skips the intervening Monday 01-12).
    expect(computeNextDueDate(rule({ recurrenceType: "biweekly", recurrenceDays: [1] }), "2026-01-05")).toBe("2026-01-19");
  });

  it("returns null when no weekdays are configured", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "biweekly", recurrenceDays: [] }), "2026-01-05")).toBeNull();
  });
});

describe("computeNextDueDate — monthly", () => {
  it("returns the next configured day later in the same month", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [15] }), "2026-01-10")).toBe("2026-01-15");
  });

  it("rolls to next month when past every configured day", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [15] }), "2026-01-20")).toBe("2026-02-15");
  });

  it("picks the nearest configured day ahead within the month", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [1, 15] }), "2026-01-10")).toBe("2026-01-15");
  });

  it("clamps day-31 into a short month (Feb 2026 → 28)", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [31] }), "2026-01-31")).toBe("2026-02-28");
  });

  it("rolls across a year boundary", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [5] }), "2026-12-20")).toBe("2027-01-05");
  });

  it("returns null when no month-days are configured", () => {
    expect(computeNextDueDate(rule({ recurrenceType: "monthly", recurrenceDays: [] }), "2026-01-10")).toBeNull();
  });
});

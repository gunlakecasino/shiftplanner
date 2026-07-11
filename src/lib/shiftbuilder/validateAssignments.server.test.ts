/**
 * Unit tests for KD-5 Apply re-validate contract (ProposalValidationError +
 * slot-key normalization used before canPlace).
 *
 * Full DB-backed canPlace paths need admin env; pure error / key contracts
 * live here. Hard-gate constitution (liturgy + schedule + knowledge + rules)
 * is covered by engine/__tests__/eligibilityConstitution.test.ts.
 */
import { describe, expect, it } from "vitest";
import { ProposalValidationError } from "./validateAssignments.server";
import { dbToUi } from "./slot-keys";
import { slotTypeForKey } from "./eligibilityCore";

describe("ProposalValidationError", () => {
  it("exposes invalid[] and 400 status for mutations route", () => {
    const invalid = [
      { slotKey: "Z4", tmId: "tm_x", reason: "Not on tonight's grave schedule" },
      { slotKey: "MRR6", tmId: "tm_f", reason: "Men's restroom requires a male TM" },
    ];
    const err = new ProposalValidationError(invalid);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProposalValidationError");
    expect(err.status).toBe(400);
    expect(err.invalid).toEqual(invalid);
    expect(err.message).toMatch(/2 placement/);
  });

  it("single failure message includes slot + reason", () => {
    const err = new ProposalValidationError([
      { slotKey: "Z9", tmId: "tm_a", reason: "Accommodation: no sweeper" },
    ]);
    expect(err.message).toBe("Z9: Accommodation: no sweeper");
  });

  it("empty invalid[] still produces a structured 400 error", () => {
    const err = new ProposalValidationError([]);
    expect(err.status).toBe(400);
    expect(err.invalid).toEqual([]);
    expect(err.message).toMatch(/invalid|placement|0/i);
  });
});

describe("batch_apply slot key normalization (db → UI for canPlace)", () => {
  it("maps DB zone / rr / overlap keys to UI liturgy keys", () => {
    expect(dbToUi("zone_4", "zone", null)).toBe("Z4");
    expect(dbToUi("rr_6", "rr", "mens")).toBe("MRR6");
    expect(dbToUi("rr_6", "rr", "womens")).toBe("WRR6");
    expect(dbToUi("overlap_am_1", "overlap", null)).toBe("OL-AM-1");
    expect(slotTypeForKey("Z4")).toBe("zone");
    expect(slotTypeForKey("MRR6")).toBe("rr");
    expect(slotTypeForKey("OL-AM-1")).toBe("overlap");
  });

  it("aux DB keys map to UI liturgy used by canPlace", () => {
    expect(dbToUi("admin", "aux", null)).toBe("ADM");
    expect(dbToUi("z9_sr", "aux", null)).toBe("Z9SR");
    expect(slotTypeForKey("ADM")).toBe("aux");
    expect(slotTypeForKey("Z9SR")).toBe("zone");
  });
});

describe("night date binding (schedule day-key)", () => {
  // normalizeNightDateIso is module-private; re-test the contract via error shape
  // and document that client date is never authoritative alone.
  it("ProposalValidationError still carries invalid for date mismatch responses", () => {
    const err = new ProposalValidationError([
      {
        slotKey: "*",
        tmId: null,
        reason: "Date does not match night (2026-07-12 ≠ 2026-07-11)",
      },
    ]);
    expect(err.invalid[0].reason).toMatch(/Date does not match night/);
    expect(err.invalid[0].slotKey).toBe("*");
    expect(err.invalid[0].tmId).toBeNull();
  });

  it("star-scoped load failures use the same invalid[] envelope as canPlace rejects", () => {
    // Mutations route treats any ProposalValidationError as 400 + invalid[] —
    // fail-closed loader errors must share that shape (no partial writes).
    const reasons = [
      "Eligibility config unavailable",
      "Supervisor knowledge unavailable",
      "Eligibility service unavailable",
    ];
    for (const reason of reasons) {
      const err = new ProposalValidationError([
        { slotKey: "*", tmId: null, reason },
      ]);
      expect(err.status).toBe(400);
      expect(err.invalid).toHaveLength(1);
      expect(err.invalid[0].slotKey).toBe("*");
    }
  });
});

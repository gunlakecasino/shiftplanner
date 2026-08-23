/**
 * Gendered RR placement guardrail — fail the build if liturgy is missing.
 *
 * Women's TMs cannot place on MRR*; men's TMs cannot place on WRR*.
 * Drag (isEligibleForSlot / eligibilityCore) and Apply (canPlace) share that gate.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canPlace } from "../eligibility";
import { isEligibleForSlot, slotFamilyForKey } from "../../eligibilityCore";
import { makeContext } from "./fixtures/roster";

const NIGHT = "2026-07-03";
const RR_NUMS = ["1", "6", "7", "8", "10"] as const;

const eligibilityCoreSrc = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/eligibilityCore.ts"),
  "utf8",
);
const canPlaceSrc = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/engine/eligibility.ts"),
  "utf8",
);
const dragFitSrc = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/dragFit.ts"),
  "utf8",
);
const validateSrc = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/validateAssignments.server.ts"),
  "utf8",
);
const opsMutationsSrc = readFileSync(
  resolve(process.cwd(), "src/lib/shiftbuilder/opsMutations.server.ts"),
  "utf8",
);

describe("gendered RR liturgy is present (fail closed)", () => {
  it("eligibilityCore gates MRR to male and WRR to female", () => {
    expect(eligibilityCoreSrc).toMatch(/case "mrr":/);
    expect(eligibilityCoreSrc).toMatch(/case "wrr":/);
    expect(eligibilityCoreSrc).toMatch(
      /normalizeGender\(tm\.gender\) === "M"/,
    );
    expect(eligibilityCoreSrc).toMatch(
      /normalizeGender\(tm\.gender\) === "F"/,
    );
    expect(eligibilityCoreSrc).toContain('return "mrr"');
    expect(eligibilityCoreSrc).toContain('return "wrr"');
  });

  it("canPlace composes liturgy first", () => {
    expect(canPlaceSrc).toContain("isEligibleForSlot");
    expect(canPlaceSrc).toContain("eligibilityCore");
    expect(canPlaceSrc).toMatch(/if \(!isEligibleForSlot\(gate, slotKey\)\)/);
  });

  it("drag and Apply share the same gate", () => {
    expect(dragFitSrc).toContain("isEligibleForSlot");
    expect(validateSrc).toContain("canPlace");
    expect(opsMutationsSrc).toContain("validateProposalsForNight");
    expect(opsMutationsSrc).toContain("same canPlace constitution as batch_apply");
  });
});

describe("gendered RR canPlace / isEligibleForSlot", () => {
  const ctx = makeContext({ nightIso: NIGHT });
  const male = ctx.rosterById.get("tm_m1")!;
  const female = ctx.rosterById.get("tm_f1")!;

  it("classifies every live RR number as mrr / wrr", () => {
    for (const n of RR_NUMS) {
      expect(slotFamilyForKey(`MRR${n}`)).toBe("mrr");
      expect(slotFamilyForKey(`WRR${n}`)).toBe("wrr");
    }
    expect(slotFamilyForKey("RR8M")).toBe("mrr");
    expect(slotFamilyForKey("RR8W")).toBe("wrr");
  });

  it("women's TM cannot place on any MRR* through liturgy or canPlace", () => {
    for (const n of RR_NUMS) {
      const key = `MRR${n}`;
      expect(isEligibleForSlot(female, key)).toBe(false);
      const verdict = canPlace(female, key);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toMatch(/male/i);
    }
    expect(isEligibleForSlot(female, "RR8M")).toBe(false);
    expect(canPlace(female, "RR8M").ok).toBe(false);
  });

  it("men's TM cannot place on any WRR* through liturgy or canPlace", () => {
    for (const n of RR_NUMS) {
      const key = `WRR${n}`;
      expect(isEligibleForSlot(male, key)).toBe(false);
      const verdict = canPlace(male, key);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toMatch(/female/i);
    }
    expect(isEligibleForSlot(male, "RR8W")).toBe(false);
    expect(canPlace(male, "RR8W").ok).toBe(false);
  });

  it("matching gender still places on the correct half", () => {
    expect(isEligibleForSlot(male, "MRR6")).toBe(true);
    expect(canPlace(male, "MRR6").ok).toBe(true);
    expect(isEligibleForSlot(female, "WRR6")).toBe(true);
    expect(canPlace(female, "WRR6").ok).toBe(true);
  });

  it("unknown gender holds neither restroom (fail closed)", () => {
    const unknown = { gender: "", gravePool: "Full" };
    expect(isEligibleForSlot(unknown, "MRR6")).toBe(false);
    expect(isEligibleForSlot(unknown, "WRR6")).toBe(false);
    expect(canPlace(unknown, "MRR6").ok).toBe(false);
    expect(canPlace(unknown, "WRR6").ok).toBe(false);
  });
});

/**
 * Scoring constitution tests (KD / PR 18).
 *
 * Locks pure Phase-1 signals that reviewers called out as untested:
 *   - hard-avoid preference → excluded (coverage > rotation > pref > skill still
 *     treats hard avoid as a hard constraint, never a soft cost)
 *   - preferenceTargetMatches boundary (Z1 ≠ Z10)
 *   - basic score order: prefer > neutral > soft-avoid for same skill fit
 *   - within_repeat hard gate
 *   - skill_match closeness ranking when prefs are equal
 */
import { describe, expect, it } from "vitest";
import { FALLBACK_CONFIG } from "./engineConfig";
import {
  preferenceTargetMatches,
  scoreAssignment,
  uiKeyToSlotDifficultyKey,
  type ScoringContext,
  type ScoreResult,
} from "./scoring";
import type { TMPreferenceRow } from "./data";

function emptyCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    config: FALLBACK_CONFIG,
    skillScores: new Map(),
    slotDifficulty: new Map(),
    preferencesByTm: new Map(),
    pairAffinitiesByTm: new Map(),
    accommodationsByTm: new Map(),
    currentDraft: new Map(),
    adjacency: new Map(),
    ...overrides,
  };
}

function pref(
  partial: Partial<TMPreferenceRow> & Pick<TMPreferenceRow, "tmId" | "stance" | "strength" | "target">,
): TMPreferenceRow {
  return {
    note: null,
    ...partial,
  };
}

function tm(id: string) {
  return { id, tmId: id };
}

describe("preferenceTargetMatches (boundary-aware)", () => {
  it("exact match is case-insensitive", () => {
    expect(preferenceTargetMatches("Z4", "Z4")).toBe(true);
    expect(preferenceTargetMatches("z4", "Z4")).toBe(true);
    expect(preferenceTargetMatches("MRR6", "mrr6")).toBe(true);
  });

  it("digit-terminated targets do not prefix-bleed (Z1 ≠ Z10)", () => {
    expect(preferenceTargetMatches("Z1", "Z10")).toBe(false);
    expect(preferenceTargetMatches("Z10", "Z10")).toBe(true);
    expect(preferenceTargetMatches("MRR1", "MRR10")).toBe(false);
  });

  it("category targets prefix-match the whole family", () => {
    expect(preferenceTargetMatches("MRR", "MRR6")).toBe(true);
    expect(preferenceTargetMatches("WRR", "WRR1")).toBe(true);
    expect(preferenceTargetMatches("OL-AM", "OL-AM-1")).toBe(true);
  });
});

describe("uiKeyToSlotDifficultyKey", () => {
  it("maps UI liturgy keys to slot_difficulty table keys", () => {
    expect(uiKeyToSlotDifficultyKey("Z2")).toBe("Zone2");
    expect(uiKeyToSlotDifficultyKey("Z9SR")).toBe("Zone9SR");
    expect(uiKeyToSlotDifficultyKey("ADM")).toBe("Admin");
    expect(uiKeyToSlotDifficultyKey("TR1")).toBe("Trash1");
    expect(uiKeyToSlotDifficultyKey("MRR8")).toBe("MRR8");
    expect(uiKeyToSlotDifficultyKey("OL-AM-1")).toBeNull();
  });
});

describe("scoreAssignment — preference hard-avoid", () => {
  it("hard avoid on the target slot excludes the candidate", () => {
    const ctx = emptyCtx({
      preferencesByTm: new Map([
        [
          "tm_a",
          [pref({ tmId: "tm_a", stance: "avoid", strength: "hard", target: "Z4" })],
        ],
      ]),
    });
    const result = scoreAssignment(tm("tm_a"), "Z4", ctx);
    expect(result.excluded).toBe(true);
    expect(result.excludeReason).toMatch(/hard-avoid/i);
    expect(result.total).toBe(-Infinity);
    expect(result.breakdown.preference_fit?.raw).toBe(-1);
  });

  it("hard avoid on Z1 does not exclude Z10 (no prefix bleed)", () => {
    const ctx = emptyCtx({
      preferencesByTm: new Map([
        [
          "tm_a",
          [pref({ tmId: "tm_a", stance: "avoid", strength: "hard", target: "Z1" })],
        ],
      ]),
    });
    const onZ1 = scoreAssignment(tm("tm_a"), "Z1", ctx);
    const onZ10 = scoreAssignment(tm("tm_a"), "Z10", ctx);
    expect(onZ1.excluded).toBe(true);
    expect(onZ10.excluded).toBe(false);
    expect(Number.isFinite(onZ10.total)).toBe(true);
  });

  it("soft avoid does not hard-exclude (scores negative only)", () => {
    const ctx = emptyCtx({
      preferencesByTm: new Map([
        [
          "tm_a",
          [pref({ tmId: "tm_a", stance: "avoid", strength: "soft", target: "Z4" })],
        ],
      ]),
    });
    const result = scoreAssignment(tm("tm_a"), "Z4", ctx);
    expect(result.excluded).toBe(false);
    expect(result.breakdown.soft_prefer_set?.raw).toBe(-1);
    expect(result.breakdown.soft_prefer_set?.weighted).toBeLessThan(0);
  });
});

describe("scoreAssignment — basic score order", () => {
  /** Same skill fit; only preference differs. Prefer should rank above neutral above soft avoid. */
  it("hard prefer > neutral > soft avoid for the same skill/difficulty", () => {
    const skillScores = new Map([
      ["tm_prefer", 7],
      ["tm_neutral", 7],
      ["tm_avoid", 7],
    ]);
    const slotDifficulty = new Map([["Zone4", 7]]);
    const preferencesByTm = new Map<string, TMPreferenceRow[]>([
      [
        "tm_prefer",
        [pref({ tmId: "tm_prefer", stance: "prefer", strength: "hard", target: "Z4" })],
      ],
      ["tm_neutral", []],
      [
        "tm_avoid",
        [pref({ tmId: "tm_avoid", stance: "avoid", strength: "soft", target: "Z4" })],
      ],
    ]);
    const ctx = emptyCtx({ skillScores, slotDifficulty, preferencesByTm });

    const prefer = scoreAssignment(tm("tm_prefer"), "Z4", ctx);
    const neutral = scoreAssignment(tm("tm_neutral"), "Z4", ctx);
    const avoid = scoreAssignment(tm("tm_avoid"), "Z4", ctx);

    expect(prefer.excluded).toBe(false);
    expect(neutral.excluded).toBe(false);
    expect(avoid.excluded).toBe(false);
    expect(prefer.total).toBeGreaterThan(neutral.total);
    expect(neutral.total).toBeGreaterThan(avoid.total);
  });

  it("closer skill match ranks higher when preferences are equal", () => {
    const skillScores = new Map([
      ["tm_close", 6],
      ["tm_far", 2],
    ]);
    const slotDifficulty = new Map([["Zone4", 6]]);
    const ctx = emptyCtx({ skillScores, slotDifficulty });

    const close = scoreAssignment(tm("tm_close"), "Z4", ctx);
    const far = scoreAssignment(tm("tm_far"), "Z4", ctx);

    expect(close.breakdown.skill_match.raw).toBeGreaterThan(far.breakdown.skill_match.raw);
    expect(close.total).toBeGreaterThan(far.total);
  });
});

describe("scoreAssignment — within_repeat hard gate", () => {
  it("excludes a TM already placed in another slot in the current draft", () => {
    const ctx = emptyCtx({
      currentDraft: new Map([["Z2", "tm_a"]]),
    });
    const result = scoreAssignment(tm("tm_a"), "Z4", ctx);
    expect(result.excluded).toBe(true);
    expect(result.excludeReason).toMatch(/already placed/i);
    expect(result.breakdown.within_repeat?.raw).toBe(-1);
    expect(result.total).toBe(-Infinity);
  });

  it("allows the same slot key (re-score of current assignment)", () => {
    const ctx = emptyCtx({
      currentDraft: new Map([["Z4", "tm_a"]]),
    });
    const result = scoreAssignment(tm("tm_a"), "Z4", ctx);
    expect(result.excluded).toBe(false);
    expect(result.breakdown.within_repeat?.raw).toBe(0);
  });
});

describe("scoreAssignment — hard pair-avoid", () => {
  it("hard pair-avoid with a placed neighbor excludes", () => {
    const ctx = emptyCtx({
      currentDraft: new Map([["Z3", "tm_partner"]]),
      adjacency: new Map([["Z4", ["Z3"]]]),
      pairAffinitiesByTm: new Map([
        [
          "tm_a",
          [
            {
              tmId: "tm_a",
              withTmId: "tm_partner",
              withLabel: null,
              stance: "avoid",
              strength: "hard",
              note: null,
            },
          ],
        ],
      ]),
    });
    const result: ScoreResult = scoreAssignment(tm("tm_a"), "Z4", ctx);
    expect(result.excluded).toBe(true);
    expect(result.breakdown.pair_affinity?.hardExclude).toBe(true);
    expect(result.excludeReason).toMatch(/avoid\/hard with tm_partner|pair/i);
    expect(result.total).toBe(-Infinity);
  });
});

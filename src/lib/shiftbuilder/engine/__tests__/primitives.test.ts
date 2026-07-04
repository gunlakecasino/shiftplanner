import { describe, it, expect } from "vitest";
import { makeRoster, makeContext } from "./fixtures/roster";
import { historyFor, weekHistory } from "./fixtures/history";
import { canPlace } from "../eligibility";
import { rotationHealthPoints } from "../health/model";
import { verdictFromPoints } from "../health/verdict";
import { weekPolicyScore } from "../health/weekPolicy";
import {
  scorecardFor,
  compareScorecards,
  tierMultipliers,
  objectiveValue,
} from "../objective";
import { validateDraft } from "../guard";
import { rescueLadder, type RescueCandidate } from "../rescue";
import type { Draft, SlotModel } from "../types";

const NIGHT = "2026-07-03";

describe("context loader (P1-1)", () => {
  it("normalizes roster and builds ordered slot models", () => {
    const ctx = makeContext();
    expect(ctx.roster.length).toBe(16);
    // Men's restrooms come first in the fill order (MRR1 → MRR7 → …).
    expect(ctx.slots[0].key).toBe("MRR1");
    // Z1/Z2 are now regular zones (not optional); zones are rotation-tracked; ADM is not.
    expect(ctx.slotByKey.get("Z1")?.isOptional).toBe(false);
    expect(ctx.slotByKey.get("Z2")?.isOptional).toBe(false);
    expect(ctx.slotByKey.get("Z4")?.isRotationTracked).toBe(true);
    expect(ctx.slotByKey.get("ADM")?.isRotationTracked).toBe(false);
  });

  it("scopes weekly history to nights before tonight", () => {
    const wk = weekHistory({
      tm_m1: [
        { nightDate: "2026-07-01", slotKey: "Z4" },
        { nightDate: NIGHT, slotKey: "Z4" }, // tonight — must be dropped
      ],
    });
    const ctx = makeContext({ nightIso: NIGHT, weeklyRecentHistory: wk });
    expect(ctx.weeklyRecentHistory.get("tm_m1")?.length).toBe(1);
  });
});

describe("eligibility gate (P1-2)", () => {
  const ctx = makeContext();
  const male = ctx.rosterById.get("tm_m1")!;
  const female = ctx.rosterById.get("tm_f1")!;

  it("enforces restroom gender with a reason", () => {
    expect(canPlace(female, "MRR6").ok).toBe(false);
    expect(canPlace(female, "MRR6").reason).toMatch(/male/i);
    expect(canPlace(male, "MRR6").ok).toBe(true);
    expect(canPlace(female, "WRR6").ok).toBe(true);
  });

  it("enforces full-grave for zones", () => {
    const am = makeRoster({ males: 0, females: 0, amOverlap: 1 })[0];
    expect(canPlace(am as any, "Z4").ok).toBe(false);
    expect(canPlace(male, "Z4").ok).toBe(true);
  });

  it("honors the schedule gate", () => {
    expect(canPlace(male, "Z4", { scheduledTmIds: new Set(["tm_m2"]) }).ok).toBe(false);
    expect(canPlace(male, "Z4", { scheduledTmIds: new Set(["tm_m1"]) }).ok).toBe(true);
  });
});

describe("health model + verdict (P1-3, F8)", () => {
  it("caps a prior-3 repeat and flags it critical regardless of exact score", () => {
    const histories = {
      tm_m1: historyFor("tm_m1", "Male 1", NIGHT, [
        { slotKey: "Z4", daysAgo: 1 },
        { slotKey: "Z5", daysAgo: 2 },
        { slotKey: "Z6", daysAgo: 3 },
      ]),
    };
    const ctx = makeContext({ histories });
    const score = rotationHealthPoints({
      tmId: "tm_m1", tmName: "Male 1", slotKey: "Z4", nightIso: NIGHT,
      histories, members: ctx.members, auxDefs: ctx.auxDefs,
    });
    expect(score.isCritical).toBe(true);
    expect(score.verdict).toBe("critical_repeat");
  });

  it("verdict never reports a non-critical band for a critical score", () => {
    expect(verdictFromPoints(43, true)).toBe("critical_repeat");
    expect(verdictFromPoints(95, false)).toBe("strong_fit");
    expect(verdictFromPoints(80, false)).toBe("acceptable");
  });

  it("scores a fresh placement strongly", () => {
    const ctx = makeContext();
    const score = rotationHealthPoints({
      tmId: "tm_m1", tmName: "Male 1", slotKey: "Z4", nightIso: NIGHT,
      histories: {}, members: ctx.members, auxDefs: ctx.auxDefs,
    });
    expect(score.points).toBeGreaterThan(80);
    expect(score.isCritical).toBe(false);
  });
});

describe("week policy (P1-3, F6)", () => {
  it("penalizes area-merged restroom repeats (MRR8/WRR8 = RR8)", () => {
    const clean = weekPolicyScore(
      weekHistory({ tm_f1: [{ nightDate: "2026-07-01", slotKey: "WRR8" }] }),
    );
    const repeat = weekPolicyScore(
      weekHistory({
        tm_f1: [
          { nightDate: "2026-07-01", slotKey: "WRR8" },
          { nightDate: "2026-07-02", slotKey: "MRR8" }, // same physical RR8
        ],
      }),
    );
    expect(repeat.maxWeeklyRepeat).toBe(2);
    expect(repeat.percent).toBeLessThan(clean.percent);
  });
});

describe("objective (P1-4, N1)", () => {
  const ctx = makeContext();

  const draftWith = (n: number): Draft => {
    const d: Draft = {};
    const zones = ["Z3", "Z4", "Z5", "Z6", "Z7"].slice(0, n);
    zones.forEach((z, i) => {
      d[z] = {
        tmId: `tm_m${i + 1}`, tmName: `Male ${i + 1}`,
        provenance: { stage: "planner", reason: "", scorecard: { eligible: true, healthPoints: 85, isCritical: false, prefScore: 0, skillScore: 0 } },
      };
    });
    return d;
  };

  it("coverage dominates health lexicographically", () => {
    const more = scorecardFor(draftWith(5), ctx);
    const fewer = scorecardFor(draftWith(3), ctx);
    expect(compareScorecards(more, fewer)).toBe(1);
  });

  it("objectiveValue agrees with compareScorecards", () => {
    const mult = tierMultipliers(ctx.slots.length, ctx);
    const a = scorecardFor(draftWith(5), ctx);
    const b = scorecardFor(draftWith(3), ctx);
    expect(Math.sign(objectiveValue(a, mult) - objectiveValue(b, mult))).toBe(
      compareScorecards(a, b),
    );
  });

  it("a hard violation loses to any clean scorecard", () => {
    const clean = scorecardFor(draftWith(1), ctx);
    const broken = { ...scorecardFor(draftWith(5), ctx), hardViolations: ["x"] };
    expect(compareScorecards(broken, clean)).toBe(-1);
  });
});

describe("guard (P1-5, N4)", () => {
  it("catches double-book and gender violations", () => {
    const ctx = makeContext();
    const draft: Draft = {
      Z4: mkPlacement("tm_m1", "Male 1"),
      Z5: mkPlacement("tm_m1", "Male 1"), // double book
      MRR6: mkPlacement("tm_f1", "Female 1"), // female in men's room
    };
    const v = validateDraft(draft, ctx);
    expect(v.ok).toBe(false);
    expect(v.hardViolations.some((h) => /double-booked/.test(h))).toBe(true);
    expect(v.hardViolations.some((h) => /MRR6/.test(h))).toBe(true);
  });

  it("rejects a coverage regression vs baseline", () => {
    const ctx = makeContext();
    const baseline: Draft = { Z3: mkPlacement("tm_m1", "Male 1"), Z4: mkPlacement("tm_m2", "Male 2") };
    const worse: Draft = { Z3: mkPlacement("tm_m1", "Male 1") };
    const v = validateDraft(worse, ctx, { baseline });
    expect(v.ok).toBe(false);
    expect(v.hardViolations.some((h) => /regress/i.test(h))).toBe(true);
  });

  it("passes a clean legal draft", () => {
    const ctx = makeContext();
    const draft: Draft = {
      Z3: mkPlacement("tm_m1", "Male 1"),
      Z4: mkPlacement("tm_m2", "Male 2"),
      MRR6: mkPlacement("tm_m3", "Male 3"),
      WRR6: mkPlacement("tm_f1", "Female 1"),
    };
    expect(validateDraft(draft, ctx).ok).toBe(true);
  });
});

describe("rescue ladder (P1-6, D1/I5)", () => {
  const trackedSlot: SlotModel = {
    key: "Z4", tier: 1, difficulty: 5, isOptional: false, isRotationTracked: true, isHardCoverage: true,
  };

  const cand = (over: Partial<RescueCandidate>): RescueCandidate => ({
    tmId: "x", tmName: "X", score: 0, healthPoints: 85, isCritical: false, isPrior3: false, isHardAvoid: false, ...over,
  });

  it("prefers clean candidates and records no relaxation", () => {
    const r = rescueLadder(trackedSlot, [
      cand({ tmId: "clean", healthPoints: 90 }),
      cand({ tmId: "p3", isPrior3: true, healthPoints: 95 }),
    ]);
    expect(r?.pick.tmId).toBe("clean");
    expect(r?.relaxations).toEqual([]);
  });

  it("relaxes prior-3 before hard-avoid", () => {
    const r = rescueLadder(trackedSlot, [
      cand({ tmId: "p3", isPrior3: true }),
      cand({ tmId: "avoid", isHardAvoid: true, healthPoints: 99 }),
    ]);
    expect(r?.pick.tmId).toBe("p3");
    expect(r?.relaxations).toContain("rotation-prior3");
  });

  it("relaxes hard-avoid only for required slots, never optional", () => {
    const optional: SlotModel = { ...trackedSlot, key: "Z1", isOptional: true };
    const onlyAvoid = [cand({ tmId: "avoid", isHardAvoid: true })];
    expect(rescueLadder(optional, onlyAvoid)).toBeNull();
    const r = rescueLadder(trackedSlot, onlyAvoid);
    expect(r?.pick.tmId).toBe("avoid");
    expect(r?.relaxations).toContain("hard-avoid");
  });
});

function mkPlacement(tmId: string, tmName: string): Draft[string] {
  return {
    tmId, tmName,
    provenance: { stage: "planner", reason: "", scorecard: { eligible: true, healthPoints: 85, isCritical: false, prefScore: 0, skillScore: 0 } },
  };
}

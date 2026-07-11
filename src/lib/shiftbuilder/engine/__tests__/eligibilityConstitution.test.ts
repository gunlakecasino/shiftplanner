/**
 * Eligibility constitution tests (KD-7 / PR 8).
 *
 * Same verdict expected from the public hard gate `canPlace` for:
 *   - RR-scoped operator rule
 *   - zone-scoped operator rule
 *   - schedule miss
 *   - knowledge accommodation
 *
 * Also locks the leaf module contract: liturgy has no operator-rules param
 * and no placement/engine reverse imports.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeContext } from "./fixtures/roster";
import { canPlace, slotTypeForKey } from "../eligibility";
import {
  isEligibleForSlot,
  normalizeGender,
  slotTypeForKey as coreSlotTypeForKey,
} from "../../eligibilityCore";
import type { EligibilityRule } from "../../engineConfig";
import {
  emptyOpsKnowledge,
  type OpsKnowledge,
} from "../../opsKnowledge/types";

const NIGHT = "2026-07-03";

function rule(partial: Partial<EligibilityRule> & { condition: Record<string, unknown> }): EligibilityRule {
  return {
    id: partial.id ?? "r1",
    configId: partial.configId ?? "cfg",
    ruleName: partial.ruleName ?? "test",
    ruleType: partial.ruleType ?? "hard_exclude",
    condition: partial.condition,
    priority: partial.priority ?? 1,
    isActive: partial.isActive ?? true,
  };
}

function knowledgeWith(partial: Partial<OpsKnowledge>): OpsKnowledge {
  return { ...emptyOpsKnowledge(), ...partial };
}

describe("eligibilityCore leaf contract (KD-7)", () => {
  it("exports pure liturgy helpers with no placement/engine imports", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../../eligibilityCore.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']\.\/placement["']/);
    expect(src).not.toMatch(/from\s+["']\.\/engine\//);
    expect(src).not.toMatch(/from\s+["']@\/app\//);
    expect(src).not.toMatch(/isEligibleUnderRules/);
  });

  it("slotTypeForKey classifies RR / zone / overlap / aux (shared with canPlace)", () => {
    expect(coreSlotTypeForKey("MRR6")).toBe("rr");
    expect(coreSlotTypeForKey("WRR1")).toBe("rr");
    expect(coreSlotTypeForKey("Z4")).toBe("zone");
    expect(coreSlotTypeForKey("Z9SR")).toBe("zone");
    expect(coreSlotTypeForKey("OL-AM-1")).toBe("overlap");
    expect(coreSlotTypeForKey("ADM")).toBe("aux");
    expect(slotTypeForKey("MRR6")).toBe(coreSlotTypeForKey("MRR6"));
  });

  it("normalizeGender maps common labels", () => {
    expect(normalizeGender("female")).toBe("F");
    expect(normalizeGender("M")).toBe("M");
    expect(normalizeGender("")).toBe("");
  });

  it("isEligibleForSlot is liturgy-only (no rules argument / ignore extras)", () => {
    const male = { gender: "M", gravePool: "Full" };
    const female = { gender: "F", gravePool: "Full" };
    expect(isEligibleForSlot(male, "MRR6")).toBe(true);
    expect(isEligibleForSlot(female, "MRR6")).toBe(false);
    expect(isEligibleForSlot(male, "Z4")).toBe(true);
    // Third-arg rules must not be part of the public liturgy contract.
    expect((isEligibleForSlot as Function).length).toBe(2);
  });
});

describe("canPlace constitution — operator rules with correct slotType", () => {
  const ctx = makeContext({ nightIso: NIGHT });
  const male = ctx.rosterById.get("tm_m1")!;

  it("RR-only slot_types rule does not treat restrooms as zone (footgun fix)", () => {
    // Under the hard_exclude interpreter, slot_types acts as a required match:
    // if the slot's type is not listed, the TM fails the rule.
    const rrOnly = [
      rule({
        id: "rr-scope",
        ruleName: "rr_scope",
        condition: { slot_types: ["rr"] },
      }),
    ];

    // MRR is type "rr" → passes slot_types filter → still ok (no exclude_tm_ids).
    expect(
      canPlace(male, "MRR6", {
        eligibilityRules: rrOnly,
        slotType: slotTypeForKey("MRR6"),
      }).ok,
    ).toBe(true);

    // Z4 is type "zone" → fails slot_types filter under hard_exclude interpreter.
    expect(
      canPlace(male, "Z4", {
        eligibilityRules: rrOnly,
        slotType: slotTypeForKey("Z4"),
      }).ok,
    ).toBe(false);

    // Omitting slotType must derive via slotTypeForKey — NOT hardcode "zone".
    // If zone were hardcoded, MRR6 would incorrectly fail the rr-only filter.
    expect(canPlace(male, "MRR6", { eligibilityRules: rrOnly }).ok).toBe(true);
    expect(canPlace(male, "Z4", { eligibilityRules: rrOnly }).ok).toBe(false);
  });

  it("zone-only slot_types rule allows zones and blocks RR under the interpreter", () => {
    const zoneOnly = [
      rule({
        id: "zone-scope",
        ruleName: "zone_scope",
        condition: { slot_types: ["zone"] },
      }),
    ];

    expect(canPlace(male, "Z4", { eligibilityRules: zoneOnly }).ok).toBe(true);
    expect(canPlace(male, "MRR6", { eligibilityRules: zoneOnly }).ok).toBe(false);
  });

  it("exclude_tm_ids hard rule blocks the named TM on any slot", () => {
    const ban = [
      rule({
        id: "ban-m1",
        ruleName: "ban",
        condition: { exclude_tm_ids: ["tm_m1"] },
      }),
    ];
    expect(canPlace(male, "Z4", { eligibilityRules: ban }).ok).toBe(false);
    expect(canPlace(male, "MRR6", { eligibilityRules: ban }).reason).toMatch(
      /operator eligibility rule/i,
    );
    const other = ctx.rosterById.get("tm_m2")!;
    expect(canPlace(other, "Z4", { eligibilityRules: ban }).ok).toBe(true);
  });
});

describe("canPlace constitution — schedule + knowledge", () => {
  const ctx = makeContext({ nightIso: NIGHT });
  const male = ctx.rosterById.get("tm_m1")!;

  it("schedule miss rejects; membership allows", () => {
    expect(
      canPlace(male, "Z4", { scheduledTmIds: new Set(["tm_m2"]) }).ok,
    ).toBe(false);
    expect(
      canPlace(male, "Z4", { scheduledTmIds: new Set(["tm_m1"]) }).ok,
    ).toBe(true);
  });

  it("hard knowledge accommodation blocks named slots", () => {
    const knowledge = knowledgeWith({
      dossiers: {
        tm_m1: {
          tmId: "tm_m1",
          capabilities: [],
          accommodations: [
            {
              kind: "no_stairs",
              label: "No stairs",
              severity: "hard",
              blockedSlotKeys: ["Z9"],
            },
          ],
        },
      },
    });
    expect(canPlace(male, "Z9", { knowledge }).ok).toBe(false);
    expect(canPlace(male, "Z4", { knowledge }).ok).toBe(true);
  });

  it("composes liturgy before operator rules (gender beats rules)", () => {
    const female = ctx.rosterById.get("tm_f1")!;
    // Even with empty rules, female cannot take MRR.
    expect(canPlace(female, "MRR6").ok).toBe(false);
    expect(canPlace(female, "MRR6").reason).toMatch(/male/i);
  });
});

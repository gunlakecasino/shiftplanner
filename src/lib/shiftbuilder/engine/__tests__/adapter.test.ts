import { describe, it, expect } from "vitest";
import { makeRoster, makeContext } from "./fixtures/roster";
import { historyFor } from "./fixtures/history";
import { runNightEngine } from "../index";
import { nightResultToLegacyDraft, nightResultExplanation } from "../adapters";

function fullContext() {
  return makeContext({ members: makeRoster({ males: 12, females: 10 }) });
}

describe("Draft-mode adapter (P2-4)", () => {
  it("maps a night result onto the legacy draft shapes", () => {
    const ctx = fullContext();
    const result = runNightEngine(ctx, { seed: 42 });
    const legacy = nightResultToLegacyDraft(result);

    // proposedAssignments: every drafted slot → tmId.
    for (const [slotKey, p] of Object.entries(result.draft)) {
      expect(legacy.proposedAssignments[slotKey]).toBe(p.tmId);
    }
    // breakdown carries picked + synthetic candidate breakdown for the Why? panel.
    for (const [slotKey, ranking] of Object.entries(legacy.breakdown)) {
      expect(ranking).toHaveProperty("pickedTmId");
      expect(ranking).toHaveProperty("preserved");
      for (const c of ranking.topCandidates) {
        expect(c.breakdown).toBeTruthy();
        expect(c.breakdown.rotation_health).toBeTruthy();
      }
    }
    // reasoningBySlot tags source + reason for each placement.
    for (const slotKey of Object.keys(result.draft)) {
      expect(legacy.reasoningBySlot[slotKey].source).toMatch(/engine|grok/);
      expect(typeof legacy.reasoningBySlot[slotKey].reason).toBe("string");
    }
  });

  it("surfaces relaxations in the reasoning text", () => {
    // Force a relaxation: single saturated TM on a board locked through Z4/Z5.
    const members = makeRoster({ males: 8, females: 5 });
    const lockKeys = ["MRR1", "MRR6", "MRR7", "MRR8", "MRR10", "WRR1", "WRR6", "WRR7", "WRR8", "WRR10", "Z4", "Z5"];
    const lockTms = ["tm_m1", "tm_m2", "tm_m3", "tm_m4", "tm_m5", "tm_f1", "tm_f2", "tm_f3", "tm_f4", "tm_f5", "tm_m6", "tm_m7"];
    const assignments: Record<string, any> = {};
    lockKeys.forEach((k, i) => (assignments[k] = { tmId: lockTms[i], tmName: lockTms[i], isLocked: true }));
    const histories = {
      tm_m8: historyFor("tm_m8", "Male 8", "2026-07-03", [
        { slotKey: "Z9", daysAgo: 1 }, { slotKey: "Z9", daysAgo: 2 }, { slotKey: "Z9", daysAgo: 3 },
      ]),
    };
    const ctx = makeContext({ members, histories, assignments, nightIso: "2026-07-03" });
    const result = runNightEngine(ctx, { seed: 1, preserve: "locked-only" });
    const legacy = nightResultToLegacyDraft(result);
    expect(legacy.reasoningBySlot.Z9?.reason).toMatch(/relaxed|rotation-prior3/);
  });

  it("builds a human explanation string", () => {
    const ctx = fullContext();
    const result = runNightEngine(ctx, { seed: 3 });
    const text = nightResultExplanation(result);
    expect(text).toMatch(/Unified engine/);
    expect(text).toMatch(/covered/);
  });
});

describe("runNightEngineFromClient — the production entry point (P2-4)", () => {
  it("accepts client-shaped raw member rows and yields a valid legacy draft", async () => {
    const { runNightEngineFromClient } = await import("../adapters");
    const { validateDraft } = await import("../guard");
    const { buildNightContext } = await import("../context");
    const { FALLBACK_CONFIG } = await import("../../engineConfig");
    const { DEFAULT_AUX_DEFS } = await import("../../constants");

    // Raw rows exactly as the board holds them (mixed id/pool shapes).
    const members = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `m${i + 1}`, name: `M${i + 1}`, gender: "M", grave_pool: "Full",
        is_am_overlap: false, is_pm_overlap: false,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `f${i + 1}`, name: `F${i + 1}`, gender: "F", grave_pool: "Full",
        is_am_overlap: false, is_pm_overlap: false,
      })),
    ];
    const skillScores = new Map(members.map((m) => [m.id, 6]));

    const result = runNightEngineFromClient(
      {
        nightIso: "2026-07-03",
        config: FALLBACK_CONFIG,
        auxDefs: DEFAULT_AUX_DEFS,
        members,
        assignments: {},
        histories: {},
        skillScores,
      },
      { mode: "no-ai", preserve: "all-existing" },
    );

    // Rebuild the same context to validate the returned draft.
    const ctx = buildNightContext({
      nightIso: "2026-07-03", config: FALLBACK_CONFIG, auxDefs: DEFAULT_AUX_DEFS,
      members, assignments: {}, histories: {}, skillScores,
    });
    expect(validateDraft(result.draft, ctx).ok).toBe(true);
    expect(result.scorecard.coverage).toBeGreaterThan(0);
    // All 10 restrooms gender-correct.
    for (const n of [1, 6, 7, 8, 10]) {
      expect(ctx.rosterById.get(result.draft[`MRR${n}`]!.tmId)?.gender).toBe("M");
      expect(ctx.rosterById.get(result.draft[`WRR${n}`]!.tmId)?.gender).toBe("F");
    }
  });
});

describe("client AI flow — the exact path runCoverageEngine now takes", () => {
  it("runs deterministic → brief → guard → thought process with AI info", async () => {
    const { runNightEngineFromClientWithContext, nightResultToThoughtProcess } = await import("../adapters");
    const { buildNightBrief, AI_SYSTEM_PROMPT } = await import("../ai/briefs");
    const { validateAiDraft } = await import("../ai/guard");
    const { FALLBACK_CONFIG } = await import("../../engineConfig");
    const { DEFAULT_AUX_DEFS } = await import("../../constants");

    const members = [
      ...Array.from({ length: 13 }, (_, i) => ({ id: `m${i + 1}`, name: `M${i + 1}`, gender: "M", grave_pool: "Full", is_am_overlap: false, is_pm_overlap: false })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `f${i + 1}`, name: `F${i + 1}`, gender: "F", grave_pool: "Full", is_am_overlap: false, is_pm_overlap: false })),
    ];
    const skillScores = new Map(members.map((m) => [m.id, 6]));

    const { result, ctx } = runNightEngineFromClientWithContext(
      { nightIso: "2026-07-03", config: FALLBACK_CONFIG, auxDefs: DEFAULT_AUX_DEFS, members, assignments: {}, histories: {}, skillScores },
      { mode: "no-ai", preserve: "all-existing" },
    );

    // Brief is a non-empty string built from ctx + result.
    const brief = buildNightBrief(ctx, result);
    expect(brief).toMatch(/ROTATION FACTS/);
    expect(AI_SYSTEM_PROMPT).toMatch(/judgment layer/i);

    // Simulate an AI proposal (a legal no-op keep) and guard it.
    const someSlot = Object.keys(result.draft)[0];
    const someTm = result.draft[someSlot].tmId;
    const guarded = validateAiDraft(ctx, result.draft, [
      { slotKey: someSlot, tmId: someTm, rationale: "keep — already strong" },
    ]);
    expect(guarded.draft).toBeTruthy();

    // Thought process with AI info renders the accepted picks + provider.
    const tp = nightResultToThoughtProcess(result, (id) => ctx.rosterById.get(id)?.name ?? id, {
      provider: "Fable",
      accepted: guarded.accepted.map((a) => ({ slot: a.slotKey, tmId: a.tmId, tmName: ctx.rosterById.get(a.tmId)?.name ?? a.tmId, rationale: a.rationale })),
      rejected: guarded.rejected.map((r) => ({ slot: r.slotKey, reason: r.reason })),
      notes: "reviewed the board",
    });
    expect(tp.ai?.provider).toBe("Fable");
    expect(tp.summary).toMatch(/covered/);
  });
});

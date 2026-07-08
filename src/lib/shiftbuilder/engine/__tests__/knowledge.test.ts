import { describe, it, expect } from "vitest";
import { makeRoster, makeContext } from "./fixtures/roster";
import { runNightEngine } from "../index";
import { canPlace } from "../eligibility";
import { validateDraft } from "../guard";
import { buildNightBrief } from "../ai/briefs";
import { runPlanner } from "../planner";
import { accommodationBlocks, dossierBriefLine, chemistryWarnings } from "../../opsKnowledge/apply";
import { emptyOpsKnowledge, type OpsKnowledge } from "../../opsKnowledge/types";

function knowledgeWith(partial: Partial<OpsKnowledge>): OpsKnowledge {
  return { ...emptyOpsKnowledge(), ...partial };
}

describe("ops knowledge — accommodations (safety-critical, hard = guard constraint)", () => {
  it("a hard accommodation blocks the TM on the named slots", () => {
    const k = knowledgeWith({
      dossiers: {
        tm_m1: { tmId: "tm_m1", capabilities: [], accommodations: [
          { kind: "no_stairs", label: "No stairs (Z9 upper)", severity: "hard", blockedSlotKeys: ["Z9"] },
        ] },
      },
    });
    expect(accommodationBlocks(k, "tm_m1", "Z9").blocked).toBe(true);
    expect(accommodationBlocks(k, "tm_m1", "Z4").blocked).toBe(false);
    // Soft accommodation never blocks.
    const soft = knowledgeWith({ dossiers: { tm_m1: { tmId: "tm_m1", capabilities: [], accommodations: [
      { kind: "other", label: "prefers no smoking room", severity: "soft", blockedSlotKeys: ["Z9"] } ] } } });
    expect(accommodationBlocks(soft, "tm_m1", "Z9").blocked).toBe(false);
  });

  it("the eligibility gate + engine never place a hard-accommodated TM on a blocked slot", () => {
    const members = makeRoster({ males: 12, females: 10 });
    const knowledge = knowledgeWith({
      dossiers: { tm_m1: { tmId: "tm_m1", capabilities: [], accommodations: [
        { kind: "no_stairs", label: "No stairs", severity: "hard", blockedSlotKeys: ["Z9"] } ] } },
    });
    const ctx = makeContext({ members });
    (ctx as any).knowledge = knowledge;

    // Gate rejects tm_m1 on Z9.
    expect(canPlace(ctx.rosterById.get("tm_m1")!, "Z9", { knowledge }).ok).toBe(false);

    const result = runNightEngine(ctx, { seed: 5 });
    expect(result.draft.Z9?.tmId).not.toBe("tm_m1");
    expect(validateDraft(result.draft, ctx).ok).toBe(true);
  });
});

describe("ops knowledge — brief context", () => {
  it("dossier facts + policies + chemistry appear in the brief", () => {
    const members = makeRoster({ males: 12, females: 10 });
    const knowledge = knowledgeWith({
      dossiers: { tm_m1: { tmId: "tm_m1", capabilities: [{ area: "Z9", level: 2, note: "still learning" }],
        accommodations: [], reliability: 5, trainingStatus: "trainer", notes: "great with new hires" } },
      policies: [{ id: "p1", text: "Z9 needs someone solid", strength: "hard", active: true }],
      chemistry: [{ aTmId: "tm_m1", bTmId: "tm_m2", kind: "keep_apart", strength: "hard", reason: "history" }],
    });
    const ctx = makeContext({ members });
    (ctx as any).knowledge = knowledge;
    const result = runPlanner(ctx, { preserve: "locked-only" });
    const brief = buildNightBrief(ctx, { scope: "night", nightIso: ctx.nightIso, draft: result.draft, breakdown: result.breakdown, scorecard: { coverage: 0, healthTotal: 0, prefTotal: 0, skillTotal: 0, hardViolations: [] }, unassignedTmIds: [], telemetry: { runId: "t", scope: "night", seed: 1, mode: "no-ai", stages: [], relaxationsUsed: [], totalMs: 0 } });
    expect(brief).toMatch(/SUPERVISOR POLICIES/);
    expect(brief).toMatch(/Z9 needs someone solid/);
    // tm_m1 dossier line present wherever they were placed.
    expect(brief).toMatch(/reliability 5\/5|trainer|great with new hires/);
  });

  it("chemistry warns when a keep-apart pair is both placed", () => {
    const k = knowledgeWith({ chemistry: [{ aTmId: "a", bTmId: "b", kind: "keep_apart", strength: "hard", reason: "x" }] });
    const warn = chemistryWarnings(k, new Set(["a", "b"]), (id) => id.toUpperCase());
    expect(warn.length).toBe(1);
    expect(warn[0].text).toMatch(/Keep apart/);
    // Only one placed → no keep-apart warning.
    expect(chemistryWarnings(k, new Set(["a"]), (id) => id).length).toBe(0);
  });

  it("empty knowledge adds nothing (engine unchanged)", () => {
    const ctx = makeContext({ members: makeRoster({ males: 12, females: 10 }) });
    const result = runPlanner(ctx, { preserve: "locked-only" });
    const brief = buildNightBrief(ctx, { scope: "night", nightIso: ctx.nightIso, draft: result.draft, breakdown: result.breakdown, scorecard: { coverage: 0, healthTotal: 0, prefTotal: 0, skillTotal: 0, hardViolations: [] }, unassignedTmIds: [], telemetry: { runId: "t", scope: "night", seed: 1, mode: "no-ai", stages: [], relaxationsUsed: [], totalMs: 0 } });
    expect(brief).not.toMatch(/SUPERVISOR POLICIES/);
    expect(dossierBriefLine(undefined, "x", "Z4")).toBe("");
  });
});

describe("feedback loop — few-shot from past decisions", () => {
  it("formats endorsed and rejected examples for the brief", async () => {
    const { feedbackBriefBlock } = await import("../../opsKnowledge/feedback");
    const lines = feedbackBriefBlock([
      { nightIso: "2026-07-03", slotKey: "Z5", tmId: "deb", tmName: "Deb", aiRationale: "fresh on Z5", verdict: "endorsed" },
      { nightIso: "2026-07-03", slotKey: "Z9", tmId: "jared", tmName: "Jared", aiRationale: "spread", verdict: "rejected", reason: "too green for high-limit" },
    ]);
    const text = lines.join("\n");
    expect(text).toMatch(/ENDORSED/);
    expect(text).toMatch(/Z5 ← Deb/);
    expect(text).toMatch(/REJECTED/);
    expect(text).toMatch(/too green for high-limit/);
    expect(feedbackBriefBlock([])).toEqual([]);
  });

  it("brief includes the LEARNED FROM THE SUPERVISOR block when feedback is passed", () => {
    const ctx = makeContext({ members: makeRoster({ males: 12, females: 10 }) });
    const result = runPlanner(ctx, { preserve: "locked-only" });
    const nr = { scope: "night" as const, nightIso: ctx.nightIso, draft: result.draft, breakdown: result.breakdown, scorecard: { coverage: 0, healthTotal: 0, prefTotal: 0, skillTotal: 0, hardViolations: [] }, unassignedTmIds: [], telemetry: { runId: "t", scope: "night" as const, seed: 1, mode: "no-ai" as const, stages: [], relaxationsUsed: [], totalMs: 0 } };
    const brief = buildNightBrief(ctx, nr, [
      { nightIso: ctx.nightIso, slotKey: "Z5", tmId: "tm_m1", tmName: "M1", aiRationale: "fresh", verdict: "endorsed" },
    ]);
    expect(brief).toMatch(/LEARNED FROM THE SUPERVISOR/);
  });
});

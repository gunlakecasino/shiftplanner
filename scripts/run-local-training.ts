#!/usr/bin/env tsx
/**
 * Local Simulation + Training Runner for ShiftPlanner AI Engine Lab
 *
 * Run this from the oms_root directory:
 *   npx tsx scripts/run-local-training.ts
 *
 * This lets you run heavy simulation + training loops locally without the browser.
 * It respects all the token guards and few-shot logic we built.
 *
 * You can feed human corrections directly in the terminal for rapid iteration.
 */

import fs from 'fs';
import path from 'path';
import { simulationRunner } from '../src/lib/shiftbuilder/ai/SimulationRunner';
import { useShiftBuilderStore } from '../src/app/shiftbuilder/store/useShiftBuilderStore';
import { calculateCoverageFeasibility } from '../src/lib/shiftbuilder/skills/placement-engine';

// Simple .env.local loader (no extra dependencies)
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length) {
      const value = rest.join('=').replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

loadEnvLocal();

const XAI_KEY = process.env.XAI_API_KEY;

if (!XAI_KEY) {
  console.error("❌ XAI_API_KEY not found in environment.");
  console.error("   Make sure it exists in .env.local and you're running with dotenv loaded.");
  process.exit(1);
}

console.log("✅ XAI_API_KEY loaded (length:", XAI_KEY.length, ")");
console.log("🚀 Starting local training runner...\n");

async function main() {
  const store = useShiftBuilderStore.getState();

  console.log("=== Local Training Session ===");
  console.log("Current human feedback in store:", store.humanFeedback.length);
  console.log("Current analyses:", store.engineAnalyses.length);

  // Custom run for the user's specific days + headcounts, adapted with our order enforcement recommendations
  console.log("\n▶ Running custom 3-night batch: Friday(24), Monday(18), Thursday(15) with adapted order_priority=3.0 + aggressive early-slot logic + weekend Grave rules active");

  const customScenarios = [
    { dayName: "Thursday", headcount: 14 },
    { dayName: "Thursday", headcount: 13 },
  ];

  // Adapted weights incorporating Grok's recent strong suggestions
  // (order_priority kept high per user's priority, grave_slot_fill_priority significantly raised)
  const adaptedWeights = {
    order_priority: 3.0,
    grave_slot_fill_priority: 3.5,   // Adopted from multiple suggestions (2.5 → 4.5 range)
    coverage: 1.8,
  };

  const results: any[] = [];

  for (const scenario of customScenarios) {
    const rosterSize = scenario.headcount;
    const roster = Array.from({ length: rosterSize }, (_, j) => ({
      key: `tm_${1000 + j}`,
      display_name: `TM-${1000 + j}`,
      rank: 1 + (j % 8),
      pool: ['Grave', 'Swing', 'AM'][j % 3],
    }));

    // Use the new world-class feasibility calculator
    const feasibility = calculateCoverageFeasibility(rosterSize);

    // Generate realistic unfilled slots based on actual feasibility
    let unfilledSlots: string[] = [];
    if (feasibility.shortfall > 0) {
      // Leave unfilled in the tiers that are impossible to clear
      unfilledSlots = feasibility.impossibleTiers.length > 0 
        ? ["Z6", "Z10", "Z8", "Z9SR"].slice(0, Math.min(3, feasibility.shortfall))
        : ["SP1", "TR2"];
    } else {
      unfilledSlots = ["SP1", "TR2", "Z9SR"].slice(0, 2);
    }

    const input = {
      dayName: `${scenario.dayName} (Custom - ${scenario.headcount} TMs)`,
      unfilledSlots,
      currentAssignments: {},
      roster,
      currentEngineConfig: {
        id: 'sim',
        isActive: true,
        isPreset: false,
        weights: adaptedWeights,
        thresholds: {},
        slotPriority: {},
        placementMethod: 'weighted',
        grokReasoningEffort: 'medium',
        notes: null,
        createdAt: new Date().toISOString(),
        createdBy: null,
      } as any,
      targetType: "deployment" as const,
    };

    // Attach feasibility for nice printing and context
    (scenario as any).feasibility = feasibility;

    try {
      const analysis = await (await import('../src/lib/shiftbuilder/ai/engineAnalysis')).analyzeDayAndProposeConfigImprovements(input, []);
      results.push({
        scenario: { ...scenario, dayName: input.dayName, unfilledSlots },
        analysis,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("Analysis failed for", input.dayName, e);
    }
  }

  console.log(`\n✅ Custom batch complete. ${results.length} analyses generated.`);

  console.log("\n" + "=".repeat(60));
  console.log("TIGHT HEADCOUNT TEST: Thursday 14 TMs + Thursday 13 TMs");
  console.log("Using adapted weights from previous suggestions (order_priority 3.0 + grave_slot_fill_priority 3.5)");
  console.log("=".repeat(60));

  let totalTokens = 0;

  for (const [index, res] of results.entries()) {
    const analysis = res.analysis;
    totalTokens += analysis.tokenUsage?.totalTokens || 0;

    const feas = (res.scenario as any).feasibility;
    console.log(`\n[${index + 1}/2] ${res.scenario.dayName}`);
    console.log(`    Headcount: ${res.scenario.headcount}`);
    console.log(`    Feasibility: ${feas?.explanation?.replace(/\n/g, ' ') || 'N/A'}`);
    console.log(`    Unfilled slots: ${res.scenario.unfilledSlots.length} → ${res.scenario.unfilledSlots.join(", ")}`);
    console.log(`    Tokens used:    ${analysis.tokenUsage?.totalTokens || "N/A"}`);
    console.log(`    Suggestions:    ${analysis.suggestions?.length || 0}`);

    if (analysis.suggestions && analysis.suggestions.length > 0) {
      console.log("\n    SUGGESTIONS:");
      analysis.suggestions.forEach((sug: any, i: number) => {
        console.log(`      ${i + 1}. [${sug.type}] ${sug.description || sug.key || sug.rule || "N/A"}`);
        console.log(`         Rationale: ${sug.rationale}`);
        if (sug.proposedChange) {
          console.log(`         Proposed change: ${JSON.stringify(sug.proposedChange)}`);
        }
        console.log(`         Confidence: ${sug.confidence ?? "?"}`);
      });
    }

    if (analysis.summary) {
      console.log(`\n    Summary: ${analysis.summary}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`TOTAL TOKENS THIS BATCH: ~${totalTokens}`);
  console.log("=".repeat(60));

  // Simple interactive training loop
  console.log("\n\n=== Interactive Training ===");
  console.log("Type your corrections below (one per line).");
  console.log("Type 'done' when finished, or 'run' to run another batch with the new feedback.\n");

  // In a real CLI we'd use readline, but for agent-driven runs we simulate.
  // For now, print how the user can continue.
  console.log("(In this environment, tell me your corrections in chat and I will inject them and re-run.)");

  // Example: how to programmatically add feedback
  // store.addHumanFeedback({ id: 'cli-1', scenarioId: 'manual', dayName: 'Manual', correction: 'Your text here', timestamp: new Date().toISOString() });
}

main().catch((err) => {
  console.error("Training run failed:", err);
  process.exit(1);
});

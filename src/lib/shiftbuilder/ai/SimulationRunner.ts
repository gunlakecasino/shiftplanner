/**
 * SimulationRunner
 *
 * Generates realistic synthetic nights for training the engine.
 * Each generated scenario is automatically analyzed and turned into TrainingExamples.
 *
 * This is the fastest way to accumulate high-quality correction data.
 */

import { analyzeDayAndProposeConfigImprovements } from './engineAnalysis';
import { useShiftBuilderStore } from '@/app/shiftbuilder/store/useShiftBuilderStore';

export interface SimulationScenario {
  id: string;
  dayName: string;
  roster: any[];
  currentAssignments: Record<string, any>;
  unfilledSlots: string[];
  targetType: 'deployment' | 'breakSheet';
  seed?: number;
}

export class SimulationRunner {
  /**
   * Hard safety limits to protect against accidental high token spend.
   * These are conservative for a training surface.
   */
  private static readonly MAX_BATCH_SIZE = 6;
  private static readonly MAX_CONCURRENT = 2; // serialize most calls to keep token rate predictable

  /**
   * Rough token cost estimate per analysis (based on current prompt shape + maxTokens).
   * Update this as the analyzer evolves.
   */
  private static readonly ESTIMATED_TOKENS_PER_ANALYSIS = 2200;

  async generateBatch(
    count = 6,
    baseEngineConfig: any = null,
    options?: { onProgress?: (done: number, total: number) => void }
  ): Promise<any[]> {
    const safeCount = Math.min(count, SimulationRunner.MAX_BATCH_SIZE);

    if (count > SimulationRunner.MAX_BATCH_SIZE) {
      console.warn(`[SimulationRunner] Requested ${count} but capped at safe max ${SimulationRunner.MAX_BATCH_SIZE} to control token cost.`);
    }

    const scenarios: SimulationScenario[] = [];
    const dayNames = ['Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

    for (let i = 0; i < safeCount; i++) {
      const rosterSize = 22 + Math.floor(Math.random() * 9);
      const roster = Array.from({ length: rosterSize }, (_, j) => ({
        key: `tm_${1000 + j}`,
        display_name: `TM-${1000 + j}`,
        rank: 1 + (j % 7),
        pool: ['Grave', 'Swing', 'AM'][j % 3],
      }));

      const possibleSlots = ['Zone1', 'Zone3', 'Zone7', 'MRR2', 'WRR4', 'BW1-Row0', 'BW2-Row1', 'RR-1'];
      const unfilledCount = 1 + Math.floor(Math.random() * 5);
      const unfilledSlots = [...possibleSlots].sort(() => 0.5 - Math.random()).slice(0, unfilledCount);

      scenarios.push({
        id: `sim_${Date.now()}_${i}`,
        dayName: `${dayNames[i % 7]} (Sim ${i + 1})`,
        roster,
        currentAssignments: {},
        unfilledSlots,
        targetType: i % 3 === 0 ? 'breakSheet' : 'deployment',
      });
    }

    const estimatedTotalTokens = safeCount * SimulationRunner.ESTIMATED_TOKENS_PER_ANALYSIS;
    console.log(`[SimulationRunner] Starting batch of ${safeCount}. Estimated tokens: ~${estimatedTotalTokens}. Concurrent limit: ${SimulationRunner.MAX_CONCURRENT}`);

    const results: any[] = [];
    let completed = 0;

    // Process with limited concurrency to control token burn rate
    for (let i = 0; i < scenarios.length; i += SimulationRunner.MAX_CONCURRENT) {
      const chunk = scenarios.slice(i, i + SimulationRunner.MAX_CONCURRENT);

      const chunkResults = await Promise.all(
        chunk.map(async (scenario) => {
          const input = {
            dayName: scenario.dayName,
            unfilledSlots: scenario.unfilledSlots,
            currentAssignments: scenario.currentAssignments,
            roster: scenario.roster,
            currentEngineConfig: baseEngineConfig,
            targetType: scenario.targetType,
          };

          try {
            // Pass accumulated human feedback for few-shot learning during batch
            const recentFeedback = (useShiftBuilderStore as any).getState?.()?.humanFeedback || [];
            const analysis = await analyzeDayAndProposeConfigImprovements(input, recentFeedback);
            completed++;
            options?.onProgress?.(completed, safeCount);

            return {
              scenario,
              analysis,
              createdAt: new Date().toISOString(),
            };
          } catch (e) {
            console.warn('[SimulationRunner] analysis failed for', scenario.dayName, e);
            completed++;
            options?.onProgress?.(completed, safeCount);
            return null;
          }
        })
      );

      results.push(...chunkResults.filter(Boolean));
    }

    return results;
  }

  getEstimatedTokensForBatch(count: number): number {
    const safe = Math.min(count, SimulationRunner.MAX_BATCH_SIZE);
    return safe * SimulationRunner.ESTIMATED_TOKENS_PER_ANALYSIS;
  }
}

export const simulationRunner = new SimulationRunner();

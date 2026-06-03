import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  estimateAiCostUsd,
  hydrateAiUsageGlobals,
  recordAiUsageEvent,
} from '@/lib/shiftbuilder/aiUsageTracker';
import type { AuxDef } from '@/lib/shiftbuilder/placement';
import type { EngineAnalysis, HumanFeedback, TrainingExample } from '@/lib/shiftbuilder/ai/types';

/**
 * ShiftAssignment shape used by planner cards and dev previews.
 * This satisfies the imports in src/app/shiftbuilder/components/planner/* and src/components/planner/*.
 */
export type ShiftAssignment = {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap" | string;
  tmName?: string | null;
  tmId?: string;
  source?: string;
  isLocked?: boolean;
  provenance?: {
    rationale?: string;
    confidence?: number;
    fairnessSignals?: Record<string, number>;
  };
  rrSide?: "mens" | "womens" | null;
  [key: string]: any;
};

/**
 * Minimal Zustand store for the remaining local mutable state in ShiftBuilder.
 *
 * Goal (3.4): Reduce re-render surface in the orchestrator by moving
 * high-churn state (assignments, draft, etc.) here with fine-grained selectors.
 *
 * Start small: assignments + basic actions.
 * Expand iteratively.
 */

interface ShiftBuilderState {
  assignments: Record<string, any>;
  setAssignments: (assignments: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;

  draftAssignments: Record<string, {
    proposedTmId: string;
    proposedTmName: string;
    previousTmId?: string;
    previousTmName?: string;
    proposedClear?: boolean;
  }>;
  setDraftAssignments: (draft: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  clearDraft: () => void;

  // Future: auxDefs, etc.

  // 3.4 continuation — Roster rail UI state (expanded sections + filters)
  // Moved here so RosterRail can subscribe narrowly instead of receiving 12+ props.
  rosterUI: {
    expanded: {
      otherTms: boolean;
      calledOff: boolean;
      deployed: boolean;
      pmOverlaps: boolean;
      amOverlaps: boolean;
      porters: boolean;
      scheduledGraves: boolean;
      scheduledPM: boolean;
      scheduledAM: boolean;
    };
    graveOnly: boolean;
    rosterSearch: string;
  };
  setRosterSectionExpanded: (key: keyof ShiftBuilderState['rosterUI']['expanded'], value: boolean) => void;
  setGraveOnly: (v: boolean) => void;
  setRosterSearch: (v: string) => void;

  // Direct feed from Sudo Weekly Roster "Apply Roster" action.
  // When the operator hits "Apply Roster" in the Sudo tab, this is populated
  // so the main board + TM Picker can show exactly the scheduled TMs from
  // the weekly roster without depending on the service role key path.
  weeklyRosterScheduled: {
    weekStart: string | null;
    grave: string[];      // union across the week (legacy / diagnostics)
    pmOverlap: string[];
    amOverlap: string[];
    /** Per-night scheduled sets keyed by local YYYY-MM-DD (Thu→Wed roster week). */
    graveByNight?: Record<string, string[]>;
    pmOverlapByNight?: Record<string, string[]>;
    amOverlapByNight?: Record<string, string[]>;
  };
  setWeeklyRosterScheduled: (data: ShiftBuilderState['weeklyRosterScheduled']) => void;

  // Short-lived pending drag state (used to keep source cards stable during reassignment)
  pendingDrag: null | {
    fromSlot: string;
    tmId: string;
    tmName: string;
  };
  setPendingDrag: (drag: ShiftBuilderState['pendingDrag']) => void;

  // auxDefs moved to store for narrow subscription in Board/cards (changes infrequently but reduces prop surface)
  auxDefs: AuxDef[];
  setAuxDefs: (updater: AuxDef[] | ((prev: AuxDef[]) => AuxDef[])) => void;

  // =================================================================
  // AI Engine Lab + Training Loop (full port from previous work) — strongly typed
  // =================================================================
  engineAnalyses: EngineAnalysis[];
  addEngineAnalysis: (analysis: EngineAnalysis) => void;
  clearEngineAnalyses: () => void;

  humanFeedback: HumanFeedback[];
  addHumanFeedback: (feedback: HumanFeedback) => void;
  clearHumanFeedback: () => void;

  trainingExamples: TrainingExample[];
  addTrainingExample: (example: TrainingExample) => void;

  // Live engine config snapshot for the AI Lab
  liveEngineConfigForAI: any | null;
  setLiveEngineConfigForAI: (cfg: any) => void;

  // Session-level AI usage tracking for the tokens/cost pill (client-side accumulation from API responses)
  // Focused on low-cost defaults; estimates use grok-4.3 rates (fast variants cheaper)
  aiSessionUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    callCount: number;
    lastModel?: string;
    lastReasoningEffort?: string;
  };
  addAiUsage: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  }) => void;
  clearAiSessionUsage: () => void;
}

export const useShiftBuilderStore = create<ShiftBuilderState>()(
  subscribeWithSelector((set) => ({
    assignments: {},

    setAssignments: (updater) =>
      set((state) => ({
        assignments: typeof updater === 'function' ? updater(state.assignments) : updater,
      })),

    draftAssignments: {},

    setDraftAssignments: (updater) =>
      set((state) => ({
        draftAssignments: typeof updater === 'function' ? updater(state.draftAssignments) : updater,
      })),

    clearDraft: () => set({ draftAssignments: {} }),

    // Roster UI (3.4 narrow subscription target)
    rosterUI: {
      expanded: {
        otherTms: false,
        calledOff: true,
        deployed: false,
        pmOverlaps: false,
        amOverlaps: false,
        porters: false,
        scheduledGraves: true,
        scheduledPM: true,
        scheduledAM: true,
      },
      graveOnly: true,
      rosterSearch: '',
    },

    setRosterSectionExpanded: (key, value) =>
      set((state) => ({
        rosterUI: {
          ...state.rosterUI,
          expanded: {
            ...state.rosterUI.expanded,
            [key]: value,
          },
        },
      })),

    setGraveOnly: (v) =>
      set((state) => ({
        rosterUI: { ...state.rosterUI, graveOnly: v },
      })),

    setRosterSearch: (v) =>
      set((state) => ({
        rosterUI: { ...state.rosterUI, rosterSearch: v },
      })),

    // auxDefs
    auxDefs: [],

    setAuxDefs: (updater) =>
      set((state) => ({
        auxDefs: typeof updater === 'function' ? updater(state.auxDefs) : updater,
      })),

    // AI Lab slices (full training loop port) — typed
    engineAnalyses: [],
    addEngineAnalysis: (analysis) =>
      set((state) => ({ engineAnalyses: [analysis, ...state.engineAnalyses].slice(0, 50) })),
    clearEngineAnalyses: () => set({ engineAnalyses: [] }),

    humanFeedback: [],
    addHumanFeedback: (fb) =>
      set((state) => ({ humanFeedback: [fb, ...state.humanFeedback].slice(0, 100) })),
    clearHumanFeedback: () => set({ humanFeedback: [] }),

    trainingExamples: [],
    addTrainingExample: (ex) =>
      set((state) => ({ trainingExamples: [ex, ...state.trainingExamples].slice(0, 200) })),

    // AI session usage (for bottom-right tokens/cost pill). Accumulates across all Grok calls in the session.
    // Cost calc uses main grok-4.3 rates; actual spend lower with fast models, caching, low effort.
    aiSessionUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      callCount: 0,
      lastModel: undefined,
      lastReasoningEffort: undefined,
    },
    addAiUsage: (usage) =>
      set((state) => {
        const { inputTokens = 0, outputTokens = 0, model, reasoningEffort } = usage;
        const newInput = state.aiSessionUsage.inputTokens + inputTokens;
        const newOutput = state.aiSessionUsage.outputTokens + outputTokens;
        const newTotal = newInput + newOutput;
        // Rates: $1.25/M input, $2.50/M output for grok-4.3 (see previous cost discussion). Fast models ~6x cheaper.
        const costDelta = estimateAiCostUsd(inputTokens, outputTokens);
        const newCost = state.aiSessionUsage.estimatedCostUsd + costDelta;
        const newUsageState = {
          inputTokens: newInput,
          outputTokens: newOutput,
          totalTokens: newTotal,
          estimatedCostUsd: Math.round(newCost * 10000) / 10000, // 4 decimals for pennies
          callCount: state.aiSessionUsage.callCount + 1,
          lastModel: model || state.aiSessionUsage.lastModel,
          lastReasoningEffort: reasoningEffort || state.aiSessionUsage.lastReasoningEffort,
        };
        if (typeof window !== 'undefined') {
          (window as any).__aiSessionUsage = newUsageState;
          recordAiUsageEvent({ inputTokens, outputTokens, model, reasoningEffort });
        }
        return { aiSessionUsage: newUsageState };
      }),
    clearAiSessionUsage: () => {
      const cleared = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        callCount: 0,
        lastModel: undefined,
        lastReasoningEffort: undefined,
      };
      if (typeof window !== 'undefined') {
        (window as any).__aiSessionUsage = cleared;
        hydrateAiUsageGlobals(cleared);
      }
      set({ aiSessionUsage: cleared });
    },

    // Direct "Apply Roster" feed from Sudo Weekly Roster tab
    weeklyRosterScheduled: {
      weekStart: null,
      grave: [],
      pmOverlap: [],
      amOverlap: [],
      graveByNight: {},
      pmOverlapByNight: {},
      amOverlapByNight: {},
    },

    // Short-lived pending drag state to prevent mid-gesture mutation of source cards.
    // This is the #1 root cause of assigned TM drag being unreliable compared to tasks.
    pendingDrag: null as null | {
      fromSlot: string;
      tmId: string;
      tmName: string;
    },

    liveEngineConfigForAI: null,
    setLiveEngineConfigForAI: (cfg) => set({ liveEngineConfigForAI: cfg }),

    setWeeklyRosterScheduled: (data) => {
      set({ weeklyRosterScheduled: data });
      // Always persist so the feed survives reloads / tab switches and the
      // MarkerPad default list (the strict scheduled+eligible+unassigned list)
      // stays correct after "Apply Roster".
      try {
        // dynamic import to avoid pulling the debug helper at module top level
        import("@/lib/shiftbuilder/debugSessionLog").then(({ persistWeeklyRosterScheduled }) => {
          if (data && (data as any).weekStart) persistWeeklyRosterScheduled(data);
        });
      } catch {}
    },

    setPendingDrag: (drag) => set({ pendingDrag: drag }),
  }))
);

// Seed the ai session global synchronously on module load (store import happens early
// in the ShiftBuilderClient path). This guarantees the poll in OpsStatusBar sees a
// shaped object with 0s on first canvas paint / hard refresh, so the "ai 0.0k ~$0.00"
// session tokens pill the operator requested is always present in the cluster.
if (typeof window !== "undefined") {
  const initAi = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    callCount: 0,
    lastModel: undefined,
    lastReasoningEffort: undefined,
  };
  hydrateAiUsageGlobals(initAi);
}

// Optional: Dev-only subscribe for debugging day-switch impact
const __DEV__ =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV === 'development';

if (__DEV__) {
  useShiftBuilderStore.subscribe(
    (state) => state.assignments,
    (assignments, prev) => {
      console.log('[ShiftBuilderStore] assignments changed', {
        keys: Object.keys(assignments).length,
        prevKeys: Object.keys(prev).length,
      });
    }
  );

  useShiftBuilderStore.subscribe(
    (state) => state.draftAssignments,
    (draft, prev) => {
      console.log('[ShiftBuilderStore] draftAssignments changed', {
        keys: Object.keys(draft).length,
        prevKeys: Object.keys(prev).length,
      });
    }
  );
}

// === Narrow selector hooks (3.4) — preferred consumption pattern for islands ===
// These give components fine-grained reactivity. Only the component re-renders
// when the selected slice actually changes (thanks to subscribeWithSelector + zustand's equality).

export const useAssignments = () =>
  useShiftBuilderStore((state) => state.assignments);

export const useDraftAssignments = () =>
  useShiftBuilderStore((state) => state.draftAssignments);

// Convenience: get current draft for a specific slot (used by cards)
export const useDraftForSlot = (slotKey: string) =>
  useShiftBuilderStore((state) => state.draftAssignments[slotKey]);

// Roster UI selectors (3.4) — RosterRail now subscribes narrowly to only what it renders
export const useRosterSectionExpanded = (key: keyof ShiftBuilderState['rosterUI']['expanded']) =>
  useShiftBuilderStore((state) => state.rosterUI.expanded[key]);

export const useGraveOnly = () =>
  useShiftBuilderStore((state) => state.rosterUI.graveOnly);

export const useRosterSearch = () =>
  useShiftBuilderStore((state) => state.rosterUI.rosterSearch);

export const useAuxDefs = () =>
  useShiftBuilderStore((state) => state.auxDefs);

// AI Lab narrow selectors
export const useEngineAnalyses = () =>
  useShiftBuilderStore((state) => state.engineAnalyses);

export const useHumanFeedback = () =>
  useShiftBuilderStore((state) => state.humanFeedback);

export const useTrainingExamples = () =>
  useShiftBuilderStore((state) => state.trainingExamples);

export const useLiveEngineConfigForAI = () =>
  useShiftBuilderStore((state) => state.liveEngineConfigForAI);

export const useAiSessionUsage = () =>
  useShiftBuilderStore((state) => state.aiSessionUsage);

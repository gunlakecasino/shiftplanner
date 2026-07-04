// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';
import {
  estimateAiCostUsd,
  hydrateAiUsageGlobals,
  recordAiUsageEvent,
} from '@/lib/shiftbuilder/aiUsageTracker';
import type { AuxDef } from '@/lib/shiftbuilder/placement';
// EngineRunPhase type - using string union for store to avoid circular import issues in this slice
type EngineRunPhase = "idle" | "running" | "complete";
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
      pmOverlaps: boolean;
      amOverlaps: boolean;
      porters: boolean;
      scheduledGraves: boolean;
      scheduledPM: boolean;
      scheduledAM: boolean;
      placed: boolean;
    };
    graveOnly: boolean;
    rosterSearch: string;
  };
  setRosterSectionExpanded: (key: keyof ShiftBuilderState['rosterUI']['expanded'], value: boolean) => void;
  setGraveOnly: (v: boolean) => void;
  setRosterSearch: (v: string) => void;

  // Short-lived pending drag state (used to keep source cards stable during reassignment)
  pendingDrag: null | {
    fromSlot: string;
    tmId: string;
    tmName: string;
  };
  setPendingDrag: (drag: ShiftBuilderState['pendingDrag']) => void;

  // Draft mode state moved to store for narrow subscription (Phase 1/3 consistency)
  isDraftMode: boolean;
  setIsDraftMode: (v: boolean) => void;

  // Draft UI state for narrow subscriptions (world-class: only Why panel, buttons etc re-render)
  draftBreakdown: Record<string, any>;
  setDraftBreakdown: (b: Record<string, any>) => void;
  draftGrokReasoning: Record<string, any>;
  setDraftGrokReasoning: (r: Record<string, any>) => void;
  draftGrokExplanation: string;
  setDraftGrokExplanation: (e: string) => void;
  draftEngineWarnings: string[];
  setDraftEngineWarnings: (w: string[]) => void;
  /** Structured unified-engine reasoning for the Thought Process panel (null = hidden). */
  engineThoughtProcess: any | null;
  setEngineThoughtProcess: (t: any | null) => void;

  engineRunPhase: EngineRunPhase;
  setEngineRunPhase: (p: EngineRunPhase) => void;

  // auxDefs moved to store for narrow subscription in Board/cards (changes infrequently but reduces prop surface)
  auxDefs: AuxDef[];
  setAuxDefs: (updater: AuxDef[] | ((prev: AuxDef[]) => AuxDef[])) => void;

  // More UI chrome moved to store (Phase 3/4 continuation) for narrow updates on view/break changes
  currentView: "deployment" | "breaks" | "weekly";
  setCurrentView: (v: "deployment" | "breaks" | "weekly") => void;

  breakGroup: any; // ActiveBreakGroupFilter | null
  setBreakGroup: (g: any) => void;

  // Week lens UI state moved to store for narrow updates (affects WeeklyOverview, health, AI suggestions)
  weekLensFilters: Set<string>;
  setWeekLensFilters: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  weekLensSearch: string;
  setWeekLensSearch: (v: string) => void;
  weekLensSidebarOpen: boolean;
  setWeekLensSidebarOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Week health tracker dismissed state (persisted, narrow)
  isWeekHealthTrackerDismissed: boolean;
  setIsWeekHealthTrackerDismissed: (v: boolean) => void;

  // Engine / scoring data for narrow subs and better ownership (refinement from debug)
  engineConfig: any | null;
  setEngineConfig: (cfg: any | null) => void;
  scoringData: {
    skillScores: Map<string, number>;
    slotDifficulty: Map<string, number>;
    // ... other maps as needed
  };
  setScoringData: (partial: any) => void;

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
        pmOverlaps: false,
        amOverlaps: false,
        porters: false,
        scheduledGraves: true,
        scheduledPM: true,
        scheduledAM: true,
        placed: false,
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

    currentView: (typeof window !== 'undefined' ? (localStorage.getItem("oms_current_view") as any) : null) || "deployment",
    setCurrentView: (v: any) =>
      set((state) => ({
        currentView: typeof v === 'function' ? v(state.currentView) : v,
      })),

    breakGroup: null,
    setBreakGroup: (g) => set({ breakGroup: g }),

    weekLensFilters: new Set<string>(),
    setWeekLensFilters: (updater) =>
      set((state) => ({
        weekLensFilters: typeof updater === 'function' ? updater(state.weekLensFilters) : updater,
      })),
    weekLensSearch: '',
    setWeekLensSearch: (v) => set({ weekLensSearch: v }),
    weekLensSidebarOpen: true,
    setWeekLensSidebarOpen: (v: any) =>
      set((state) => ({
        weekLensSidebarOpen: typeof v === 'function' ? v(state.weekLensSidebarOpen) : v,
      })),

    isWeekHealthTrackerDismissed: (typeof window !== 'undefined' && localStorage.getItem("oms_week_health_tracker_dismissed") === "false") ? false : true,
    setIsWeekHealthTrackerDismissed: (v: boolean) => {
      set({ isWeekHealthTrackerDismissed: v });
      try {
        localStorage.setItem("oms_week_health_tracker_dismissed", v ? "true" : "false");
      } catch {}
    },

    engineConfig: null,
    setEngineConfig: (cfg) => set({ engineConfig: cfg }),
    scoringData: { skillScores: new Map(), slotDifficulty: new Map() },
    setScoringData: (partial) => set((s) => ({ scoringData: { ...s.scoringData, ...partial } })),

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
    // Now model-aware costing (build/fast cheaper). Tracks both session and 30d (via record). Target ~100k tok/day.
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
        const costDelta = estimateAiCostUsd(inputTokens, outputTokens, model);
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

    // Short-lived pending drag state to prevent mid-gesture mutation of source cards.
    // This is the #1 root cause of assigned TM drag being unreliable compared to tasks.
    pendingDrag: null as null | {
      fromSlot: string;
      tmId: string;
      tmName: string;
    },

    liveEngineConfigForAI: null,
    setLiveEngineConfigForAI: (cfg) => set({ liveEngineConfigForAI: cfg }),

    setPendingDrag: (drag) => set({ pendingDrag: drag }),

    // Draft mode
    isDraftMode: false,
    setIsDraftMode: (v) => set({ isDraftMode: v }),

    draftBreakdown: {},
    setDraftBreakdown: (b) => set({ draftBreakdown: b }),
    draftGrokReasoning: {},
    setDraftGrokReasoning: (r) => set({ draftGrokReasoning: r }),
    draftGrokExplanation: "",
    setDraftGrokExplanation: (e) => set({ draftGrokExplanation: e }),
    draftEngineWarnings: [],
    setDraftEngineWarnings: (w) => set({ draftEngineWarnings: w }),
    engineThoughtProcess: null,
    setEngineThoughtProcess: (t) => set({ engineThoughtProcess: t }),

    engineRunPhase: "idle" as EngineRunPhase,
    setEngineRunPhase: (p: EngineRunPhase) => set({ engineRunPhase: p }),
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
// Use bare process.env.NODE_ENV — Next/Turbopack inlines this at build time
// without pulling the runtime process polyfill (avoids "module factory not available"
// errors on large client chunks in dev, especially on iPad/Safari).
if (process.env.NODE_ENV === 'development') {
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
  useShiftBuilderStore(useShallow((state) => state.assignments));

export const useDraftAssignments = () =>
  useShiftBuilderStore(useShallow((state) => state.draftAssignments));

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

// === Narrow derived selectors for ultra-responsive narrow updates ===
// These allow header badges, status, and other islands to subscribe only to
// the derived values they need instead of full assignments or local memos in
// the giant orchestrator. Promotes consistency + reduces re-render surface.
//
// IMPORTANT: For selectors that return new objects/arrays/sets, we pass a
// custom equality function (shallow or setsAreEqual). This prevents
// "getSnapshot should be cached to avoid an infinite loop" warnings from
// useSyncExternalStore (used internally by Zustand).



export const useBreakCounts = () =>
  useShiftBuilderStore(
    useShallow((state) => {
      const counts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      Object.entries(state.assignments || {}).forEach(([slotKey, a]: [string, any]) => {
        if (!a?.tmId && !a?.tmName) return;
        if (slotKey.startsWith("OL-")) return;
        const g = (a.breakGroup ?? 0) as number;
        // Off-the-sheet (0) intentionally excluded; 4 = overlaps wave
        if (g === 1) counts[1]++;
        else if (g === 2) counts[2]++;
        else if (g === 3) counts[3]++;
        else if (g === 4) counts[4]++;
      });
      return counts;
    })
  );

export const useInRotationCount = () =>
  useShiftBuilderStore((state) => {
    let sum = 0;
    Object.entries(state.assignments || {}).forEach(([slotKey, a]: [string, any]) => {
      if (!a?.tmId && !a?.tmName) return;
      if (slotKey.startsWith("OL-")) return;
      const g = (a.breakGroup ?? 0) as number;
      if (g >= 1 && g <= 4) sum++;
    });
    return sum;
  });

export const useHasPlacedAssignments = () =>
  useShiftBuilderStore((state) =>
    Object.values(state.assignments || {}).some((a: any) => !!(a?.tmId || a?.tmName))
  );

export const usePlacedTmIds = () =>
  useShiftBuilderStore(
    useShallow((state) => {
      const ids: string[] = [];
      Object.values(state.assignments || {}).forEach((a: any) => {
        if (a?.tmId) ids.push(a.tmId);
      });
      return ids.sort(); // return sorted array for stable shallow comparison with useShallow
    })
  );

export const useIsDraftMode = () =>
  useShiftBuilderStore((state) => state.isDraftMode);

export const useSetIsDraftMode = () =>
  useShiftBuilderStore((state) => state.setIsDraftMode);

export const useDraftBreakdown = () =>
  useShiftBuilderStore(useShallow((state) => state.draftBreakdown));

export const useDraftGrokReasoning = () =>
  useShiftBuilderStore(useShallow((state) => state.draftGrokReasoning));

export const useDraftGrokExplanation = () =>
  useShiftBuilderStore((state) => state.draftGrokExplanation);

export const useDraftEngineWarnings = () =>
  useShiftBuilderStore(useShallow((state) => state.draftEngineWarnings));

export const useEngineThoughtProcess = () =>
  useShiftBuilderStore((state) => state.engineThoughtProcess);
export const useSetEngineThoughtProcess = () =>
  useShiftBuilderStore((state) => state.setEngineThoughtProcess);

export const useEngineRunPhase = () =>
  useShiftBuilderStore((state) => state.engineRunPhase ?? "idle");

export const useSetEngineRunPhase = () =>
  useShiftBuilderStore((state) => state.setEngineRunPhase ?? (() => {}));

export const useSetDraftBreakdown = () =>
  useShiftBuilderStore((state) => state.setDraftBreakdown);

export const useCurrentView = () =>
  useShiftBuilderStore((state) => state.currentView);

export const useSetCurrentView = () =>
  useShiftBuilderStore((state) => state.setCurrentView);

export const useBreakGroup = () =>
  useShiftBuilderStore((state) => state.breakGroup);

export const useSetBreakGroup = () =>
  useShiftBuilderStore((state) => state.setBreakGroup);

export const useWeekLensFilters = () =>
  useShiftBuilderStore(useShallow((state) => state.weekLensFilters));

export const useSetWeekLensFilters = () =>
  useShiftBuilderStore((state) => state.setWeekLensFilters);

export const useWeekLensSearch = () =>
  useShiftBuilderStore((state) => state.weekLensSearch);

export const useSetWeekLensSearch = () =>
  useShiftBuilderStore((state) => state.setWeekLensSearch);

export const useWeekLensSidebarOpen = () =>
  useShiftBuilderStore((state) => state.weekLensSidebarOpen);

export const useSetWeekLensSidebarOpen = () =>
  useShiftBuilderStore((state) => state.setWeekLensSidebarOpen) as (v: boolean | ((prev: boolean) => boolean)) => void;

export const useIsWeekHealthTrackerDismissed = () =>
  useShiftBuilderStore((state) => state.isWeekHealthTrackerDismissed);

export const useSetIsWeekHealthTrackerDismissed = () =>
  useShiftBuilderStore((state) => state.setIsWeekHealthTrackerDismissed);

export const useEngineConfig = () =>
  useShiftBuilderStore((state) => state.engineConfig);

export const useSetEngineConfig = () =>
  useShiftBuilderStore((state) => state.setEngineConfig);

export const useScoringData = () =>
  useShiftBuilderStore((state) => state.scoringData);

export const useSetDraftGrokReasoning = () =>
  useShiftBuilderStore((state) => state.setDraftGrokReasoning);

export const useSetDraftGrokExplanation = () =>
  useShiftBuilderStore((state) => state.setDraftGrokExplanation);

export const useSetDraftEngineWarnings = () =>
  useShiftBuilderStore((state) => state.setDraftEngineWarnings);

export const useSetDraftAssignments = () =>
  useShiftBuilderStore((state) => state.setDraftAssignments);

"use client";

import React from "react";
import type { EngineRunPhase, CoverageEngineRunOptions } from "../components/CanvasEngineCluster";
import type { SlotRanking } from "@/lib/shiftbuilder/placement";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import { useConfirm } from "../components/ConfirmDialog";

/**
 * useEngineRunner
 *
 * Manages "Run Engine" / Optimize Night (Full: planner+opt+AI) phase and draft entry.
 *
 * See notes in timefoldLocalSolver.ts and engine/index.ts on how this relates
 * The single Optimize Night path (full placements + optimization). Week uses the same engine core.
 */
export interface UseEngineRunnerParams {
  // Pure helpers (passed from orchestrator to avoid duplication)
  buildTmLookupIndex: (roster: any[]) => any;
  resolveTmFromLookup: (lookup: any, tmId: string) => any;
  boardTmId: (tm: any) => string;
  startHeavyTransition: (fn: () => void) => void;
  // For toasts and guards
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  canRunEngine?: boolean;
  isCurrentNightLocked?: boolean;
}

export interface UseEngineRunnerReturn {
  engineRunPhase: EngineRunPhase;
  setEngineRunPhase: (phase: EngineRunPhase) => void;
  runCoverageEngineRef: React.MutableRefObject<(options?: CoverageEngineRunOptions) => Promise<void>>;
  enterDraftMode: (options?: CoverageEngineRunOptions) => Promise<void>;
  applyPlannerResultAsDraft: (
    result: { proposedAssignments: Record<string, string>; breakdown: Record<string, SlotRanking> },
    rosterForLookup: any[],
    reasoningBySlot: Record<string, { source: "engine" | "grok"; reason?: string }>,
    grokExplanation?: string,
    warnings?: string[]
  ) => void;
  runXaiEngineFromCanvas?: () => void;
  // Unified draft commit surface (step 2)
  discardDraft: () => Promise<void>;
  upsertDraftSlot: (slotKey: string, update: { kind: "assign"; tmId: string; tmName: string } | { kind: "clear" }) => void;
  applyDraftMoveOrSwap: (
    fromKey: string,
    toKey: string,
    moving: { tmId: string; tmName: string } | null,
    displaced: { tmId: string; tmName: string } | null,
  ) => void;
  buildFinalAssignmentsFromDraft?: (draftEntries: [string, any][], currentAssignments: Record<string, any>) => Record<string, any>;
}

export function useEngineRunner(params: UseEngineRunnerParams): UseEngineRunnerReturn {
  const {
    buildTmLookupIndex,
    resolveTmFromLookup,
    boardTmId,
    startHeavyTransition,
    showToast,
    canRunEngine,
    isCurrentNightLocked,
  } = params;

  const confirm = useConfirm();
  const [engineRunPhase, setEngineRunPhase] = React.useState<EngineRunPhase>("idle");
  const runCoverageEngineRef = React.useRef<(options?: CoverageEngineRunOptions) => Promise<void>>(
    async () => {}
  );

  /**
   * Applies planner/Grok result to draft state (moved here for decomposition).
   * Uses startHeavyTransition for responsiveness.
   */
  const applyPlannerResultAsDraft = (
    result: { proposedAssignments: Record<string, string>; breakdown: Record<string, SlotRanking> },
    rosterForLookup: any[],
    reasoningBySlot: Record<string, { source: "engine" | "grok"; reason?: string }>,
    grokExplanation: string = "",
    warnings: string[] = []
  ) => {
    const lookup = buildTmLookupIndex(rosterForLookup);
    const newDraft: Record<string, any> = {};
    Object.entries(result.proposedAssignments).forEach(([slotKey, tmId]) => {
      const current = {} as any; // caller can enhance if needed; simplified for hook
      const currentTmId = current?.tmId;

      if (!tmId) {
        if (currentTmId) {
          newDraft[slotKey] = {
            proposedTmId: "",
            proposedTmName: "",
            previousTmId: currentTmId,
            previousTmName: current?.tmName,
            proposedClear: true,
          };
        }
        return;
      }

      const tm = resolveTmFromLookup(lookup, tmId);
      if (!tm) return;

      const boardId = boardTmId(tm);
      if (currentTmId === boardId) return;

      newDraft[slotKey] = {
        proposedTmId: boardId,
        proposedTmName: tm.name || tm.fullName || boardId,
        previousTmId: currentTmId,
        previousTmName: current?.tmName,
      };
    });
    startHeavyTransition(() => {
      useShiftBuilderStore.getState().setDraftAssignments(newDraft);
      useShiftBuilderStore.getState().setDraftBreakdown(result.breakdown);
      useShiftBuilderStore.getState().setDraftGrokReasoning(reasoningBySlot);
      useShiftBuilderStore.getState().setDraftGrokExplanation(grokExplanation);
      useShiftBuilderStore.getState().setDraftEngineWarnings(warnings);
      useShiftBuilderStore.getState().setIsDraftMode(true);
    });
  };

  const enterDraftMode = async (options?: CoverageEngineRunOptions) => {
    await runCoverageEngineRef.current(options);
  };

  // Basic privileged run wrapper (can be enhanced)
  const runXaiEngineFromCanvas = React.useCallback(() => {
    if (!canRunEngine) {
      showToast("Insufficient privileges — you cannot run the engine", "error");
      return;
    }
    if (isCurrentNightLocked) {
      showToast("This day is locked — engine cannot run", "error");
      return;
    }
    void enterDraftMode({
      forceXai: true,
      useTools: true,
      confirmMessage:
        "Run the xAI coverage engine for tonight? Weighted planner scores the board, then xAI uses engine rules, Graves Default Schedule, and rotation fit to propose a draft (nothing saves until you apply).",
    });
  }, [canRunEngine, isCurrentNightLocked, enterDraftMode, showToast]);

  // === Draft lifecycle helpers moved here for full unification (step 2) ===
  // These use direct store for narrow updates. applyDraft (the commit with guard + history + DB) stays in Client for now
  // due to heavy coupling (selectedDay, nightId, shiftData, history record, etc.) but upsert/discard/move are here.
  const discardDraft = async () => {
    const store = useShiftBuilderStore.getState();
    if (!store.isDraftMode) return;
    const ok = await confirm("Unsaved placement changes will be lost.", {
      title: "Discard the current draft?",
      confirmLabel: "Discard",
      tone: "danger",
    });
    if (!ok) return;
    store.setIsDraftMode(false);
    store.clearDraft();
  };

  const upsertDraftSlot = (
    slotKey: string,
    update: { kind: "assign"; tmId: string; tmName: string } | { kind: "clear" },
  ) => {
    const store = useShiftBuilderStore.getState();
    const committed = store.assignments ?? {};
    const prev = store.draftAssignments;
    const existingDraft = prev[slotKey];
    const baseline = committed[slotKey];
    const previousTmId = existingDraft?.previousTmId ?? baseline?.tmId;
    const previousTmName = existingDraft?.previousTmName ?? baseline?.tmName;
    const next = { ...prev };

    if (update.kind === "clear") {
      if (!baseline?.tmId && !(existingDraft?.proposedTmId && !existingDraft.proposedClear)) {
        delete next[slotKey];
      } else {
        next[slotKey] = {
          proposedTmId: "",
          proposedTmName: "",
          previousTmId,
          previousTmName,
          proposedClear: true,
        };
      }
    } else {
      const { tmId, tmName } = update;
      if (tmId === baseline?.tmId) {
        delete next[slotKey];
      } else {
        next[slotKey] = {
          proposedTmId: tmId,
          proposedTmName: tmName,
          previousTmId,
          previousTmName,
        };
      }
    }

    store.setDraftAssignments(next);
  };

  const applyDraftMoveOrSwap = (
    fromKey: string,
    toKey: string,
    moving: { tmId: string; tmName: string } | null,
    displaced: { tmId: string; tmName: string } | null,
  ) => {
    const store = useShiftBuilderStore.getState();
    const committed = store.assignments ?? {};
    const next = { ...store.draftAssignments };

    const patchSlot = (key: string, tmId: string | null, tmName: string | null) => {
      const existingDraft = next[key];
      const baseline = committed[key];
      const previousTmId = existingDraft?.previousTmId ?? baseline?.tmId;
      const previousTmName = existingDraft?.previousTmName ?? baseline?.tmName;

      if (!tmId) {
        if (!baseline?.tmId && !(existingDraft?.proposedTmId && !existingDraft?.proposedClear)) {
          delete next[key];
        } else {
          next[key] = { proposedTmId: "", proposedTmName: "", previousTmId, previousTmName, proposedClear: true };
        }
      } else {
        if (tmId === baseline?.tmId) {
          delete next[key];
        } else {
          next[key] = { proposedTmId: tmId, proposedTmName: tmName || tmId, previousTmId, previousTmName };
        }
      }
    };

    if (moving) patchSlot(toKey, moving.tmId, moving.tmName);
    if (displaced) patchSlot(fromKey, displaced.tmId, displaced.tmName);
    else if (moving) patchSlot(fromKey, null, null);

    store.setDraftAssignments(next);
  };

  const buildFinalAssignmentsFromDraft = (
    draftEntries: [string, any][],
    currentAssignments: Record<string, any>,
  ) => {
    const slotTypeForUiKey = (slotKey: string) =>
      slotKey.startsWith("Z")
        ? "zone"
        : slotKey.startsWith("MRR") || slotKey.startsWith("WRR")
          ? "rr"
          : slotKey.startsWith("OL-")
            ? "overlap"
            : "aux";

    const newAssignments: Record<string, any> = { ...currentAssignments };
    for (const [slotKey, info] of draftEntries) {
      if (info.proposedClear) {
        delete newAssignments[slotKey];
      } else if (info.proposedTmId) {
        newAssignments[slotKey] = {
          ...newAssignments[slotKey],
          tmId: info.proposedTmId,
          tmName: info.proposedTmName,
          breakGroup: newAssignments[slotKey]?.breakGroup ?? 0,
          type: slotTypeForUiKey(slotKey),
          slotKey,
        };
      }
    }
    return newAssignments;
  };

  return {
    engineRunPhase,
    setEngineRunPhase,
    runCoverageEngineRef,
    enterDraftMode,
    applyPlannerResultAsDraft,
    runXaiEngineFromCanvas,
    // New unified draft helpers
    discardDraft,
    upsertDraftSlot,
    applyDraftMoveOrSwap,

    buildFinalAssignmentsFromDraft,
  };
}

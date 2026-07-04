"use client";

import * as React from "react";
import { runLocalDeepOptimize } from "@/lib/shiftbuilder/timefold/timefoldLocalSolver";
import type {
  TimefoldProgressTick,
  TimefoldRunInput,
  TimefoldRunPhase,
  TimefoldRunResult,
} from "@/lib/shiftbuilder/timefold/timefoldTypes";

/**
 * useTimefoldOptimize
 *
 * Owns the Optimize Tonight run lifecycle only — starting,
 * ticking progress, landing on results, cancelling. It deliberately does NOT
 * know how to apply a proposal to Draft Mode; that's ShiftBuilderClient's
 * applyTimefoldProposal (same shape as applyGrokSuggestions), kept in the
 * orchestrator since it needs assignments/auxDefs/history-recording context
 * this hook shouldn't be coupled to.
 *
 * Backed by timefoldLocalSolver.ts — a real in-process optimizer over the
 * live board (coverage > rotation > preferences > skill). When a true
 * Timefold service exists, swap the implementation of `start` to call it
 * instead — the phase/tick/result contract matches a real async progress
 * stream (SSE/poll) without changing any consuming component.
 */
export interface UseTimefoldOptimizeReturn {
  phase: TimefoldRunPhase;
  tick: TimefoldProgressTick | null;
  result: TimefoldRunResult | null;
  errorMessage: string | null;
  start: (input: TimefoldRunInput) => void;
  cancel: () => void;
  /** Close overlay/sheet and return to idle (e.g. after import completes). */
  reset: () => void;
  markImporting: () => void;
  markImported: () => void;
}

export function useTimefoldOptimize(): UseTimefoldOptimizeReturn {
  const [phase, setPhase] = React.useState<TimefoldRunPhase>("idle");
  const [tick, setTick] = React.useState<TimefoldProgressTick | null>(null);
  const [result, setResult] = React.useState<TimefoldRunResult | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const cancelRunRef = React.useRef<(() => void) | null>(null);

  const start = React.useCallback((input: TimefoldRunInput) => {
    cancelRunRef.current?.();
    setErrorMessage(null);
    setResult(null);
    setTick(null);
    setPhase("running");

    cancelRunRef.current = runLocalDeepOptimize(input, {
      onTick: (nextTick) => setTick(nextTick),
      onDone: (nextResult) => {
        cancelRunRef.current = null;
        setResult(nextResult);
        setPhase("results");
      },
      onError: (message) => {
        cancelRunRef.current = null;
        setErrorMessage(message);
        setPhase("error");
      },
    });
  }, []);

  const cancel = React.useCallback(() => {
    cancelRunRef.current?.();
    cancelRunRef.current = null;
    setPhase("idle");
    setTick(null);
  }, []);

  const reset = React.useCallback(() => {
    cancelRunRef.current?.();
    cancelRunRef.current = null;
    setPhase("idle");
    setTick(null);
    setResult(null);
    setErrorMessage(null);
  }, []);

  const markImporting = React.useCallback(() => setPhase("importing"), []);
  const markImported = React.useCallback(() => setPhase("imported"), []);

  React.useEffect(() => {
    return () => {
      cancelRunRef.current?.();
    };
  }, []);

  return { phase, tick, result, errorMessage, start, cancel, reset, markImporting, markImported };
}

"use client";

/**
 * useShiftCompletion
 *
 * Thin wrapper around Vercel AI SDK's `useCompletion` that:
 *  - Targets the correct /api/complete/[surface] endpoint
 *  - Debounces requests so we don't fire on every keystroke
 *  - Passes structured shift context with each request
 *  - Exposes `ghostText` (the current suggestion) and `accept()` (Tab handler)
 *  - Clears the ghost text automatically when the user keeps typing past it
 *
 * Usage:
 *   const { ghostText, handleChange, accept, inputProps } = useShiftCompletion({
 *     surface: "notes",
 *     context: { day: "Friday", assignments, scheduledUnplaced },
 *   });
 */

import { useCompletion } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompletionSurface = "notes" | "command" | "recap";

export interface ShiftCompletionContext {
  day?: string;
  assignments?: Record<string, { tmId?: string; tmName?: string }>;
  scheduledUnplaced?: string[];
  loggedEvents?: string[];
}

interface UseShiftCompletionOptions {
  surface: CompletionSurface;
  context?: ShiftCompletionContext;
  /** Debounce delay in ms. Defaults: command=250, notes=400, recap=500 */
  debounceMs?: number;
  /** Disable the feature entirely (e.g. when offline or during draft mode) */
  disabled?: boolean;
  /** Called when the user accepts a suggestion (Tab key) */
  onAccept?: (acceptedText: string) => void;
}

interface UseShiftCompletionReturn {
  /** The current ghost-text suggestion (only the *appended* fragment) */
  ghostText: string;
  /** Call this with the current textarea/input value on every change */
  handleChange: (value: string) => void;
  /** Accept the current suggestion — call from your Tab key handler */
  accept: () => string;
  /** True while a network request is in-flight */
  isLoading: boolean;
  /** Clear the current ghost text (e.g. on Escape) */
  dismiss: () => void;
}

// ─── Debounce delay defaults per surface ─────────────────────────────────────

const DEFAULT_DEBOUNCE: Record<CompletionSurface, number> = {
  command: 250,
  notes: 400,
  recap: 500,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useShiftCompletion({
  surface,
  context = {},
  debounceMs,
  disabled = false,
  onAccept,
}: UseShiftCompletionOptions): UseShiftCompletionReturn {
  const delay = debounceMs ?? DEFAULT_DEBOUNCE[surface];

  // The last value we sent to the API — lets us detect stale completions.
  const lastSentRef = useRef<string>("");
  // The current editor value (updated synchronously on every keystroke).
  const currentValueRef = useRef<string>("");
  // Debounce timer.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serialized context — used as a stable body param.
  const contextRef = useRef(context);
  contextRef.current = context;

  const [ghostText, setGhostText] = useState<string>("");

  const { complete, completion, isLoading, setCompletion } = useCompletion({
    api: `/api/complete/${surface}`,
    // Inject structured context alongside the prompt.
    body: { context: contextRef.current },
    onFinish: (_prompt, fullCompletion) => {
      // Only surface the ghost text if the editor value still matches
      // what we sent — discard stale completions from fast typists.
      if (currentValueRef.current === lastSentRef.current) {
        // Strip any leading whitespace the model added (we add a space ourselves).
        const trimmed = fullCompletion.trimStart();
        setGhostText(trimmed);
      } else {
        setGhostText("");
      }
    },
    onError: () => {
      setGhostText("");
    },
  });

  // Keep streaming ghost text live (partial renders).
  useEffect(() => {
    if (!isLoading) return;
    if (currentValueRef.current !== lastSentRef.current) {
      setGhostText("");
      return;
    }
    const trimmed = completion.trimStart();
    setGhostText(trimmed);
  }, [completion, isLoading]);

  const handleChange = useCallback(
    (value: string) => {
      currentValueRef.current = value;

      // Ghost text is only valid while the editor matches exactly what we
      // sent to the API. Any change (forward or backward) invalidates it.
      if (ghostText && value !== lastSentRef.current) {
        setGhostText("");
        setCompletion("");
      }

      if (disabled) return;

      // Cancel any pending debounce.
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      // Don't fire for very short inputs.
      if (value.trim().length < 3) {
        setGhostText("");
        return;
      }

      debounceTimerRef.current = setTimeout(() => {
        lastSentRef.current = value;
        complete(value, { body: { context: contextRef.current } });
      }, delay);
    },
    [complete, delay, disabled, ghostText, setCompletion]
  );

  const accept = useCallback((): string => {
    if (!ghostText) return currentValueRef.current;
    const accepted = currentValueRef.current + ghostText;
    setGhostText("");
    setCompletion("");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    onAccept?.(accepted);
    return accepted;
  }, [ghostText, onAccept, setCompletion]);

  const dismiss = useCallback(() => {
    setGhostText("");
    setCompletion("");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, [setCompletion]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return { ghostText, handleChange, accept, isLoading, dismiss };
}

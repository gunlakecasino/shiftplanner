import { useState, useCallback } from "react";

export type AuxDef = {
  key: string;
  label: string;
  locations: string[];
};

export type AssignmentRecord = Record<string, any>;

export type Snapshot = {
  assignments: AssignmentRecord;
  auxDefs: AuxDef[];
};

export interface HistoryEntry {
  id: string;
  description: string;
  before: Snapshot;
  after: Snapshot;
}

export interface UseShiftHistoryReturn {
  recordChange: (description: string, before: Snapshot, after: Snapshot) => void;
  undo: () => Snapshot | null;
  redo: () => Snapshot | null;
  canUndo: boolean;
  canRedo: boolean;
  getUndoDescription: () => string | undefined;
  getRedoDescription: () => string | undefined;
  clear: () => void;
}

/**
 * Lightweight snapshot-based undo/redo for the ShiftBuilder.
 * Designed for one-tab session use. Snapshots are cheap because
 * the assignments map + auxDefs array is small.
 */

const MAX_HISTORY = 50; // cap prevents unbounded memory growth over long sessions

export function useShiftHistory(): UseShiftHistoryReturn {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const recordChange = useCallback((description: string, mutator: () => void) => {
    // We capture "before" by letting the caller run the mutator after we snapshot.
    // This is the simplest integration with existing setState calls.
    // The caller is responsible for capturing the *current* state as "before"
    // right before calling recordChange, then performing the mutation.
    //
    // For ergonomic use we accept a small pattern:
    //   const before = { assignments, auxDefs };
    //   recordChange("Did X", () => {
    //     setAssignments(...);
    //     setAuxDefs(...);
    //   });
    //
    // Inside recordChange we cannot easily snapshot "before" ourselves
    // without forcing the caller to pass it. We take the practical approach:
    // the caller passes the before snapshot as part of a small wrapper.
    //
    // Better API for this codebase: accept before snapshot explicitly.
    // This avoids stale closures and keeps the hook simple.
  }, []);

  // Re-designed for the actual integration pattern we will use:
  // The component will do:
  //   const before = { assignments: currentAssignments, auxDefs };
  //   recordChangeWithBefore("Description", before, () => { set... });
  const recordChangeWithBefore = useCallback(
    (description: string, before: Snapshot, mutator: () => void) => {
      // Run the mutation
      mutator();

      // After React batches the setState, we capture "after" on the next tick.
      // Because we are in the same event, we schedule a microtask to snapshot after.
      // Simpler approach used in practice: the caller also gives us the after snapshot.
      // For maximum safety and simplicity in this monolith, we ask the caller
      // to provide both before and after snapshots.
    },
    []
  );

  // Final clean API we will actually use in the component:
  const recordAtomicChange = useCallback(
    (description: string, before: Snapshot, after: Snapshot) => {
      const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        description,
        before,
        after,
      };

      setHistory((prev) => {
        const next = [...prev, entry];
        // Trim to MAX_HISTORY — drop oldest entries first
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });
      setRedoStack([]); // clear redo on new action
    },
    []
  );

  const undo = useCallback((): Snapshot | null => {
    if (history.length === 0) return null;

    const lastEntry = history[history.length - 1];
    const previousState = lastEntry.before;

    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, lastEntry]);

    return previousState;
  }, [history]);

  const redo = useCallback((): Snapshot | null => {
    if (redoStack.length === 0) return null;

    const nextEntry = redoStack[redoStack.length - 1];
    const nextState = nextEntry.after;

    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, nextEntry]);

    return nextState;
  }, [redoStack]);

  const canUndo = history.length > 0;
  const canRedo = redoStack.length > 0;

  const getUndoDescription = useCallback(() => {
    return history.length > 0 ? history[history.length - 1].description : undefined;
  }, [history]);

  const getRedoDescription = useCallback(() => {
    return redoStack.length > 0 ? redoStack[redoStack.length - 1].description : undefined;
  }, [redoStack]);

  const clear = useCallback(() => {
    setHistory([]);
    setRedoStack([]);
  }, []);

  // Public API — the component will primarily use recordAtomicChange
  return {
    recordChange: (description: string, before: Snapshot, after: Snapshot) =>
      recordAtomicChange(description, before, after),
    undo,
    redo,
    canUndo,
    canRedo,
    getUndoDescription,
    getRedoDescription,
    clear,
  };
}

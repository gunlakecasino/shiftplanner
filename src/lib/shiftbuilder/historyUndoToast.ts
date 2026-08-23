/**
 * iPad covering-operator undo: one Sonner toast that replays the existing
 * in-memory history snapshot. Same path as Cmd/Ctrl+Z — no second stack,
 * no history table.
 */
import { toast } from "sonner";

export const HISTORY_UNDO_TOAST_ID = "sheetbuilder-history-undo";

export function offerHistoryUndoToast(message: string, onUndo: () => void): void {
  toast(message, {
    id: HISTORY_UNDO_TOAST_ID,
    duration: 7000,
    action: {
      label: "Undo",
      onClick: onUndo,
    },
  });
}

export function dismissHistoryUndoToast(): void {
  toast.dismiss(HISTORY_UNDO_TOAST_ID);
}

/**
 * Shared undo entry used by both the toast action and the keyboard handler.
 * Gate on `busy` before popping the stack so a second trigger cannot consume
 * the next snapshot while the first persist is in flight (no double-undo).
 */
export function runSharedHistoryUndo<TSnapshot>(opts: {
  busy: boolean;
  undo: () => TSnapshot | null;
  apply: (snapshot: TSnapshot, label: "Undo") => void;
  dismissToast: () => void;
}): boolean {
  if (opts.busy) return false;
  opts.dismissToast();
  const previous = opts.undo();
  if (!previous) return false;
  opts.apply(previous, "Undo");
  return true;
}

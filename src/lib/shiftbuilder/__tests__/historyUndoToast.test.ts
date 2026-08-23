import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock, dismissMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  dismissMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastMock, { dismiss: dismissMock }),
}));

import {
  HISTORY_UNDO_TOAST_ID,
  dismissHistoryUndoToast,
  offerHistoryUndoToast,
  runSharedHistoryUndo,
} from "../historyUndoToast";

describe("historyUndoToast", () => {
  beforeEach(() => {
    toastMock.mockReset();
    dismissMock.mockReset();
  });

  it("offers a Sonner toast whose only action is Undo", () => {
    const onUndo = vi.fn();
    offerHistoryUndoToast("Swapped", onUndo);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [message, options] = toastMock.mock.calls[0];
    expect(message).toBe("Swapped");
    expect(options.id).toBe(HISTORY_UNDO_TOAST_ID);
    expect(options.action.label).toBe("Undo");
    options.action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("dismisses the same toast id the offer uses", () => {
    dismissHistoryUndoToast();
    expect(dismissMock).toHaveBeenCalledWith(HISTORY_UNDO_TOAST_ID);
  });
});

describe("runSharedHistoryUndo", () => {
  it("replays the popped snapshot and dismisses the toast", () => {
    const snapshot = { assignments: { Z1: { tmId: "tm-a" } }, auxDefs: [] };
    const undo = vi.fn(() => snapshot);
    const apply = vi.fn();
    const dismissToast = vi.fn();

    expect(
      runSharedHistoryUndo({
        busy: false,
        undo,
        apply,
        dismissToast,
      }),
    ).toBe(true);

    expect(dismissToast).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(snapshot, "Undo");
  });

  it("does not pop the stack while a persist is in flight", () => {
    const undo = vi.fn();
    const apply = vi.fn();
    const dismissToast = vi.fn();

    expect(
      runSharedHistoryUndo({
        busy: true,
        undo,
        apply,
        dismissToast,
      }),
    ).toBe(false);

    expect(undo).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(dismissToast).not.toHaveBeenCalled();
  });

  it("dismisses a stale toast when the stack is empty without applying", () => {
    const undo = vi.fn(() => null);
    const apply = vi.fn();
    const dismissToast = vi.fn();

    expect(
      runSharedHistoryUndo({
        busy: false,
        undo,
        apply,
        dismissToast,
      }),
    ).toBe(false);

    expect(dismissToast).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });
});

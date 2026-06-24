import {
  beginDayCardContentVeil,
  dayKeyFromSwitchDetail,
  DAY_CONTENT_VEIL_MS,
  prefersReducedMotion,
} from "./dayCardContentVeil";

/** @deprecated Use DAY_CONTENT_VEIL_MS — kept for checklist / drop-in compat. */
export const DAY_SWITCH_DURATION_MS = DAY_CONTENT_VEIL_MS;

export const DAY_SWITCH_EVENT = "sb-day-switch";

export { prefersReducedMotion, dayKeyFromSwitchDetail };

/** Card-inner blur veil — shells stay fixed. */
export function beginDaySwitchBoardTransition(source = "unknown"): void {
  beginDayCardContentVeil({ source });
}

export function dispatchDaySwitchIntent(detail?: {
  source?: string;
  dayKey?: string;
}): void {
  if (typeof window === "undefined") return;

  beginDayCardContentVeil({
    source: detail?.source ?? "intent",
    targetDayKey: detail?.dayKey,
  });

  if (typeof performance !== "undefined" && performance.mark) {
    try {
      performance.mark("day-switch-start", { detail });
    } catch {
      performance.mark("day-switch-start");
    }
  }
}

export function subscribeDaySwitchIntent(
  handler: (detail: { source?: string; dayKey?: string }) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (e: Event) => {
    handler((e as CustomEvent).detail ?? {});
  };
  window.addEventListener(DAY_SWITCH_EVENT, listener);
  return () => window.removeEventListener(DAY_SWITCH_EVENT, listener);
}
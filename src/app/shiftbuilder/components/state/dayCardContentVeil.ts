import {
  getBoardAssignmentsDayKey,
  subscribeBoardAssignmentsDayKey,
} from "@/lib/shiftbuilder/liveCache";

/** Minimum veil hold before reveal — also waits for hydrated assignments.
 *  Held a full 1.75s so a switched-to night has time to load in completely
 *  before the board resolves. */
export const DAY_CONTENT_VEIL_MS = 1750;
const UNBLUR_MS = 220;
/** Hard ceiling if data never hydrates — comfortably past the 1.75s min so a
 *  genuinely slow night still gets to finish loading rather than force-reveal. */
const SAFETY_CAP_MS = 4000;

export const DAY_CONTENT_VEIL_CLASS = "sb-day-content-veil";
export const DAY_CONTENT_READY_CLASS = "sb-day-content-ready";
/** Marks a backward switch (target date earlier than the one on screen) so the
 *  luminous sweep glides the other way. Absent = forward (default). */
export const DAY_VEIL_PREV_CLASS = "sb-day-veil--prev";

const VEIL_ROOT_SELECTOR = ".sb-builder-fluid-viewport";

type VeilTimer = ReturnType<typeof globalThis.setTimeout>;

type VeilSession = {
  targetDayKey: string | null;
  previousDayKey: string | null;
  startAt: number;
  minTimer: VeilTimer | null;
  safetyTimer: VeilTimer | null;
};

let session: VeilSession | null = null;
let unsubscribeDayKey: (() => void) | null = null;
/** The last day we veiled toward = what's on screen now. Used to pick sweep
 *  direction reliably even when the live assignments cache is momentarily null. */
let lastVeilDayKey: string | null = null;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resolveVeilRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(VEIL_ROOT_SELECTOR);
}

export function dayKeyFromSwitchDetail(detail: unknown): string | undefined {
  if (!detail || typeof detail !== "object") return undefined;
  const d = detail as Record<string, unknown>;
  if (typeof d.dayKey === "string") return d.dayKey;
  if (typeof d.date === "string") return d.date.slice(0, 10);
  return undefined;
}

function hasLoadingSkeletons(root: HTMLElement): boolean {
  return !!root.querySelector(".sb-skeleton, .sb-skeleton--ghost");
}

function isAssignmentsReady(
  targetDayKey: string | null,
  previousDayKey: string | null,
): boolean {
  const current = getBoardAssignmentsDayKey();
  if (!current) return false;
  if (targetDayKey) return current === targetDayKey;
  if (previousDayKey && current === previousDayKey) return false;
  return true;
}

function clearSessionTimers() {
  if (!session) return;
  if (session.minTimer) clearTimeout(session.minTimer);
  if (session.safetyTimer) clearTimeout(session.safetyTimer);
  session.minTimer = null;
  session.safetyTimer = null;
}

function finishVeil() {
  const root = resolveVeilRoot();
  clearSessionTimers();
  unsubscribeDayKey?.();
  unsubscribeDayKey = null;
  root?.classList.remove(
    DAY_CONTENT_VEIL_CLASS,
    DAY_CONTENT_READY_CLASS,
    DAY_VEIL_PREV_CLASS,
  );
  session = null;
}

function tryReveal(force = false) {
  if (!session) return;
  const root = resolveVeilRoot();
  if (!root) return;

  const elapsed = Date.now() - session.startAt;
  const timeOk = force || elapsed >= DAY_CONTENT_VEIL_MS;
  const dataOk =
    force ||
    (isAssignmentsReady(session.targetDayKey, session.previousDayKey) &&
      !hasLoadingSkeletons(root));

  if (!timeOk || !dataOk) return;

  clearSessionTimers();
  unsubscribeDayKey?.();
  unsubscribeDayKey = null;

  root.classList.add(DAY_CONTENT_READY_CLASS);
  globalThis.setTimeout(() => finishVeil(), UNBLUR_MS);
}

/**
 * Card shells stay fixed; inner assignment content blurs until max(250ms, data ready).
 */
export function beginDayCardContentVeil(opts?: {
  targetDayKey?: string;
  source?: string;
}): void {
  if (typeof window === "undefined") return;
  if (prefersReducedMotion()) return;

  const root = resolveVeilRoot();
  if (!root) return;

  finishVeil();

  const previousDayKey = getBoardAssignmentsDayKey();
  session = {
    targetDayKey: opts?.targetDayKey ?? null,
    previousDayKey,
    startAt: Date.now(),
    minTimer: null,
    safetyTimer: null,
  };

  // Direction of travel — target earlier than what's on screen sweeps backward.
  // Prefer the last day we veiled toward (reliable across rapid switches); fall
  // back to the live cache. ISO day keys compare lexicographically.
  const referenceDayKey = lastVeilDayKey ?? previousDayKey;
  const goingBack = !!(
    opts?.targetDayKey &&
    referenceDayKey &&
    opts.targetDayKey < referenceDayKey
  );
  if (opts?.targetDayKey) lastVeilDayKey = opts.targetDayKey;

  root.classList.remove(DAY_CONTENT_READY_CLASS, DAY_VEIL_PREV_CLASS);
  // Force a reflow so the sweep animation restarts cleanly on rapid, repeated
  // day switches (a synchronous remove→add otherwise wouldn't re-run it).
  void root.offsetWidth;
  root.classList.add(DAY_CONTENT_VEIL_CLASS);
  root.classList.toggle(DAY_VEIL_PREV_CLASS, goingBack);
  root.setAttribute("data-sb-day-veil-source", opts?.source ?? "unknown");

  session.minTimer = globalThis.setTimeout(() => tryReveal(), DAY_CONTENT_VEIL_MS);

  unsubscribeDayKey = subscribeBoardAssignmentsDayKey(() => tryReveal());

  session.safetyTimer = globalThis.setTimeout(() => tryReveal(true), SAFETY_CAP_MS);
}
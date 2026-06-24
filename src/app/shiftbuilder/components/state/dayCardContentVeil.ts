import {
  getBoardAssignmentsDayKey,
  subscribeBoardAssignmentsDayKey,
} from "@/lib/shiftbuilder/liveCache";

/** Minimum veil hold before reveal — also waits for hydrated assignments. */
export const DAY_CONTENT_VEIL_MS = 250;
const UNBLUR_MS = 220;
const SAFETY_CAP_MS = 2200;

export const DAY_CONTENT_VEIL_CLASS = "sb-day-content-veil";
export const DAY_CONTENT_READY_CLASS = "sb-day-content-ready";

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
  root?.classList.remove(DAY_CONTENT_VEIL_CLASS, DAY_CONTENT_READY_CLASS);
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

  root.classList.remove(DAY_CONTENT_READY_CLASS);
  root.classList.add(DAY_CONTENT_VEIL_CLASS);
  root.setAttribute("data-sb-day-veil-source", opts?.source ?? "unknown");

  session.minTimer = globalThis.setTimeout(() => tryReveal(), DAY_CONTENT_VEIL_MS);

  unsubscribeDayKey = subscribeBoardAssignmentsDayKey(() => tryReveal());

  session.safetyTimer = globalThis.setTimeout(() => tryReveal(true), SAFETY_CAP_MS);
}
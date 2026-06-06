/**
 * Rolling 30-day xAI usage ledger (localStorage).
 * Powers the OpsStatusBar "ai" pill — survives refresh and browser restarts on this device.
 * Target: keep daily engine usage relatively token-friendly (~100k tokens/day max for active single-operator use)
 * via light/fast (build-0.1) for auto determinations, high-effort 4.3 only on-demand/explicit, aggressive caching, and context pruning.
 */

export const AI_USAGE_STORAGE_KEY = "glcr_shiftbuilder_xai_usage_v1";
export const AI_USAGE_WINDOW_DAYS = 30;
const RETENTION_MS = AI_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** grok-4.3 list rates (fast variants cheaper in practice). Build/fast models use significantly lower rates. */
export const XAI_INPUT_RATE_USD = 1.25 / 1_000_000;
export const XAI_OUTPUT_RATE_USD = 2.5 / 1_000_000;
export const XAI_BUILD_INPUT_RATE_USD = 0.20 / 1_000_000; // approximate for grok-build-0.1 / fast paths
export const XAI_BUILD_OUTPUT_RATE_USD = 0.60 / 1_000_000;

export type AiUsageEvent = {
  at: string;
  inputTokens: number;
  outputTokens: number;
  model?: string;
  reasoningEffort?: string;
};

type AiUsageLedgerV1 = {
  version: 1;
  events: AiUsageEvent[];
};

export type AiUsageRollup = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  callCount: number;
  windowDays: typeof AI_USAGE_WINDOW_DAYS;
  oldestEventAt?: string;
};

export type AiSessionUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  callCount: number;
  lastModel?: string;
  lastReasoningEffort?: string;
};

export function estimateAiCostUsd(inputTokens: number, outputTokens: number, model?: string): number {
  const isBuildFast =
    !!model &&
    (model.toLowerCase().includes("build") ||
      model.toLowerCase().includes("fast") ||
      model === "grok-build-0.1");
  const inRate = isBuildFast ? XAI_BUILD_INPUT_RATE_USD : XAI_INPUT_RATE_USD;
  const outRate = isBuildFast ? XAI_BUILD_OUTPUT_RATE_USD : XAI_OUTPUT_RATE_USD;
  const cost = inputTokens * inRate + outputTokens * outRate;
  return Math.round(cost * 10000) / 10000;
}

function emptyRollup(): AiUsageRollup {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    callCount: 0,
    windowDays: AI_USAGE_WINDOW_DAYS,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadLedger(): AiUsageLedgerV1 {
  if (!isBrowser()) return { version: 1, events: [] };
  try {
    const raw = localStorage.getItem(AI_USAGE_STORAGE_KEY);
    if (!raw) return { version: 1, events: [] };
    const parsed = JSON.parse(raw) as Partial<AiUsageLedgerV1>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.events)) {
      return { version: 1, events: [] };
    }
    return { version: 1, events: parsed.events };
  } catch {
    return { version: 1, events: [] };
  }
}

function saveLedger(ledger: AiUsageLedgerV1): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(AI_USAGE_STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    /* quota / private mode */
  }
}

function pruneEvents(events: AiUsageEvent[], cutoffMs: number): AiUsageEvent[] {
  return events.filter((e) => {
    const t = Date.parse(e.at);
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

export function rollupEvents(events: AiUsageEvent[]): AiUsageRollup {
  if (events.length === 0) return emptyRollup();

  let inputTokens = 0;
  let outputTokens = 0;
  let oldestMs = Infinity;
  let totalCost = 0;

  for (const e of events) {
    const i = e.inputTokens || 0;
    const o = e.outputTokens || 0;
    inputTokens += i;
    outputTokens += o;
    totalCost += estimateAiCostUsd(i, o, e.model);
    const t = Date.parse(e.at);
    if (Number.isFinite(t) && t < oldestMs) oldestMs = t;
  }

  const totalTokens = inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    callCount: events.length,
    windowDays: AI_USAGE_WINDOW_DAYS,
    oldestEventAt:
      oldestMs !== Infinity ? new Date(oldestMs).toISOString() : undefined,
  };
}

/** Sum usage for the rolling 30-day window (prunes stale events on read). */
export function getAiUsage30dRollup(): AiUsageRollup {
  if (!isBrowser()) return emptyRollup();

  const cutoff = Date.now() - RETENTION_MS;
  const ledger = loadLedger();
  const pruned = pruneEvents(ledger.events, cutoff);
  if (pruned.length !== ledger.events.length) {
    saveLedger({ version: 1, events: pruned });
  }
  return rollupEvents(pruned);
}

/** Append one API usage record and refresh the window global for OpsStatusBar. */
export function recordAiUsageEvent(usage: {
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  reasoningEffort?: string;
}): AiUsageRollup {
  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  if (!isBrowser()) return emptyRollup();

  const cutoff = Date.now() - RETENTION_MS;
  const ledger = loadLedger();
  const pruned = pruneEvents(ledger.events, cutoff);
  pruned.push({
    at: new Date().toISOString(),
    inputTokens,
    outputTokens,
    model: usage.model,
    reasoningEffort: usage.reasoningEffort,
  });
  saveLedger({ version: 1, events: pruned });

  const rollup = rollupEvents(pruned);
  (window as any).__aiUsage30d = rollup;
  return rollup;
}

/** Seed globals on boot so OpsStatusBar shows 30d totals before the first Grok call. */
export function hydrateAiUsageGlobals(session?: AiSessionUsageSnapshot): void {
  if (!isBrowser()) return;
  const rollup30d = getAiUsage30dRollup();
  (window as any).__aiUsage30d = rollup30d;
  if (session) {
    (window as any).__aiSessionUsage = session;
  } else if (!(window as any).__aiSessionUsage) {
    (window as any).__aiSessionUsage = {
      ...emptyRollup(),
      lastModel: undefined,
      lastReasoningEffort: undefined,
    };
  }
}

export function clearAiUsageLedger(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(AI_USAGE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  (window as any).__aiUsage30d = emptyRollup();
}
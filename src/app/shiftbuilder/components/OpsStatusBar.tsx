// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
"use client";

import React, { useEffect } from "react";
import { hydrateAiUsageGlobals } from "@/lib/shiftbuilder/aiUsageTracker";
import { OPS_PILL_Z } from "./canvasPillGlass";

/**
 * OpsStatusBar — static LIVE dot + label in the bottom-right corner.
 * Telemetry details are exposed via the native title tooltip on hover/long-press.
 *
 * KD-13: pill reflects session poll health (`window.__realtimeState`), not
 * Supabase Realtime (retired for ops multi-operator sync).
 */

type RealtimeState = "LIVE" | "SYNCING" | "OFFLINE";

let __opsInterval: ReturnType<typeof setInterval> | null = null;

const PILL_ID = "ops-status-bar";

function getPillShellStyles(): string {
  return `
    position: fixed !important;
    bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;
    right: max(10px, env(safe-area-inset-right, 0px)) !important;
    z-index: ${OPS_PILL_Z} !important;
    font-family: var(--font-atkinson, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace) !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
    background: rgba(28,28,30,0.82) !important;
    color: #fff !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 10px !important;
    pointer-events: auto !important;
    box-shadow: 0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.75) !important;
    backdrop-filter: blur(12px) saturate(145%) !important;
    -webkit-backdrop-filter: blur(12px) saturate(145%) !important;
    user-select: none !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    overflow: hidden !important;
    max-width: calc(100vw - 20px) !important;
  `;
}

function buildOpsStatusBarShell(pill: HTMLDivElement): void {
  pill.innerHTML = `
    <div
      style="
        display:inline-flex;align-items:center;gap:5px;padding:3px 9px;
        font:inherit;line-height:1.3;white-space:nowrap;
      "
    >
      <span style="display:inline-flex;align-items:center;gap:3px;font-weight:600">
        <span data-ops-rt-dot style="display:inline-block;width:6px;height:6px;border-radius:999px;background:#eab308"></span>
        <span data-ops-rt-label>SYNCING</span>
      </span>
    </div>
  `;
}

function readTelemetry(): {
  perfText: string;
  rt: RealtimeState;
  rtColor: string;
  latencyText: string;
  ai30Tokens: number;
  ai30Cost: number;
  ai30Calls: number;
  sessionTokens: number;
  sessionCost: number;
  sessionCalls: number;
} {
  const data = (window as any).__lastDaySwitch;
  const paintDelta = (window as any).__lastDataToPaintMs;

  let perfText = "—";
  if (data && typeof data.totalMs === "number") {
    perfText = `${data.totalMs.toFixed(0)}ms`;
    if (typeof paintDelta === "number" && paintDelta > 0) {
      perfText += `+${paintDelta.toFixed(0)}`;
    }
  } else {
    const legacy = (window as any).__lastDaySwitchMs;
    if (typeof legacy === "number") {
      perfText = `${legacy.toFixed(0)}ms`;
    }
  }

  const rt = ((window as any).__realtimeState as RealtimeState) || "SYNCING";
  const lat = (window as any).__lastServerLatencyMs as number | null;
  const latencyText = lat != null ? `${lat}ms` : "—";

  const rtColor =
    rt === "LIVE" ? "#22c55e" : rt === "SYNCING" ? "#eab308" : "#ef4444";

  let ai30Tokens = 0;
  let ai30Cost = 0;
  let ai30Calls = 0;
  const ai30Raw = (window as any).__aiUsage30d as {
    totalTokens?: number;
    estimatedCostUsd?: number;
    callCount?: number;
  } | undefined;
  if (ai30Raw) {
    ai30Tokens = ai30Raw.totalTokens || 0;
    ai30Cost = ai30Raw.estimatedCostUsd || 0;
    ai30Calls = ai30Raw.callCount || 0;
  } else {
    (window as any).__aiUsage30d = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      callCount: 0,
      windowDays: 30,
    };
  }

  let sessionTokens = 0;
  let sessionCost = 0;
  let sessionCalls = 0;
  const sessionRaw = (window as any).__aiSessionUsage as {
    totalTokens?: number;
    estimatedCostUsd?: number;
    callCount?: number;
  } | undefined;
  if (sessionRaw) {
    sessionTokens = sessionRaw.totalTokens || 0;
    sessionCost = sessionRaw.estimatedCostUsd || 0;
    sessionCalls = sessionRaw.callCount || 0;
  } else {
    (window as any).__aiSessionUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      callCount: 0,
    };
  }

  return {
    perfText,
    rt,
    rtColor,
    latencyText,
    ai30Tokens,
    ai30Cost,
    ai30Calls,
    sessionTokens,
    sessionCost,
    sessionCalls,
  };
}

/** Update metric text nodes only (safe for 250ms poll). */
export function updateOpsStatusBarContent(): void {
  const pill = document.getElementById(PILL_ID) as HTMLDivElement | null;
  if (!pill || pill.style.display === "none") return;

  if (!pill.querySelector("[data-ops-rt-label]")) {
    buildOpsStatusBarShell(pill);
  }

  const t = readTelemetry();

  const dotEl = pill.querySelector("[data-ops-rt-dot]") as HTMLElement | null;
  const rtLabelEl = pill.querySelector("[data-ops-rt-label]");

  if (rtLabelEl) rtLabelEl.textContent = t.rt;
  if (dotEl) {
    dotEl.style.background = t.rtColor;
    dotEl.style.boxShadow = `0 0 4px ${t.rtColor}`;
  }

  pill.title = `Poll sync: ${t.rt} · day switch ${t.perfText} · server ${t.latencyText} · xAI 30d ${t.ai30Tokens} tok (~$${t.ai30Cost.toFixed(4)}, ${t.ai30Calls} calls) · session ${t.sessionTokens} tok (~$${t.sessionCost.toFixed(4)}, ${t.sessionCalls} calls)`;
}

/** Toggle visibility without tearing down the telemetry poll (e.g. iPad placement dock). */
export function setOpsStatusBarVisible(visible: boolean): void {
  if (typeof document === "undefined") return;
  const pill = document.getElementById(PILL_ID);
  if (pill) pill.style.display = visible ? "flex" : "none";
}

export function ensureOpsStatusBar(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  hydrateAiUsageGlobals();

  const old = document.getElementById("dev-day-switch-pill");
  if (old?.parentNode) {
    try {
      old.parentNode.removeChild(old);
    } catch {
      /* ignore */
    }
  }

  if (__opsInterval) {
    clearInterval(__opsInterval);
    __opsInterval = null;
  }
  const prevWinId = (window as any).__opsStatusIntervalId;
  if (prevWinId) {
    clearInterval(prevWinId);
    delete (window as any).__opsStatusIntervalId;
  }

  let pill = document.getElementById(PILL_ID) as HTMLDivElement | null;
  if (!pill) {
    pill = document.createElement("div");
    pill.id = PILL_ID;
    pill.style.cssText = getPillShellStyles();
    document.body.appendChild(pill);
    buildOpsStatusBarShell(pill);
  } else {
    pill.style.cssText = getPillShellStyles();
    pill.style.display = "flex";
    if (!pill.querySelector("[data-ops-rt-label]")) {
      buildOpsStatusBarShell(pill);
    }
  }

  updateOpsStatusBarContent();
  __opsInterval = setInterval(updateOpsStatusBarContent, 250);
  (window as any).__opsStatusIntervalId = __opsInterval;
}

export function hideOpsStatusBar(): void {
  if (typeof document === "undefined") return;

  if (__opsInterval) {
    clearInterval(__opsInterval);
    __opsInterval = null;
  }
  const wId = (window as any).__opsStatusIntervalId;
  if (wId) {
    try {
      clearInterval(wId);
    } catch {
      /* ignore */
    }
    delete (window as any).__opsStatusIntervalId;
  }

  const pill = document.getElementById(PILL_ID);
  if (pill) pill.style.display = "none";
}

export function OpsStatusBar() {
  useEffect(() => {
    ensureOpsStatusBar();
    return () => {
      hideOpsStatusBar();
    };
  }, []);

  return null;
}

export default OpsStatusBar;
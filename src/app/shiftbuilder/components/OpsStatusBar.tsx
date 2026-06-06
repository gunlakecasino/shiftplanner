"use client";

import React, { useEffect } from "react";
import { hydrateAiUsageGlobals } from "@/lib/shiftbuilder/aiUsageTracker";
import { SB_DRAWER_TRANSITION } from "./builderPrimitives";

/**
 * OpsStatusBar — collapsed: LIVE dot + label only; tap opens left drawer with
 * day / sb / xAI telemetry (same drawer pattern as rotation health cluster).
 */

type RealtimeState = "LIVE" | "SYNCING" | "OFFLINE";

let __opsInterval: ReturnType<typeof setInterval> | null = null;
let __opsOutsidePointerHandler: ((e: PointerEvent) => void) | null = null;

const PILL_ID = "ops-status-bar";

function isDrawerOpen(pill: HTMLElement): boolean {
  return pill.getAttribute("data-drawer-open") === "true";
}

function setDrawerOpen(pill: HTMLElement, open: boolean): void {
  pill.setAttribute("data-drawer-open", open ? "true" : "false");
  const drawer = pill.querySelector("[data-ops-drawer]") as HTMLElement | null;
  const toggle = pill.querySelector("[data-ops-toggle]") as HTMLElement | null;
  const chevron = pill.querySelector("[data-ops-chevron]") as HTMLElement | null;

  if (drawer) {
    drawer.style.maxWidth = open ? "360px" : "0";
    drawer.style.opacity = open ? "1" : "0";
    drawer.style.paddingLeft = open ? "8px" : "0";
    drawer.style.paddingRight = open ? "6px" : "0";
    drawer.style.borderRight = open ? "1px solid #3a3a3c" : "none";
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      open ? "Close ops telemetry drawer" : "Open ops telemetry drawer",
    );
  }
  if (chevron) {
    chevron.innerHTML = chevronSvg(open ? "right" : "left");
  }

  syncOutsideClickListener(open);
}

function syncOutsideClickListener(open: boolean): void {
  if (__opsOutsidePointerHandler) {
    document.removeEventListener("pointerdown", __opsOutsidePointerHandler);
    __opsOutsidePointerHandler = null;
  }
  if (!open) return;

  __opsOutsidePointerHandler = (e: PointerEvent) => {
    const pill = document.getElementById(PILL_ID);
    if (!pill || pill.contains(e.target as Node)) return;
    setDrawerOpen(pill, false);
  };
  document.addEventListener("pointerdown", __opsOutsidePointerHandler);
}

function getPillShellStyles(): string {
  return `
    position: fixed !important;
    bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;
    right: max(10px, env(safe-area-inset-right, 0px)) !important;
    z-index: 2147483647 !important;
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
    align-items: stretch !important;
    overflow: hidden !important;
    max-width: calc(100vw - 20px) !important;
  `;
}

function chevronSvg(pointing: "left" | "right"): string {
  const path =
    pointing === "left"
      ? '<path d="M13 6L7 12l6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M7 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  return `<svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true" style="display:block;opacity:0.75">${path}</svg>`;
}

function buildOpsStatusBarShell(pill: HTMLDivElement): void {
  pill.innerHTML = `
    <div
      data-ops-drawer
      aria-hidden="true"
      style="
        display:flex;align-items:center;gap:5px;overflow:hidden;white-space:nowrap;
        max-width:0;opacity:0;padding-left:0;padding-right:0;border-right:none;
        transition:${SB_DRAWER_TRANSITION};
      "
    >
      <span style="color:#a1a1aa;margin-right:1px">day</span>
      <span data-ops-day style="font-weight:600;color:#fff">—</span>
      <span style="color:#3a3a3c;margin:0 1px">·</span>
      <span style="color:#a1a1aa;margin-right:1px">sb</span>
      <span data-ops-sb style="font-weight:600;color:#fff">—</span>
      <span style="color:#3a3a3c;margin:0 1px">·</span>
      <span style="color:#a1a1aa;margin-right:1px">ai30</span>
      <span data-ops-ai-tok style="font-weight:600;color:#fff">0.0k</span>
      <span style="color:#a1a1aa;margin:0 1px">+</span>
      <span data-ops-ai-sess-tok style="font-weight:600;color:#fff">0.0k</span>
      <span style="color:#a1a1aa;margin:0 2px">~</span>
      <span data-ops-ai-cost style="font-weight:600;color:#fff">$0.00</span>
      <span style="color:#a1a1aa;margin:0 1px">·</span>
      <span data-ops-ai-calls style="font-weight:600;color:#fff">0</span>
    </div>
    <button
      type="button"
      data-ops-toggle
      aria-expanded="false"
      aria-label="Open ops telemetry drawer"
      style="
        display:inline-flex;align-items:center;gap:5px;padding:3px 9px;margin:0;
        background:transparent;border:none;color:#fff;cursor:pointer;
        font:inherit;line-height:1.3;white-space:nowrap;
      "
    >
      <span data-ops-chevron>${chevronSvg("left")}</span>
      <span style="display:inline-flex;align-items:center;gap:3px;font-weight:600">
        <span data-ops-rt-dot style="display:inline-block;width:6px;height:6px;border-radius:999px;background:#eab308"></span>
        <span data-ops-rt-label>SYNCING</span>
      </span>
    </button>
  `;
}

function attachOpsStatusBarListeners(pill: HTMLDivElement): void {
  if (pill.dataset.listenersAttached === "1") return;
  pill.dataset.listenersAttached = "1";

  pill.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-ops-toggle]")) return;
    e.preventDefault();
    e.stopPropagation();
    setDrawerOpen(pill, !isDrawerOpen(pill));
  });
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

/** Update metric text nodes only (safe for 250ms poll + smooth drawer CSS). */
export function updateOpsStatusBarContent(): void {
  const pill = document.getElementById(PILL_ID) as HTMLDivElement | null;
  if (!pill || pill.style.display === "none") return;

  if (!pill.querySelector("[data-ops-toggle]")) {
    buildOpsStatusBarShell(pill);
    attachOpsStatusBarListeners(pill);
    setDrawerOpen(pill, isDrawerOpen(pill));
  }

  const t = readTelemetry();
  const open = isDrawerOpen(pill);

  const dayEl = pill.querySelector("[data-ops-day]");
  const sbEl = pill.querySelector("[data-ops-sb]");
  const aiTokEl = pill.querySelector("[data-ops-ai-tok]");
  const aiSessTokEl = pill.querySelector("[data-ops-ai-sess-tok]");
  const aiCostEl = pill.querySelector("[data-ops-ai-cost]");
  const aiCallsEl = pill.querySelector("[data-ops-ai-calls]");
  const dotEl = pill.querySelector("[data-ops-rt-dot]") as HTMLElement | null;
  const rtLabelEl = pill.querySelector("[data-ops-rt-label]");

  if (dayEl) dayEl.textContent = t.perfText;
  if (sbEl) sbEl.textContent = t.latencyText;
  if (aiTokEl) aiTokEl.textContent = `${(t.ai30Tokens / 1000).toFixed(1)}k`;
  if (aiSessTokEl) aiSessTokEl.textContent = `${(t.sessionTokens / 1000).toFixed(1)}k`;
  if (aiCallsEl) aiCallsEl.textContent = String(t.ai30Calls || 0);
  // Show cost with more precision when small (common for mixed 4.3 + build calls); session cost if higher recent activity
  let costToShow = t.ai30Cost;
  if (t.sessionCost > t.ai30Cost * 0.1) costToShow = t.sessionCost; // bias to visible recent
  const costStr = costToShow < 0.01 ? costToShow.toFixed(4) : costToShow.toFixed(2);
  if (aiCostEl) aiCostEl.textContent = `$${costStr}`;
  if (rtLabelEl) rtLabelEl.textContent = t.rt;
  if (dotEl) {
    dotEl.style.background = t.rtColor;
    dotEl.style.boxShadow = `0 0 4px ${t.rtColor}`;
  }

  pill.title = open
    ? `Ops telemetry — day: ${t.perfText} | sb: ${t.latencyText} | xAI 30d: ${t.ai30Tokens} tok (~$${t.ai30Cost.toFixed(4)}, ${t.ai30Calls} calls) | session: ${t.sessionTokens} tok (~$${t.sessionCost.toFixed(4)}, ${t.sessionCalls} calls)`
    : `Realtime: ${t.rt} — tap to open ops telemetry (day switch, server latency, xAI usage)`;
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
    pill.setAttribute("data-drawer-open", "false");
    pill.style.cssText = getPillShellStyles();
    document.body.appendChild(pill);
    buildOpsStatusBarShell(pill);
    attachOpsStatusBarListeners(pill);
    console.log("[OpsStatusBar] ensure: created collapsible #ops-status-bar");
  } else {
    pill.style.cssText = getPillShellStyles();
    pill.style.display = "flex";
    if (!pill.querySelector("[data-ops-toggle]")) {
      buildOpsStatusBarShell(pill);
    }
    attachOpsStatusBarListeners(pill);
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

  syncOutsideClickListener(false);

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
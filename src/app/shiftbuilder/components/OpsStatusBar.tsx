"use client";

import React, { useEffect } from "react";
import { hydrateAiUsageGlobals } from "@/lib/shiftbuilder/aiUsageTracker";

/**
 * OpsStatusBar (permanent, production-visible)
 *
 * Compact bottom-right cluster of tiny pills showing live operational signals
 * for the floor team on iPad and all other clients.
 *
 * v1 signals (locked):
 *   - Day-switch performance (data ms from worker+store + paint delta)
 *   - Realtime connection health (green LIVE / amber / red)
 *   - Server latency (last successful Supabase roundtrip)
 *   - xAI tokens/cost — rolling 30-day totals (localStorage); session breakdown in tooltip
 *
 * Design constraints:
 *   - Display-only (no tap targets, no popovers per spec)
 *   - Matches the exact visual language of the prior dev timing pill
 *     (dark rounded, monospace numbers, subtle shadow, high z)
 *   - Lives in the chrome space already reserved by stageHost padding comments
 *   - Extremely cheap — polls globals + minimal state
 *   - Always rendered (prod + dev). No more dev-only guard.
 *
 * Sacred contracts: never overlaps or affects the 1056×816 artboard,
 * print fidelity, or any interactive surface.
 *
 * Refresh resilience: creation is now available via imperative ensureOpsStatusBar()
 * (callable from Client enter/transition paths) in addition to the React component effect.
 * This defeats timing races on hard refresh, React strict double-mount, launchpad body root,
 * and HMR. ai global is forced to 0s on first ensure so the pill content (incl "ai") is never empty.
 */

type RealtimeState = "LIVE" | "SYNCING" | "OFFLINE";

let __opsInterval: ReturnType<typeof setInterval> | null = null;

function getPillStyles(): string {
  return `
    position: fixed !important;
    bottom: 10px !important;
    right: 10px !important;
    z-index: 2147483647 !important;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
    font-size: 10px !important;
    line-height: 1.3 !important;
    padding: 3px 9px !important;
    background: rgba(0,0,0,0.92) !important;
    color: #fff !important;
    border: 1px solid #3a3a3c !important;
    border-radius: 4px !important;
    pointer-events: none !important;
    white-space: nowrap !important;
    box-shadow: 0 2px 10px rgba(0,0,0,0.65) !important;
    user-select: none !important;
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
  `;
}

/** Idempotent. Creates (or reuses) the body-fixed pill and starts the 250ms poller if needed. Safe to call from anywhere (enterCanvas, effects, early boot). */
export function ensureOpsStatusBar(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  hydrateAiUsageGlobals();

  // Clean any legacy dev pill that could be in the way.
  const old = document.getElementById("dev-day-switch-pill");
  if (old?.parentNode) {
    try { old.parentNode.removeChild(old); } catch {}
  }

  // Stop any prior poller (prevents multiples on HMR/rapid toggle/refresh paths).
  if (__opsInterval) {
    clearInterval(__opsInterval);
    __opsInterval = null;
  }
  const prevWinId = (window as any).__opsStatusIntervalId;
  if (prevWinId) {
    clearInterval(prevWinId);
    delete (window as any).__opsStatusIntervalId;
  }

  let pill = document.getElementById("ops-status-bar") as HTMLDivElement | null;
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "ops-status-bar";
    pill.style.cssText = getPillStyles();
    document.body.appendChild(pill);
    // eslint-disable-next-line no-console
    console.log("[OpsStatusBar] ensure: created and appended #ops-status-bar to body");
  } else {
    pill.style.display = "flex";
  }

  const update = () => {
    const p = document.getElementById("ops-status-bar") as HTMLDivElement | null;
    if (!p) {
      // Defensive: recreate on next cycle if DOM was nuked externally.
      ensureOpsStatusBar();
      return;
    }

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
      rt === "LIVE" ? "#22c55e" :
      rt === "SYNCING" ? "#eab308" : "#ef4444";

    // Rolling 30-day xAI totals (persisted in localStorage via aiUsageTracker).
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
      const seeded30 = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        callCount: 0,
        windowDays: 30,
      };
      (window as any).__aiUsage30d = seeded30;
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
      const seededSession = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        callCount: 0,
      };
      (window as any).__aiSessionUsage = seededSession;
    }

    const aiText = `<span style="color:#3a3a3c;margin:0 1px">·</span><span style="color:#a1a1aa;margin-right:1px">ai30</span><span style="font-weight:600;color:#fff">${(ai30Tokens / 1000).toFixed(1)}k</span><span style="color:#a1a1aa;margin:0 2px">~</span><span style="font-weight:600;color:#fff">$${ai30Cost.toFixed(2)}</span>`;

    p.innerHTML = `
      <span style="color:#a1a1aa;margin-right:1px">day</span>
      <span style="font-weight:600;color:#fff">${perfText}</span>
      <span style="color:#3a3a3c;margin:0 1px">·</span>
      <span style="display:inline-flex;align-items:center;gap:3px;color:#fff">
        <span style="display:inline-block;width:6px;height:6px;border-radius:999px;background:${rtColor};box-shadow:0 0 4px ${rtColor}"></span>
        ${rt}
      </span>
      <span style="color:#3a3a3c;margin:0 1px">·</span>
      <span style="color:#a1a1aa;margin-right:1px">sb</span>
      <span style="font-weight:600;color:#fff">${latencyText}</span>
      ${aiText}
    `;
    p.title = `Ops telemetry — day switch: ${perfText} | realtime: ${rt} | server: ${latencyText} | xAI 30d: ${ai30Tokens} tokens (~$${ai30Cost.toFixed(2)}, ${ai30Calls} calls) | session: ${sessionTokens} tokens (~$${sessionCost.toFixed(2)}, ${sessionCalls} calls). Persisted ${30} days on this device.`;
  };

  update();
  __opsInterval = setInterval(update, 250);
  (window as any).__opsStatusIntervalId = __opsInterval;
}

/** Hides the pill and stops its poller. Used when leaving canvas for launchpad (cleaner presentation). */
export function hideOpsStatusBar(): void {
  if (typeof document === "undefined") return;
  if (__opsInterval) {
    clearInterval(__opsInterval);
    __opsInterval = null;
  }
  const wId = (window as any).__opsStatusIntervalId;
  if (wId) {
    try { clearInterval(wId); } catch {}
    delete (window as any).__opsStatusIntervalId;
  }
  const p = document.getElementById("ops-status-bar");
  if (p) p.style.display = "none";
}

export function OpsStatusBar() {
  // We render nothing declaratively.
  // The actual pill is created imperatively (body append, escapes all canvas transforms/stacking).
  // This is the only technique proven reliable on iPad Pro Safari + the 1056x816 artboard.
  useEffect(() => {
    ensureOpsStatusBar();
    return () => {
      // On unmount (e.g. leaving for launchpad or route change), hide but leave the element
      // so a later ensure (HMR, re-enter, refresh path) can just flip display + restart poller.
      hideOpsStatusBar();
    };
  }, []);

  return null;
}

export default OpsStatusBar;

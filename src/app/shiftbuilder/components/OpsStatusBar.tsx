"use client";

import React, { useEffect } from "react";

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
 */

type RealtimeState = "LIVE" | "SYNCING" | "OFFLINE";

export function OpsStatusBar() {
  // Snapshot state removed — we now drive the imperative DOM element directly
  // (the only reliable path on iPad Safari simulator).

  useEffect(() => {
    // === Imperative body-append (proven reliable on iPad Pro simulator + Mac)
    // This is the exact technique that finally made the previous dev timing pill
    // visible after many declarative attempts failed due to transforms/stacking.
    const isBrowser = typeof document !== 'undefined' && typeof window !== 'undefined';
    if (!isBrowser) return;

    // Aggressively remove any leftover old dev pill (the "behind the old banner" problem)
    const oldPill = document.getElementById('dev-day-switch-pill');
    if (oldPill?.parentNode) {
      oldPill.parentNode.removeChild(oldPill);
      console.log('[OpsStatusBar] Removed leftover #dev-day-switch-pill');
    }

    let pill = document.getElementById('ops-status-bar') as HTMLDivElement | null;
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'ops-status-bar';
      pill.style.cssText = `
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
      document.body.appendChild(pill);
      console.log('[OpsStatusBar] Imperative pill mounted to body');
    }

    const update = () => {
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

      pill!.innerHTML = `
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
      `;
      pill!.title = `Ops telemetry — day switch: ${perfText} | realtime: ${rt} | server: ${latencyText}`;
    };

    update();
    const id = setInterval(update, 250);

    return () => clearInterval(id);
    // Note: we intentionally do not remove the pill on unmount (same behavior as the
    // old dev pill) so it survives fast refresh / HMR on both Mac and iPad sim.
  }, []);

  // We render nothing declaratively.
  // The actual pill is created imperatively and appended to document.body.
  // This is the only positioning technique that has consistently worked
  // on the iPad Pro 13" Xcode simulator Safari (heavy transforms + stacking
  // contexts in the artboard stage break normal fixed/portal elements).
  return null;
}

export default OpsStatusBar;

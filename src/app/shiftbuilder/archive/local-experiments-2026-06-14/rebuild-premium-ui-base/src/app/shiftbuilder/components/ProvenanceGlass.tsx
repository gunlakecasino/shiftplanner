"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";

interface ProvenanceGlassProps {
  slotKey: string | null;
  side?: 'mens' | 'womens' | null;
  name?: string | null;
  rationale?: string | null;
  fairnessSignals?: Record<string, number> | null;
  confidence?: number | null;
  onClose: () => void;
  /** For week rotation advisor results (prescriptive moves to improve health %). */
  advisorText?: string | null;
}

/**
 * ProvenanceGlass
 * 
 * Reusable on-demand glass overlay for the "engine heart" / provenance.
 * 
 * - Fixed inset glassmorphic (matches the dev v1 "stripped provenance" direction the user liked).
 * - Board remains the entire surface; this pops "respective to the card pressed".
 * - Clean formatting: "Rot 0.4   Aff 1.2   Load 0.7" style (no emojis).
 * - Supports per-side for RR (e.g. "Why X in RR 1+2 (MENS)?").
 * - Does NOT change any card appearances.
 * 
 * Usage in established ShiftBuilderClient: 
 *   when a card/gender has engine provenance, set the key + data and render <ProvenanceGlass ... />
 */
export function ProvenanceGlass({
  slotKey,
  side,
  name: nameProp,
  rationale: rationaleProp,
  fairnessSignals: signalsProp,
  confidence: confProp,
  onClose,
  advisorText,
}: ProvenanceGlassProps) {
  // Live lookup from the established store so we always get the latest engine output
  // (including provenance populated by the placement engine / scoring).
  // This brings the "engine heart" into the main page without any card appearance changes.
  const assignments = useShiftBuilderStore((s) => s.assignments);

  if (!slotKey) return null;

  const isWeekAdvisor = slotKey === "week-rotation-advisor" || slotKey === "week-advisor" || /advisor/i.test(slotKey);
  const a = assignments?.[slotKey] || {};
  const prov = a.provenance || {};

  const displayName = nameProp || a.tmName || "—";

  // Derive side and nice display slot from common main keys (MRRxx / WRRxx or plain).
  let derivedSide = side;
  let displaySlot = slotKey;
  if (!derivedSide) {
    if (slotKey.startsWith('MRR') || slotKey.startsWith('M')) {
      derivedSide = 'mens';
      const num = slotKey.replace(/MRR|M/g, '');
      displaySlot = `RR ${num} (MENS)`;
    } else if (slotKey.startsWith('WRR') || slotKey.startsWith('W')) {
      derivedSide = 'womens';
      const num = slotKey.replace(/WRR|W/g, '');
      displaySlot = `RR ${num} (WOMENS)`;
    } else if (slotKey.startsWith('RR')) {
      displaySlot = slotKey.replace('RR', 'RR ');
    }
  } else {
    displaySlot = `${slotKey} (${derivedSide.toUpperCase()})`;
  }

  const rationale = rationaleProp || prov.rationale || "No detailed rationale recorded.";
  const fairnessSignals = signalsProp || prov.fairnessSignals || {};
  const confidence = confProp ?? prov.confidence;

  const hasSignals = Object.keys(fairnessSignals).length > 0;

  const hasRealData = !!(rationale && rationale !== "No detailed rationale recorded.") || hasSignals;

  // For the week rotation advisor we intentionally show the glass even without normal per-slot
  // provenance/rationale/signals. The content comes from advisorText (or the legacy window stash).
  if (!isWeekAdvisor && !hasRealData) {
    return null; // render nothing if no engine data for normal provenance keys
  }

  // For advisor, we may have advisorText even before the xAI call completes (local suggestions are instant).
  // Proceed to render the modal.

  const overlay = (
    <div
      className="sb-overlay-backdrop sb-overlay-backdrop--fixed z-[70] flex items-center justify-center !bg-black/20"
      onClick={onClose}
    >
      <div
        className="sb-modal-enter sb-glass-pill bg-white/95 dark:bg-[#1C1C1E]/95 border border-white/30 dark:border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] font-medium">{isWeekAdvisor ? "Rotation Health + xAI" : "Provenance"}</div>
            <div className="text-lg font-semibold mt-1">
              {isWeekAdvisor ? "Week rotation improvement plan" : `Why ${displayName} in ${displaySlot}?`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="sb-interactive text-sm text-[#8B6F2E] hover:text-[#5C4A2E] rounded-lg px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="text-[15px] text-[#2F2F2D] leading-relaxed whitespace-pre-wrap">
          {isWeekAdvisor
            ? (advisorText || (window as any).__lastWeekAdvisorText || rationale || "Local suggestions + xAI plan will appear here. If nothing shows, the request may still be in flight or there were no violations in the week data.")
            : (rationale || "No rationale recorded for this placement.")}
        </div>

        {!isWeekAdvisor && confidence !== undefined && confidence !== null && (
          <div className="mt-3 text-[12px] text-[#6E6E6A]">
            Confidence: {Math.round(Number(confidence) * 100)}%
          </div>
        )}

        {!isWeekAdvisor && hasSignals && (
          <div className="mt-5 pt-4 border-t border-[#EDE4D3]">
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#6E6E6A] mb-2.5">Fairness Signals</div>
            <div className="space-y-2 text-sm">
              {Object.entries(fairnessSignals).map(([k, v]) => {
                const lower = k.toLowerCase();
                const label = lower.includes('rot') ? 'Rot' : lower.includes('aff') ? 'Aff' : 'Load';
                return (
                  <div key={k} className="flex justify-between items-center bg-[#F9F6EF] rounded px-3 py-1.5">
                    <span className="text-[#6E6E6A] capitalize">{label}</span>
                    <span className="font-mono font-semibold tabular-nums text-[#3A3A38]">{Number(v).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t text-[10px] text-[#8B6F2E]/70">
          {isWeekAdvisor
            ? "Local suggestions are instant & deterministic. xAI suggestions (when available) are ranked for minimal high-impact moves that lift weeklyBalance by reducing the listed repeats. Execute via day jump + pad or direct edits in the WEEK BUILDER table."
            : "This is the heartbeat of the system — engine intelligence combined with human factors."}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(overlay, document.body);
}

export default ProvenanceGlass;

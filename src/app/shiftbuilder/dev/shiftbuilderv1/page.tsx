"use client";

import React from "react";
import { PlanningCard } from "../../ui/cards/PlanningCard";

// Local dev shape for the new shiftbuilderv1 surface (loose on purpose for rapid iteration on per-side + provenance).
// Supports both classic single tmName and the dual per-restroom (mens/womens sub-assignments).
type DevAssignment = {
  slotKey: string;
  slotType?: string;
  tmName?: string | null;
  isLocked?: boolean;
  source?: "engine" | "manual";
  provenance?: {
    rationale?: string;
    confidence?: number;
    fairnessSignals?: Record<string, number>;
  };
  rrSide?: "mens" | "womens";
  // Per-side for RR cards (each physical restroom needs one male + one female)
  mens?: { tmName?: string | null; source?: string; provenance?: any; isLocked?: boolean } | null;
  womens?: { tmName?: string | null; source?: string; provenance?: any; isLocked?: boolean } | null;
  // Allow extra during optimistic updates
  [key: string]: any;
};

/**
 * ShiftBuilder v1 — Operator Interface (Awe Edition)
 * 
 * This is the dedicated dev surface for building the real interface
 * operators will use and (ideally) love.
 * 
 * Design Principles (non-negotiable in this pass):
 * - Paper-like calm and confidence
 * - Pencil Pro 2 first-class (web is simulation only)
 * - Instant scannability at realistic density
 * - Provenance and fairness as quiet intelligence, not decoration
 * - Empty states must feel inviting and actionable
 * - Every interaction should feel safe, reversible, and delightful
 */

export default function ShiftBuilderV1Page() {
  // Full 10 Zone + 5 Restroom board data
  const [assignments, setAssignments] = React.useState<Record<string, DevAssignment>>({
    // Zones - 10 positions
    Z1: { slotKey: "Z1", slotType: "zone", tmName: "Maya R.", isLocked: false, source: "engine", provenance: { rationale: "Strong skill match + pair affinity", confidence: 0.92, fairnessSignals: { rotation: 0.4, affinity: 1.2, load: 0.65 } } },
    Z2: { slotKey: "Z2", slotType: "zone", tmName: "Jordan Hale", isLocked: true, source: "engine", provenance: { rationale: "Best coverage for peak hours", confidence: 0.81, fairnessSignals: { rotation: 0.7, affinity: 0.9, load: 0.8 } } },
    Z3: { slotKey: "Z3", slotType: "zone", tmName: null, isLocked: false, source: "manual" },
    Z4: { slotKey: "Z4", slotType: "zone", tmName: "Alex Rivera", isLocked: false, source: "engine", provenance: { rationale: "Excellent recent performance", confidence: 0.88, fairnessSignals: { rotation: 0.5, affinity: 1.1, load: 0.7 } } },
    Z5: { slotKey: "Z5", slotType: "zone", tmName: "Taylor Kim", isLocked: false, source: "manual", provenance: { rationale: "Good availability this shift", confidence: 0.71, fairnessSignals: { rotation: 0.9, affinity: 0.6, load: 0.9 } } },
    Z6: { slotKey: "Z6", slotType: "zone", tmName: null, isLocked: false, source: "manual" },
    Z7: { slotKey: "Z7", slotType: "zone", tmName: "Casey Brooks", isLocked: false, source: "engine", provenance: { rationale: "Strong zone knowledge", confidence: 0.95, fairnessSignals: { rotation: 0.3, affinity: 1.4, load: 0.5 } } },
    Z8: { slotKey: "Z8", slotType: "zone", tmName: "Morgan Ellis", isLocked: true, source: "engine", provenance: { rationale: "Best available for this zone", confidence: 0.84, fairnessSignals: { rotation: 0.6, affinity: 0.8, load: 0.75 } } },
    Z9: { slotKey: "Z9", slotType: "zone", tmName: null, isLocked: false, source: "manual" },
    Z10: { slotKey: "Z10", slotType: "zone", tmName: "Sam Patel", isLocked: false, source: "engine", provenance: { rationale: "Solid all-rounder", confidence: 0.79, fairnessSignals: { rotation: 0.8, affinity: 0.7, load: 0.85 } } },

    // Restrooms - 5 positions, each needs male + female (dual assignment per card)
    RR1: {
      slotKey: "RR1",
      slotType: "rr",
      mens: { tmName: "Marcus T.", source: "engine", provenance: { rationale: "Reliable RR coverage", confidence: 0.86 } },
      womens: null,
      isLocked: false,
    },
    RR2: {
      slotKey: "RR2",
      slotType: "rr",
      mens: null,
      womens: null,
      isLocked: false,
    },
    RR3: {
      slotKey: "RR3",
      slotType: "rr",
      mens: { tmName: "Priya S.", source: "engine", provenance: { rationale: "Best available for this area", confidence: 0.91 } },
      womens: { tmName: "Jordan Hale", source: "manual", isLocked: true },
      isLocked: false,
    },
    RR4: {
      slotKey: "RR4",
      slotType: "rr",
      mens: null,
      womens: { tmName: "Casey Brooks", source: "engine", provenance: { rationale: "Strong coverage", confidence: 0.83 } },
      isLocked: false,
    },
    RR5: {
      slotKey: "RR5",
      slotType: "rr",
      mens: null,
      womens: null,
      isLocked: false,
    },

    // Aux - visible on the board
    AUX1: { slotKey: "AUX1", slotType: "aux", tmName: "Priya S.", isLocked: false, source: "manual" },
    AUX2: { slotKey: "AUX2", slotType: "aux", tmName: null, isLocked: false, source: "manual" },

    // Breaks - summonable (not on main board by default)
    BW1: { slotKey: "BW1", slotType: "break", tmName: "Taylor Kim", isLocked: false, source: "engine", provenance: { rationale: "Standard wave 1 coverage", confidence: 0.78 } },
    BW2: { slotKey: "BW2", slotType: "break", tmName: null, isLocked: false, source: "manual" },
    BW3: { slotKey: "BW3", slotType: "break", tmName: "Alex Rivera", isLocked: false, source: "engine", provenance: { rationale: "Good for this wave", confidence: 0.82 } },
  });

  const [showPencil, setShowPencil] = React.useState(true);
  const [provenanceCardKey, setProvenanceCardKey] = React.useState<string | null>(null);
  const [draggingKey, setDraggingKey] = React.useState<string | null>(null);
  const [pendingAssignKey, setPendingAssignKey] = React.useState<string | null>(null);
  const [showBreaks, setShowBreaks] = React.useState(false);
  const [draggingFromRoster, setDraggingFromRoster] = React.useState(false);

  const handleOptimisticUpdate = (key: string, changes: Partial<DevAssignment>) => {
    setAssignments(prev => ({
      ...prev,
      [key]: { ...prev[key], ...changes },
    }));
  };

  // Drag to assign / swap (core UX priority)
  const handleDragStart = (key: string) => (e: React.DragEvent) => {
    setDraggingKey(key);
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceData = e.dataTransfer.getData("text/plain");
    if (!sourceData || sourceData === targetKey) {
      setDraggingKey(null);
      return;
    }

    const targetAssignment = assignments[targetKey];

    // Roster external drag (from Available Team)
    if (sourceData.startsWith("roster:")) {
      const personName = sourceData.split(":")[1];
      const isRRTarget = targetKey.startsWith("RR");
      const target = assignments[targetKey] || { slotKey: targetKey, slotType: isRRTarget ? "rr" : "zone" };

      if (isRRTarget) {
        // If this outer drop fired, pick a side intelligently (first open). Precise side drops use the onDropToSide from inside RestroomPlanningCard halves.
        if (!target.mens?.tmName) {
          assignToRRSide(targetKey, 'mens', personName);
        } else if (!target.womens?.tmName) {
          assignToRRSide(targetKey, 'womens', personName);
        } else {
          setDraggingKey(null);
          return;
        }
        setDraggingKey(null);
        return;
      }

      if (target.tmName) {
        setDraggingKey(null);
        return;
      }

      handleOptimisticUpdate(targetKey, {
        tmName: personName,
        source: "manual",
        isLocked: false,
      });
      setDraggingKey(null);
      return;
    }

    // Side-aware internal drag (sourceData like "RR1:mens" from inner draggable name divs in RestroomPlanningCard)
    if (sourceData.includes(":")) {
      const [srcKey, srcSide] = sourceData.split(":");
      if (srcSide === 'mens' || srcSide === 'womens') {
        const sourceRR = assignments[srcKey];
        const person = (sourceRR as any)[srcSide];
        if (!person?.tmName) {
          setDraggingKey(null);
          return;
        }
        const isRRTarget = targetKey.startsWith("RR");
        const target = assignments[targetKey] || { slotKey: targetKey, slotType: isRRTarget ? "rr" : "zone" };

        if (isRRTarget) {
          assignToRRSide(targetKey, srcSide as 'mens' | 'womens', person.tmName);
          clearRRSide(srcKey, srcSide as 'mens' | 'womens');
          setDraggingKey(null);
          return;
        }

        // assign side person to a non-RR target (zone/aux/break)
        if (target.tmName) {
          setDraggingKey(null);
          return;
        }
        handleOptimisticUpdate(targetKey, { tmName: person.tmName, source: "manual" });
        const src = { ...sourceRR };
        (src as any)[srcSide] = null;
        handleOptimisticUpdate(srcKey, src);
        setDraggingKey(null);
        return;
      }
    }

    const sourceKey = sourceData;
    const source = assignments[sourceKey];
    const target = targetAssignment;

    if (!source) {
      setDraggingKey(null);
      return;
    }

    // Type compatibility (RR cards are their own type for drag rules)
    const isCompatible = (a: any, b: any) => {
      if (a.slotType === "zone" && b.slotType === "zone") return true;
      if (a.slotType === "rr" && b.slotType === "rr") return true;
      if (a.slotType === "aux" && b.slotType === "aux") return true;
      if (a.slotType === "break" && b.slotType === "break") return true;
      return false;
    };

    const targetForCompat = target || { slotType: targetKey.startsWith("RR") ? "rr" : targetKey.startsWith("AUX") ? "aux" : targetKey.startsWith("BW") ? "break" : "zone" };
    if (!isCompatible(source, targetForCompat)) {
      // Special case: allow moving any staffed person (from zone/aux/break) into an open RR side.
      // RR cards act as person sinks for the per-side model.
      const isPersonToRR = targetForCompat.slotType === 'rr' && !!source?.tmName;
      if (!isPersonToRR) {
        setDraggingKey(null);
        return;
      }
    }

    // RR -> RR or RR -> other already handled in the side-aware ":" branch above.
    // If we reach here it's normal zone/aux/break assign/swap or person-to-RR.
    if (target?.slotType === "rr" || source?.slotType === "rr") {
      // Fallback safety: if somehow an RR object reached here without side suffix, pick first open side on target.
      if (target?.slotType === "rr") {
        const personName = source.tmName;
        if (!personName) { setDraggingKey(null); return; }
        if (!target.mens?.tmName) assignToRRSide(targetKey, 'mens', personName);
        else if (!target.womens?.tmName) assignToRRSide(targetKey, 'womens', personName);
        else { setDraggingKey(null); return; }
      }
      if (source?.slotType === "rr") {
        // Best effort clear (prefer mens then womens)
        if (source.mens?.tmName) clearRRSide(sourceKey, 'mens');
        else if (source.womens?.tmName) clearRRSide(sourceKey, 'womens');
      }
      setDraggingKey(null);
      return;
    }

    const newAssignments = { ...assignments };

    if (!target?.tmName) {
      // Assign to empty (non-RR)
      newAssignments[targetKey] = {
        ...target,
        tmName: source.tmName,
        tmId: (source as any).tmId,
        source: "manual",
        isLocked: false,
      };
      newAssignments[sourceKey] = {
        ...source,
        tmName: null,
        tmId: null,
        provenance: undefined,
      };
    } else {
      // Swap (non-RR)
      const temp = { ...target };
      newAssignments[targetKey] = { ...source };
      newAssignments[sourceKey] = temp;
    }

    setAssignments(newAssignments);
    setDraggingKey(null);
  };

  const handleDragEnd = () => {
    setDraggingKey(null);
  };

  // Helper for per-side assignment (used by onDropToSide and handleDrop)
  const assignToRRSide = (rrKey: string, side: 'mens' | 'womens', personName: string, source: 'manual' | 'engine' = 'manual') => {
    const rr = { ...assignments[rrKey] };
    if (side === 'mens') {
      rr.mens = { tmName: personName, source };
    } else {
      rr.womens = { tmName: personName, source };
    }
    handleOptimisticUpdate(rrKey, rr);
  };

  const clearRRSide = (rrKey: string, side: 'mens' | 'womens') => {
    const rr = { ...assignments[rrKey] };
    if (side === 'mens') {
      rr.mens = null;
    } else {
      rr.womens = null;
    }
    handleOptimisticUpdate(rrKey, rr);
  };

  // Parse composite provenance key e.g. "RR1:mens" -> { base: "RR1", side: "mens" }
  const parseProvenanceKey = (k: string | null): { base: string; side?: 'mens' | 'womens' } => {
    if (!k) return { base: '' };
    if (k.includes(':')) {
      const [base, s] = k.split(':');
      if (s === 'mens' || s === 'womens') return { base, side: s };
      return { base: k };
    }
    return { base: k };
  };

  // Resolve the effective assignment + side data for provenance glass (supports whole key or side key)
  const getProvenanceData = (key: string | null) => {
    if (!key) return null;
    const { base, side } = parseProvenanceKey(key);
    const baseAssign = assignments[base];
    if (!baseAssign) return null;
    if (side && (side === 'mens' || side === 'womens')) {
      const sideData = (baseAssign as any)[side];
      return {
        slotKey: base,
        side,
        tmName: sideData?.tmName || null,
        provenance: sideData?.provenance || baseAssign.provenance || null,
        isRR: true,
      };
    }
    return {
      slotKey: base,
      side: undefined,
      tmName: baseAssign.tmName || null,
      provenance: baseAssign.provenance || null,
      isRR: baseAssign.slotType === 'rr',
    };
  };

  // Midpoint hit-test helper for determining which side of an RR card a drop/click landed on.
  // Used for outer wrapper drops when inner onDropToSide doesn't capture (robust per-side targeting).
  const getSideForPosition = (e: React.DragEvent | React.MouseEvent, element: HTMLElement | null): 'mens' | 'womens' | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const y = 'clientY' in e ? e.clientY : (e as any).clientY;
    const mid = rect.top + rect.height / 2;
    return y < mid ? 'mens' : 'womens';
  };

  const getIsCompatible = (sourceKey: string, targetKey: string) => {
    const normalizedSourceKey = sourceKey.includes(':') ? sourceKey.split(':')[0] : sourceKey;
    const source = assignments[normalizedSourceKey];
    const target = assignments[targetKey] || { slotType: targetKey.startsWith('RR') ? 'rr' : targetKey.startsWith('AUX') ? 'aux' : targetKey.startsWith('BW') ? 'break' : 'zone' };

    // Person drags (from RR side with : or any staffed source moving to RR) are allowed to RR open sides.
    const isRRTarget = targetKey.startsWith('RR');
    if (isRRTarget) {
      const t = assignments[targetKey];
      const hasOpen = !t?.mens?.tmName || !t?.womens?.tmName;
      if (!hasOpen) return false;
      // If it's a side person drag or any source that currently holds a tmName, allow the move into RR.
      if (sourceKey.includes(':') || (source && source.tmName)) return true;
      // roster handled separately via draggingFromRoster
    }

    // If dragging a specific side person out of an RR (sourceKey has :mens etc), it's a "person move".
    if (sourceKey.includes(':')) {
      // zone / aux / break: as long as target empty (or for swap we handle in drop)
      const tAssign = assignments[targetKey];
      return !tAssign?.tmName;
    }

    if (!source) return false;
    if (source.slotType === 'zone' && target.slotType === 'zone') return true;
    if (source.slotType === 'rr' && target.slotType === 'rr') return true;
    if (source.slotType === 'aux' && target.slotType === 'aux') return true;
    if (source.slotType === 'break' && target.slotType === 'break') return true;
    return false;
  };

  // Simple zone + restroom keys for rendering
  const zoneKeys = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7", "Z8", "Z9", "Z10"];
  const restroomKeys = ["RR1", "RR2", "RR3", "RR4", "RR5"];
  const auxKeys = ["AUX1", "AUX2"];
  const breakKeys = ["BW1", "BW2", "BW3"];

  return (
    <div className="min-h-screen bg-[#FAFAF8] p-8 text-[#1C1C1E]">
      <div className="max-w-[1280px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-[3px] text-[#8B6F2E] mb-1">DEV • SHIFTBUILDERV1</div>
            <h1 className="text-3xl font-semibold tracking-tight">ShiftBuilder v1</h1>
            <p className="text-[#6E6E6A] mt-1">The interface operators will actually use.</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowPencil(!showPencil)}
              className="px-4 py-2 text-sm rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/5 hover:bg-[#C9A84C]/15 text-[#8B6F2E] transition"
            >
              {showPencil ? "Disable" : "Enable"} Pencil Mode
            </button>
          </div>
        </div>

        {/* Unified Planning Board - the entire surface */}
        <div 
          className="bg-white border border-[#EDE4D3] rounded-3xl p-6 shadow-sm"
          onDragEnd={() => {
            setDraggingKey(null);
            setDraggingFromRoster(false);
          }}
        >
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-sm font-semibold tracking-tight">Planning Board</div>
                <div className="text-[11px] text-[#6E6E6A] mt-0.5">10 Zones • 5 Restrooms • 2 Aux • Live + Draft</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-[#8B6F2E]">15 / 17 positions</div>
                <button
                  onClick={() => setShowBreaks(!showBreaks)}
                  className="text-[10px] px-3 py-1 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/5 hover:bg-[#C9A84C]/15 text-[#8B6F2E] transition"
                >
                  {showBreaks ? "Hide" : "Summon"} Breaks
                </button>
              </div>
            </div>

          {/* Restrooms - integrated at top as perimeter */}
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] mb-2 pl-1">Restrooms</div>
            <div className="grid grid-cols-5 gap-3">
              {restroomKeys.map((key) => {
                const assignment = assignments[key] || { slotKey: key, slotType: "rr" };
                const isDragging = draggingKey === key || !!(draggingKey && draggingKey.startsWith(key + ':'));
                const rr = assignment;
                const hasOpenSide = rr.slotType === "rr" ? (!rr.mens?.tmName || !rr.womens?.tmName) : !rr.tmName;
                const isDropTarget = (draggingKey && draggingKey !== key && !draggingKey.startsWith(key + ':') && getIsCompatible(draggingKey.split(':')[0], key)) || (draggingFromRoster && hasOpenSide);

                return (
                  <div
                    key={key}
                    // Note: draggable intentionally omitted for RR cards. Side-specific drags are initiated from the inner name divs in RestroomPlanningCard (with "key:side" payload). This prevents the outer chrome from capturing whole-card drags and fighting per-side interactions.
                    onDragOver={handleDragOver}
                    onDrop={(e) => {
                      // For drops that land on the outer wrapper (chrome, 9.5px bar area, padding), use midpoint to choose side when possible.
                      // Content-area drops are handled by the onDropToSide passed into the halves inside RestroomPlanningCard.
                      const isRR = assignment.slotType === 'rr' || key.startsWith('RR');
                      if (isRR) {
                        const side = getSideForPosition(e, e.currentTarget as HTMLElement);
                        // If we have a side and the source looks like it can target a side, replicate minimal logic here then return early.
                        const sourceData = e.dataTransfer.getData("text/plain");
                        if (side && sourceData) {
                          if (sourceData.startsWith("roster:")) {
                            const personName = sourceData.split(":")[1];
                            assignToRRSide(key, side, personName);
                            setDraggingKey(null);
                            return;
                          }
                          if (sourceData.includes(":")) {
                            const [srcKey, srcSide] = sourceData.split(":");
                            if (srcSide === 'mens' || srcSide === 'womens') {
                              const srcRR = assignments[srcKey];
                              const person = (srcRR as any)[srcSide];
                              if (person?.tmName) {
                                assignToRRSide(key, side, person.tmName);
                                clearRRSide(srcKey, srcSide as 'mens' | 'womens');
                                setDraggingKey(null);
                                return;
                              }
                            }
                          } else {
                            // plain sourceKey from a zone etc.
                            const src = assignments[sourceData];
                            if (src?.tmName) {
                              assignToRRSide(key, side, src.tmName);
                              // clear source (non-RR)
                              handleOptimisticUpdate(sourceData, { tmName: null, provenance: undefined });
                              setDraggingKey(null);
                              return;
                            }
                          }
                        }
                      }
                      // Fallback to the general handler (picks first open side for RR etc.)
                      handleDrop(key)(e);
                    }}
                    onDragEnd={handleDragEnd}
                    className={`transition-all ${isDragging ? "opacity-50 scale-[0.98]" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C]/40 rounded-3xl" : ""} ${provenanceCardKey && provenanceCardKey.startsWith(key) ? "ring-2 ring-[#C9A84C] shadow-md" : ""}`}
                  >
                    <PlanningCard
                      assignment={assignment}
                      showPencilHover={showPencil}
                      onToggleLock={() => handleOptimisticUpdate(key, { isLocked: !assignment.isLocked })}
                      onWhyClick={() => setProvenanceCardKey(key)}
                      onClickSide={(side) => {
                        const sideData = (assignment as any)[side];
                        if (!sideData?.tmName) {
                          setPendingAssignKey(`${key}:${side}`);
                        } else {
                          // Always use composite for side-specific provenance glass ("heartbeat per side")
                          setProvenanceCardKey(`${key}:${side}`);
                        }
                      }}
                      onDropToSide={(side, e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const sourceData = e.dataTransfer.getData("text/plain");
                        if (sourceData.startsWith("roster:")) {
                          const personName = sourceData.split(":")[1];
                          assignToRRSide(key, side, personName);
                        } else if (sourceData.includes(":")) {
                          // per side from another RR
                          const [srcKey, srcSide] = sourceData.split(":");
                          const srcRR = assignments[srcKey];
                          const person = (srcRR as any)[srcSide];
                          if (person?.tmName) {
                            assignToRRSide(key, side, person.tmName);
                            clearRRSide(srcKey, srcSide as 'mens' | 'womens');
                          }
                        } else {
                          // regular board drag to specific side
                          const sourceKey = sourceData;
                          const source = assignments[sourceKey];
                          if (source && source.tmName) {
                            assignToRRSide(key, side, source.tmName);
                            // clear the source (it was a non-RR or we handle RR via the : branch)
                            handleOptimisticUpdate(sourceKey, { tmName: null, provenance: undefined });
                          }
                        }
                        setDraggingKey(null);
                      }}
                      onClick={() => {
                        const rr = assignment;
                        const hasAny = rr.mens?.tmName || rr.womens?.tmName || rr.tmName;
                        if (!hasAny) {
                          setPendingAssignKey(key);
                        } else if (rr.provenance || rr.mens?.provenance || rr.womens?.provenance) {
                          // Default whole-RR click opens the glass with both sides listed (user can click sides for specific)
                          setProvenanceCardKey(key);
                        }
                      }}
                      onSideDragStart={(side) => {
                        // Composite so source fade works on the RR wrapper + we can key provenance if needed
                        setDraggingKey(`${key}:${side}`);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zones - full 5-col x 2 rows for perfect symmetry and consistency with restrooms above */}
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] mb-2 pl-1">Zones</div>
            <div className="grid grid-cols-5 gap-3">
              {zoneKeys.map((key) => {
                const assignment = assignments[key] || { slotKey: key, slotType: "zone", tmName: null };
                const isDragging = draggingKey === key;
                const isDropTarget = (draggingKey && draggingKey !== key && getIsCompatible(draggingKey, key)) || (draggingFromRoster && !assignment.tmName);

                return (
                  <div
                    key={key}
                    draggable
                    onDragStart={handleDragStart(key)}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop(key)}
                    onDragEnd={handleDragEnd}
                    className={`transition-all ${isDragging ? "opacity-50 scale-[0.98]" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C]/40 rounded-3xl" : ""} ${provenanceCardKey && provenanceCardKey.startsWith(key) ? "ring-2 ring-[#C9A84C] shadow-md" : ""}`}
                  >
                    <PlanningCard
                      assignment={assignment}
                      showPencilHover={showPencil}
                      onToggleLock={() => handleOptimisticUpdate(key, { isLocked: !assignment.isLocked })}
                      onWhyClick={() => setProvenanceCardKey(key)}
                      onClick={() => {
                        if (!assignment.tmName) {
                          setPendingAssignKey(key);
                        } else if (assignment.provenance) {
                          setProvenanceCardKey(key);
                        }
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Support - consistent full-width section (symmetrical with other sections), 2 Aux cards centered */}
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] mb-2 pl-1">Support</div>
            <div className="grid grid-cols-5 gap-3">
              <div className="col-start-2">
                <div
                  draggable
                  onDragStart={handleDragStart(auxKeys[0])}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(auxKeys[0])}
                  onDragEnd={handleDragEnd}
                  className={`transition-all ${draggingKey === auxKeys[0] ? "opacity-50 scale-[0.98]" : ""} ${(draggingKey && draggingKey !== auxKeys[0] && getIsCompatible(draggingKey, auxKeys[0])) || (draggingFromRoster && !assignments[auxKeys[0]]?.tmName) ? "ring-2 ring-[#C9A84C]/40 rounded-3xl" : ""} ${auxKeys[0] === provenanceCardKey ? "ring-2 ring-[#C9A84C] shadow-md" : ""}`}
                >
                  <PlanningCard
                    assignment={assignments[auxKeys[0]] || { slotKey: auxKeys[0], slotType: "aux", tmName: null }}
                    showPencilHover={showPencil}
                    onToggleLock={() => handleOptimisticUpdate(auxKeys[0], { isLocked: !(assignments[auxKeys[0]]?.isLocked) })}
                    onWhyClick={() => setProvenanceCardKey(auxKeys[0])}
                    onClick={() => {
                      const a = assignments[auxKeys[0]] || { tmName: null };
                      if (!a.tmName) {
                        setPendingAssignKey(auxKeys[0]);
                      } else if (a.provenance) {
                        setProvenanceCardKey(auxKeys[0]);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="col-start-4">
                <div
                  draggable
                  onDragStart={handleDragStart(auxKeys[1])}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(auxKeys[1])}
                  onDragEnd={handleDragEnd}
                  className={`transition-all ${draggingKey === auxKeys[1] ? "opacity-50 scale-[0.98]" : ""} ${(draggingKey && draggingKey !== auxKeys[1] && getIsCompatible(draggingKey, auxKeys[1])) || (draggingFromRoster && !assignments[auxKeys[1]]?.tmName) ? "ring-2 ring-[#C9A84C]/40 rounded-3xl" : ""} ${auxKeys[1] === provenanceCardKey ? "ring-2 ring-[#C9A84C] shadow-md" : ""}`}
                >
                  <PlanningCard
                    assignment={assignments[auxKeys[1]] || { slotKey: auxKeys[1], slotType: "aux", tmName: null }}
                    showPencilHover={showPencil}
                    onToggleLock={() => handleOptimisticUpdate(auxKeys[1], { isLocked: !(assignments[auxKeys[1]]?.isLocked) })}
                    onWhyClick={() => setProvenanceCardKey(auxKeys[1])}
                    onClick={() => {
                      const a = assignments[auxKeys[1]] || { tmName: null };
                      if (!a.tmName) {
                        setPendingAssignKey(auxKeys[1]);
                      } else if (a.provenance) {
                        setProvenanceCardKey(auxKeys[1]);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Breaks - summonable, shown when toggled for visibility without cluttering main board */}
          {showBreaks && (
            <div className="mt-6 pt-6 border-t border-[#EDE4D3]">
              <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] mb-2 pl-1">Breaks (summoned)</div>
              <div className="grid grid-cols-5 gap-3">
                {breakKeys.map((key) => {
                  const assignment = assignments[key] || { slotKey: key, slotType: "break", tmName: null };
                  const isDragging = draggingKey === key;
                  const isDropTarget = (draggingKey && draggingKey !== key && getIsCompatible(draggingKey, key)) || (draggingFromRoster && !assignment.tmName);

                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={handleDragStart(key)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop(key)}
                      onDragEnd={handleDragEnd}
                      className={`transition-all ${isDragging ? "opacity-50 scale-[0.98]" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C]/40 rounded-3xl" : ""} ${provenanceCardKey && provenanceCardKey.startsWith(key) ? "ring-2 ring-[#C9A84C] shadow-md" : ""}`}
                    >
                      <PlanningCard
                        assignment={assignment}
                        showPencilHover={showPencil}
                        onToggleLock={() => handleOptimisticUpdate(key, { isLocked: !assignment.isLocked })}
                        onWhyClick={() => setProvenanceCardKey(key)}
                        onClick={() => {
                          if (!assignment.tmName) {
                            setPendingAssignKey(key);
                          } else if (assignment.provenance) {
                            setProvenanceCardKey(key);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Glass Overlay for Provenance — pops up respective to the card pressed.
            Strips away the permanent side panel so the planning board becomes the entire surface.
            Now fully supports per-side RR: composite keys like "RR1:mens" yield "Why Maya R. in RR1 (MENS)?" with that side's rationale/fairness. */}
        {provenanceCardKey && (() => {
          const provData = getProvenanceData(provenanceCardKey);
          if (!provData) return null;
          const { base, side } = parseProvenanceKey(provenanceCardKey);
          const baseAssign = assignments[base];
          if (!baseAssign) return null;

          const displayName = provData.tmName || "—";
          const sideLabel = side ? ` (${side.toUpperCase()})` : '';
          const rationale = provData.provenance?.rationale || (side ? (baseAssign as any)[side]?.provenance?.rationale : null) || "No detailed rationale recorded.";
          const signals = provData.provenance?.fairnessSignals || (side ? (baseAssign as any)[side]?.provenance?.fairnessSignals : null) || baseAssign.provenance?.fairnessSignals || null;

          return (
            <div 
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/10 backdrop-blur-[2px]"
              onClick={() => setProvenanceCardKey(null)}
            >
              <div 
                className="bg-white/95 backdrop-blur-md border border-white/30 rounded-3xl p-6 w-full max-w-md shadow-2xl mx-4"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] font-medium">Provenance</div>
                    <div className="text-lg font-semibold mt-1">
                      Why {displayName} in {base}{sideLabel}?
                    </div>
                  </div>
                  <button 
                    onClick={() => setProvenanceCardKey(null)} 
                    className="text-sm text-[#8B6F2E] hover:text-[#5C4A2E]"
                  >
                    Close
                  </button>
                </div>

                <div className="text-[15px] text-[#2F2F2D] leading-relaxed">
                  {rationale}
                </div>

                {/* Per-side RR details (even when viewing one side, surface the other for context) */}
                {baseAssign.slotType === "rr" && (baseAssign.mens || baseAssign.womens) && (
                  <div className="mt-4 text-sm border border-[#EDE4D3] rounded-xl p-3 bg-[#FAFAF8]">
                    {baseAssign.mens?.tmName && (
                      <div className={`mb-1 flex items-center gap-2 ${side === 'mens' ? 'font-semibold text-[#1C1C1E]' : 'text-[#3A3A38]'}`}>
                        ♂ MENS: <span>{baseAssign.mens.tmName}</span>
                        {baseAssign.mens.provenance?.confidence !== undefined && (
                          <span className="text-[10px] text-[#8B6F2E] tabular-nums">{Math.round(baseAssign.mens.provenance.confidence * 100)}%</span>
                        )}
                      </div>
                    )}
                    {baseAssign.womens?.tmName && (
                      <div className={`flex items-center gap-2 ${side === 'womens' ? 'font-semibold text-[#1C1C1E]' : 'text-[#3A3A38]'}`}>
                        ♀ WOMENS: <span>{baseAssign.womens.tmName}</span>
                        {baseAssign.womens.provenance?.confidence !== undefined && (
                          <span className="text-[10px] text-[#8B6F2E] tabular-nums">{Math.round(baseAssign.womens.provenance.confidence * 100)}%</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {signals && Object.keys(signals).length > 0 && (
                  <div className="mt-5 pt-4 border-t border-[#EDE4D3]">
                    <div className="text-[10px] uppercase tracking-[1.5px] text-[#6E6E6A] mb-2.5">Fairness Signals</div>
                    <div className="space-y-2 text-sm">
                      {Object.entries(signals).map(([k, v]) => (
                        <div key={k} className="flex justify-between items-center bg-[#F9F6EF] rounded px-3 py-1.5">
                          <span className="text-[#6E6E6A] capitalize">{k}</span>
                          <span className="font-mono font-semibold tabular-nums text-[#3A3A38]">{Number(v).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-5 pt-4 border-t text-[10px] text-[#8B6F2E]/70">
                  This is the heartbeat of the system — engine intelligence combined with human factors. Click a side on any RR card for its specific why.
                </div>
              </div>
            </div>
          );
        })()}

        {/* Available Team - Drag source for assign (supports "drag to assign") */}
        <div className="mt-8">
          <div className="text-[10px] uppercase tracking-[2px] text-[#8B6F2E] mb-2">Available Team (drag to empty slot)</div>
          <div className="flex flex-wrap gap-2">
            {["Alex Rivera", "Jordan Hale", "Taylor Kim", "Casey Brooks", "Morgan Ellis", "Sam Patel"].map((name, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", `roster:${name}`);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingFromRoster(true);
                }}
                onDragEnd={() => setDraggingFromRoster(false)}
                className="px-3 py-1 text-sm border border-[#EDE4D3] rounded-full bg-white hover:bg-[#F9F6EF] cursor-grab active:cursor-grabbing text-[#3A3A38]"
              >
                {name}
              </div>
            ))}
          </div>
          <div className="text-[10px] text-[#A3A39F] mt-1">Drag a person from here onto any empty compatible slot on the board.</div>
        </div>

        {/* Future Controls / Debug */}
        <div className="mt-12 pt-8 border-t text-xs text-[#A3A39F]">
          Dedicated v1 test surface at <code>/dev/shiftbuilderv1</code>. 
          Drag board cards to assign/swap (same type). Drag from Team list to empty slots. 
          Pencil mode for hover. Provenance is the heartbeat (click gold areas).
        </div>
      </div>
    </div>
  );
}

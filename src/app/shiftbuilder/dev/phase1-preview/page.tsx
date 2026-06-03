"use client";

import React from "react";
import { PlanningCard } from "../../ui/cards/PlanningCard";   // New decomposed architecture
import { ZonePlanningCard } from "../../ui/cards/ZonePlanningCard";
import { RestroomPlanningCard } from "../../ui/cards/RestroomPlanningCard";
import { AuxPlanningCard } from "../../ui/cards/AuxPlanningCard";
import { BreakPlanningCard } from "../../ui/cards/BreakPlanningCard";
// Local dev shape for the isolated Phase 1 preview (mirrors the Phase 0 unified model + provenance).
// The real ShiftAssignment lives in production store; this keeps the preview 100% independent.
type ShiftAssignment = {
  slotKey: string;
  slotType?: string;
  tmName?: string | null;
  tmId?: string | null;
  isLocked?: boolean;
  source?: "engine" | "manual" | string;
  provenance?: {
    rationale?: string;
    confidence?: number;
    fairnessSignals?: Record<string, number>;
  };
  rrSide?: "mens" | "womens";
  tasks?: string[];
  [key: string]: any;
};

/**
 * Phase 1 Preview – Isolated dev surface
 * Route: /shiftbuilder/dev/phase1-preview
 *
 * Purpose: Fast, safe experimentation with the new unified interaction model
 * (PlanningCard, pencil hover, optimistic updates, contextual power surface)
 * without touching the main production ShiftBuilder.
 */

export default function Phase1PreviewPage() {
  // Full 10 Zone + 5 Restroom demo data for the Phase 1 board
  // Structured for excellent scannability and premium paper-like UX
  const [assignments, setAssignments] = React.useState<Record<string, ShiftAssignment>>({
    // === ZONES (10) ===
    Z1: { slotKey: "Z1", slotType: "zone", tmName: "Maya R.", source: "engine", isLocked: false, provenance: { rationale: "Strong skill match + pair affinity", confidence: 0.92, fairnessSignals: { rotation: 0.4, affinity: 1.2, load: 0.65 } } },
    Z2: { slotKey: "Z2", slotType: "zone", tmName: "Jordan Hale", source: "engine", isLocked: true, provenance: { rationale: "Best coverage for peak hours", confidence: 0.81, fairnessSignals: { rotation: 0.7, affinity: 0.9, load: 0.8 } } },
    Z3: { slotKey: "Z3", slotType: "zone", tmName: null, source: "manual", isLocked: false },
    Z4: { slotKey: "Z4", slotType: "zone", tmName: "Alex Rivera", source: "engine", isLocked: false, provenance: { rationale: "Excellent recent performance", confidence: 0.88, fairnessSignals: { rotation: 0.5, affinity: 1.1, load: 0.7 } } },
    Z5: { slotKey: "Z5", slotType: "zone", tmName: "Taylor Kim", source: "manual", isLocked: false, provenance: { rationale: "Good availability this shift", confidence: 0.71, fairnessSignals: { rotation: 0.9, affinity: 0.6, load: 0.9 } } },
    Z6: { slotKey: "Z6", slotType: "zone", tmName: null, source: "manual", isLocked: false },
    Z7: { slotKey: "Z7", slotType: "zone", tmName: "Casey Brooks", source: "engine", isLocked: false, provenance: { rationale: "Strong zone knowledge", confidence: 0.95, fairnessSignals: { rotation: 0.3, affinity: 1.4, load: 0.5 } } },
    Z8: { slotKey: "Z8", slotType: "zone", tmName: "Morgan Ellis", source: "engine", isLocked: true, provenance: { rationale: "Best available for this zone", confidence: 0.84, fairnessSignals: { rotation: 0.6, affinity: 0.8, load: 0.75 } } },
    Z9: { slotKey: "Z9", slotType: "zone", tmName: null, source: "manual", isLocked: false },
    Z10: { slotKey: "Z10", slotType: "zone", tmName: "Sam Patel", source: "engine", isLocked: false, provenance: { rationale: "Solid all-rounder", confidence: 0.79, fairnessSignals: { rotation: 0.8, affinity: 0.7, load: 0.85 } } },

    // === RESTROOMS (5) ===
    RR1: { slotKey: "RR1", slotType: "rr", rrSide: "mens", tmName: "Marcus T.", source: "engine", isLocked: false, provenance: { rationale: "Reliable RR coverage", confidence: 0.86, fairnessSignals: { rotation: 0.5, load: 0.6 } } },
    RR2: { slotKey: "RR2", slotType: "rr", rrSide: "womens", tmName: null, source: "manual", isLocked: false },
    RR3: { slotKey: "RR3", slotType: "rr", rrSide: "mens", tmName: "Priya S.", source: "engine", isLocked: false, provenance: { rationale: "Best available for this area", confidence: 0.91, fairnessSignals: { rotation: 0.4, load: 0.7 } } },
    RR4: { slotKey: "RR4", slotType: "rr", rrSide: "womens", tmName: "Jordan Hale", source: "manual", isLocked: true },
    RR5: { slotKey: "RR5", slotType: "rr", rrSide: "mens", tmName: null, source: "manual", isLocked: false },
  });

  const [showPencil, setShowPencil] = React.useState(true);
  const [showRoster, setShowRoster] = React.useState(false);
  const [pendingAssignKey, setPendingAssignKey] = React.useState<string | null>(null);
  const [whyForKey, setWhyForKey] = React.useState<string | null>(null);

  // Simple undo stack for the preview (Phase 1 demo of safety)
  const [history, setHistory] = React.useState<any[]>([]);

  const updateAssignment = (key: string, changes: Partial<ShiftAssignment>) => {
    setHistory((h) => [...h, assignments].slice(-8)); // keep last 8 states
    setAssignments((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...changes },
    }));
  };

  const undoLastChange = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setAssignments(previous);
    setHistory((h) => h.slice(0, -1));
  };

  const handleOptimisticClear = (key: string) => {
    updateAssignment(key, { tmName: null, tmId: null, source: "manual" });
  };

  const handleOptimisticLockToggle = (key: string) => {
    const current = assignments[key];
    updateAssignment(key, { isLocked: !current.isLocked });
  };

  const handleQuickAddTask = (key: string) => {
    const current = assignments[key];
    const existingTasks = current.tasks || [];
    const newTask = "Restock supplies";
    updateAssignment(key, {
      tasks: [...existingTasks, newTask],
    });
  };

  const [activeMenuKey, setActiveMenuKey] = React.useState<string | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number } | null>(null);

  const handleContextAction = (key: string, action: string) => {
    if (action === "clear") {
      handleOptimisticClear(key);
      setActiveMenuKey(null);
    }
    if (action === "lock") {
      handleOptimisticLockToggle(key);
      setActiveMenuKey(null);
    }
    if (action === "open-menu") {
      // Simple inline menu for the dev preview (we'll replace with real glass ContextMenu later)
      setActiveMenuKey(key);
      // For now just center a small menu; in real use we'd pass real coordinates
      setMenuPosition({ x: 400, y: 300 });
    }
  };

  const closeMenu = () => {
    setActiveMenuKey(null);
    setMenuPosition(null);
  };

  const resetPreview = () => {
    // Use the exact same deterministic data as initial state
    setAssignments({
      Z1: {
        slotKey: "Z1",
        slotType: "zone",
        tmName: "Maya R.",
        tmId: "tm-maya-r",
        isLocked: false,
        source: "engine",
        provenance: {
          rationale: "Strong skill match + pair affinity with current team",
          confidence: 0.87,
          fairnessSignals: { rotation: 0.4, affinity: 1.2, load: 0.65 },
        },
      },
      Z5: {
        slotKey: "Z5",
        slotType: "zone",
        tmName: null,
        isLocked: false,
        source: "manual",
      },
      MRR2: {
        slotKey: "MRR2",
        slotType: "rr",
        rrSide: "mens",
        tmName: "Marcus T.",
        tmId: "tm-marcus-t",
        isLocked: false,
        source: "engine",
        provenance: {
          rationale: "Best available for RR coverage this week",
          confidence: 0.79,
          fairnessSignals: { rotation: 0.8, load: 0.5 },
        },
      },
      AUX: {
        slotKey: "AUX",
        slotType: "aux",
        tmName: "Priya S.",
        tmId: "tm-priya-s",
        isLocked: false,
        source: "manual",
      },
    });
  };

  return (
    <div className="min-h-screen bg-[var(--sb-substrate,#FAFAF8)] p-8 text-[#1C1C1E]">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-[2px] text-muted-foreground mb-1">
              DEV PREVIEW
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Phase 1 Preview — Seamless Awe</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Decomposed cards (ui/cards/) • CardShell + gold Pencil ring • Optimistic actions • Inline provenance
            </p>
            <p className="text-xs text-muted-foreground/70 mt-2">
              Hover (mouse/pen) for gold ring + “Edit” cue • Tap % or rationale → “Why this feels fair” panel • Right-click / long-press → context
            </p>
            <p className="text-[10px] text-[#8B6F2E]/80 mt-1.5 tracking-tight">
              Architecture: Thin <code>PlanningCard</code> orchestrator + dedicated <code>Zone / Restroom / Aux / BreakPlanningCard</code> + shared <code>CardShell</code>. All work isolated here.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={undoLastChange}
              disabled={history.length === 0}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-surface-2 active:bg-surface-3 transition disabled:opacity-40"
            >
              Undo Last
            </button>
            <button
              onClick={resetPreview}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-surface-2 active:bg-surface-3 transition"
            >
              Reset Preview
            </button>
            <button
              onClick={() => setShowRoster(!showRoster)}
              className="px-4 py-2 text-sm rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/5 hover:bg-[#C9A84C]/15 active:bg-[#C9A84C]/20 text-[#8B6F2E] transition font-medium"
            >
              {showRoster ? "Dismiss Roster" : "Summon Roster"}
            </button>
          </div>
        </div>

        <div className="flex gap-6 items-start">
          {/* Main Board Area — Premium paper-like operations grid */}
          <div className="flex-1 space-y-8">

            {/* === ZONES (10) === */}
            <div>
              <div className="flex items-end justify-between mb-3 pb-2 border-b border-[#EDE4D3]">
                <div>
                  <div className="text-[11px] uppercase tracking-[2.5px] text-[#8B6F2E] font-medium">Zones</div>
                  <div className="text-[10px] text-[#6E6E6A] mt-0.5">10 positions • Full coverage</div>
                </div>
                <div className="text-[10px] font-medium text-[#8B6F2E]">10 / 10</div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {["Z1","Z2","Z3","Z4","Z5","Z6","Z7","Z8","Z9","Z10"].map((key) => {
                  const assignment = assignments[key] || { slotKey: key, slotType: "zone", tmName: null, isLocked: false, source: "manual" };
                  return (
                    <PlanningCard
                      key={key}
                      assignment={assignment}
                      showPencilHover={showPencil}
                      onToggleLock={() => handleOptimisticLockToggle(key)}
                      onContextAction={(action) => handleContextAction(key, action)}
                      onWhyClick={() => setWhyForKey(key)}
                      onClick={() => {
                        if (!assignment.tmName) {
                          setPendingAssignKey(key);
                          if (!showRoster) setShowRoster(true);
                        } else if (assignment.provenance) {
                          setWhyForKey(key);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* === RESTROOMS (5) === */}
            <div>
              <div className="flex items-end justify-between mb-3 pb-2 border-b border-[#EDE4D3]">
                <div>
                  <div className="text-[11px] uppercase tracking-[2.5px] text-[#8B6F2E] font-medium">Restrooms</div>
                  <div className="text-[10px] text-[#6E6E6A] mt-0.5">5 positions • Gender balanced</div>
                </div>
                <div className="text-[10px] font-medium text-[#8B6F2E]">3 / 5</div>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {["RR1","RR2","RR3","RR4","RR5"].map((key) => {
                  const assignment = assignments[key] || { slotKey: key, slotType: "rr", tmName: null, isLocked: false, source: "manual" };
                  return (
                    <PlanningCard
                      key={key}
                      assignment={assignment}
                      showPencilHover={showPencil}
                      onToggleLock={() => handleOptimisticLockToggle(key)}
                      onContextAction={(action) => handleContextAction(key, action)}
                      onWhyClick={() => setWhyForKey(key)}
                      onClick={() => {
                        if (!assignment.tmName) {
                          setPendingAssignKey(key);
                          if (!showRoster) setShowRoster(true);
                        } else if (assignment.provenance) {
                          setWhyForKey(key);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>

          </div>

          {/* Right sidebar — Roster is now a summonable guest (not permanent rail) */}
          <div className="w-80 flex-shrink-0 space-y-4 border-l pl-6">
            {/* Summonable Roster */}
            {showRoster && (
              <div className="border rounded-xl p-4 bg-white">
                <div className="text-sm font-semibold mb-3 flex items-center justify-between">
                  <span>Roster (guest)</span>
                  <span className="text-[10px] text-muted-foreground/60">tap to assign</span>
                </div>
                <div className="space-y-1 text-sm">
                  {["Alex Rivera", "Jordan Hale", "Taylor Kim", "Casey Brooks", "Morgan Ellis"].map((name, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (pendingAssignKey) {
                          updateAssignment(pendingAssignKey, {
                            tmName: name,
                            tmId: `tm-${name.toLowerCase().replace(" ", "-")}`,
                            source: "manual",
                          });
                          setPendingAssignKey(null);
                        } else {
                          console.log("No empty slot selected. Click an empty card first.");
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-100 border border-transparent hover:border-border transition"
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-muted-foreground/70">
                  {pendingAssignKey 
                    ? `Selected: ${pendingAssignKey} — click a person above to assign` 
                    : showRoster 
                      ? "Click an empty card (or tap here) to assign"
                      : "Tap an empty card — roster will appear automatically for seamless assignment"}
                </div>

                {pendingAssignKey && (
                  <button
                    onClick={() => handleQuickAddTask(pendingAssignKey)}
                    className="mt-3 w-full text-sm px-3 py-2 rounded-lg border border-border hover:bg-amber-50 active:bg-amber-100 text-amber-700 transition"
                  >
                    Quick Add Task (Optimistic)
                  </button>
                )}
              </div>
            )}

            {/* Why? / Provenance Panel — refined to match the calm, premium style in the target image */}
            {whyForKey && assignments[whyForKey]?.provenance ? (
              <div 
                key={whyForKey} 
                className="p-5 rounded-2xl border bg-white shadow-sm transition-all duration-200 opacity-100 translate-y-0"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[1.5px] text-[#8B6F2E] mb-0.5">PROVENANCE</div>
                    <div className="font-semibold text-[15px] leading-tight text-[#1C1C1E]">
                      Why <span className="font-medium">{assignments[whyForKey].tmName}</span> in <span className="font-medium">{whyForKey}</span>?
                    </div>
                  </div>
                  <button 
                    onClick={() => setWhyForKey(null)} 
                    className="text-[10px] text-[#8B6F2E] hover:text-[#6B5330] px-2 py-0.5 -mr-1 rounded transition"
                  >
                    Close
                  </button>
                </div>

                <div className="text-[13px] text-[#3A3A38] leading-relaxed mb-4">
                  {assignments[whyForKey].provenance?.rationale}
                </div>

                {assignments[whyForKey].provenance?.fairnessSignals && (
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[1px] text-muted-foreground mb-2">Fairness &amp; Load Signals</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(assignments[whyForKey].provenance.fairnessSignals).map(([key, value]) => (
                        <div 
                          key={key} 
                          className="flex items-center gap-1 rounded-full bg-[#F4F0E7] px-2 py-0.5 text-[10px] text-[#5C4A2E]"
                        >
                          <span className="text-[#8B6F2E]/80">{key}</span>
                          <span className="font-mono font-medium tabular-nums">{Number(value).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-3 border-t text-[9px] text-[#8B6F2E]/60 leading-snug">
                  This data will come from the live engine + Grok reasoning in production.
                </div>
              </div>
            ) : (
              <div className="p-4 text-[11px] text-[#7A7A75] border border-dashed border-[#D9D6CF] rounded-2xl bg-white/60 leading-snug">
                Click the confidence badge (%) or the rationale text on any card that has provenance data to open the detailed “Why this assignment?” panel.
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-xs text-muted-foreground/70 space-y-1">
          <div>• Pencil hover (simulated): hover with mouse while “Pencil mode” feels active.</div>
          <div>• Right-click or long-press any card → opens contextual actions (demo).</div>
          <div>• “Clear” and “Lock” actions are optimistic (instant local feedback).</div>
          <div>• Click % or rationale text on a card → opens the "Why this assignment?" panel on the right.</div>
          <div>• Click an empty card → it becomes selected for roster assignment (see right sidebar).</div>
        </div>

        {/* Component Inventory — shows the new decomposed architecture in action */}
        <div className="mt-12 pt-8 border-t">
          <div className="text-sm font-semibold tracking-wider text-muted-foreground mb-4">CARD SYSTEM (NEW ARCHITECTURE)</div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground mb-2">Zone</div>
              <ZonePlanningCard 
                assignment={{
                  slotKey: "Z9",
                  slotType: "zone",
                  tmName: "Elena Voss",
                  isLocked: false,
                  source: "engine",
                  provenance: { rationale: "Highest combined score this week", confidence: 0.93 }
                }} 
                showPencilHover={showPencil}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground mb-2">Restroom</div>
              <RestroomPlanningCard 
                assignment={{
                  slotKey: "WRR3",
                  slotType: "rr",
                  rrSide: "womens",
                  tmName: null,
                  isLocked: false,
                  source: "manual"
                }} 
                showPencilHover={showPencil}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground mb-2">Aux / Support</div>
              <AuxPlanningCard 
                assignment={{
                  slotKey: "AUX",
                  slotType: "aux",
                  tmName: "Marcus T.",
                  isLocked: true,
                  source: "manual"
                }} 
                showPencilHover={showPencil}
              />
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground mb-2">Break (Early)</div>
              <BreakPlanningCard 
                assignment={{
                  slotKey: "BW2-Row1",
                  slotType: "break",
                  tmName: "Taylor Kim",
                  isLocked: false,
                  source: "engine"
                }} 
                showPencilHover={showPencil}
              />
            </div>
          </div>

          <div className="mt-3 text-[10px] text-muted-foreground/60">
            Each card type is now its own focused, maintainable component. This is the foundation for long-term velocity and quality.
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showPencil}
              onChange={(e) => setShowPencil(e.target.checked)}
            />
            Enable pencil hover affordance
          </label>
        </div>
      </div>
    </div>
  );
}

// Demo data is now fully static/deterministic to prevent hydration mismatches.

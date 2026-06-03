"use client";

import React from "react";
import { BookPlanningCard } from "../../ui/book-cards/BookPlanningCard";
import { getBookZoneColor, getRestroomLabel } from "../../ui/book-cards/book-utils";

/**
 * ShiftBuilder v1.5 — Weekly Zone Deployment Book (8.5x11 Paper Artboard)
 *
 * This is the new dedicated dev surface that takes the proven precision
 * (decomposed cards, per-side restroom model, drag-to-assign/swap from board + roster,
 * optimistic updates, side-aware provenance) and re-presents it as the exact
 * "Figma/Canva" print-style Weekly Zone Deployment Book shown in the reference image.
 *
 * The interactive artboard is a literal 8.5x11 paper simulation:
 * - Centered white page with subtle shadow + thin border
 * - Exact section layout, card visuals, typography density, colored accents
 * - Surrounding editor chrome (today nav, Deploy/Breaks, Search·Assign·Command, Fit, print, avatar)
 *
 * Everything remains fully live: drag people between zones, onto specific MENS/WOMENS halves,
 * roster → board, x to unassign, click for glass provenance "why", etc.
 */

type DevAssignment = {
  slotKey: string;
  slotType?: string;
  tmName?: string | null;
  isLocked?: boolean;
  source?: "engine" | "manual";
  provenance?: { rationale?: string; confidence?: number; fairnessSignals?: Record<string, number> };
  mens?: { tmName?: string | null; source?: string; provenance?: any } | null;
  womens?: { tmName?: string | null; source?: string; provenance?: any } | null;
  coverage?: number;
  auxPill?: string;
  subLocations?: string[];
  [k: string]: any;
};

const ZONE_KEYS = ["Z1","Z2","Z3","Z4","Z5","Z6","Z7","Z8","Z9","Z10"];
const RR_KEYS = ["RR1+2","RR6","RR7","RR8","RR10"]; // labels match artboard (RR 1+2 etc)
const AUX_KEYS = ["AUX_Z9","AUX_ADMIN","AUX_TRASH1","AUX_TRASH2","AUX_SUPPORT1","AUX_SUPPORT2"];

export default function ShiftBuilderV15Page() {
  // Seed data crafted to closely match the reference screenshot while keeping full 10Z + 5RR coverage
  const [assignments, setAssignments] = React.useState<Record<string, DevAssignment>>({
    // Zones - exact match to the reference artboard screenshot
    Z1: { slotKey: "Z1", slotType: "zone", tmName: "Kaiden", coverage: 3, subLocations: ["Elevators & Stairwells", "Outdoor Smoking Area"], provenance: { rationale: "Strong opener + elevator coverage", confidence: 0.94 } },
    Z2: { slotKey: "Z2", slotType: "zone", tmName: "Jason", coverage: 1, subLocations: ["And Lobby"], provenance: { rationale: "Lobby expert", confidence: 0.88 } },
    Z3: { slotKey: "Z3", slotType: "zone", tmName: "Jack", coverage: 2, subLocations: [] },
    Z4: { slotKey: "Z4", slotType: "zone", tmName: "Tawnya", coverage: 1, subLocations: ["High Limit Table Games", "Indoor TM Smoking Room"], provenance: { rationale: "High limit tables specialist", confidence: 0.91 } },
    Z5: { slotKey: "Z5", slotType: "zone", tmName: "Seth", coverage: 1, subLocations: ["High Limit Table Games", "Indoor TM Smoking Room"] },
    Z6: { slotKey: "Z6", slotType: "zone", tmName: "Robby", coverage: 1, subLocations: ["Outdoor Smoking Area"], isLocked: true },
    Z7: { slotKey: "Z7", slotType: "zone", tmName: "Jared", coverage: 1, subLocations: ["Pit 1 + 2", "South Door Glass"], provenance: { rationale: "Pit + glass coverage", confidence: 0.85 } },
    Z8: { slotKey: "Z8", slotType: "zone", tmName: "Sam", coverage: 2, subLocations: ["Pit 3"] },
    Z9: { slotKey: "Z9", slotType: "zone", tmName: "Joy", coverage: 1, subLocations: ["Social Bar Tables"] },
    Z10: { slotKey: "Z10", slotType: "zone", tmName: "Peter", coverage: 1, subLocations: ["High Limit Slots", "East Door Glass", "Outside Smoking Area"], provenance: { rationale: "High limit + pit 4", confidence: 0.89 } },

    // Restrooms — per side exactly as requested in prior work. Data matches image splits. Key "RR1+2" for label "RR 1+2"
    "RR1+2": {
      slotKey: "RR1+2", slotType: "rr",
      mens: { tmName: "Alec", source: "engine", provenance: { rationale: "Buffet + family reliability" } },
      womens: { tmName: "Nikki", source: "engine", provenance: { rationale: "Strong family RR coverage" } },
    },
    RR6: {
      slotKey: "RR6", slotType: "rr",
      mens: { tmName: "Carter" },
      womens: { tmName: "Amanda" },
    },
    RR7: {
      slotKey: "RR7", slotType: "rr",
      mens: { tmName: "Drew" },
      womens: { tmName: "Jessica" },
    },
    RR8: {
      slotKey: "RR8", slotType: "rr",
      mens: { tmName: "Steve" },
      womens: { tmName: "Jamie" },
    },
    RR10: {
      slotKey: "RR10", slotType: "rr",
      mens: { tmName: "Gary" },
      womens: { tmName: "Silvia" },
    },

    // Auxiliary — 2 filled (matching image) + 4 unassigned dashed
    AUX_Z9: { slotKey: "AUX_Z9", slotType: "aux", tmName: "Mike S", auxPill: "Z9 SR", coverage: 3 },
    AUX_ADMIN: { slotKey: "AUX_ADMIN", slotType: "aux", tmName: "Sherry B", auxPill: "ADMIN", coverage: 2 },
    AUX_TRASH1: { slotKey: "AUX_TRASH1", slotType: "aux", tmName: null, coverage: 3 },
    AUX_TRASH2: { slotKey: "AUX_TRASH2", slotType: "aux", tmName: null, coverage: 3 },
    AUX_SUPPORT1: { slotKey: "AUX_SUPPORT1", slotType: "aux", tmName: null, coverage: 2 },
    AUX_SUPPORT2: { slotKey: "AUX_SUPPORT2", slotType: "aux", tmName: null, coverage: 2 },

    // Breaks (summoned via header)
    BW1: { slotKey: "BW1", slotType: "break", tmName: "Taylor Kim" },
    BW2: { slotKey: "BW2", slotType: "break", tmName: null },
    BW3: { slotKey: "BW3", slotType: "break", tmName: "Alex Rivera" },
  });

  const [scale, setScale] = React.useState(1.0);
  const [provenanceKey, setProvenanceKey] = React.useState<string | null>(null);
  const [draggingKey, setDraggingKey] = React.useState<string | null>(null);
  const [draggingFromRoster, setDraggingFromRoster] = React.useState(false);
  const [highlightRR, setHighlightRR] = React.useState<{ key: string; side: 'mens'|'womens' } | null>(null);
  const [showBreaks, setShowBreaks] = React.useState(false);

  const handleOptimistic = (key: string, changes: Partial<DevAssignment>) => {
    setAssignments(prev => ({ ...prev, [key]: { ...prev[key], ...changes } }));
  };

  // Core per-side helpers (lifted from the proven v1 work for precision)
  const assignToRRSide = (rrKey: string, side: 'mens' | 'womens', person: string) => {
    const rr = { ...assignments[rrKey] };
    if (side === 'mens') rr.mens = { tmName: person, source: "manual" };
    else rr.womens = { tmName: person, source: "manual" };
    handleOptimistic(rrKey, rr);
  };
  const clearRRSide = (rrKey: string, side: 'mens' | 'womens') => {
    const rr = { ...assignments[rrKey] };
    if (side === 'mens') rr.mens = null; else rr.womens = null;
    handleOptimistic(rrKey, rr);
  };

  const getSideForPosition = (e: React.DragEvent | React.MouseEvent, el: HTMLElement | null): 'mens' | 'womens' | null => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const y = 'clientY' in e ? (e as any).clientY : (e as React.MouseEvent).clientY;
    return y < rect.top + rect.height / 2 ? 'mens' : 'womens';
  };

  // Drag & drop (board + roster, side-aware for RR)
  const handleDragStart = (key: string) => (e: React.DragEvent) => {
    setDraggingKey(key);
    e.dataTransfer.setData("text/plain", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = e.dataTransfer.getData("text/plain");
    if (!src || src === targetKey) { setDraggingKey(null); return; }

    const isRoster = src.startsWith("roster:");
    const person = isRoster ? src.split(":")[1] : null;

    const target = assignments[targetKey];
    const isRR = targetKey.startsWith("RR");

    if (isRoster && person) {
      if (isRR) {
        // pick first open side for outer drop; precise halves use onDropToSide
        if (!target.mens?.tmName) assignToRRSide(targetKey, 'mens', person);
        else if (!target.womens?.tmName) assignToRRSide(targetKey, 'womens', person);
      } else if (!target?.tmName) {
        handleOptimistic(targetKey, { tmName: person, source: "manual" });
      }
      setDraggingKey(null);
      setDraggingFromRoster(false);
      return;
    }

    // Side-to-side or side-to-zone (RR person moving)
    if (src.includes(":")) {
      const [srcKey, srcSide] = src.split(":") as [string, 'mens'|'womens'];
      const srcRR = assignments[srcKey];
      const personName = (srcRR as any)[srcSide]?.tmName;
      if (!personName) { setDraggingKey(null); return; }

      if (isRR) {
        assignToRRSide(targetKey, srcSide, personName);
        clearRRSide(srcKey, srcSide);
      } else {
        handleOptimistic(targetKey, { tmName: personName, source: "manual" });
        clearRRSide(srcKey, srcSide);
      }
      setDraggingKey(null);
      return;
    }

    // Plain zone/aux <-> zone/aux or zone -> RR
    const source = assignments[src];
    if (!source) { setDraggingKey(null); return; }

    if (isRR && source.tmName) {
      // move person from zone/aux into an open RR side (first available)
      if (!target.mens?.tmName) assignToRRSide(targetKey, 'mens', source.tmName);
      else if (!target.womens?.tmName) assignToRRSide(targetKey, 'womens', source.tmName);
      handleOptimistic(src, { tmName: null });
      setDraggingKey(null);
      return;
    }

    if (target?.tmName && source.tmName) {
      // swap
      const t = { ...target };
      handleOptimistic(targetKey, { ...source });
      handleOptimistic(src, t);
    } else if (source.tmName && !target?.tmName) {
      handleOptimistic(targetKey, { ...source, tmName: source.tmName });
      handleOptimistic(src, { ...source, tmName: null });
    }
    setDraggingKey(null);
  };

  const handleDragEnd = () => { setDraggingKey(null); setDraggingFromRoster(false); setHighlightRR(null); };

  // Side-specific drop from the halves inside BookRestroomCard
  const handleDropToSide = (rrKey: string, side: 'mens' | 'womens') => (e: React.DragEvent) => {
    e.stopPropagation(); e.preventDefault();
    const src = e.dataTransfer.getData("text/plain");
    if (src.startsWith("roster:")) {
      assignToRRSide(rrKey, side, src.split(":")[1]);
    } else if (src.includes(":")) {
      const [sKey, sSide] = src.split(":") as any;
      const p = assignments[sKey]?.[sSide]?.tmName;
      if (p) { assignToRRSide(rrKey, side, p); clearRRSide(sKey, sSide); }
    } else {
      const s = assignments[src];
      if (s?.tmName) {
        assignToRRSide(rrKey, side, s.tmName);
        handleOptimistic(src, { tmName: null });
      }
    }
    setDraggingKey(null);
    setHighlightRR(null);
  };

  const handleSideDragStart = (rrKey: string, side: 'mens' | 'womens') => () => {
    setDraggingKey(`${rrKey}:${side}`);
  };

  // Click handlers (open glass provenance)
  const openProvenance = (key: string, side?: 'mens' | 'womens') => {
    setProvenanceKey(side ? `${key}:${side}` : key);
  };

  const closeProvenance = () => setProvenanceKey(null);

  const getProvData = (key: string | null) => {
    if (!key) return null;
    const [base, side] = key.includes(":") ? key.split(":") : [key, null];
    const a = assignments[base];
    if (!a) return null;
    const niceSlot = base.startsWith("RR") ? getRestroomLabel(base) : base;
    if (side) {
      const sd = (a as any)[side];
      return { name: sd?.tmName, rationale: sd?.provenance?.rationale || "No rationale recorded.", slot: `${niceSlot} (${side.toUpperCase()})` };
    }
    return { name: a.tmName, rationale: a.provenance?.rationale || "No rationale recorded.", slot: niceSlot };
  };

  // Roster (available people — drag source)
  const roster = ["Alex Rivera", "Jordan Hale", "Taylor Kim", "Casey Brooks", "Morgan Ellis", "Sam Patel", "Priya S.", "Marcus T."];

  // Dynamic filled counts for the header badges
  const zoneFilled = `${ZONE_KEYS.filter(k => assignments[k]?.tmName).length} / ${ZONE_KEYS.length} FILLED`;
  const rrFilled = `${RR_KEYS.filter(k => assignments[k]?.mens?.tmName || assignments[k]?.womens?.tmName).length} / ${RR_KEYS.length} FILLED`;
  const auxFilled = `${AUX_KEYS.filter(k => assignments[k]?.tmName).length} / ${AUX_KEYS.length} FILLED`;

  // Simple breaks summary (from header in image)
  const breaksSummary = [4, 7, 3];

  // Render a card with all the wiring
  const renderCard = (key: string) => {
    const a = assignments[key] || { slotKey: key };
    const isRR = key.startsWith("RR");
    const isDrag = draggingKey === key || (draggingKey && draggingKey.startsWith(key + ":"));
    const isTarget = !!draggingKey && draggingKey !== key && !draggingKey.startsWith(key + ":");
    const hl = highlightRR && highlightRR.key === key ? highlightRR.side : null;

    // For RR cards we wrap so we can do side-aware hover highlight + outer drop
    if (isRR) {
      return (
        <div
          key={key}
          onDragOver={(e) => {
            handleDragOver(e);
            // live side highlight while dragging over the whole RR card
            const side = getSideForPosition(e, e.currentTarget as HTMLElement);
            if (side) setHighlightRR({ key, side });
          }}
          onDragLeave={() => setHighlightRR(null)}
          onDrop={(e) => {
            const side = getSideForPosition(e, e.currentTarget as HTMLElement);
            if (side) {
              // delegate to the precise side handler
              const fakeEvent = { ...e, stopPropagation: () => {}, preventDefault: () => {} } as any;
              handleDropToSide(key, side)(fakeEvent);
            } else {
              handleDrop(key)(e);
            }
            setHighlightRR(null);
          }}
          onDragEnd={handleDragEnd}
          className={`h-full ${isDrag ? "opacity-50" : ""}`}
        >
          <BookPlanningCard
            assignment={a}
            onClick={() => openProvenance(key)}
            onClickSide={(s) => openProvenance(key, s)}
            onDropToSide={(side, e) => {
              // adapter: BookRestroomCard calls with (side, e); our helper is curried as handleDropToSide(rrKey)(side)(e) no — handleDropToSide(rrKey, side) returns the event handler
              const handler = handleDropToSide(key, side);
              if (handler) handler(e as any);
            }}
            onDragStart={handleDragStart(key)}
            onSideDragStart={(s) => handleSideDragStart(key, s)()}
            onUnassign={() => handleOptimistic(key, { tmName: null, mens: null, womens: null })}
            onUnassignSide={(s) => clearRRSide(key, s)}
            isDragging={!!isDrag}
            isDropTarget={isTarget}
            highlightSide={hl}
          />
        </div>
      );
    }

    return (
      <div
        key={key}
        onDragOver={handleDragOver}
        onDrop={handleDrop(key)}
        onDragEnd={handleDragEnd}
        className={`h-full ${isDrag ? "opacity-50" : ""}`}
      >
        <BookPlanningCard
          assignment={a}
          onClick={() => openProvenance(key)}
          onDragStart={handleDragStart(key)}
          onUnassign={() => handleOptimistic(key, { tmName: null })}
          isDragging={!!isDrag}
          isDropTarget={isTarget}
        />
      </div>
    );
  };

  const prov = getProvData(provenanceKey);

  return (
    <div className="min-h-screen bg-[#F4F1E9] p-6 text-[#1C1C1E]">
      {/* Editor chrome (Figma-like / browser toolbar matching the image) */}
      <div className="max-w-[1100px] mx-auto mb-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <button className="text-xs px-2 py-1 rounded border bg-white">← Launchpad</button>
          <div className="px-3 py-1 bg-white border rounded text-xs flex items-center gap-1">
            <span>📅</span> <span>Today</span>
          </div>
          <div className="flex items-center bg-white border rounded px-1 text-xs">
            <button className="px-2">&lt;</button>
            <div className="px-3 py-1 bg-[#C9A84C] text-white rounded font-medium">JUN 5</div>
            <button className="px-2">&gt;</button>
            <div className="px-2 text-[#6E6E6A]">6 7 8 9 10 11</div>
          </div>
          <button className="px-3 py-1 rounded bg-white border text-xs">Deploy</button>
          <button className="px-3 py-1 rounded bg-white border text-xs">Breaks</button>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="text-xs px-3 py-1 border bg-white rounded w-64 placeholder:text-[#9A9588]"
            placeholder="Search · Assign · Command"
          />
          <div className="text-xs px-2">⌘K</div>
          <button className="text-xs px-2">↩︎</button>
          <button className="text-xs px-2">↪︎</button>
          <div className="flex items-center border bg-white rounded text-xs">
            <button onClick={() => setScale(s => Math.max(0.6, s - 0.1))} className="px-2">Fit −</button>
            <div className="px-2 border-x text-[#6E6E6A]">{Math.round(scale * 100)}%</div>
            <button onClick={() => setScale(s => Math.min(1.4, s + 0.1))} className="px-2">− +</button>
          </div>
          <button className="text-xs px-2 py-1 border bg-white rounded">Saved</button>
          <button onClick={() => window.print()} className="text-xs px-2 py-1 border bg-white rounded">⎙</button>
          <div className="w-6 h-6 rounded-full bg-[#C9A84C] text-white text-[10px] flex items-center justify-center font-medium">BK</div>
        </div>
      </div>

      {/* THE 8.5x11 PAPER ARTBOARD — exact layout per the reference image */}
      <div
        className="mx-auto bg-white border border-[#D9D2C3] shadow-2xl rounded-xl overflow-hidden"
        style={{
          width: "816px",           // 8.5" @ 96dpi
          minHeight: "1056px",      // 11"
          transform: `scale(${scale})`,
          transformOrigin: "top center",
          marginBottom: scale < 1 ? "40px" : 0,
        }}
      >
        {/* Page header block matching the screenshot */}
        <div className="px-8 pt-6 pb-4 border-b border-[#EDE8DC]">
          <div className="flex items-start justify-between">
            <div className="flex items-baseline gap-3">
              <div className="text-[72px] font-semibold tracking-[-3px] leading-none text-[#1C1C1E]">5</div>
              <div>
                <div className="text-[21px] font-semibold tracking-[-0.2px]">Friday</div>
                <div className="text-[11px] text-[#6E6E6A] -mt-0.5">June 2026 · Day 1 of 7</div>
              </div>
            </div>

            {/* Breaks - styled to match artboard: gold label + small individual numbers (no heavy pills) */}
            <div className="flex items-center gap-1.5 text-xs cursor-pointer" onClick={() => setShowBreaks(!showBreaks)} title="Toggle breaks detail row">
              <div className="uppercase tracking-[1.2px] text-[#8B6F2E] text-[9px]">BREAKS</div>
              {breaksSummary.map((n, i) => (
                <div key={i} className="px-1.5 py-px text-[#8B6F2E] font-semibold tabular-nums">{n}</div>
              ))}
            </div>

            {/* Mini calendar + groups - closer to artboard (small day boxes, GROUP with 1 highlighted) */}
            <div className="text-right text-[9px]">
              <div className="flex gap-px justify-end mb-0.5">
                {["F","S","S","M","T","W","T"].map((d, i) => (
                  <div key={i} className={`w-3.5 h-3.5 text-[8px] flex items-center justify-center rounded-sm ${i === 4 ? "bg-[#C62828] text-white" : "bg-[#F4F1E9] text-[#6E6E6A]"}`}>{d}</div>
                ))}
              </div>
              <div className="text-[#8B6F2E] tracking-[0.5px] text-[8px]">GROUP <span className="font-semibold text-[#2E7D32] bg-[#E8F5E9] px-0.5 rounded">1</span> 2 3</div>
            </div>
          </div>
        </div>

        {/* ZONES */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="text-[9px] uppercase tracking-[1.5px] text-[#8B6F2E] font-semibold">ZONES</div>
            <div className="text-[9px] text-[#6E6E6A] tabular-nums">{zoneFilled}</div>
          </div>
          <div className="grid grid-cols-5 gap-2.5 auto-rows-fr">
            {ZONE_KEYS.map(k => renderCard(k))}
          </div>
        </div>

        {/* RESTROOMS */}
        <div className="px-6 pt-5">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="text-[9px] uppercase tracking-[1.5px] text-[#8B6F2E] font-semibold">RESTROOMS</div>
            <div className="text-[9px] text-[#6E6E6A] tabular-nums">{rrFilled}</div>
          </div>
          <div className="grid grid-cols-5 gap-2.5 auto-rows-fr">
            {RR_KEYS.map(k => renderCard(k))}
          </div>
        </div>

        {/* Breaks detail (summonable, matching the v1 spirit + header in the image) */}
        {showBreaks && (
          <div className="px-6 pt-3 pb-1">
            <div className="text-[9px] uppercase tracking-[1.5px] text-[#8B6F2E] mb-1 pl-1">Breaks (waves)</div>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {["BW1","BW2","BW3"].map((b, i) => (
                <div key={i} className="border border-[#EDE8DC] rounded px-2 py-1 bg-[#FAF9F6] text-[#5C5850]">
                  Wave {i + 1} — {assignments[b]?.tmName || "— Unassigned —"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUXILIARY */}
        <div className="px-6 pt-5 pb-6">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <div className="text-[9px] uppercase tracking-[1.5px] text-[#8B6F2E] font-semibold">AUXILIARY</div>
            <div className="text-[9px] text-[#6E6E6A] tabular-nums">{auxFilled}</div>
          </div>
          <div className="grid grid-cols-6 gap-2.5 auto-rows-fr">
            {AUX_KEYS.map(k => renderCard(k))}
          </div>
        </div>

        {/* Page footer (brand + version + page) */}
        <div className="mt-auto border-t border-[#EDE8DC] px-8 py-3 text-[9px] text-[#8A8575] flex items-center justify-between">
          <div>SBS © Weekly Zone Deployment Book — GRAVES</div>
          <div>v0.7</div>
          <div>— 1 of 14 —</div>
        </div>
      </div>

      {/* Available roster (drag source) — placed under the paper like a palette */}
      <div className="max-w-[816px] mx-auto mt-4">
        <div className="text-[10px] uppercase tracking-[1.5px] text-[#8B6F2E] mb-1.5 pl-1">Available Team (drag to any empty slot or restroom side)</div>
        <div className="flex flex-wrap gap-2">
          {roster.map((name, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", `roster:${name}`);
                setDraggingFromRoster(true);
              }}
              onDragEnd={() => { setDraggingFromRoster(false); setHighlightRR(null); }}
              className="px-3 py-1 text-sm border border-[#D9D2C3] bg-white rounded-full cursor-grab active:cursor-grabbing hover:bg-[#F9F6EF]"
            >
              {name}
            </div>
          ))}
        </div>
        <div className="text-[10px] text-[#9A9588] mt-1 pl-1">Drop on a zone card or a specific MEN'S / WOMEN'S half. Side drops are precise.</div>
      </div>

      {/* Glass provenance overlay (side-aware, reuses the "heartbeat" pattern) */}
      {provenanceKey && prov && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/10 backdrop-blur-[1px]" onClick={closeProvenance}>
          <div className="bg-white/95 backdrop-blur-md border border-white/40 rounded-3xl p-6 w-full max-w-md shadow-2xl mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <div>
                <div className="uppercase text-[10px] tracking-[2px] text-[#8B6F2E]">Provenance</div>
                <div className="text-lg font-semibold mt-1">Why {prov.name} in {prov.slot}?</div>
              </div>
              <button onClick={closeProvenance} className="text-sm text-[#8B6F2E]">Close</button>
            </div>
            <div className="text-[15px] leading-relaxed text-[#2F2F2D]">{prov.rationale}</div>
            <div className="mt-6 pt-4 border-t text-[10px] text-[#8B6F2E]/70">This is the heartbeat of the system.</div>
          </div>
        </div>
      )}

      {/* Tiny status bar */}
      <div className="max-w-[816px] mx-auto mt-3 text-[9px] text-[#9A9588] text-center">
        v1.5 dev surface — 8.5×11 paper artboard · per-side RR drag · provenance glass · exact visual fidelity to reference
      </div>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { X, Search, Users, Table2 } from "lucide-react";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

/**
 * WeeklyOverview
 *
 * Live, interactive weekly table (TM rows × days) + focus mode.
 * - Lives as a glass panel (right-anchored on desktop, bottom-sheet on tablet).
 * - Tapping a TM name fades other rows, highlights the row, and surfaces a detail
 *   week strip ("where they are" across the planned week).
 * - The parent (Client) wires focusedTmId down to the canvas cards so non-matching
 *   assignments on the *current selected day* are dimmed while the TM's slot is highlighted.
 * - Fully live via the weeklyRecentHistory (planned week data from live store + current assignments).
 * - Reuses liquid glass, Atkinson, zone colors, sb-interactive, ms icons, tablet patterns.
 */

export interface WeeklyOverviewProps {
  open: boolean;
  onClose: () => void;
  /** The planned this-week history (Map<tmId, placements this week>). Primary data source. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  /** Current day's assignments (for "this day" context + current placement of focused TM). */
  currentAssignments?: Record<string, any>;
  /** The 7 day defs for the current grave week (for labels, order, colors). */
  dayDefs?: Array<{ name: string; short?: string; dateNum: number; color?: string }>;
  /** Currently selected day index in the week (0-6) for "current day" emphasis in the strip. */
  selectedDayIndex?: number;
  /** Callback to jump the canvas to a different day in the week while keeping focus. */
  onJumpToDayIndex?: (index: number) => void;
  /** Current focus (set from table click; cleared by parent on close/day change). */
  focusedTmId?: string | null;
  onFocusTm?: (tmId: string | null) => void;
  isDark?: boolean;
  /** Optional full roster/members for enriching names if the history only has placed TMs. */
  members?: any[];
}

interface TmWeekRow {
  tmId: string;
  tmName: string;
  placements: Record<string, string>; // dayIndex (as string key) -> slot label or "—"
  total: number;
  repeats: number; // simple count of days with >0 for this TM (proxy; real repeat logic lives elsewhere)
}

export default function WeeklyOverview({
  open,
  onClose,
  weeklyRecentHistory,
  currentAssignments = {},
  dayDefs = [],
  selectedDayIndex = 0,
  onJumpToDayIndex,
  focusedTmId,
  onFocusTm,
  isDark = false,
  members = [],
}: WeeklyOverviewProps) {
  const [search, setSearch] = useState("");
  const [showOnlyRepeats, setShowOnlyRepeats] = useState(false);

  // Build TM-centric week data from the planned history (live + current week prior days).
  const tmRows: TmWeekRow[] = useMemo(() => {
    if (!weeklyRecentHistory || weeklyRecentHistory.size === 0) return [];

    const byTm = new Map<string, { name: string; slotsByDay: Record<number, string> }>();

    // Seed from the week history (covers planned prior + current for the viewed week).
    for (const [tmId, recs] of weeklyRecentHistory.entries()) {
      if (!byTm.has(tmId)) {
        // Try to enrich name from members or fall back to the id (the live history map for the week carries tmName on the assignment objects, not the recent list).
        const mem = members.find((m: any) => (m.id === tmId || m.tmId === tmId || m.tm_id === tmId));
        byTm.set(tmId, { name: mem?.display_name || mem?.full_name || tmId, slotsByDay: {} });
      }
      const entry = byTm.get(tmId)!;
      recs.forEach((r) => {
        // Map the placement date back to a day index in the provided dayDefs (best effort by date string match).
        const idx = dayDefs.findIndex((d: any) => d && formatDateKey(d.date) === r.nightDate);
        if (idx >= 0) {
          entry.slotsByDay[idx] = r.slotKey; // raw key is fine; UI can pretty-print if wanted
        }
      });
    }

    // Also ensure current day's placed TMs are represented (even if history lag).
    Object.entries(currentAssignments).forEach(([slotKey, a]: [string, any]) => {
      const tmId = a?.tmId;
      if (!tmId) return;
      if (!byTm.has(tmId)) {
        const mem = members.find((m: any) => (m.id === tmId || m.tmId === tmId || m.tm_id === tmId));
        byTm.set(tmId, { name: mem?.display_name || mem?.full_name || a?.tmName || tmId, slotsByDay: {} });
      }
      const idx = selectedDayIndex;
      byTm.get(tmId)!.slotsByDay[idx] = slotKey;
    });

    const rows: TmWeekRow[] = [];
    for (const [tmId, data] of byTm.entries()) {
      const placements: Record<string, string> = {};
      let total = 0;
      for (let i = 0; i < 7; i++) {
        const sk = data.slotsByDay[i];
        placements[i] = sk || "—";
        if (sk) total++;
      }
      // Simple "repeats" proxy: number of days the TM appears (real week repeat uses slot-specific counts elsewhere).
      const repeats = Object.values(data.slotsByDay).length; // distinct days placed
      rows.push({ tmId, tmName: data.name, placements, total, repeats });
    }

    // Filter + sort (name asc by default; user can imagine sort UI).
    let filtered = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) => r.tmName.toLowerCase().includes(q) || r.tmId.toLowerCase().includes(q));
    }
    if (showOnlyRepeats) {
      filtered = filtered.filter((r) => r.repeats > 1); // proxy for "has week concentration"
    }
    return filtered.sort((a, b) => a.tmName.localeCompare(b.tmName));
  }, [weeklyRecentHistory, currentAssignments, dayDefs, selectedDayIndex, members, search, showOnlyRepeats]);

  const selectedRow = focusedTmId ? tmRows.find((r) => r.tmId === focusedTmId) : null;

  // Helper for day label in the mini strip.
  const dayLabel = (i: number) => {
    const d = dayDefs[i];
    if (!d) return `D${i}`;
    return `${(d.short || d.name || "D").slice(0, 3)} ${d.dateNum || ""}`.trim();
  };

  if (!open) return null;

  const isTablet = isTabletTouchDevice();

  const panelClass = isTablet
    ? "fixed inset-x-0 bottom-0 z-[70] rounded-t-3xl border-t shadow-2xl overflow-hidden"
    : "fixed right-3 top-16 z-[60] w-[min(420px,calc(100vw-24px))] max-h-[calc(100vh-80px)] rounded-2xl border shadow-2xl overflow-hidden flex flex-col";

  const glassStyle: React.CSSProperties = isDark
    ? { background: "rgba(20,19,22,0.92)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(32px) saturate(180%)" }
    : { background: "rgba(252,252,250,0.96)", borderColor: "rgba(0,0,0,0.06)", backdropFilter: "blur(32px) saturate(180%)" };

  return (
    <div
      className={panelClass}
      style={{
        ...glassStyle,
        color: isDark ? "#F2F2F4" : "#1C1C1E",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
      role="dialog"
      aria-label="Weekly Overview"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 opacity-70" />
          <div className="font-semibold tracking-[0.3px] text-[13px]">WEEKLY OVERVIEW</div>
          {dayDefs.length > 0 && (
            <div className="text-[10px] text-[#6B7280] dark:text-[#8E8E93] tabular-nums">
              {dayDefs[0]?.dateNum}–{dayDefs[dayDefs.length - 1]?.dateNum}
            </div>
          )}
        </div>
        <button onClick={onClose} className="sb-interactive rounded p-1 opacity-70 hover:opacity-100" aria-label="Close weekly overview">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-3 py-2 border-b text-[12px]" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 opacity-50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search TM name or id…"
            className="w-full rounded-lg border bg-white/70 dark:bg-black/30 pl-7 pr-2 py-1 text-[12px] placeholder:text-[#8E8E93] focus:outline-none"
            style={{ borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}
          />
        </div>
        <button
          onClick={() => setShowOnlyRepeats((v) => !v)}
          className={`rounded px-2 py-1 text-[11px] border transition ${showOnlyRepeats ? "bg-[#C13A14] text-white border-[#C13A14]" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Show only TMs with multiple placements this week (proxy)"
        >
          {showOnlyRepeats ? "Showing repeats" : "Repeats only"}
        </button>
        <button onClick={() => { setSearch(""); setShowOnlyRepeats(false); onFocusTm?.(null); }} className="text-[11px] text-[#6B7280] hover:text-current">Clear</button>
      </div>

      {/* Live Table (TM rows × days) */}
      <div className="flex-1 overflow-auto p-2 text-[12px] tabular-nums" style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}>
        {tmRows.length === 0 ? (
          <div className="p-6 text-center text-[#6B7280] text-[12px]">No placements in the current week yet. Build the schedule and this view will light up live.</div>
        ) : (
          <div className="min-w-[620px]">
            {/* Header */}
            <div className="grid grid-cols-[minmax(140px,1.6fr)_repeat(7,minmax(68px,1fr))_auto] gap-px bg-black/5 dark:bg-white/5 rounded-t px-1 py-1 font-semibold text-[#6B7280] dark:text-[#8E8E93] text-[10px] tracking-[0.5px]">
              <div className="px-2">TM</div>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="text-center truncate" title={dayDefs[i]?.name}>{dayLabelShort(i)}</div>
              ))}
              <div className="text-right pr-1">Wk</div>
            </div>

            {/* Rows */}
            {tmRows.map((row) => {
              const isSel = focusedTmId === row.tmId;
              return (
                <div
                  key={row.tmId}
                  onClick={() => onFocusTm?.(isSel ? null : row.tmId)}
                  className={`grid grid-cols-[minmax(140px,1.6fr)_repeat(7,minmax(68px,1fr))_auto] gap-px items-center border-b last:border-b-0 cursor-pointer transition-colors ${isSel ? "bg-[#C13A14]/10" : "hover:bg-black/5 dark:hover:bg-white/5"} ${isSel ? "" : focusedTmId ? "opacity-35" : ""}`}
                  style={{ borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                >
                  {/* TM name (tappable) */}
                  <div className="px-2 py-1.5 flex items-center gap-2 min-w-0">
                    <div className="font-semibold truncate tracking-[-0.1px]">{row.tmName}</div>
                    {row.repeats > 1 && <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">R{row.repeats}</span>}
                  </div>

                  {/* Day cells */}
                  {Array.from({ length: 7 }).map((_, i) => {
                    const val = row.placements[i] || "—";
                    const isCurrentDay = i === selectedDayIndex;
                    const isPlaced = val !== "—";
                    return (
                      <div
                        key={i}
                        className={`text-center py-1 truncate text-[10px] ${isCurrentDay && isPlaced ? "font-semibold" : ""}`}
                        style={isPlaced ? { color: isDark ? "#E5E5E7" : "#1f2937", background: isCurrentDay ? "rgba(0,0,0,0.03)" : undefined } : { color: isDark ? "#6B7280" : "#9CA3AF" }}
                        title={val}
                      >
                        {prettySlot(val)}
                      </div>
                    );
                  })}

                  {/* Week total */}
                  <div className="text-right pr-2 text-[10px] text-[#6B7280]">{row.total}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail: "where they are" for the focused TM (full week strip + quick actions) */}
      {selectedRow && (
        <div className="border-t p-3 text-[11px]" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.015)" }}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="font-semibold tracking-tight">{selectedRow.tmName} — this week</div>
            <button onClick={() => onFocusTm?.(null)} className="text-[10px] text-[#6B7280] hover:text-current">clear focus</button>
          </div>

          {/* Mini 7-day strip (the "shows where they are" visual) */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, i) => {
              const val = selectedRow.placements[i] || "—";
              const isCurrent = i === selectedDayIndex;
              const isPlaced = val !== "—";
              const d = dayDefs[i];
              return (
                <button
                  key={i}
                  onClick={() => onJumpToDayIndex?.(i)}
                  className={`rounded px-1 py-1 text-center border text-[9px] transition active:scale-[0.985] ${isCurrent ? "ring-1 ring-offset-1" : ""}`}
                  style={{
                    borderColor: isCurrent ? (d?.color || "#C13A14") : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                    background: isPlaced ? (isCurrent ? "rgba(0,0,0,0.04)" : "transparent") : "transparent",
                    color: isPlaced ? (isDark ? "#E5E5E7" : "#111") : (isDark ? "#6B7280" : "#9CA3AF"),
                  }}
                  title={`Jump to ${d?.name || "day"} ${d?.dateNum || ""} and highlight ${selectedRow.tmName}`}
                >
                  <div className="font-mono tabular-nums opacity-70">{dayLabelShort(i)}</div>
                  <div className="truncate font-medium leading-tight">{prettySlot(val)}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 text-[10px] text-[#6B7280] dark:text-[#8E8E93]">
            Tap a day above to jump the canvas (focus stays on {selectedRow.tmName}). Current day is ringed.
          </div>
        </div>
      )}

      {/* Quiet footer */}
      <div className="px-3 py-1.5 text-[9px] text-[#6B7280] dark:text-[#8E8E93] border-t flex items-center justify-between" style={{ borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
        <div>Live from planned week assignments • tap TM to focus</div>
        <div className="opacity-60">{tmRows.length} TMs</div>
      </div>
    </div>
  );
}

// Small helpers (local to keep the component self-contained; reuse real formatters in a follow-up if desired).
function formatDateKey(d: Date | string | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

function dayLabelShort(i: number): string {
  // Fri=4 in JS getDay for grave week start, but we just use short labels.
  const shorts = ["F", "S", "S", "M", "T", "W", "T"];
  return shorts[i % 7] || "D";
}

function prettySlot(sk: string): string {
  if (!sk || sk === "—") return "—";
  // Keep short for cells (Z4, R3W, A1, etc). Expand only in titles.
  if (sk.startsWith("Z")) return sk;
  if (sk.startsWith("MRR")) return "R" + sk.replace("MRR", "") + "M";
  if (sk.startsWith("WRR")) return "R" + sk.replace("WRR", "") + "W";
  if (sk.startsWith("OL")) return "OL";
  return sk.replace(/[^A-Z0-9]/g, "").slice(0, 4) || sk;
}
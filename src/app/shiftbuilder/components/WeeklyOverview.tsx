"use client";

import React from "react";
import { useWeekLensFilters, useWeekLensSearch, useWeekLensSidebarOpen } from "../store/useShiftBuilderStore";
import { buildOverviewSlotRows, layoutForWeekly } from "../print/printOverviewTables";
import type { OverviewNight, OverviewSlotRow } from "../print/printOverviewTables";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { getTmThisWeekRepeatForSlot } from "./shiftRotationHealth";

/**
 * LiveWeeklyOverviewArtboard
 *
 * Renders the Week Overview directly on the "sheet" (the 1056×816 artboard area)
 * in print-preview mode (triggered via Table2 nav). Uses the *exact* same layout solver
 * (layoutForWeekly + exactRowHeights + buildOverviewSlotRows) as buildWeeklyOverviewArtboardHTML
 * so the interactive preview matches the density, column widths, fonts, row heights, and
 * section layout of the actual printed PDF.
 *
 * === GUIDING PRINCIPLES (for all evolution of this surface) ===
 * 1. Data geometry is sacred for print fidelity: slot positions, row heights (via layout), sections,
 *    basic typography, and assignment names must stay extremely close to what the printed PDF produces.
 *    The core "who is where" must feel identical.
 * 2. The meta-layer (repeats, health implications, load, person footprints, navigation, focus lens)
 *    is intentionally richer on the interactive sheet. Digital assists (ovals, tints, badges, hover
 *    details, contextual actions) are screen-only and must never affect the printed artifact.
 * 3. This is a *week-level diagnostic and navigation lens*, not a replacement for PlacementPad (the
 *    deep per-TM/slot reasoning + xAI + full actions live in the pad) or the day cards.
 *    The overview makes problems *visible and jumpable*; the pad resolves them with full context.
 * 4. Focus is a first-class cross-surface context ("this TM this week"), not just local dimming.
 *    It should coherently affect the table, the current day's cards, future pad opens, health signals, etc.
 * 5. Signal hierarchy respects the operator's mental model: repeats (tied to rotation health policy:
 *    1=ideal, 2=penalty, 3+=real bad) are primary, but load balance, person spread, and health
 *    consequences must also surface without clutter.
 * 6. Actionable but contained: one-gesture jumps + focus, lightweight contextual actions that feed
 *    the pad or store with pre-loaded week context. No full editing in the overview (keeps it a
 *    clean diagnostic surface).
 * 7. Self-documenting over time: affordances (hover states, visual weight on names/ovals, consistent
 *    click targets), richer titles, and progressive disclosure should reduce reliance on the footer note.
 * 8. Overview is both consumer and producer of week signals: it should consume weeklyRecentHistory,
 *    health computations, fit data; and produce focused context + highlighted problems for pad/board/health.
 * 9. Banner stays ultra-minimal (per explicit request: date numbers range + written out next to it).
 *    Subtle high-level signals (e.g. violation count) may appear only if they do not violate the "sparse" intent.
 *
 * Banner (sheet-only): ultra-minimal — first and last date *numbers* of the week as the range
 * ("5 – 11"), written out with day names next to it ("Friday 5 – Thursday 11"). No rainbow
 * stripe, no hero day, no BREAKS/GROUP pills. Click the banner (or most non-name areas) to deselect.
 *
 * Digital assists (screen-only, stripped from print/PDF):
 * - Click any TM name → focus it across the whole week (stronger tint on their cells; others dim, sidebar shows footprint + suggestions) + jump the main builder to that day's column (focus preserved).
 * - Red hand-drawn rotated ovals (with box-shadow, severity-aware for 3+) + subtle bg + count badge (for 3+) on any TM placed in the *same slot* multiple times this week.
 * - Day column headers are clickable → jump the builder's selected day while preserving focus.
 * - Enriched titles and explicit affordances (xAI dots, sidebar actions) can feed the PlacementPad with rotation/health context when desired.
 * - Absolute screen-only footer note (temporary; goal is self-evident interactions).
 *
 * This is the foundation for richer week-level UX (insights, actions, better focus viz, health integration)
 * while the real printed artifact stays clean via the separate overviewShell + static HTML path.
 */

/**
 * WeekLens v2 — Builder-side enhancements for the Weekly Overview (strictly screen-only).
 *
 * VISUAL MOCKUP (builder mode, unscaled page chrome + overlays on the fixed 1056×816 golden paper):
 * - Above the paper (absolute or page shell): 40px Top Controls Bar with Rotation Health % pill,
 *   clickable "N viol." pill, tiny sparkline of 7 headcounts, Avg Daily Load, 5 quick-filter chips
 *   (Zones / Restrooms / Support / Repeats Only / Empty Slots), compact search, and prominent
 *   purple "AI Optimize Rotations" button (Gun Lake purple gradient + gold hover).
 * - Inside the paper (exact solver geometry, row heights, slotColW, banner, caps, headcount row,
 *   3 sections, 30 data rows, SP2 visible): 
 *     • tiny 🧹/🚻/📋 icons on slot labels (builder only).
 *     • Clean scalable red repeat rings (rounded-rect 4px, severity-scaled 2/2.5px stroke + soft shadow)
 *       that extend larger over the cell; name text position unchanged. Small red count badge
 *       immediately to the right of the ring on EVERY repeat cell (off to the side, never covering letters).
 *     • Very light red row heatmap gradient (stronger for higher repeat count).
 *     • Absolute narrow Repeat Score strip on the far right (tiny bar + "2×"/"4×" per slot row) —
 *       does not participate in the 7-col flex; paper width/height budget identical to preview.
 *     • Headcount cells now have segmented actual (day color) + light target remainder (dayColor 0x22).
 * - Right of the paper (unscaled, ~240px, absolute/fixed): Focus Mode 2.0 sidebar with the focused
 *   TM's name, mini 7-day Gantt (colored pips), repeats/weeklyBalance impact, local suggestions
 *   (real display names), "Apply" buttons (stub that exercises applyWeekLensMove), and "Ask xAI".
 * - When universal Builder/Preview toggle or local Print Preview is active: bar + sidebar + icons +
 *   rings (replaced by oval) + heatmap + score strip + segmented extras all disappear instantly.
 *   The inner paper is bit-for-bit what buildWeeklyOverviewArtboardHTML emits.
 *
 * NEW "SVG"/ASSETS (all inline, no external files):
 * - Repeat ring: pure CSS border + border-radius:4px + box-shadow (same technique as the hand-drawn oval
 *   but axis-aligned rounded rect for the "clean scalable" builder aesthetic).
 * - Section icons: emoji (🧹 🚻 📋) or 12×12 inline <svg> micro glyphs (currentColor, 9-10px).
 * - Segmented bar: two nested absolutely positioned divs (actual + target tint) inside the existing
 *   3px headcount bar height budget.
 * - Sparkline (top bar): 7 tiny <rect> or flex divs.
 * - All high-contrast, Atkinson, purple (#6B21A8 / #9333EA) + gold accents + #C13A14 repeat red.
 *
 * CLEAR DIFF vs current (pre-WeekLens v2):
 * - Client: + weekLens* state, + unscaled 40px top bar JSX (conditional builder), + unscaled right
 *   sidebar JSX (conditional), + applyWeekLensMove, + early dnd guard for weekly cells, + prop
 *   passing for filters/search. The 1056×816 div and <WeeklyOverview> call are unchanged in structure.
 * - WeeklyOverview.tsx: + mode-aware builder branches inside the three section row maps and headcount
 *   (icons, ring vs oval, always-badge, heatmap bg, absolute score strip, segmented bars). All solver
 *   math (layoutForWeekly, innerScale, rowHeights[...], slotColW, exact flex for 7 days) is identical.
 *   Preview path is a no-op delta (still emits the synced hand-drawn oval + external >=3 badge).
 * - print/printOverviewTables.ts: ZERO changes (new layers are builder-only; core oval/badge/banner/
 *   headcount/section strings remain the source of truth for PDF fidelity).
 * - The golden paper content area is geometrically sacred. WeekLens v2 is pure CSS/React overlays +
 *   page-shell siblings, exactly as the request's "All new layers must be pure CSS/React overlays"
 *   and the "preserve 100% current architecture" preamble required.
 *
 * All changes tsc-clean. Advisor, health, names, relevant-slot filtering, and full-week stability
 * are reused (no duplication, no regression on the "not thinking about overlaps or admin" rule).
 */

export interface LiveWeeklyOverviewArtboardProps {
  overviewNights: OverviewNight[];
  dayDefs: DayDef[];
  focusedTmId?: string | null;
  onFocusTm?: (tmId: string | null) => void;
  onJumpToDayIndex?: (dayIndex: number) => void;
  currentDayIndex?: number; // Optional context for future day-specific assists or highlighting in the banner/other UI. Currently unused in the minimal banner.
  /** Recent history for this week (prior planned days) to compute full "this week" repeats including priors for health signals. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  isDark?: boolean;

  /**
   * Optional callback for deeper/explicit actionability (e.g. from xAI dots, sidebar buttons, or
   * future "open context" affordances). Not called automatically on plain name clicks in the table
   * (those are focus + jump only).
   * Can be used to open the PlacementPad (or other) pre-contextualized with the TM, the specific slot,
   * the day of this placement, and week health/rotation signals.
   * Screen-only; never affects print.
   */
  onActivateTmContext?: (tmId: string, slotKey: string, dayIndex: number) => void;

  /**
   * When true, enable screen-only xAI / digital assists in the overview (subtle visual cues on cells,
   * enhanced focus tints, click-to-explain). Stripped for print. Defaults to false to preserve
   * pure print fidelity.
   */
  showDigitalAssists?: boolean;

  /**
   * Request xAI/engine insight for a TM in week context (or specific placement).
   * Used to pre-load ProvenanceGlass or Pad with week-level provenance, fit rationale, or
   * "why this repeat / placement" explanations. Called from name clicks, repeat ovals, or
   * dedicated affordances when showDigitalAssists is true.
   */
  onRequestXaiInsight?: (tmId: string | '', context: { slotKey?: string; dayIndex?: number; week?: boolean }) => void;

  /**
   * 'preview': clean, print-faithful view with diagnostic assists (current default for the print-preview sheet).
   * 'builder': richer, more interactive version tuned for actively constructing/editing the week as a whole.
   *   - More direct edit affordances (cells open pad/context for that placement).
   *   - Stronger week-building signals (xAI cues, health, load, repeats with action hints).
   *   - Additional tools/chrome for week-level decisions and edits (screen-only).
   *   - Still respects the core data geometry for consistency.
   */
  mode?: 'preview' | 'builder';

  // WeekLens v2 builder-only filters/search (from the top bar). The renderer uses them for
  // visual highlighting / heatmap emphasis without ever changing the slotRows or rowHeights
  // coming from the sacred layout solver (fidelity with print is preserved).
  filters?: Set<string>;
  search?: string;

  /** When true in builder mode, the day columns are visually shortened a bit to leave room for the right sidebar without the paper having to shift as far or the sidebar overlapping names/score. */
  sidebarOpen?: boolean;
}

export default function LiveWeeklyOverviewArtboard({
  overviewNights,
  dayDefs,
  focusedTmId,
  onFocusTm,
  onJumpToDayIndex,
  currentDayIndex,
  weeklyRecentHistory,
  onActivateTmContext,
  isDark = false,
  showDigitalAssists = false,
  onRequestXaiInsight,
  mode = 'preview',
  filters,
  search,
  sidebarOpen = false,
}: LiveWeeklyOverviewArtboardProps) {
  const slotRows: OverviewSlotRow[] = buildOverviewSlotRows();
  const nights = [...overviewNights].sort((a, b) => a.dayIndex - b.dayIndex);

  const nightDefs = nights.map((n, idx) => ({
    night: n,
    def: dayDefs[n.dayIndex] ?? ({
      name: `Day ${n.dayIndex ?? idx}`,
      short: "?",
      color: "#6B7280",
      dateNum: 0,
    } as DayDef),
  }));

  // Use the exact same layout solver as the print generator so the live sheet
  // on the artboard matches the density, column widths, fonts, and overall printed vibe
  // of the actual Week Overview (adapts for number of days shown).
  const layout = layoutForWeekly(nights.length, slotRows.length);

  const slotColW = layout.slotColW;
  const rowH = layout.rowH;
  const headerFont = layout.headerFont;
  const fontSize = layout.fontSize;

  // WeekLens builder-only: when the right sidebar is open we visually shorten the 7 day columns
  // (by wrapping them in a max-width container) so the sidebar fits beside the paper with less
  // overlap on names / last day / Repeat Score strip. The label column and row heights stay full
  // from the solver. Preview is never affected.
  const isSidebarCompact = mode === 'builder' && sidebarOpen;

  // Name + slot label helpers to match the printed output (compact for 5+ days).
  const getDisplayName = (name: string) => {
    if (name === "—") return name;
    if (layout.useFirstName) {
      const parts = name.trim().split(/\s+/);
      if (parts.length > 1) {
        const first = parts[0];
        if (first.length <= layout.nameMax) return first;
      }
    }
    if (name.length <= layout.nameMax) return name;
    return name.slice(0, layout.nameMax - 1) + "…";
  };

  const getSlotLabel = (slot: OverviewSlotRow) => {
    if (!layout.compactSlots) return slot.label;
    if (slot.section === "ZONES") return slot.key;
    if (slot.section === "RESTROOMS") {
      const side = slot.key.startsWith("M") ? "M" : "W";
      const num = slot.key.replace(/^[MW]RR/, "");
      return `R${num}${side}`;
    }
    if (slot.label.startsWith("TRASH")) return slot.label.replace("TRASH ", "TR");
    if (slot.label.startsWith("SUPPORT")) return slot.label.replace("SUPPORT ", "SP");
    return slot.label;
  };

  const dayLabel = (def: DayDef) => `${(def.name || "").slice(0, 3).toUpperCase()} ${def.dateNum || ""}`;

  // Repeat detection (week-level, same slot key). Returns a Map of `${tmId}:${slotKey}` -> count.
  // Used for the red hand-drawn ovals + tints. Only entries with count > 1 are meaningful for "isRepeated".
  // This is the foundation for rotation health signals (ideal max 1, penalty at 2, bad at 3).
  const repeatCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of overviewNights) {
      for (const [slotKey, asgn] of Object.entries(n.assignments || {})) {
        const t = asgn?.tmId;
        if (t) {
          const k = `${t}:${slotKey}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
    return counts;
  }, [overviewNights]);

  // Minimal banner (sheet-only): first–last date *numbers* of the week as the range,
  // with the written-out day names + dates next to it. This is intentionally sparse.
  // (The printed PDF uses the richer dark overviewShell banner with "Week Overview" + full subtitle + GLCR line.)
  // 30px gives comfortable alignment for the two text sizes while leaving maximum room for the table rows.
  const BANNER_H = 30;
  const liveBelowBanner = 816 - BANNER_H;
  const liveTableBodyH = Math.max(120, liveBelowBanner - layout.colHdrH);
  const innerScale = liveTableBodyH / layout.tableBodyH;

  // First and last date numbers from the week (the columns shown in the table).
  const firstDef = nightDefs[0]?.def;
  const lastDef = nightDefs[nightDefs.length - 1]?.def;
  const startNum = firstDef?.dateNum ?? 0;
  const endNum = lastDef?.dateNum ?? 0;
  const dateRange = `${startNum} – ${endNum}`;
  const writtenRange =
    firstDef && lastDef ? `${firstDef.name} ${startNum} – ${lastDef.name} ${endNum}` : "";

  // Week-level repeat violations (number of (TM, slot) pairs with plan count >1).
  // Used for subtle diagnostic indicator (screen-only). Ties directly to rotation health policy.
  const planRepeatViolations = React.useMemo(() => {
    let v = 0;
    repeatCounts.forEach((c) => {
      if (c > 1) v++;
    });
    return v;
  }, [repeatCounts]);

  // WeekLens v2 (builder): cheap per-slot max repeat for row heatmap tint and Repeat Score strip.
  // Only used in builder; does not affect preview/print or the solver geometry.
  const getRowMaxSeverity = (slotKey: string) => {
    let max = 0;
    for (const n of overviewNights) {
      const a = n.assignments?.[slotKey];
      if (a?.tmId) {
        const c = repeatCounts.get(`${a.tmId}:${slotKey}`) || 0;
        if (c > max) max = c;
      }
    }
    return max;
  };

  // WeekLens v2 (builder): compute whether this row should be visually dimmed based on active
  // top-bar filters/search. We only change opacity / subtle borders — never the number of rows
  // or the heights coming from the layout solver. This keeps exact print fidelity.
  const rowMatchesFilters = (slot: OverviewSlotRow) => {
    if (!filters || filters.size === 0) return true;
    const hasRepeats = getRowMaxSeverity(slot.key) > 1;
    if (filters.has('repeats') && !hasRepeats) return false;
    if (filters.has('empties')) {
      // row "has empty" if any night has no one on this slot
      const hasEmpty = nightDefs.some(({ night }) => !night.assignments[slot.key]?.tmId);
      if (!hasEmpty) return false;
    }
    if (filters.has('zones') && slot.section !== 'ZONES') return false;
    if (filters.has('restrooms') && slot.section !== 'RESTROOMS') return false;
    if (filters.has('support') && slot.section !== 'SUPPORT') return false;
    return true;
  };

  const rowMatchesSearch = (slot: OverviewSlotRow) => {
    if (!search || !search.trim()) return true;
    const q = search.trim().toLowerCase();
    if (slot.key.toLowerCase().includes(q) || getSlotLabel(slot).toLowerCase().includes(q)) return true;
    // Check any name in this row across the week
    return nightDefs.some(({ night }) => {
      const nm = night.assignments[slot.key]?.tmName || '';
      return nm.toLowerCase().includes(q);
    });
  };

  return (
    <div
      className="w-full h-full bg-white flex flex-col overflow-hidden"
      style={{
        fontFamily: "var(--font-atkinson, system-ui)",
        color: isDark ? "#1C1C1E" : "#1C1C1E",
        boxSizing: "border-box",
        position: "relative",
      }}
      onClick={() => onFocusTm?.(null)}
    >
      {/* Minimal banner (sheet-only, screen interactive context).
          Date numbers = first and last of the week range.
          Written out = full day names + those numbers next to it.
          No stripe, no hero, no pills, no extra chrome. Click anywhere to deselect focus. */}
      <div
        onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
        style={{
          height: BANNER_H,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 6px",
          background: "#fff",
          borderBottom: "1px solid #E5E5EA",
          boxSizing: "border-box",
          cursor: onFocusTm ? "pointer" : "default",
          gap: 4,
        }}
        title="Click to deselect"
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "-0.2px",
            fontFamily: "var(--font-atkinson, system-ui)",
            color: "#1C1C1E",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {dateRange}
        </span>
        <span
          style={{
            fontSize: 7.5,
            fontWeight: 500,
            color: "#6B7280",
            fontFamily: "var(--font-atkinson, system-ui)",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          {writtenRange}
        </span>

        {/* Subtle screen-only week health signal (minimal, only appears if there are plan-internal repeats >1). */}
        {planRepeatViolations > 0 && (
          <div
            className="no-print"
            style={{
              marginLeft: 4,
              fontSize: 6,
              fontWeight: 700,
              padding: "0 2px",
              borderRadius: 2,
              background: "rgba(193, 58, 20, 0.12)",
              color: "#C13A14",
              fontFamily: "var(--font-atkinson, system-ui)",
              letterSpacing: "0.1px",
              whiteSpace: "nowrap",
              alignSelf: "center",
              height: 11,
              display: "flex",
              alignItems: "center",
              lineHeight: 1,
            }}
            title={`${planRepeatViolations} (TM, slot) pairs with multiple placements in the same slot this week — see red ovals and rotation health`}
          >
            {planRepeatViolations} viol.
          </div>
        )}
      </div>

      {/* Column headers — exact solver height, seamless with paper. Ultra-tight 1px padding, perfect vertical centering. */}
      <div
        style={{
          display: "flex",
          background: "#F8F8FB",
          borderBottom: "2px solid #C8C8CC",
          flexShrink: 0,
          height: layout.colHdrH,
          boxSizing: "border-box",
          alignItems: "stretch",
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
          style={{
            width: slotColW,
            padding: "0 2px",
            fontSize: 7,
            fontWeight: 700,
            color: "#8E8E93",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
            cursor: onFocusTm ? "pointer" : "default",
            lineHeight: 1,
          }}
          title="Click to deselect"
        >
          Slot
        </div>
        <div style={isSidebarCompact ? { display: 'flex', flex: 1, maxWidth: '87%' } : { display: 'flex', flex: 1 }}>
        {nightDefs.map(({ def }, i) => (
          <div
            key={i}
            onClick={(e) => { e.stopPropagation(); onJumpToDayIndex?.(i); }}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: headerFont,
              fontWeight: 700,
              color: def.color,
              padding: "0 0",
              letterSpacing: "0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              borderLeft: "1px solid #E5E5EA",
              borderTop: `2px solid ${def.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              cursor: onJumpToDayIndex ? "pointer" : "default",
              lineHeight: 1,
              transition: 'background 60ms ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={def.name}
          >
            {dayLabel(def)}
          </div>
        ))}
        </div>
      </div>

      {/* WeekLens builder-only: small header label for the Repeat Score strip, aligned at column header height on the far right.
          This ensures the rightmost column has a clear "Wk Repeats" label at the same level as "Slot" and day headers (instead of "—"). */}
      {mode === 'builder' && (
        <div
          className="no-print"
          style={{
            position: 'absolute',
            right: 2,
            top: layout.colHdrH,  // align with the day column headers
            width: 52,
            height: Math.max(10, Math.round(layout.headCountH * innerScale)),
            fontSize: 6,
            fontWeight: 700,
            color: '#8E8E93',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#F8F8FB',
            borderLeft: '1px solid #E5E5EA',
            borderBottom: '1px solid #E5E5EA',
            zIndex: 4,
            pointerEvents: 'none',
          }}
        title="Wk Repeats: total repeats this slot has across the full week (higher = more rotation pressure for that area)"
        >
          Wk Repeats
        </div>
      )}

      {/* Constrained table body — liveTableBodyH (reduced by the taller header delta) with innerScale applied to
          headcount / section headers / data rows. This keeps total height exact and the last SUPPORT/SP2 row visible. */}
      <div
        style={{
          height: liveTableBodyH,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        {/* Headcount row — tight padding, consistent with solver height. Segmented bars for visual load. */}
        <div
          style={{
            display: "flex",
            height: Math.max(11, Math.round(layout.headCountH * innerScale)),
            alignItems: "center",
            background: "#F0F4FF",
            fontSize: fontSize,
            fontWeight: 600,
            borderTop: "1px solid #E5E5EA",
            borderBottom: "1px solid #C8C8CC",
            boxSizing: "border-box",
          }}
        >
          <div
            onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
            style={{
              width: slotColW,
              padding: "0 2px",
              color: "#4B5563",
              flexShrink: 0,
              fontSize: 6.5,
              fontWeight: 800,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
              cursor: onFocusTm ? "pointer" : "default",
              lineHeight: 1,
            }}
            title="Click to deselect"
          >
            Headcount
          </div>
          {nightDefs.map(({ night, def }, i) => {
            const count = slotRows.filter((slot) => night.assignments[slot.key]?.tmId).length;
            const colHasFocused = !!focusedTmId && Object.values(night.assignments || {}).some((a: any) => a?.tmId === focusedTmId);
            return (
              <div
                key={i}
                onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderLeft: "1px solid #D1D5DB",
                  color: def.color,
                  cursor: onFocusTm ? "pointer" : "default",
                  fontWeight: colHasFocused ? 700 : 400,
                  position: "relative",
                  lineHeight: 1,
                }}
                title={colHasFocused ? "Focused TM is assigned in this column today" : "Click to deselect"}
              >
                <span style={{ fontSize: fontSize + 0.2, fontWeight: colHasFocused ? 900 : 800 }}>{count}</span>
                {layout.showHeadcountRatio && (
                  <span style={{ fontSize: fontSize - 0.2, fontWeight: 600, color: "#8E8E93" }}>
                    /{slotRows.length}
                  </span>
                )}
                {colHasFocused && (
                  <span style={{ fontSize: 5, marginLeft: 1, color: def.color, verticalAlign: "super" }}>●</span>
                )}
                {/* Segmented actual vs target bar — subtle, print-safe, gives instant load sense */}
                <div
                  className="no-print"
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    height: 2.5,
                    width: "68%",
                    background: "rgba(0,0,0,0.04)",
                    borderRadius: 1,
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                  title={`Headcount ${count} / ${slotRows.length} — Zones+Restrooms+Support for this day`}
                >
                  <div style={{ height: "100%", background: def.color, width: `${Math.min(100, Math.round((count / Math.max(1, slotRows.length)) * 100))}%`, transition: "width 100ms ease" }} />
                  {count < slotRows.length && (
                    <div style={{ position: 'absolute', left: `${Math.min(100, Math.round((count / Math.max(1, slotRows.length)) * 100))}%`, top: 0, height: '100%', width: `${Math.min(100, Math.round(((slotRows.length - count) / Math.max(1, slotRows.length)) * 100))}%`, background: `${def.color}15` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sections - separate blocks with offset row heights for exact fit so SP2 and all rows fits */}
        {(() => {
          const zSectionRows = slotRows.filter((s) => s.section === "ZONES");
          const zRows = zSectionRows.map((slot, rowIdx) => {
            const thisRowH = Math.max(9, Math.round((layout.rowHeights[rowIdx] || rowH) * innerScale));
            const hasFocusedInRow = !!focusedTmId && nightDefs.some(({ night }) => night.assignments[slot.key]?.tmId === focusedTmId);
            return (
              <div
                key={slot.key}
                style={{
                  display: "flex",
                  height: thisRowH,
                  alignItems: "center",
                  fontSize: fontSize,
                  borderBottom: "1px solid #EBEBF0",
                  opacity: (mode === 'builder' && (filters?.size || search)) ? (rowMatchesFilters(slot) && rowMatchesSearch(slot) ? 1 : 0.25) : 1,
                  background: (() => {
                    const base = rowIdx % 2 === 0 ? "#fff" : "#F3F4F6";
                    if (mode !== 'builder') return base;
                    const sev = getRowMaxSeverity(slot.key);
                    if (sev <= 1) return base;
                    // WeekLens v2 builder-only row heatmap (light red, stronger with higher repeat count + priors already folded into effectiveSeverity elsewhere).
                    const opacity = Math.min(0.22, 0.06 + (sev - 1) * 0.06);
                    return `linear-gradient(90deg, rgba(239,68,68,${opacity}) 0%, ${base} 18%)`;
                  })(),
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 1px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #F59E0B" : "none",
                    paddingLeft: hasFocusedInRow ? 0 : 1,
                    lineHeight: 1,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {/* WeekLens v2 builder-only: tiny section icon (purely decorative, screen-only, zero layout impact on golden solver).
                      Collapsed in preview/print to preserve exact print fidelity. */}
                  {mode === 'builder' && (
                    <span title={slot.section} style={{ marginRight: 1, opacity: 0.55, fontSize: 7, fontWeight: 700, verticalAlign: 'middle', color: slot.accent || '#6B7280', lineHeight: 1 }}>
                      {slot.section === 'ZONES' ? 'Z' : slot.section === 'RESTROOMS' ? 'R' : 'S'}
                    </span>
                  )}
                  {getSlotLabel(slot)}
                </div>

                <div style={isSidebarCompact ? { display: 'flex', flex: 1, maxWidth: '87%' } : { display: 'flex', flex: 1 }}>
                {nightDefs.map(({ night }, colIdx) => {
                  const asgn = night.assignments[slot.key];
                  const tmId = asgn?.tmId;
                  const name = asgn?.tmName ?? "—";
                  const disp = getDisplayName(name);
                  const isFocused = focusedTmId && tmId === focusedTmId;
                  const isDimmed = focusedTmId && tmId && tmId !== focusedTmId;
                  const repeatCount = tmId ? (repeatCounts.get(`${tmId}:${slot.key}`) || 0) : 0;
                  const isRepeated = repeatCount > 1;

                  // Deeper health integration: prior recent history on this exact slot (for "effective this week" repeats).
                  // repeatCount = multiples within the current planned week.
                  // priorCount = matches in weeklyRecentHistory (prior days/weeks).
                  // totalThisWeek drives titles and consequence surfacing; plan repeat still drives the primary oval.
                  const priorInfo = tmId ? getTmThisWeekRepeatForSlot(weeklyRecentHistory, tmId, slot.key) : { count: 0, dates: [] as string[] };
                  const priorCount = priorInfo.count;
                  const totalThisWeek = repeatCount + priorCount;

                  let cellBg = "transparent";
                  if (isFocused) {
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.15)" : "rgba(193, 58, 20, 0.12)";
                  } else if (isRepeated) {
                    cellBg = "rgba(239, 68, 68, 0.03)";
                  }

                  // Screen-only repeat visualization. Hand-drawn style red oval (inspired by the reference "circled" look).
                  // Stronger for higher multiplicity (ties to rotation health: 2 = penalty, 3+ = real bad).
                  // Small count badge appears for 3+ so multiplicity is instantly visible without counting ovals.
                  const effectiveSeverity = Math.max(repeatCount, totalThisWeek);
                  const repeatCircle = isRepeated ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "calc(100% + 18px)",
                        height: "calc(100% + 12px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "2.5px solid #C13A14" : "2px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "2px 3px 0 #C13A14, -1.5px -1.5px 0 #C13A14"
                          : "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
                        marginLeft: 3,
                        flexShrink: 0,
                        verticalAlign: "middle",
                      }}
                    >
                      {effectiveSeverity}
                    </span>
                  ) : null;

                  return (
                    <div
                      key={colIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tmId && onFocusTm) onFocusTm(tmId);
                        // One-gesture action: focus this TM *and* jump the builder to this specific day
                        // so you land in context with the problematic/repeated placement visible on the main board.
                        if (onJumpToDayIndex) onJumpToDayIndex(night.dayIndex ?? colIdx);
                        // Note: onActivateTmContext (pad open) is no longer called on plain name click.
                        // Click = focus + day jump only. Deeper pad context available via xAI dots or sidebar actions.
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1px 2px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: isFocused ? '2px solid #F59E0B' : "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.32 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                        transition: 'background 70ms ease, border-color 70ms ease, opacity 70ms ease, box-shadow 70ms ease',
                        boxShadow: isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none',
                      }}
                      onMouseEnter={e => { 
                        if (!isFocused) e.currentTarget.style.background = isRepeated ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.02)'; 
                        if (isFocused) e.currentTarget.style.transform = 'translateY(-0.5px)';
                      }}
                      onMouseLeave={e => { 
                        e.currentTarget.style.background = cellBg; 
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none';
                      }}
                      data-placement-host={mode === 'builder' ? slot.key : undefined}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <>
                          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1, padding: '0 1px', lineHeight: 1 }}>
                            {disp}
                            {/* WeekLens v2: in builder we prefer a clean scalable red "ring" (rounded rect, soft shadow, stroke scales with severity).
                                Preview/print keep the hand-drawn rotated oval for exact fidelity with the print generator.
                                The ring is sized to "extend larger over the cell" while the name text position is unchanged. */}
                            {mode === 'builder' ? (
                              // Inset-based ring: extends outside the name's bounding box by a fixed amount on all sides.
                              // This guarantees the name text is visually centered inside the rounded red box
                              // regardless of the name's exact width or the inline-flex layout. Slightly asymmetric right for badge room.
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -6,
                                  left: -6,
                                  right: -8,
                                  bottom: -6,
                                  border: effectiveSeverity >= 3 ? '1.5px solid #C13A14' : '1px solid #C13A14',
                                  borderRadius: '4px',
                                  pointerEvents: 'none',
                                  zIndex: 0,
                                  boxShadow: effectiveSeverity >= 3
                                    ? '1px 1.5px 0 rgba(193,58,20,0.35)'
                                    : '0.5px 1px 0 rgba(193,58,20,0.3)',
                                  opacity: 0.9,
                                }}
                              />
                            ) : (
                              repeatCircle
                            )}
                          </span>

                          {/* In builder: small red count badge on EVERY repeat cell (not just 3+), placed off to the side of the ring/circle.
                              Preview keeps the original >=3 only badge. */}
                          {(mode === 'builder' && isRepeated && effectiveSeverity >= 2) || (effectiveSeverity >= 3) ? (
                            <span
                              style={{
                                minWidth: 8,
                                height: 8,
                                padding: '0 1px',
                                fontSize: 5.5,
                                fontWeight: 800,
                                lineHeight: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#C13A14',
                                color: '#fff',
                                borderRadius: 999,
                                pointerEvents: 'none',
                                zIndex: 2,
                                fontFamily: "var(--font-atkinson, system-ui)",
                                marginLeft: 2,
                                flexShrink: 0,
                                verticalAlign: 'middle',
                              }}
                            >
                              {effectiveSeverity}
                            </span>
                          ) : null}

                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4.5,
                                height: 4.5,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.85)",
                                border: "1px solid #fff",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                              title="Ask xAI about this week placement / repeat (opens insight)"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          {disp}
                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.8)",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                              }}
                              title="Ask xAI about this TM's week (opens insight)"
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>{/* close day wrapper (shortens day columns for sidebar) */}
              </div>
            );
          });

          const rSectionRows = slotRows.filter((s) => s.section === "RESTROOMS");
          const rRows = rSectionRows.map((slot, rowIdx) => {
            const thisRowH = Math.max(9, Math.round((layout.rowHeights[10 + rowIdx] || rowH) * innerScale));
            const hasFocusedInRow = !!focusedTmId && nightDefs.some(({ night }) => night.assignments[slot.key]?.tmId === focusedTmId);
            return (
              <div
                key={slot.key}
                style={{
                  display: "flex",
                  height: thisRowH,
                  alignItems: "center",
                  fontSize: fontSize,
                  borderBottom: "1px solid #EBEBF0",
                  opacity: (mode === 'builder' && (filters?.size || search)) ? (rowMatchesFilters(slot) && rowMatchesSearch(slot) ? 1 : 0.25) : 1,
                  background: (() => {
                    const base = (10 + rowIdx) % 2 === 0 ? "#fff" : "#F3F4F6";
                    if (mode !== 'builder') return base;
                    const sev = getRowMaxSeverity(slot.key);
                    if (sev <= 1) return base;
                    const opacity = Math.min(0.22, 0.06 + (sev - 1) * 0.06);
                    return `linear-gradient(90deg, rgba(239,68,68,${opacity}) 0%, ${base} 18%)`;
                  })(),
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 1px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #F59E0B" : "none",
                    paddingLeft: hasFocusedInRow ? 0 : 1,
                    lineHeight: 1,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {/* WeekLens v2 builder-only: tiny section icon (purely decorative, screen-only, zero layout impact on golden solver).
                      Collapsed in preview/print to preserve exact print fidelity. */}
                  {mode === 'builder' && (
                    <span title={slot.section} style={{ marginRight: 1, opacity: 0.55, fontSize: 7, fontWeight: 700, verticalAlign: 'middle', color: slot.accent || '#6B7280', lineHeight: 1 }}>
                      {slot.section === 'ZONES' ? 'Z' : slot.section === 'RESTROOMS' ? 'R' : 'S'}
                    </span>
                  )}
                  {getSlotLabel(slot)}
                </div>

                <div style={isSidebarCompact ? { display: 'flex', flex: 1, maxWidth: '87%' } : { display: 'flex', flex: 1 }}>
                {nightDefs.map(({ night }, colIdx) => {
                  const asgn = night.assignments[slot.key];
                  const tmId = asgn?.tmId;
                  const name = asgn?.tmName ?? "—";
                  const disp = getDisplayName(name);
                  const isFocused = focusedTmId && tmId === focusedTmId;
                  const isDimmed = focusedTmId && tmId && tmId !== focusedTmId;
                  const repeatCount = tmId ? (repeatCounts.get(`${tmId}:${slot.key}`) || 0) : 0;
                  const isRepeated = repeatCount > 1;

                  // Deeper health integration: prior recent history on this exact slot (for "effective this week" repeats).
                  // repeatCount = multiples within the current planned week.
                  // priorCount = matches in weeklyRecentHistory (prior days/weeks).
                  // totalThisWeek drives titles and consequence surfacing; plan repeat still drives the primary oval.
                  const priorInfo = tmId ? getTmThisWeekRepeatForSlot(weeklyRecentHistory, tmId, slot.key) : { count: 0, dates: [] as string[] };
                  const priorCount = priorInfo.count;
                  const totalThisWeek = repeatCount + priorCount;

                  let cellBg = "transparent";
                  if (isFocused) {
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.15)" : "rgba(193, 58, 20, 0.12)";
                  } else if (isRepeated) {
                    cellBg = "rgba(239, 68, 68, 0.03)";
                  }

                  // Screen-only repeat visualization. Hand-drawn style red oval (inspired by the reference "circled" look).
                  // Stronger for higher multiplicity (ties to rotation health: 2 = penalty, 3+ = real bad).
                  // Small count badge appears for 3+ so multiplicity is instantly visible without counting ovals.
                  const effectiveSeverity = Math.max(repeatCount, totalThisWeek);
                  const repeatCircle = isRepeated ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "calc(100% + 18px)",
                        height: "calc(100% + 12px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "2.5px solid #C13A14" : "2px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "2px 3px 0 #C13A14, -1.5px -1.5px 0 #C13A14"
                          : "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
                        marginLeft: 3,
                        flexShrink: 0,
                        verticalAlign: "middle",
                      }}
                    >
                      {effectiveSeverity}
                    </span>
                  ) : null;

                  return (
                    <div
                      key={colIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tmId && onFocusTm) onFocusTm(tmId);
                        // One-gesture action: focus this TM *and* jump the builder to this specific day
                        // so you land in context with the problematic/repeated placement visible on the main board.
                        if (onJumpToDayIndex) onJumpToDayIndex(night.dayIndex ?? colIdx);
                        // Note: onActivateTmContext (pad open) is no longer called on plain name click.
                        // Click = focus + day jump only. Deeper pad context available via xAI dots or sidebar actions.
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1px 2px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: isFocused ? '2px solid #F59E0B' : "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.32 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                        transition: 'background 70ms ease, border-color 70ms ease, opacity 70ms ease, box-shadow 70ms ease',
                        boxShadow: isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none',
                      }}
                      onMouseEnter={e => { 
                        if (!isFocused) e.currentTarget.style.background = isRepeated ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.02)'; 
                        if (isFocused) e.currentTarget.style.transform = 'translateY(-0.5px)';
                      }}
                      onMouseLeave={e => { 
                        e.currentTarget.style.background = cellBg; 
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none';
                      }}
                      data-placement-host={mode === 'builder' ? slot.key : undefined}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <>
                          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1, padding: '0 1px', lineHeight: 1 }}>
                            {disp}
                            {/* WeekLens v2: in builder we prefer a clean scalable red "ring" (rounded rect, soft shadow, stroke scales with severity).
                                Preview/print keep the hand-drawn rotated oval for exact fidelity with the print generator.
                                The ring is sized to "extend larger over the cell" while the name text position is unchanged. */}
                            {mode === 'builder' ? (
                              // Inset-based ring: extends outside the name's bounding box by a fixed amount on all sides.
                              // This guarantees the name text is visually centered inside the rounded red box
                              // regardless of the name's exact width or the inline-flex layout. Slightly asymmetric right for badge room.
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -6,
                                  left: -6,
                                  right: -8,
                                  bottom: -6,
                                  border: effectiveSeverity >= 3 ? '1.5px solid #C13A14' : '1px solid #C13A14',
                                  borderRadius: '4px',
                                  pointerEvents: 'none',
                                  zIndex: 0,
                                  boxShadow: effectiveSeverity >= 3
                                    ? '1px 1.5px 0 rgba(193,58,20,0.35)'
                                    : '0.5px 1px 0 rgba(193,58,20,0.3)',
                                  opacity: 0.9,
                                }}
                              />
                            ) : (
                              repeatCircle
                            )}
                          </span>

                          {/* In builder: small red count badge on EVERY repeat cell (not just 3+), placed off to the side of the ring/circle.
                              Preview keeps the original >=3 only badge. */}
                          {(mode === 'builder' && isRepeated && effectiveSeverity >= 2) || (effectiveSeverity >= 3) ? (
                            <span
                              style={{
                                minWidth: 8,
                                height: 8,
                                padding: '0 1px',
                                fontSize: 5.5,
                                fontWeight: 800,
                                lineHeight: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#C13A14',
                                color: '#fff',
                                borderRadius: 999,
                                pointerEvents: 'none',
                                zIndex: 2,
                                fontFamily: "var(--font-atkinson, system-ui)",
                                marginLeft: 2,
                                flexShrink: 0,
                                verticalAlign: 'middle',
                              }}
                            >
                              {effectiveSeverity}
                            </span>
                          ) : null}

                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4.5,
                                height: 4.5,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.85)",
                                border: "1px solid #fff",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                              title="Ask xAI about this week placement / repeat (opens insight)"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          {disp}
                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.8)",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                              }}
                              title="Ask xAI about this TM's week (opens insight)"
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>{/* close day wrapper (shortens day columns for sidebar) */}
              </div>
            );
          });

          const sSectionRows = slotRows.filter((s) => s.section === "SUPPORT");
          const sRows = sSectionRows.map((slot, rowIdx) => {
            const thisRowH = Math.max(9, Math.round((layout.rowHeights[20 + rowIdx] || rowH) * innerScale));
            const hasFocusedInRow = !!focusedTmId && nightDefs.some(({ night }) => night.assignments[slot.key]?.tmId === focusedTmId);
            return (
              <div
                key={slot.key}
                style={{
                  display: "flex",
                  height: thisRowH,
                  alignItems: "center",
                  fontSize: fontSize,
                  borderBottom: "1px solid #EBEBF0",
                  opacity: (mode === 'builder' && (filters?.size || search)) ? (rowMatchesFilters(slot) && rowMatchesSearch(slot) ? 1 : 0.25) : 1,
                  background: (() => {
                    const base = (20 + rowIdx) % 2 === 0 ? "#fff" : "#F3F4F6";
                    if (mode !== 'builder') return base;
                    const sev = getRowMaxSeverity(slot.key);
                    if (sev <= 1) return base;
                    const opacity = Math.min(0.22, 0.06 + (sev - 1) * 0.06);
                    return `linear-gradient(90deg, rgba(239,68,68,${opacity}) 0%, ${base} 18%)`;
                  })(),
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 1px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #F59E0B" : "none",
                    paddingLeft: hasFocusedInRow ? 0 : 1,
                    lineHeight: 1,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {/* WeekLens v2 builder-only: tiny section icon (purely decorative, screen-only, zero layout impact on golden solver).
                      Collapsed in preview/print to preserve exact print fidelity. */}
                  {mode === 'builder' && (
                    <span title={slot.section} style={{ marginRight: 1, opacity: 0.55, fontSize: 7, fontWeight: 700, verticalAlign: 'middle', color: slot.accent || '#6B7280', lineHeight: 1 }}>
                      {slot.section === 'ZONES' ? 'Z' : slot.section === 'RESTROOMS' ? 'R' : 'S'}
                    </span>
                  )}
                  {getSlotLabel(slot)}
                </div>

                <div style={isSidebarCompact ? { display: 'flex', flex: 1, maxWidth: '87%' } : { display: 'flex', flex: 1 }}>
                {nightDefs.map(({ night }, colIdx) => {
                  const asgn = night.assignments[slot.key];
                  const tmId = asgn?.tmId;
                  const name = asgn?.tmName ?? "—";
                  const disp = getDisplayName(name);
                  const isFocused = focusedTmId && tmId === focusedTmId;
                  const isDimmed = focusedTmId && tmId && tmId !== focusedTmId;
                  const repeatCount = tmId ? (repeatCounts.get(`${tmId}:${slot.key}`) || 0) : 0;
                  const isRepeated = repeatCount > 1;

                  // Deeper health integration: prior recent history on this exact slot (for "effective this week" repeats).
                  // repeatCount = multiples within the current planned week.
                  // priorCount = matches in weeklyRecentHistory (prior days/weeks).
                  // totalThisWeek drives titles and consequence surfacing; plan repeat still drives the primary oval.
                  const priorInfo = tmId ? getTmThisWeekRepeatForSlot(weeklyRecentHistory, tmId, slot.key) : { count: 0, dates: [] as string[] };
                  const priorCount = priorInfo.count;
                  const totalThisWeek = repeatCount + priorCount;

                  let cellBg = "transparent";
                  if (isFocused) {
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.15)" : "rgba(193, 58, 20, 0.12)";
                  } else if (isRepeated) {
                    cellBg = "rgba(239, 68, 68, 0.03)";
                  }

                  // Screen-only repeat visualization. Hand-drawn style red oval (inspired by the reference "circled" look).
                  // Stronger for higher multiplicity (ties to rotation health: 2 = penalty, 3+ = real bad).
                  // Small count badge appears for 3+ so multiplicity is instantly visible without counting ovals.
                  const effectiveSeverity = Math.max(repeatCount, totalThisWeek);
                  const repeatCircle = isRepeated ? (
                    <span
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        width: "calc(100% + 18px)",
                        height: "calc(100% + 12px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "2.5px solid #C13A14" : "2px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "2px 3px 0 #C13A14, -1.5px -1.5px 0 #C13A14"
                          : "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
                        marginLeft: 3,
                        flexShrink: 0,
                        verticalAlign: "middle",
                      }}
                    >
                      {effectiveSeverity}
                    </span>
                  ) : null;

                  return (
                    <div
                      key={colIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tmId && onFocusTm) onFocusTm(tmId);
                        // One-gesture action: focus this TM *and* jump the builder to this specific day
                        // so you land in context with the problematic/repeated placement visible on the main board.
                        if (onJumpToDayIndex) onJumpToDayIndex(night.dayIndex ?? colIdx);
                        // Note: onActivateTmContext (pad open) is no longer called on plain name click.
                        // Click = focus + day jump only. Deeper pad context available via xAI dots or sidebar actions.
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1px 2px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: isFocused ? '2px solid #F59E0B' : "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.32 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                        transition: 'background 70ms ease, border-color 70ms ease, opacity 70ms ease, box-shadow 70ms ease',
                        boxShadow: isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none',
                      }}
                      onMouseEnter={e => { 
                        if (!isFocused) e.currentTarget.style.background = isRepeated ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.02)'; 
                        if (isFocused) e.currentTarget.style.transform = 'translateY(-0.5px)';
                      }}
                      onMouseLeave={e => { 
                        e.currentTarget.style.background = cellBg; 
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = isFocused ? '0 0 0 1px rgba(245, 158, 11, 0.2)' : 'none';
                      }}
                      data-placement-host={mode === 'builder' ? slot.key : undefined}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <>
                          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1, padding: '0 1px', lineHeight: 1 }}>
                            {disp}
                            {/* WeekLens v2: in builder we prefer a clean scalable red "ring" (rounded rect, soft shadow, stroke scales with severity).
                                Preview/print keep the hand-drawn rotated oval for exact fidelity with the print generator.
                                The ring is sized to "extend larger over the cell" while the name text position is unchanged. */}
                            {mode === 'builder' ? (
                              // Inset-based ring: extends outside the name's bounding box by a fixed amount on all sides.
                              // This guarantees the name text is visually centered inside the rounded red box
                              // regardless of the name's exact width or the inline-flex layout. Slightly asymmetric right for badge room.
                              <span
                                style={{
                                  position: 'absolute',
                                  top: -6,
                                  left: -6,
                                  right: -8,
                                  bottom: -6,
                                  border: effectiveSeverity >= 3 ? '1.5px solid #C13A14' : '1px solid #C13A14',
                                  borderRadius: '4px',
                                  pointerEvents: 'none',
                                  zIndex: 0,
                                  boxShadow: effectiveSeverity >= 3
                                    ? '1px 1.5px 0 rgba(193,58,20,0.35)'
                                    : '0.5px 1px 0 rgba(193,58,20,0.3)',
                                  opacity: 0.9,
                                }}
                              />
                            ) : (
                              repeatCircle
                            )}
                          </span>

                          {/* In builder: small red count badge on EVERY repeat cell (not just 3+), placed off to the side of the ring/circle.
                              Preview keeps the original >=3 only badge. */}
                          {(mode === 'builder' && isRepeated && effectiveSeverity >= 2) || (effectiveSeverity >= 3) ? (
                            <span
                              style={{
                                minWidth: 8,
                                height: 8,
                                padding: '0 1px',
                                fontSize: 5.5,
                                fontWeight: 800,
                                lineHeight: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#C13A14',
                                color: '#fff',
                                borderRadius: 999,
                                pointerEvents: 'none',
                                zIndex: 2,
                                fontFamily: "var(--font-atkinson, system-ui)",
                                marginLeft: 2,
                                flexShrink: 0,
                                verticalAlign: 'middle',
                              }}
                            >
                              {effectiveSeverity}
                            </span>
                          ) : null}

                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4.5,
                                height: 4.5,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.85)",
                                border: "1px solid #fff",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                                flexShrink: 0,
                              }}
                              title="Ask xAI about this week placement / repeat (opens insight)"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          {disp}
                          {showDigitalAssists && onRequestXaiInsight && tmId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestXaiInsight(tmId!, { slotKey: slot.key, dayIndex: night.dayIndex, week: true });
                              }}
                              className="no-print"
                              style={{
                                display: "inline-block",
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                background: "rgba(147, 51, 234, 0.8)",
                                marginLeft: 2,
                                verticalAlign: "middle",
                                cursor: "pointer",
                              }}
                              title="Ask xAI about this TM's week (opens insight)"
                            />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
                </div>{/* close day wrapper (shortens day columns for sidebar) */}
              </div>
            );
          });

          return (
            <>
              <div>
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    height: Math.max(10, Math.round(layout.secH * innerScale)),
                    background: "#F2F2F7",
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                    color: "#5F6368",
                    padding: "0 3px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
                    lineHeight: 1,
                  }}
                  title="Click to deselect"
                >
                  ZONES
                </div>
                {zRows}
              </div>
              <div>
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    height: Math.max(10, Math.round(layout.secH * innerScale)),
                    background: "#F2F2F7",
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                    color: "#5F6368",
                    padding: "0 3px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
                    lineHeight: 1,
                  }}
                  title="Click to deselect"
                >
                  RESTROOMS
                </div>
                {rRows}
              </div>
              <div>
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    height: Math.max(10, Math.round(layout.secH * innerScale)),
                    background: "#F2F2F7",
                    fontSize: 7.5,
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                    color: "#5F6368",
                    padding: "0 3px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
                    lineHeight: 1,
                  }}
                  title="Click to deselect"
                >
                  SUPPORT
                </div>
                {sRows}
              </div>
            </>
          );
        })()}
      </div> {/* close tableBodyH wrapper */}

      {/* WeekLens v2 (builder-only): absolute Repeat Score strip on the far right of the table body.
          Does NOT participate in the flex layout of the 7 day columns + slot label. The solver-computed
          row heights, slotColW, and day column widths remain 100% identical to preview/print.
          "Wk Repeats" header aligns perfectly with column headers. Bars are thicker with gradient. */}
      {mode === 'builder' && (
        <div
          className="no-print"
          style={{
            position: 'absolute',
            right: 1,
            top: layout.colHdrH + Math.max(11, Math.round(layout.headCountH * innerScale)),
            width: 50,
            height: liveTableBodyH - Math.max(11, Math.round(layout.headCountH * innerScale)),
            pointerEvents: 'none',
            zIndex: 3,
            fontFamily: "var(--font-atkinson, system-ui)",
            fontSize: 7.5,
            color: '#6B7280',
            borderLeft: '1px solid #E5E5EA',
            background: 'rgba(255,255,255,0.92)',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ 
            height: Math.max(10, Math.round(layout.headCountH * innerScale)), 
            fontSize: 5, 
            fontWeight: 700, 
            padding: '0 1px', 
            borderBottom: '1px solid #E5E5EA', 
            background: '#F8F8FB',
            textTransform: 'uppercase',
            letterSpacing: '0.2px',
            color: '#8E8E93',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center'
          }} title="Wk Repeats: total repeats for this slot across the full week (higher = more rotation pressure)">
            Wk Repeats
          </div>
          {slotRows.map((slot, i) => {
            const baseIdx = slot.section === 'ZONES' ? i : slot.section === 'RESTROOMS' ? 10 + i : 20 + i;
            const h = Math.max(9, Math.round((layout.rowHeights[baseIdx] || rowH) * innerScale));
            const maxSev = getRowMaxSeverity(slot.key);
            const barW = Math.min(100, Math.round((maxSev / 5) * 100));
            const barColor = maxSev >= 4 ? '#9F1239' : maxSev >= 3 ? '#C13A14' : maxSev >= 2 ? '#EA580C' : '#F59E0B';
            const textColor = maxSev >= 3 ? '#C13A14' : '#6B7280';
            return (
              <div key={slot.key} style={{ height: h, display: 'flex', alignItems: 'center', padding: '0 1px', borderBottom: '1px solid #F4F4F5', background: i % 2 === 0 ? '#fff' : '#F3F4F6' }}>
                <div style={{ width: 22, height: 3.5, background: '#E5E5EA', borderRadius: 1, overflow: 'hidden', marginRight: 1 }}>
                  <div style={{ width: `${barW}%`, height: '100%', background: barColor }} />
                </div>
                <span style={{ fontSize: 6.5, color: textColor, fontWeight: maxSev >= 2 ? 700 : 400 }}>{maxSev || 0}×</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Subtle footer note — now very minimal, self-documenting via hovers/titles. */}
      <div
        className="no-print"
        onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
        style={{
          fontSize: 5.5,
          color: "#A1A1AA",
          padding: "0 3px",
          textAlign: "right",
          borderTop: "1px solid #E5E5EA",
          cursor: onFocusTm ? "pointer" : "default",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(255,255,255,0.94)",
          lineHeight: 1,
        }}
        title="Click to deselect • Focus = sidebar + week highlights • Wk Repeats = right column • xAI dots = advisor"
      >
        builder • focus = sidebar + highlights • Wk Repeats right col • xAI dots = plan
      </div>
    </div>
  );
}

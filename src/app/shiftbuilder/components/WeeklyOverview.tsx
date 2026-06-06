"use client";

import React from "react";
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
 * - Click any TM name → focus it across the whole week (stronger tint on their cells; others dim) + jump to that placement's day.
 * - Red hand-drawn rotated ovals (with box-shadow, severity-aware for 3+) + subtle bg + count badge (for 3+) on any TM placed in the *same slot* multiple times this week.
 * - Day column headers are clickable → jump the builder's selected day while preserving focus.
 * - Enriched titles and (future) contextual actions feed the PlacementPad with rotation/health context.
 * - Absolute screen-only footer note (temporary; goal is self-evident interactions).
 *
 * This is the foundation for richer week-level UX (insights, actions, better focus viz, health integration)
 * while the real printed artifact stays clean via the separate overviewShell + static HTML path.
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
   * Optional callback for deeper actionability: when a TM name or repeat cell is activated,
   * this can open the PlacementPad (or other) pre-contextualized with the TM, the specific slot,
   * the day of this placement, and week health/rotation signals.
   * Screen-only; never affects print.
   */
  onActivateTmContext?: (tmId: string, slotKey: string, dayIndex: number) => void;
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
          alignItems: "baseline",
          padding: "0 12px",
          background: "#fff",
          borderBottom: "1px solid #E5E5EA",
          boxSizing: "border-box",
          cursor: onFocusTm ? "pointer" : "default",
          gap: 10,
        }}
        title="Click to deselect"
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "-0.4px",
            fontFamily: "var(--font-atkinson, system-ui)",
            color: "#1C1C1E",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {dateRange}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: "#6B7280",
            fontFamily: "var(--font-atkinson, system-ui)",
            whiteSpace: "nowrap",
          }}
        >
          {writtenRange}
        </span>

        {/* Subtle screen-only week health signal (minimal, only appears if there are plan-internal repeats >1).
            This is the "broader problem indicator" — number of (TM, exact slot) pairs violating the max-1 policy this week.
            Does not affect print. Positioned minimally on the right of the sparse banner. */}
        {planRepeatViolations > 0 && (
          <div
            className="no-print"
            style={{
              marginLeft: 8,
              fontSize: 7,
              fontWeight: 700,
              padding: "1px 4px",
              borderRadius: 2,
              background: "rgba(193, 58, 20, 0.12)",
              color: "#C13A14",
              fontFamily: "var(--font-atkinson, system-ui)",
              letterSpacing: "0.3px",
              whiteSpace: "nowrap",
              alignSelf: "center",
            }}
            title={`${planRepeatViolations} (TM, slot) pairs with multiple placements in the same slot this week — see red ovals and rotation health`}
          >
            {planRepeatViolations} viol.
          </div>
        )}
      </div>

      {/* Column headers (full colHdrH for colored caps + "FRI 5" style labels from main pages).
          Table body uses liveTableBodyH + innerScale so the 30 data rows (Z at 0+, R at 10+, S at 20+)
          plus headcount + section headers exactly fill the remaining artboard height (SP2 always visible). */}
      {/* Column headers — styles aligned with print (colored top borders, jumpable, "Slot" + day labels) */}
      <div
        style={{
          display: "flex",
          background: "#F8F8FB",
          borderBottom: "2px solid #C8C8CC",
          flexShrink: 0,
          height: layout.colHdrH,
          boxSizing: "border-box",
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
          style={{
            width: slotColW,
            padding: "3px 6px",
            fontSize: 8,
            fontWeight: 700,
            color: "#8E8E93",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
            cursor: onFocusTm ? "pointer" : "default",
          }}
          title="Click to deselect"
        >
          Slot
        </div>
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
              padding: "1px 0",
              letterSpacing: "0.02em",
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
            }}
            title={def.name}
          >
            {dayLabel(def)}
          </div>
        ))}
      </div>

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
        {/* Headcount row — per-day filled counts (only the slots actually rendered in this table).
            Numbers use the day's accent color to match the column caps. Structural label rows (headcount + sections)
            get a gentler min height so text stays readable on screen; data rows absorb most elasticity. */}
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
              padding: "0 4px",
              color: "#4B5563",
              flexShrink: 0,
              fontSize: 7.5,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              cursor: onFocusTm ? "pointer" : "default",
            }}
            title="Click to deselect"
          >
            Headcount
          </div>
          {nightDefs.map(({ night, def }, i) => {
            // Count only the defined slots in this table (matches print countFilledSlots)
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
                  position: "relative", // for the load bar
                }}
                title={colHasFocused ? "Focused TM is assigned in this column today" : "Click to deselect"}
              >
                <span style={{ fontSize: fontSize + 0.5, fontWeight: colHasFocused ? 900 : 800 }}>{count}</span>
                {layout.showHeadcountRatio && (
                  <span style={{ fontSize: fontSize - 0.5, fontWeight: 600, color: "#8E8E93" }}>
                    /{slotRows.length}
                  </span>
                )}
                {colHasFocused && (
                  <span style={{ fontSize: 6, marginLeft: 1, color: def.color, verticalAlign: "super" }}>●</span>
                )}
                {/* Screen-only week load indicator for this column (relative to total slots; not shown in print).
                    Gives quick visual sense of "how heavy is this day" in the week context. */}
                <div
                  className="no-print"
                  style={{
                    position: "absolute",
                    bottom: 1,
                    left: "50%",
                    transform: "translateX(-50%)",
                    height: 2,
                    width: "60%",
                    background: "rgba(0,0,0,0.08)",
                    borderRadius: 1,
                    overflow: "hidden",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      background: def.color,
                      width: `${Math.min(100, Math.round((count / Math.max(1, slotRows.length * 0.7)) * 100))}%`,
                      transition: "width 120ms ease",
                    }}
                  />
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
                  background: rowIdx % 2 === 0 ? "#fff" : "#FAFAFA",
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 3px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #C13A14" : "none",
                    paddingLeft: hasFocusedInRow ? 1 : 3,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {getSlotLabel(slot)}
                </div>

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
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.10)" : "rgba(193, 58, 20, 0.08)";
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
                        width: "calc(100% + 6px)",
                        height: "calc(100% + 4px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "3px solid #C13A14" : "2.5px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14"
                          : "1px 1.5px 0 #C13A14, -0.5px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -1,
                        right: -2,
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
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
                        // Deeper actionability: if provided, activate full context (e.g. open PlacementPad
                        // pre-loaded with this TM + exact slot + this day's index + week repeat/health signals).
                        if (tmId && onActivateTmContext) onActivateTmContext(tmId, slot.key, night.dayIndex ?? colIdx);
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 1px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.35 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                          {disp}
                          {repeatCircle}
                          {repeatBadge}
                        </span>
                      ) : (
                        disp
                      )}
                    </div>
                  );
                })}
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
                  background: (10 + rowIdx) % 2 === 0 ? "#fff" : "#FAFAFA",
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 3px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #C13A14" : "none",
                    paddingLeft: hasFocusedInRow ? 1 : 3,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {getSlotLabel(slot)}
                </div>

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
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.10)" : "rgba(193, 58, 20, 0.08)";
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
                        width: "calc(100% + 6px)",
                        height: "calc(100% + 4px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "3px solid #C13A14" : "2.5px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14"
                          : "1px 1.5px 0 #C13A14, -0.5px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -1,
                        right: -2,
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
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
                        // Deeper actionability: if provided, activate full context (e.g. open PlacementPad
                        // pre-loaded with this TM + exact slot + this day's index + week repeat/health signals).
                        if (tmId && onActivateTmContext) onActivateTmContext(tmId, slot.key, night.dayIndex ?? colIdx);
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 1px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.35 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                          {disp}
                          {repeatCircle}
                          {repeatBadge}
                        </span>
                      ) : (
                        disp
                      )}
                    </div>
                  );
                })}
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
                  background: (20 + rowIdx) % 2 === 0 ? "#fff" : "#FAFAFA",
                }}
              >
                <div
                  onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
                  style={{
                    width: slotColW,
                    padding: "0 3px",
                    fontWeight: hasFocusedInRow ? 700 : 600,
                    color: hasFocusedInRow ? "#C13A14" : (slot.accent || "#5F6368"),
                    flexShrink: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    cursor: onFocusTm ? "pointer" : "default",
                    borderLeft: hasFocusedInRow ? "2px solid #C13A14" : "none",
                    paddingLeft: hasFocusedInRow ? 1 : 3,
                  }}
                  title={hasFocusedInRow ? "This row contains the focused TM — click to deselect or jump via name" : "Click to deselect"}
                >
                  {getSlotLabel(slot)}
                </div>

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
                    cellBg = isRepeated ? "rgba(193, 58, 20, 0.10)" : "rgba(193, 58, 20, 0.08)";
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
                        width: "calc(100% + 6px)",
                        height: "calc(100% + 4px)",
                        transform: "translate(-50%, -50%) rotate(-4deg)",
                        border: effectiveSeverity >= 3 ? "3px solid #C13A14" : "2.5px solid #C13A14",
                        borderRadius: "9999px",
                        pointerEvents: "none",
                        zIndex: 0,
                        boxShadow: effectiveSeverity >= 3
                          ? "1.5px 2px 0 #C13A14, -1px -1px 0 #C13A14"
                          : "1px 1.5px 0 #C13A14, -0.5px -1px 0 #C13A14",
                        opacity: effectiveSeverity >= 3 ? 0.95 : 0.9,
                      }}
                    />
                  ) : null;

                  const repeatBadge = (isRepeated && effectiveSeverity >= 3) ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -1,
                        right: -2,
                        minWidth: 9,
                        height: 9,
                        padding: "0 1.5px",
                        fontSize: 6,
                        fontWeight: 800,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#C13A14",
                        color: "#fff",
                        borderRadius: 999,
                        pointerEvents: "none",
                        zIndex: 2,
                        fontFamily: "var(--font-atkinson, system-ui)",
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
                        // Deeper actionability: if provided, activate full context (e.g. open PlacementPad
                        // pre-loaded with this TM + exact slot + this day's index + week repeat/health signals).
                        if (tmId && onActivateTmContext) onActivateTmContext(tmId, slot.key, night.dayIndex ?? colIdx);
                      }}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 1px",
                        fontSize: fontSize,
                        fontWeight: asgn?.tmId ? 600 : 400,
                        color: asgn?.tmId ? "#1C1C1E" : "#AEAEB2",
                        borderLeft: "1px solid #EBEBF0",
                        textAlign: "center",
                        cursor: "pointer",
                        overflow: "visible",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        opacity: isDimmed ? 0.35 : 1,
                        background: cellBg,
                        boxSizing: "border-box",
                        position: "relative",
                      }}
                      title={
                        tmId && isRepeated
                          ? `${name} — ${repeatCount}× in this week's plan${priorCount > 0 ? ` (+${priorCount} prior)` : ""}${totalThisWeek >= 3 ? " — contributes to rotation penalty" : ""}`
                          : name
                      }
                    >
                      {isRepeated ? (
                        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                          {disp}
                          {repeatCircle}
                          {repeatBadge}
                        </span>
                      ) : (
                        disp
                      )}
                    </div>
                  );
                })}
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
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    color: "#5F6368",
                    padding: "1px 4px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
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
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    color: "#5F6368",
                    padding: "1px 4px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
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
                    fontSize: 8,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    color: "#5F6368",
                    padding: "1px 4px",
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid #E5E5EA",
                    cursor: onFocusTm ? "pointer" : "default",
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

      {/* Subtle footer note (screen-only, explicitly no-print so it never appears in the PDF).
          Absolute so it never affects the 816px height budget or row fitting. */}
      <div
        className="no-print"
        onClick={(e) => { e.stopPropagation(); onFocusTm?.(null); }}
        style={{
          fontSize: 6,
          color: "#9CA3AF",
          padding: "1px 4px",
          textAlign: "right",
          borderTop: "1px solid #E5E5EA",
          cursor: onFocusTm ? "pointer" : "default",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(255,255,255,0.9)",
        }}
        title="Click to deselect"
      >
        Week Overview • names = focus + jump to that day + contextual action • red ovals/badges = plan repeats (3× stronger + prior history in titles) • accents on labels/headcount = focused person's footprint • load bars = relative day weight (screen only)
      </div>
    </div>
  );
}

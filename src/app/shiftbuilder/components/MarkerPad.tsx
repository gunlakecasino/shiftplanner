"use client";

/**
 * MarkerPad module — shared slot/TM picker primitives
 *
 * The MarkerPad floating panel itself was removed (dead code — superseded by
 * PlacementPad); this module now only hosts the pieces still consumed elsewhere:
 *   • getSlotMeta — slot identity lookup (label / loc / icon / accent)
 *   • TmPicker (+ TmEntry) — searchable TM assignment list with drag support
 *
 * Uses --sb-* CSS tokens so light/dark mode is automatic.
 */

import React, { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  ZONE_DEFS, RR_DEFS,
  ZONE_ICONS, RR_ICONS,
  getZoneColor, getRRAccent, getAuxAccent, getAuxIcon,
} from "@/lib/shiftbuilder/constants";
import {
  fitVerdictLabel,
  fitVerdictStyles,
  type PlacementFitVerdict,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PickerTmRotationFit } from "../hooks/usePickerRotationSort";

export interface TmEntry {
  tmId: string;
  tmName: string;
}

// ── Slot metadata lookup ─────────────────────────────────────────────────────

export function getSlotMeta(
  slotKey: string,
  auxDefs: import("@/lib/shiftbuilder/placement").AuxDef[] = [],
): { label: string; loc: string; icon: string; accent: string } {
  const zd = ZONE_DEFS.find(z => z.key === slotKey);
  if (zd) return {
    label: zd.label,
    loc: "",
    icon: ZONE_ICONS[slotKey] ?? "●",
    accent: getZoneColor(slotKey),
  };

  const rrMatch = slotKey.match(/^([MW])RR(\d+)$/);
  if (rrMatch) {
    const side = rrMatch[1] === "M" ? "Men's" : "Women's";
    const num = Number(rrMatch[2]);
    const rd = RR_DEFS.find(r => r.num === num);
    return {
      label: `${side} · ${rd?.label ?? `RR ${num}`}`,
      loc: "",
      icon: RR_ICONS[num] ?? "●",
      accent: getRRAccent(num),
    };
  }

  const ad = auxDefs.find((a) => a.key === slotKey);
  if (ad && ad.role !== "blank") return {
    label: ad.label,
    loc: ad.locations[0] ?? "",
    icon: getAuxIcon(slotKey, ad.role),
    accent: getAuxAccent(slotKey, ad.role),
  };

  return { label: slotKey, loc: "", icon: "●", accent: "#6B7280" };
}

function TmPickerRow({
  tm,
  enableDragAssign,
  allowListScroll = false,
  isTablet,
  accent,
  rowBg,
  rowBorder,
  textPrimary,
  rotationFit,
  onPick,
}: {
  tm: TmEntry;
  enableDragAssign: boolean;
  allowListScroll?: boolean;
  isTablet: boolean;
  accent: string;
  rowBg: string;
  rowBorder: string;
  textPrimary: string;
  rotationFit?: PickerTmRotationFit;
  onPick: (tm: TmEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tm:${tm.tmId}`,
    data: { type: "tm", tmId: tm.tmId, tmName: tm.tmName },
    disabled: !enableDragAssign,
  });
  const initial = tm.tmName.charAt(0).toUpperCase();
  const fitStyles = rotationFit
    ? fitVerdictStyles(rotationFit.fitVerdict as PlacementFitVerdict)
    : null;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(enableDragAssign ? { ...listeners, ...attributes } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onPick(tm);
      }}
      onPointerDown={allowListScroll ? undefined : (e) => e.stopPropagation()}
      className="sb-list-row sb-interactive"
      style={{
        display: "flex",
        alignItems: "center",
        gap: isTablet ? 12 : 8,
        padding: isTablet ? "12px 14px" : "7px 10px",
        borderRadius: isTablet ? 12 : 10,
        minHeight: isTablet ? 56 : undefined,
        background: rowBg,
        border: `1px solid ${rowBorder}`,
        cursor: enableDragAssign ? "grab" : "pointer",
        textAlign: "left",
        width: "100%",
        opacity: isDragging ? 0.45 : 1,
        touchAction: allowListScroll ? "pan-y" : enableDragAssign ? "none" : "manipulation",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = `${accent}22`;
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}66`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = rowBg;
        (e.currentTarget as HTMLElement).style.borderColor = rowBorder;
      }}
    >
      <span
        style={{
          width: isTablet ? 40 : 22,
          height: isTablet ? 40 : 22,
          borderRadius: "50%",
          flexShrink: 0,
          background: `${accent}22`,
          border: `1px solid ${accent}66`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isTablet ? 17 : 10,
          fontWeight: 800,
          color: accent,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
        }}
      >
        {initial}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: isTablet ? 20 : 12.5,
          fontWeight: 600,
          color: textPrimary,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          letterSpacing: "-0.15px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tm.tmName}
      </span>
      {rotationFit && fitStyles && (
        <span
          title={[
            `${fitVerdictLabel(rotationFit.fitVerdict as PlacementFitVerdict)} · ${rotationFit.healthPoints.toFixed(1)}pt`,
            rotationFit.fitFactLine,
            rotationFit.fitSummary,
          ].filter(Boolean).join("\n")}
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: isTablet ? "4px 8px" : "2px 6px",
            borderRadius: 999,
            background: fitStyles.bg,
            color: fitStyles.text,
            fontSize: isTablet ? 12 : 9,
            fontWeight: 700,
            fontFamily: "var(--font-jetbrains, monospace)",
            letterSpacing: "0.02em",
          }}
        >
          <span
            style={{
              width: isTablet ? 7 : 5,
              height: isTablet ? 7 : 5,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.92)",
              flexShrink: 0,
            }}
          />
          {rotationFit.healthPoints.toFixed(1)}
        </span>
      )}
    </button>
  );
}

// ── TmPicker ──────────────────────────────────────────────────────────────────

export const TmPicker: React.FC<{
  tms: TmEntry[];
  allTms?: TmEntry[];   // broader eligible pool — only used when the operator types in the search box
  currentTmName?: string;
  onPick: (tm: TmEntry) => void;
  onAddOnCall?: (tm: TmEntry) => void;
  onMarkUnavailable?: (tm: TmEntry, status: string) => void | Promise<void>;
  onCancel?: () => void;
  confirmed: boolean;
  accent: string;
  isDark: boolean;
  /** iPad bottom sheet — larger type and touch rows */
  variant?: "default" | "tablet";
  /** Drag TM rows onto slots (requires parent DndContext). Click-to-assign still works. */
  enableDragAssign?: boolean;
  /** When true, list uses pan-y so touch/wheel scroll works (placement pad). */
  allowListScroll?: boolean;
  /** Explicit scroll region height — required for Safari nested flex scroll. */
  listScrollMaxHeight?: number;
  /** Rotation-health preview per TM when assigning to a specific slot (default list only). */
  fitByTmId?: Record<string, PickerTmRotationFit>;
}> = ({
  tms,
  allTms,
  currentTmName,
  onPick,
  onAddOnCall,
  onMarkUnavailable,
  onCancel,
  confirmed,
  accent,
  isDark,
  variant = "default",
  enableDragAssign = false,
  allowListScroll = false,
  listScrollMaxHeight,
  fitByTmId,
}) => {
  const isTablet = variant === "tablet";
  const [filter, setFilter] = useState("");
  const [showAllEligible, setShowAllEligible] = useState(false);
  const [unavailableFor, setUnavailableFor] = useState<string | null>(null);

  // Rule:
  // 1. Default list (no text in box) = scheduled + eligible + unassigned only (tms prop)
  // 2. When typing → switch to all eligible (allTms prop) for search
  // 3. The default list must *never* contain anyone who is not scheduled tonight for the correct role group.
  const searchPool = (filter.trim() || showAllEligible) && allTms ? allTms : tms;
  const scheduledIds = new Set(tms.map((t) => t.tmId));
  const filtered = filter.trim()
    ? searchPool.filter(t => t.tmName.toLowerCase().includes(filter.toLowerCase()))
    : showAllEligible
      ? searchPool
      : tms;

  const textPrimary = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)";
  const textMuted   = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const rowBg       = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const rowBorder   = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)";
  const inputBg     = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)";

  const unavailableReasons = [
    { status: 'called_off', label: 'Called off' },
    { status: 'pto', label: 'PTO' },
    { status: 'loa', label: 'LOA' },
    { status: 'off', label: 'Other / Off' },
  ];

  if (confirmed) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span className="ms" style={{ fontSize: 28, color: accent, fontVariationSettings: '"FILL" 1' }}>check_circle</span>
        <span style={{ fontSize: isTablet ? 18 : 11, fontWeight: 700, color: textPrimary }}>Assigned</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 8 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: isTablet ? 18 : 10.5, fontWeight: 700, letterSpacing: "-0.1px", color: textPrimary }}>
          {currentTmName ? `Replace ${currentTmName}…` : "Assign TM"}
          <span style={{ fontSize: isTablet ? 15 : 9, marginLeft: 6, opacity: 0.55 }}>
            {filter.trim() ? "all eligible" : "scheduled + eligible"}
          </span>
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ fontSize: isTablet ? 20 : 11, color: textMuted, background: "none", border: "none", cursor: "pointer", padding: isTablet ? "6px 8px" : "2px 4px", lineHeight: 1, minWidth: isTablet ? 44 : undefined, minHeight: isTablet ? 44 : undefined }}
          >✕</button>
        )}
      </div>

      {/* Filter input */}
      <input
        aria-label="Search eligible team members"
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Search…"
        style={{
          flexShrink: 0,
          background: inputBg, border: `1px solid ${inputBorder}`,
          borderRadius: isTablet ? 12 : 9,
          padding: isTablet ? "12px 14px" : "6px 10px",
          fontSize: isTablet ? 20 : 12,
          fontWeight: 500,
          color: textPrimary,
          minHeight: isTablet ? 52 : undefined,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          outline: "none", caretColor: accent,
        }}
      />

      {/* Mode indicator — makes the three rules visible on screen */}
      <div style={{
        fontSize: isTablet ? 15 : 9,
        fontWeight: 600,
        letterSpacing: "0.3px",
        color: filter.trim() || showAllEligible ? textMuted : accent,
        padding: isTablet ? "2px 4px" : "0 4px",
        flexShrink: 0,
        lineHeight: 1.35,
      }}>
        {filter.trim()
          ? "Search: all eligible TMs (broad pool)"
          : showAllEligible
            ? "Eligible on-call candidates"
          : fitByTmId && Object.keys(fitByTmId).length > 0
            ? "Sorted by rotation health (strongest first)"
            : "Default: Graves Default Schedule + on-call (unassigned)"}
      </div>

      {/* TM list — single scroll region; explicit max-height for Safari */}
      <div
        className={allowListScroll ? "sb-tm-picker-scroll" : "no-scrollbar"}
        style={{
          overflowY: allowListScroll ? "scroll" : "auto",
          flex: allowListScroll ? undefined : 1,
          flexShrink: allowListScroll ? undefined : undefined,
          minHeight: 0,
          maxHeight: listScrollMaxHeight ?? (allowListScroll ? 240 : undefined),
          display: "flex",
          flexDirection: "column",
          gap: 3,
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: allowListScroll ? "pan-y" : enableDragAssign ? "none" : "pan-y",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ fontSize: isTablet ? 17 : 11, color: textMuted, textAlign: "center", paddingTop: 12 }}>
            {filter.trim() ? "No eligible team member matches that search" : "Everyone scheduled is already placed"}
            {!filter.trim() && tms.length === 0 && allTms && allTms.length > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowAllEligible(true);
                }}
                className="sb-tablet-touch-target mx-auto mt-3 block rounded-xl border px-3 py-2 font-semibold"
                style={{ borderColor: inputBorder, color: accent, background: rowBg }}
              >
                Show eligible on-call candidates
              </button>
            )}
          </div>
        ) : filtered.map(tm => {
          const inDefaultList = scheduledIds.has(tm.tmId);
          const showOnCall =
            (filter.trim() || showAllEligible) && onAddOnCall && !inDefaultList;
          return (
            <div
              key={tm.tmId}
              style={{
                display: "flex", flexDirection: "column", gap: 4, flexShrink: 0,
              }}
            >
              <TmPickerRow
                tm={tm}
                enableDragAssign={enableDragAssign}
                allowListScroll={allowListScroll}
                isTablet={isTablet}
                accent={accent}
                rowBg={rowBg}
                rowBorder={rowBorder}
                textPrimary={textPrimary}
                rotationFit={!filter.trim() ? fitByTmId?.[tm.tmId] : undefined}
                onPick={onPick}
              />
              {showOnCall && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddOnCall(tm);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    fontSize: isTablet ? 16 : 10, fontWeight: 600, color: accent,
                    background: `${accent}14`, border: `1px dashed ${accent}55`,
                    borderRadius: isTablet ? 10 : 8,
                    padding: isTablet ? "8px 12px" : "4px 8px",
                    cursor: "pointer",
                    minHeight: isTablet ? 44 : undefined,
                    textAlign: "left",
                  }}
                >
                  Add on-call for tonight
                </button>
              )}

              {onMarkUnavailable && unavailableFor !== tm.tmId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUnavailableFor(tm.tmId);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    fontSize: isTablet ? 15 : 9, fontWeight: 600, color: "#b45309",
                    background: "rgba(245,158,11,0.08)", border: `1px dashed rgba(245,158,11,0.4)`,
                    borderRadius: isTablet ? 10 : 8,
                    padding: isTablet ? "6px 10px" : "3px 6px",
                    cursor: "pointer",
                    minHeight: isTablet ? 40 : undefined,
                    textAlign: "left",
                  }}
                >
                  Mark unavailable tonight
                </button>
              )}

              {onMarkUnavailable && unavailableFor === tm.tmId && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: isTablet ? 8 : 4, paddingLeft: isTablet ? 4 : 2 }}>
                  {unavailableReasons.map(r => (
                    <button
                      key={r.status}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onMarkUnavailable(tm, r.status);
                        setUnavailableFor(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        fontSize: isTablet ? 12 : 9, fontWeight: 600,
                        color: "#92400e",
                        background: "rgba(245,158,11,0.12)",
                        border: `1px solid rgba(245,158,11,0.3)`,
                        borderRadius: isTablet ? 8 : 6,
                        padding: isTablet ? "6px 10px" : "2px 6px",
                        cursor: "pointer",
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setUnavailableFor(null); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ fontSize: isTablet ? 12 : 9, color: textMuted, padding: "2px 4px" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

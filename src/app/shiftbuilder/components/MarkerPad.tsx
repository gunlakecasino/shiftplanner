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
import { MsIcon } from "./MsIcon";
import {
  ZONE_DEFS, RR_DEFS,
  ZONE_ICONS, RR_ICONS,
  getZoneColor, getRRAccent, getAuxAccent, getAuxIcon,
} from "@/lib/shiftbuilder/constants";
import {
  fitVerdictLabel,
  type PlacementFitVerdict,
} from "@/lib/shiftbuilder/placementPadInsightSchema";

function pickerFitChip(verdict: PlacementFitVerdict): { bg: string; text: string } {
  switch (verdict) {
    case "strong_fit":
      return { bg: "#E8F7EE", text: "#147A45" };
    case "acceptable":
      return { bg: "#EEF4FF", text: "#007AFF" };
    case "questionable":
      return { bg: "#F4F6FA", text: "#64748B" };
    case "critical_repeat":
    case "poor_fit":
    case "needs_swap":
      return { bg: "#FFF5F5", text: "#B91C1C" };
    default:
      return { bg: "#F4F6FA", text: "#64748B" };
  }
}
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
  rotationFit,
  onPick,
}: {
  tm: TmEntry;
  enableDragAssign: boolean;
  allowListScroll?: boolean;
  rotationFit?: PickerTmRotationFit;
  onPick: (tm: TmEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tm:${tm.tmId}`,
    data: { type: "tm", tmId: tm.tmId, tmName: tm.tmName },
    disabled: !enableDragAssign,
  });
  const initial = tm.tmName.charAt(0).toUpperCase();
  const fitChip = rotationFit
    ? pickerFitChip(rotationFit.fitVerdict as PlacementFitVerdict)
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
      className="sb-list-row sb-interactive sb-tm-picker-row"
      style={{
        opacity: isDragging ? 0.45 : 1,
        cursor: enableDragAssign ? "grab" : "pointer",
        touchAction: allowListScroll ? "pan-y" : enableDragAssign ? "none" : "manipulation",
      }}
    >
      <span className="sb-tm-picker-avatar">{initial}</span>
      <span className="sb-tm-picker-name">{tm.tmName}</span>
      {rotationFit && fitChip && (
        <span
          className="sb-tm-picker-score"
          title={[
            `${fitVerdictLabel(rotationFit.fitVerdict as PlacementFitVerdict)} · ${rotationFit.healthPoints.toFixed(1)}pt`,
            rotationFit.fitFactLine,
            rotationFit.fitSummary,
          ].filter(Boolean).join("\n")}
          style={{ background: fitChip.bg, color: fitChip.text }}
        >
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

  const textPrimary = isDark ? "rgba(255,255,255,0.85)" : "#111827";

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
        <MsIcon name="check_circle" size={28} fill={1} style={{ color: accent }} />
        <span style={{ fontSize: isTablet ? 18 : 11, fontWeight: 700, color: textPrimary }}>Assigned</span>
      </div>
    );
  }

  return (
    <div className="sb-tm-picker" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 8 }}>
      <div className="sb-tm-picker-heading">
        <span className="sb-tm-picker-title">
          {currentTmName ? `Replace ${currentTmName}…` : "Assign TM"}
          <span className="sb-tm-picker-meta">
            {filter.trim() ? "all eligible" : "scheduled + eligible"}
          </span>
        </span>
        {onCancel && (
          <button
            type="button"
            className="sb-tm-picker-cancel"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            onPointerDown={(e) => e.stopPropagation()}
          >✕</button>
        )}
      </div>

      <input
        aria-label="Search eligible team members"
        type="text"
        className="sb-tm-picker-search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        placeholder="Search…"
      />

      <div className="sb-tm-picker-sort">
        {filter.trim()
          ? "Search: all eligible TMs (broad pool)"
          : showAllEligible
            ? "Eligible on-call candidates"
          : fitByTmId && Object.keys(fitByTmId).length > 0
            ? "Sorted by rotation health (strongest first)"
            : "Default: Graves Default Schedule + on-call (unassigned)"}
      </div>

      <div
        className={allowListScroll ? "sb-tm-picker-scroll" : "no-scrollbar"}
        style={{
          overflowY: allowListScroll ? "scroll" : "auto",
          flex: 1,
          minHeight: 0,
          maxHeight: listScrollMaxHeight,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: allowListScroll ? "pan-y" : enableDragAssign ? "none" : "pan-y",
        }}
      >
        {filtered.length === 0 ? (
          <div className="sb-tm-picker-empty">
            {filter.trim() ? "No eligible team member matches that search" : "Everyone scheduled is already placed"}
            {!filter.trim() && tms.length === 0 && allTms && allTms.length > 0 && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowAllEligible(true);
                }}
                className="sb-tm-picker-link"
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
            <div key={tm.tmId} className="sb-tm-picker-item">
              <TmPickerRow
                tm={tm}
                enableDragAssign={enableDragAssign}
                allowListScroll={allowListScroll}
                rotationFit={!filter.trim() ? fitByTmId?.[tm.tmId] : undefined}
                onPick={onPick}
              />
              {onMarkUnavailable && unavailableFor !== tm.tmId && (
                <button
                  type="button"
                  className="sb-tm-picker-unavail"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUnavailableFor(tm.tmId);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  Off
                </button>
              )}
              {showOnCall && (
                <button
                  type="button"
                  className="sb-tm-picker-link sb-tm-picker-item-extra"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddOnCall(tm);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  Add on-call for tonight
                </button>
              )}

              {onMarkUnavailable && unavailableFor === tm.tmId && (
                <div className="sb-tm-picker-reasons">
                  {unavailableReasons.map(r => (
                    <button
                      key={r.status}
                      type="button"
                      className="sb-tm-picker-reason"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onMarkUnavailable(tm, r.status);
                        setUnavailableFor(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="sb-tm-picker-link"
                    onClick={(e) => { e.stopPropagation(); setUnavailableFor(null); }}
                    onPointerDown={(e) => e.stopPropagation()}
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

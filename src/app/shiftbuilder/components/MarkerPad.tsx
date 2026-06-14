"use client";

/**
 * MarkerPad — Velvet floating right-side panel
 *
 * Appears when an operator taps a card on the artboard.
 * Shows:
 *   • Slot identity (icon + label + location + assigned TM avatar)
 *   • Break wave selector (Off / 1 / 2 / 3 grid)
 *   • Current tasks with accent pip + × remove
 *   • Quick task composer input
 *   • Recent-task gold chips for one-tap recall
 *   • Footer actions: Lock, Coverage, Swap, Clear
 *   • Inline coverage picker (activates in-place, no command palette needed)
 *
 * All layout values match the Velvet spec (sb-velvet.jsx).
 * Uses --sb-* CSS tokens so light/dark mode is automatic.
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { normalizeGender } from "@/lib/shiftbuilder/placement";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { BreakGroup } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import {
  ZONE_DEFS, RR_DEFS, BLANK_AUX_DEFS,
  ZONE_ICONS, RR_ICONS, AUX_ICONS,
  getZoneColor, getRRAccent, getAuxAccent, getAuxIcon,
  nextBreakGroup,
} from "@/lib/shiftbuilder/constants";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";
import { useAssignments } from "../store/useShiftBuilderStore";
import { BuilderLoadingLine } from "./builderPrimitives";

export interface TmEntry {
  tmId: string;
  tmName: string;
}

export interface MarkerPadProps {
  slotKey: string | null;
  assignments: Record<string, any>;
  selectedTasks: Record<string, NightSlotTask[]>;
  recentTasks: string[];
  auxDefs?: AuxDef[];                  // operator-added aux slots
  scheduledUnassigned?: TmEntry[];     // TMs scheduled tonight but not yet placed
  allEligibleTms?: TmEntry[];          // Full roster (minus placed) — used for search
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onAddTask: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  /** New: Quick sweeper assignment with forced orange color + duplication guard */
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onToggleLock?: (slotKey: string) => void;
  onClearSlot?: (slotKey: string) => void;
  onAssign?: (slotKey: string, tmId: string, tmName: string) => void;
  onAddCoverage?: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  onClose: () => void;
  isDark?: boolean;
  tmGender?: string | null;    // "M" | "F" | null — passed through normalizeGender for gender-aware RR filtering in history (Last 14 / Last 5 etc)
}

// ── Slot metadata lookup ─────────────────────────────────────────────────────

export function getSlotMeta(
  slotKey: string,
  auxDefs: import("@/lib/shiftbuilder/placement").AuxDef[] = [],
): { label: string; loc: string; icon: string; accent: string } {
  const zd = ZONE_DEFS.find(z => z.key === slotKey);
  if (zd) return {
    label: zd.label,
    loc: zd.locations[0] ?? "",
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
      loc: (side === "Men's" ? rd?.mensLoc : rd?.womensLoc) ?? "",
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

// Canonical key for RR slots in the picker — always MRR side so expandCoverageToKeys
// adds the task to both M and W in the handler.
function rrPickerKey(num: number) { return `MRR${num}`; }

// ── BreakWave ─────────────────────────────────────────────────────────────────

const BreakWave: React.FC<{
  current: BreakGroup;
  accent: string;
  onChange: (g: BreakGroup) => void;
}> = ({ current, accent, onChange }) => {
  const opts: { v: BreakGroup; l: string; sub: string }[] = [
    { v: 0, l: "Off", sub: "no break" },
    { v: 1, l: "1",   sub: "12:00a"   },
    { v: 2, l: "2",   sub: "1:30a"    },
    { v: 3, l: "3",   sub: "3:00a"    },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-bold tracking-[1.2px] uppercase" style={{ color: "var(--sb-text-muted, #6C6C72)" }}>
          Break Wave
        </span>
        {current > 0 && (
          <span className="text-[9.5px] font-semibold" style={{ color: "var(--sb-gold-bright, #E9B948)", fontFamily: "var(--font-jetbrains, monospace)" }}>
            Group {current}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {opts.map(o => {
          const active = o.v === current;
          return (
            <button
              key={o.v}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(o.v); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex flex-col items-center py-2 rounded-xl"
              style={{
                background: active
                  ? `linear-gradient(180deg, ${accent}cc, ${accent}88)`
                  : "var(--sb-glass)",
                border: active ? `1px solid ${accent}` : "1px solid var(--sb-glass-border)",
                boxShadow: active 
                  ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px ${accent}88` 
                  : "none",
                color: active ? "#fff" : "var(--sb-text-muted, #9CA3AF)",
                transition: "all 0.22s var(--sb-spring-premium-snappy)",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.07)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                  e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--sb-glass)";
                  e.currentTarget.style.borderColor = "var(--sb-glass-border)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              <span
                className="font-black leading-none"
                style={{
                  fontSize: o.l === "Off" ? 12 : 17,
                  fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                  letterSpacing: "-0.4px",
                }}
              >
                {o.l}
              </span>
              <span
                className="mt-0.5"
                style={{
                  fontSize: 7.5,
                  color: active ? "rgba(255,255,255,0.85)" : "var(--sb-text-muted, #6C6C72)",
                  fontFamily: "var(--font-jetbrains, monospace)",
                  letterSpacing: "0.2px",
                }}
              >
                {o.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── CoveragePicker ────────────────────────────────────────────────────────────

export const CoveragePicker: React.FC<{
  currentSlotKey: string;
  auxDefs: AuxDef[];
  onPick: (targetKey: string) => void;
  onCancel: () => void;
  confirmed: boolean;
  isDark: boolean;
}> = ({ currentSlotKey, auxDefs, onPick, onCancel, confirmed, isDark }) => {
  const sectionLabel: React.CSSProperties = {
    fontSize: 7.5, fontWeight: 700, letterSpacing: "1.4px",
    textTransform: "uppercase",
    color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.35)",
    fontFamily: "var(--font-atkinson)",
    marginBottom: 4, display: "block",
  };

  const chipBase: React.CSSProperties = {
    borderRadius: 8, border: "1px solid",
    fontSize: 9, fontWeight: 700, letterSpacing: "0.4px",
    fontFamily: "var(--font-atkinson)",
    cursor: "pointer", transition: "all 0.12s",
    padding: "5px 0", textAlign: "center",
    lineHeight: 1,
  };

  const textPrimary = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)";
  const textMuted   = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.35)";

  if (confirmed) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span style={{ fontSize: 28 }}>✓</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: textPrimary }}>
          Coverage added
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px", color: textPrimary }}>
          Add coverage to…
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            fontSize: 11, color: textMuted, background: "none",
            border: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Scrollable slot grid */}
      <div className="no-scrollbar" style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ZONES */}
        <div>
          <span style={sectionLabel}>Zones</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {ZONE_DEFS.map(z => {
              const color = getZoneColor(z.key);
              const isSelf = z.key === currentSlotKey;
              return (
                <button
                  key={z.key}
                  type="button"
                  disabled={isSelf}
                  onClick={(e) => { e.stopPropagation(); if (!isSelf) onPick(z.key); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    ...chipBase,
                    borderColor: isSelf ? "rgba(255,255,255,0.08)" : `${color}88`,
                    color: isSelf ? "rgba(255,255,255,0.20)" : color,
                    background: isSelf ? "rgba(255,255,255,0.02)" : `${color}15`,
                    cursor: isSelf ? "default" : "pointer",
                  }}
                  onMouseEnter={e => {
                    if (!isSelf) {
                      (e.currentTarget as HTMLElement).style.background = `${color}35`;
                      (e.currentTarget as HTMLElement).style.borderColor = color;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelf) {
                      (e.currentTarget as HTMLElement).style.background = `${color}15`;
                      (e.currentTarget as HTMLElement).style.borderColor = `${color}88`;
                    }
                  }}
                >
                  {z.key.replace("Z", "")}
                </button>
              );
            })}
          </div>
        </div>

        {/* RESTROOMS */}
        <div>
          <span style={sectionLabel}>Restrooms</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {RR_DEFS.map(rr => {
              const color = getRRAccent(rr.num);
              const targetKey = rrPickerKey(rr.num);
              // Consider self if current slot is either side of this RR
              const isSelf = currentSlotKey === `MRR${rr.num}` || currentSlotKey === `WRR${rr.num}`;
              return (
                <button
                  key={rr.num}
                  type="button"
                  disabled={isSelf}
                  onClick={(e) => { e.stopPropagation(); if (!isSelf) onPick(targetKey); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    ...chipBase,
                    borderColor: isSelf ? "rgba(255,255,255,0.08)" : `${color}88`,
                    color: isSelf ? "rgba(255,255,255,0.20)" : color,
                    background: isSelf ? "rgba(255,255,255,0.02)" : `${color}15`,
                    cursor: isSelf ? "default" : "pointer",
                    fontSize: 8,
                  }}
                  onMouseEnter={e => {
                    if (!isSelf) {
                      (e.currentTarget as HTMLElement).style.background = `${color}35`;
                      (e.currentTarget as HTMLElement).style.borderColor = color;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelf) {
                      (e.currentTarget as HTMLElement).style.background = `${color}15`;
                      (e.currentTarget as HTMLElement).style.borderColor = `${color}88`;
                    }
                  }}
                >
                  {rr.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* SUPPORT / AUX */}
        {auxDefs.length > 0 && (
          <div>
            <span style={sectionLabel}>Support</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {auxDefs.map(aux => {
                const color = getAuxAccent(aux.key);
                const isSelf = aux.key === currentSlotKey;
                // Light-mode aware neutrals for aux chips (no per-slot accent colour)
                const auxBg        = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
                const auxBorder    = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)";
                const auxColor     = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.65)";
                const auxBgSelf    = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)";
                const auxBorderSelf= isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
                const auxColorSelf = isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.20)";
                const auxBgHover   = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";
                const auxColorHover= isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.80)";
                return (
                  <button
                    key={aux.key}
                    type="button"
                    disabled={isSelf}
                    onClick={(e) => { e.stopPropagation(); if (!isSelf) onPick(aux.key); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      ...chipBase,
                      borderColor: isSelf ? auxBorderSelf : auxBorder,
                      color: isSelf ? auxColorSelf : auxColor,
                      background: isSelf ? auxBgSelf : auxBg,
                      cursor: isSelf ? "default" : "pointer",
                      fontSize: 8,
                    }}
                    onMouseEnter={e => {
                      if (!isSelf) {
                        (e.currentTarget as HTMLElement).style.background = auxBgHover;
                        (e.currentTarget as HTMLElement).style.color = auxColorHover;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelf) {
                        (e.currentTarget as HTMLElement).style.background = auxBg;
                        (e.currentTarget as HTMLElement).style.color = auxColor;
                      }
                    }}
                  >
                    {aux.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Recency helpers ───────────────────────────────────────────────────────────

function recencyColor(daysAgo: number): string {
  if (daysAgo <= 7)  return "#34C759";
  if (daysAgo <= 14) return "#FFD60A";
  if (daysAgo <= 30) return "#FF9F0A";
  return "#FF3B30";
}

function daysAgoFrom(isoDate: string): number {
  return Math.floor(
    (Date.now() - new Date(isoDate + "T12:00:00").getTime()) / 86_400_000
  );
}

function fmtShortDate(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

// ── MiniHistorySection ────────────────────────────────────────────────────────

/** Filter out slots irrelevant to this TM's gender (opposite RR side). Uses the single source of truth normalizeGender. */
function genderFilter(uiKey: string, gender: string | null | undefined): boolean {
  const g = normalizeGender(gender);
  if (!g) return true;
  if (/^WRR/.test(uiKey) && g === 'M') return false;
  if (/^MRR/.test(uiKey) && g === 'F') return false;
  return true;
}

const MiniHistorySection: React.FC<{
  history: ZoneDetailEntry | null;
  loading: boolean;
  isDark: boolean;
  tmGender?: string | null;
  onViewAll: () => void;
}> = ({ history, loading, isDark, tmGender, onViewAll }) => {
  const textPrimary = isDark ? "var(--sb-text-1, #F2F2F4)" : "var(--sb-text-1, #111111)";
  const textMuted   = isDark ? "var(--sb-text-muted, #8E8E93)" : "var(--sb-text-muted, #6C6C72)";
  const divBorder   = "var(--sb-glass-border)";

  const wrapStyle: React.CSSProperties = {
    borderTop: `1px solid ${divBorder}`,
    paddingTop: 8,
    display: "flex", flexDirection: "column", gap: 4,
  };

  if (loading) {
    return (
      <div style={wrapStyle}>
        <BuilderLoadingLine className="!mt-0 text-[9.5px] font-mono">Loading history</BuilderLoadingLine>
      </div>
    );
  }

  if (!history || history.totalAssignments === 0) return null;

  // Gender-aware sorted list — exclude opposite-gender RR sides
  const eligible = Object.entries(history.zoneCounts)
    .filter(([uiKey]) => genderFilter(uiKey, tmGender))
    .sort(([, a], [, b]) => b - a);

  if (eligible.length === 0) return null;

  const TAKE = 4;
  const top = eligible.slice(0, TAKE);
  // Bottom-4: last N entries reversed so least-frequent is first
  const bot = eligible.length > TAKE
    ? eligible.slice(-Math.min(TAKE, Math.floor(eligible.length / 2) || 1)).reverse()
    : [];

  const SlotRow = ({ uiKey, count, accent: _accent }: { uiKey: string; count: number; accent?: string }) => {
    const { accent } = getSlotMeta(uiKey);
    const dates = history.zoneDates[uiKey] ?? [];
    const last  = dates[0];
    const ago   = last ? daysAgoFrom(last) : null;

    return (
      <div 
        style={{ 
          display: "flex", alignItems: "center", gap: 6, 
          padding: "1px 0",
          borderRadius: 6,
          transition: "background 0.12s var(--sb-spring-snappy, cubic-bezier(0.16,1,0.3,1))",
        }}
        onMouseEnter={(e) => { 
          e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"; 
          e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
        }}
        onMouseLeave={(e) => { 
          e.currentTarget.style.background = "transparent"; 
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <span style={{
          fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
          background: `${accent}22`, border: `1px solid ${accent}50`, color: accent,
          fontFamily: "var(--font-atkinson)", letterSpacing: "0.2px", flexShrink: 0,
        }}>{uiKey}</span>

        <span style={{
          fontSize: 10.5, fontWeight: 600, color: textPrimary, flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
        }}>{slotKeyToLabel(uiKey)}</span>

        <span style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
          fontSize: 9, color: textMuted,
          fontFamily: "var(--font-jetbrains, monospace)",
        }}>
          <span>{count}×</span>
          {ago !== null && (
            <span style={{ 
              color: recencyColor(ago), 
              fontWeight: 600,
              padding: "0 3px",
              borderRadius: 3,
              background: `${recencyColor(ago)}15`,
            }}>{ago}d</span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div style={wrapStyle}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "1.1px",
          textTransform: "uppercase", color: textMuted,
          fontFamily: "var(--font-atkinson)",
        }}>30d History</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onViewAll(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            fontSize: 9, fontWeight: 600, letterSpacing: "0.2px",
            color: "var(--sb-gold-bright, #E9B948)",
            background: "none", border: "none", cursor: "pointer",
            padding: "2px 6px",
            borderRadius: 6,
            fontFamily: "var(--font-atkinson)",
            transition: "all 0.18s var(--sb-spring-premium-snappy)",
          }}
          onMouseEnter={(e) => { 
            e.currentTarget.style.background = "rgba(184,151,8,0.14)"; 
            e.currentTarget.style.color = "#E9B948"; 
            e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
            e.currentTarget.style.transform = "translateY(-0.5px)";
          }}
          onMouseLeave={(e) => { 
            e.currentTarget.style.background = "none"; 
            e.currentTarget.style.color = "var(--sb-gold-bright, #E9B948)"; 
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "";
          }}
        >View All →</button>
      </div>

      {/* Most frequent — up to 4 */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
        <span style={{ fontSize: 8, color: "#34C759", fontFamily: "var(--font-jetbrains, monospace)", flexShrink: 0 }}>▲ most</span>
      </div>
      {top.map(([uiKey, count]) => (
        <SlotRow key={uiKey} uiKey={uiKey} count={count} />
      ))}

      {/* Least frequent — only show if we have enough data */}
      {bot.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, marginBottom: 1 }}>
            <span style={{ fontSize: 8, color: "#FF9F0A", fontFamily: "var(--font-jetbrains, monospace)", flexShrink: 0 }}>▼ least</span>
          </div>
          {bot.map(([uiKey, count]) => (
            <SlotRow key={uiKey} uiKey={uiKey} count={count} />
          ))}
        </>
      )}
    </div>
  );
};

// ── HistoryOverlay ────────────────────────────────────────────────────────────

const HistoryOverlay: React.FC<{
  history: ZoneDetailEntry;
  isDark: boolean;
  onClose: () => void;
}> = ({ history, isDark, onClose }) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const textPrimary = isDark ? "var(--sb-text-1, #F2F2F4)" : "var(--sb-text-1, #111111)";
  const textMuted   = isDark ? "var(--sb-text-muted, #8E8E93)" : "var(--sb-text-muted, #6C6C72)";
  const panelBg     = "var(--sb-glass)";
  const rowBgBase   = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
  const rowBorderBase = "var(--sb-glass-border)";

  const sorted = Object.entries(history.zoneCounts)
    .sort(([, a], [, b]) => b - a);

  return (
    <div
      className="sb-marker-enter"
      style={{
        position: "absolute", inset: 0, borderRadius: 20, zIndex: 20,
        background: panelBg,
        backdropFilter: "var(--sb-glass-blur)",
        WebkitBackdropFilter: "var(--sb-glass-blur)",
        display: "flex", flexDirection: "column",
        padding: "14px 14px 10px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid var(--sb-glass-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: textMuted, cursor: "pointer", flexShrink: 0, fontSize: 15, lineHeight: 1,
            transition: "all 0.22s var(--sb-spring-premium-snappy)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "var(--sb-glass-border)"; }}
          aria-label="Back"
        >←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 800, letterSpacing: "-0.2px", color: textPrimary,
            fontFamily: "var(--font-bricolage, var(--font-atkinson))",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{history.tmName}</div>
          <div style={{
            fontSize: 9, color: textMuted,
            fontFamily: "var(--font-jetbrains, monospace)",
          }}>
            {history.totalAssignments} placements · {history.totalNights} nights · 30d
          </div>
        </div>
      </div>

      {/* Slot list */}
      <div
        className="no-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}
      >
        {sorted.map(([uiKey, count]) => {
          const { accent } = getSlotMeta(uiKey);
          const dates = history.zoneDates[uiKey] ?? [];
          const last  = dates[0];
          const ago   = last ? daysAgoFrom(last) : null;
          const isExpanded = expandedKey === uiKey;

          return (
            <div key={uiKey}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpandedKey(isExpanded ? null : uiKey); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 8px", borderRadius: 10, textAlign: "left",
                  background: isExpanded
                    ? (isDark ? `${accent}18` : `${accent}12`)
                    : rowBgBase,
                  border: `1px solid ${isExpanded ? accent + "44" : rowBorderBase}`,
                  cursor: "pointer", 
                  transition: "all 0.22s var(--sb-spring-premium-snappy)",
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded) {
                    e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
                    e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded) {
                    e.currentTarget.style.background = rowBgBase;
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                {/* Short key badge */}
                <span style={{
                  fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
                  background: `${accent}22`, border: `1px solid ${accent}44`, color: accent,
                  fontFamily: "var(--font-atkinson)", letterSpacing: "0.2px", flexShrink: 0,
                }}>{uiKey}</span>

                {/* Full label */}
                <span style={{
                  flex: 1, fontSize: 10.5, fontWeight: 600, color: textPrimary,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                }}>{slotKeyToLabel(uiKey)}</span>

                {/* Count */}
                <span style={{
                  fontSize: 9, fontWeight: 700, color: accent, flexShrink: 0,
                  fontFamily: "var(--font-jetbrains, monospace)",
                }}>{count}×</span>

                {/* Recency */}
                {ago !== null && (
                  <span style={{
                    fontSize: 8.5, flexShrink: 0,
                    color: recencyColor(ago),
                    fontFamily: "var(--font-jetbrains, monospace)",
                  }}>{ago}d</span>
                )}

                {/* Chevron */}
                <span style={{ fontSize: 8, color: textMuted, flexShrink: 0 }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded date chips */}
              {isExpanded && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 3,
                  padding: "5px 8px 6px",
                  borderLeft: `2px solid ${accent}44`,
                  marginLeft: 8, marginTop: 2, marginBottom: 2,
                }}>
                  {dates.map((d, i) => {
                    const chipAgo = daysAgoFrom(d);
                    const chipColor = recencyColor(chipAgo);
                    return (
                      <span key={i} style={{
                        fontSize: 8.5, padding: "2px 6px", borderRadius: 4,
                        background: `${chipColor}18`, border: `1px solid ${chipColor}44`,
                        color: chipColor, fontFamily: "var(--font-jetbrains, monospace)",
                      }}>{fmtShortDate(d)}</span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

function TmPickerRow({
  tm,
  enableDragAssign,
  isTablet,
  accent,
  rowBg,
  rowBorder,
  textPrimary,
  onPick,
}: {
  tm: TmEntry;
  enableDragAssign: boolean;
  isTablet: boolean;
  accent: string;
  rowBg: string;
  rowBorder: string;
  textPrimary: string;
  onPick: (tm: TmEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tm:${tm.tmId}`,
    data: { type: "tm", tmId: tm.tmId, tmName: tm.tmName },
    disabled: !enableDragAssign,
  });
  const initial = tm.tmName.charAt(0).toUpperCase();

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...(enableDragAssign ? { ...listeners, ...attributes } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onPick(tm);
      }}
      onPointerDown={(e) => e.stopPropagation()}
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
        touchAction: enableDragAssign ? "none" : undefined,
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
          fontSize: isTablet ? 20 : 12.5,
          fontWeight: 600,
          color: textPrimary,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          letterSpacing: "-0.15px",
        }}
      >
        {tm.tmName}
      </span>
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
}) => {
  const isTablet = variant === "tablet";
  const [filter, setFilter] = useState("");
  const [unavailableFor, setUnavailableFor] = useState<string | null>(null);

  // Rule:
  // 1. Default list (no text in box) = scheduled + eligible + unassigned only (tms prop)
  // 2. When typing → switch to all eligible (allTms prop) for search
  // 3. The default list must *never* contain anyone who is not scheduled tonight for the correct role group.
  const searchPool = filter.trim() && allTms ? allTms : tms;
  const scheduledIds = new Set(tms.map((t) => t.tmId));
  const filtered = filter.trim()
    ? searchPool.filter(t => t.tmName.toLowerCase().includes(filter.toLowerCase()))
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
        color: filter.trim() ? textMuted : accent,
        padding: isTablet ? "2px 4px" : "0 4px",
        flexShrink: 0,
        lineHeight: 1.35,
      }}>
        {filter.trim()
          ? "Search: all eligible TMs (broad pool)"
          : "Default: Graves Default Schedule + on-call (unassigned)"}
      </div>

      {/* TM list */}
      <div className="no-scrollbar" style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: isTablet ? 17 : 11, color: textMuted, textAlign: "center", paddingTop: 12 }}>
            {filter.trim() ? "No match" : tms.length === 0 ? "All TMs placed" : "No match"}
          </div>
        ) : filtered.map(tm => {
          const inDefaultList = scheduledIds.has(tm.tmId);
          const showOnCall =
            filter.trim() && onAddOnCall && !inDefaultList;
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
                isTablet={isTablet}
                accent={accent}
                rowBg={rowBg}
                rowBorder={rowBorder}
                textPrimary={textPrimary}
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

// ── Main component ────────────────────────────────────────────────────────────

const MarkerPad: React.FC<MarkerPadProps> = ({
  slotKey,
  assignments: assignmentsProp,
  selectedTasks,
  recentTasks,
  auxDefs = BLANK_AUX_DEFS,
  scheduledUnassigned = [],
  allEligibleTms,
  setBreakGroupForSlot,
  onAddTask,
  onRemoveTask,
  onToggleLock,
  onClearSlot,
  onAssign,
  onAddCoverage,
  onAssignSweeper,
  onClose,
  isDark,
  tmGender,
}) => {
  // MarkerPad reads live assignments directly (Zustand) so the occupant + picker
  // always reflect what is painted on the board, even if parent props are slightly behind.
  const storeAssignments = useAssignments();
  const assignments = (storeAssignments && Object.keys(storeAssignments).length > 0)
    ? storeAssignments
    : (assignmentsProp ?? {});
  const [taskInput, setTaskInput] = useState("");
  const [coverageMode, setCoverageMode] = useState(false);
  const [coverageConfirmed, setCoverageConfirmed] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [assignConfirmed, setAssignConfirmed] = useState(false);
  const [sweeperMenuOpen, setSweeperMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close sweeper menu when clicking outside the panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setSweeperMenuOpen(false);
      }
    };
    if (sweeperMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sweeperMenuOpen]);

  // TM history widget — derive tmId before hooks so it can be a dependency
  const currentTmId: string | null = slotKey ? (assignments[slotKey]?.tmId ?? null) : null;
  const [tmHistory, setTmHistory] = useState<ZoneDetailEntry | null>(null);
  const [tmHistoryLoading, setTmHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!currentTmId) {
      setTmHistory(null);
      setTmHistoryLoading(false);
      setHistoryOpen(false);
      return;
    }
    setTmHistoryLoading(true);
    setHistoryOpen(false);
    import("@/lib/shiftbuilder/data")
      .then(({ getTmPlacementHistory }) =>
        getTmPlacementHistory(currentTmId, 30)
          .then(h => { setTmHistory(h); setTmHistoryLoading(false); })
          .catch(() => { setTmHistory(null); setTmHistoryLoading(false); })
      );
  }, [currentTmId]);

  // Reset all local state when the slot changes
  useEffect(() => {
    setTaskInput("");
    setCoverageMode(false);
    setCoverageConfirmed(false);
    setAssignMode(false);
    setAssignConfirmed(false);
    setHistoryOpen(false);
    if (slotKey) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [slotKey]);

  // Tap-to-dismiss: close when clicking anywhere outside the panel
  useEffect(() => {
    if (!slotKey) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use capture phase so card clicks still open the correct slot via their own handler
    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => document.removeEventListener("mousedown", handleOutsideClick, true);
  }, [slotKey, onClose]);

  const handlePickTm = useCallback((tm: TmEntry) => {
    if (!slotKey || !onAssign) return;
    onAssign(slotKey, tm.tmId, tm.tmName);
    setAssignConfirmed(true);
    setTimeout(() => {
      setAssignMode(false);
      setAssignConfirmed(false);
      onClose();
    }, 700);
  }, [slotKey, onAssign, onClose]);

  const handlePickCoverage = useCallback(async (targetKey: string) => {
    if (!slotKey || !onAddCoverage) return;
    try {
      await onAddCoverage(slotKey, targetKey);
    } finally {
      setCoverageConfirmed(true);
      setTimeout(() => {
        setCoverageMode(false);
        setCoverageConfirmed(false);
      }, 900);
    }
  }, [slotKey, onAddCoverage]);

  if (!slotKey) return null;

  const { label, loc, icon, accent } = getSlotMeta(slotKey, auxDefs);
  const a = assignments[slotKey] || {};
  const tasks = (selectedTasks[slotKey] || []).filter(t => !t.isCoverage);
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;

  const tmInitials = a.tmName
    ? a.tmName.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()
    : null;

  const handleAddTask = () => {
    const lbl = taskInput.trim();
    if (!lbl) return;
    setTaskInput("");
    void onAddTask(slotKey, lbl);
  };

  const handleAssignSweeper = (sweeperLabel: string) => {
    if (!onAssignSweeper) return;
    void onAssignSweeper(slotKey, sweeperLabel);
    setSweeperMenuOpen(false);
  };

  // Show TM picker when slot is empty OR when operator tapped Swap
  const showTmPicker = onAssign && (!a.tmId || assignMode);

  // The lists arriving here are already final:
  // - scheduledUnassigned = scheduled (correct role group) + eligible for slot + unassigned
  // - allEligibleTms     = any eligible for slot (used only when the operator types in search)
  // Default view in TmPicker uses the first; typing switches to the second.

  const isDarkPanel = isDark !== false;
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 68,
    right: 12,
    width: 284,
    bottom: 58,
    borderRadius: 20,
    background: "var(--sb-glass)",
    backdropFilter: "var(--sb-glass-blur)",
    WebkitBackdropFilter: "var(--sb-glass-blur)",
    border: "1px solid var(--sb-glass-border)",
    boxShadow: isDarkPanel
      ? `inset 0 1px 0 var(--sb-glass-highlight), inset 0 -1px 0 rgba(255,255,255,0.04), 0 24px 48px -16px rgba(0,0,0,0.55), 0 0 0 1px ${accent}1a`
      : `inset 0 1px 0 var(--sb-glass-highlight), 0 24px 48px -16px rgba(0,0,0,0.12), 0 0 0 1px ${accent}18`,
    display: "flex",
    flexDirection: "column",
    gap: coverageMode ? 8 : 10,
    padding: "14px 14px 10px",
    zIndex: 35,
    overflow: "hidden",
  };

  return (
    <div ref={panelRef} className="sb-marker-enter" style={panelStyle} onClick={(e) => e.stopPropagation()}>

      {/* Accent rail */}
      <div style={{
        position: "absolute", top: 18, left: -1, width: 3, height: 52,
        borderRadius: "0 3px 3px 0",
        background: accent,
        boxShadow: `0 0 16px ${accent}88`,
      }} />

      {/* Close button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute", top: 10, right: 10,
          width: 26, height: 26, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--sb-text-muted, #9CA3AF)",
          cursor: "pointer",
          fontSize: 14, lineHeight: 1,
          transition: "all 0.22s var(--sb-spring-premium-snappy)",
        }}
        aria-label="Close marker pad"
        onMouseEnter={(e) => { 
          e.currentTarget.style.background = "var(--sb-glass)"; 
          e.currentTarget.style.borderColor = "var(--sb-glass-border)"; 
          e.currentTarget.style.boxShadow = "0 0 0 1px var(--sb-glass-highlight)";
        }}
        onMouseLeave={(e) => { 
          e.currentTarget.style.background = "rgba(255,255,255,0.05)"; 
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; 
          e.currentTarget.style.boxShadow = "none";
        }}
      >×</button>

      {/* ── Slot identity ──────────────────────────────────────────────── */}
      <div style={{ paddingRight: 28, display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        <span style={{ fontSize: 18, color: accent, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "1.15px",
            color: accent, textTransform: "uppercase",
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          }}>{label}</div>
          <div style={{
            fontSize: 9, marginTop: 0.5,
            color: "var(--sb-text-muted, #8E8E93)",
            fontFamily: "var(--font-jetbrains, monospace)",
            letterSpacing: "0.25px",
            opacity: 0.75,
          }}>Marker Pad</div>
        </div>
      </div>

      {/* ── Assigned TM ────────────────────────────────────────────────── */}
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "8px 10px",
        display: "flex", alignItems: "center", gap: 8,
        flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: tmInitials
            ? `linear-gradient(135deg, ${accent}, ${accent}88)`
            : "rgba(255,255,255,0.08)",
          color: "#fff",
          fontSize: tmInitials ? 11 : 16,
          fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          letterSpacing: "-0.3px",
          boxShadow: tmInitials ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "none",
          flexShrink: 0,
        }}>
          {tmInitials ?? "–"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, letterSpacing: "-0.2px",
            color: "var(--sb-text-1, #F2F2F4)",
            fontFamily: "var(--font-bricolage, var(--font-atkinson))",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {a.tmName ?? "— Unassigned —"}
          </div>
          {a.tmId && (
            <div style={{
              fontSize: 9.5, marginTop: 1,
              color: "var(--sb-text-muted, #8E8E93)",
              fontFamily: "var(--font-jetbrains, monospace)",
            }}>
              {a.hours ?? "11p–7a"} · {a.pool ?? "Full"}
            </div>
          )}
        </div>
        {a.isLocked && (
          <span className="ms" style={{ fontSize: 14, color: '#FF9F0A', flexShrink: 0, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
        )}
      </div>

      {/* ── Break wave (hidden when any picker is active) ───────────────── */}
      {!coverageMode && !showTmPicker && (
        <BreakWave
          current={currentBreak}
          accent={accent}
          onChange={(g) => setBreakGroupForSlot(slotKey, g)}
        />
      )}

      {/* ── Body: TM picker, Coverage picker, or Tasks section ──────────── */}
      {showTmPicker ? (
        <TmPicker
          tms={scheduledUnassigned}
          allTms={allEligibleTms}
          currentTmName={a.tmId ? a.tmName : undefined}
          onPick={handlePickTm}
          onCancel={a.tmId ? () => { setAssignMode(false); setAssignConfirmed(false); } : undefined}
          confirmed={assignConfirmed}
          accent={accent}
          isDark={isDarkPanel}
        />
      ) : coverageMode ? (
        <CoveragePicker
          currentSlotKey={slotKey}
          auxDefs={auxDefs}
          onPick={handlePickCoverage}
          onCancel={() => { setCoverageMode(false); setCoverageConfirmed(false); }}
          confirmed={coverageConfirmed}
          isDark={isDarkPanel}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase",
              color: "var(--sb-text-muted, #6C6C72)",
            }}>
              Tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
            </span>
            <span style={{
              fontSize: 9, color: "var(--sb-text-muted, #8E8E93)",
              fontFamily: "var(--font-jetbrains, monospace)",
            }}>↵ to add</span>
          </div>

          {/* Assign Sweeper quick action — orange tasks with duplication guard */}
          {onAssignSweeper && (() => {
            const hasSweeper = tasks.some((t: any) =>
              t.taskLabel?.toLowerCase().includes('sweep')
            );
            return (
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSweeperMenuOpen(!sweeperMenuOpen); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={hasSweeper}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '7px 12px',
                    borderRadius: 12,
                    background: hasSweeper ? 'rgba(255,255,255,0.035)' : 'rgba(255,159,10,0.10)',
                    border: hasSweeper ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(255,159,10,0.30)',
                    color: hasSweeper ? 'var(--sb-text-muted, #8E8E93)' : '#FF9F0A',
                    cursor: hasSweeper ? 'default' : 'pointer',
                    transition: 'all 0.22s var(--sb-spring-premium-snappy)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 13, lineHeight: 1 }}>🧹</span>
                  <span>Assign Sweeper</span>
                  {hasSweeper && <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 2 }}>(assigned)</span>}
                </button>

                {/* Mini drop-up — Velvet glass treatment */}
                {sweeperMenuOpen && !hasSweeper && (
                  <div
                    className="sb-popover-up"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: 0,
                      right: 0,
                      marginBottom: 6,
                      background: 'var(--sb-glass)',
                      border: '1px solid var(--sb-glass-border)',
                      borderRadius: 14,
                      boxShadow: isDarkPanel
                        ? '0 16px 40px -12px rgba(0,0,0,0.55), inset 0 1px 0 var(--sb-glass-highlight)'
                        : '0 12px 32px -8px rgba(0,0,0,0.18), inset 0 1px 0 var(--sb-glass-highlight)',
                      backdropFilter: 'var(--sb-glass-blur)',
                      WebkitBackdropFilter: 'var(--sb-glass-blur)',
                      padding: '6px 4px',
                      zIndex: 50,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {[
                      { label: 'Sweep 5/8/HL', full: 'Sweep 5/8/HL' },
                      { label: 'Sweep 9/10/SR', full: 'Sweep 9/10/SR' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => handleAssignSweeper(opt.full)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.background = 'rgba(255,159,10,0.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.background = 'transparent'; }}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '8px 14px',
                          borderRadius: 10,
                          background: 'transparent',
                          color: '#FF9F0A',
                          transition: 'all 0.18s var(--sb-spring-premium-snappy)',
                          textAlign: 'left',
                          border: 'none',
                          cursor: 'pointer',
                          letterSpacing: '-0.1px',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Task list */}
          {tasks.length > 0 && (
            <div className="no-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 120 }}>
              {tasks.map(t => (
                <div 
                  key={t.id} 
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 10,
                    background: "var(--sb-glass)",
                    border: "1px solid var(--sb-glass-border)",
                    transition: "all 0.22s var(--sb-spring-premium-snappy)",
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.background = "rgba(255,255,255,0.09)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)";
                    e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.background = "var(--sb-glass)";
                    e.currentTarget.style.borderColor = "var(--sb-glass-border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: 2, flexShrink: 0,
                    background: t.color ?? accent,
                    boxShadow: `0 0 6px ${t.color ?? accent}88`,
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: 600, letterSpacing: "-0.15px", flex: 1,
                    color: "var(--sb-text-1, #F2F2F4)",
                    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{t.taskLabel}</span>
                  {onRemoveTask && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemoveTask(slotKey, t.taskLabel); }}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{
                        fontSize: 14, lineHeight: 1, color: "var(--sb-text-muted, #6C6C72)",
                        background: "none", border: "none", cursor: "pointer", 
                        padding: "2px 5px", borderRadius: 6,
                        flexShrink: 0,
                        transition: "all 0.18s var(--sb-spring-premium-snappy)",
                      }}
                      aria-label={`Remove task "${t.taskLabel}"`}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#FF3B30"; e.currentTarget.style.background = "rgba(255,59,48,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--sb-text-muted, #6C6C72)"; e.currentTarget.style.background = "none"; }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Task input */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 12,
            background: "var(--sb-glass)",
            border: `1px solid ${taskInput ? accent + "66" : "var(--sb-glass-border)"}`,
            boxShadow: taskInput 
              ? `0 0 0 3px ${accent}15, 0 1px 0 var(--sb-glass-highlight), inset 0 1px 0 var(--sb-glass-highlight)` 
              : "0 1px 0 var(--sb-glass-highlight), inset 0 1px 0 var(--sb-glass-highlight)",
            transition: "all 0.22s var(--sb-spring-premium-snappy)",
          }}>
            <input
              ref={inputRef}
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); handleAddTask(); }
                if (e.key === "Escape") { e.preventDefault(); setTaskInput(""); onClose(); }
              }}
              placeholder="Type a task…"
              style={{
                flex: 1,
                background: "none", border: "none", outline: "none",
                fontSize: 13, fontWeight: 600, letterSpacing: "-0.15px",
                color: "var(--sb-text-1, #F2F2F4)",
                fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                caretColor: accent,
              }}
            />
            {taskInput && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleAddTask(); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  fontSize: 9.5, padding: "3px 8px", borderRadius: 7,
                  background: accent, color: "#fff",
                  fontWeight: 700, letterSpacing: "0.3px", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  flexShrink: 0,
                  transition: "all 0.12s var(--sb-spring-snappy, cubic-bezier(0.16,1,0.3,1))",
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.transform = "scale(1.04)"; 
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.transform = "scale(1)"; 
                  e.currentTarget.style.boxShadow = "none";
                }}
              >↵</button>
            )}
          </div>

          {/* Recent task chips */}
          {recentTasks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              <span style={{
                fontSize: 9, color: "var(--sb-text-muted, #6C6C72)",
                fontFamily: "var(--font-jetbrains, monospace)",
                letterSpacing: "0.3px",
                padding: "3px 0 3px 2px", alignSelf: "center",
              }}>recent</span>
              {recentTasks.slice(0, 6).map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void onAddTask(slotKey, chip); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 8,
                    background: "rgba(184,151,8,0.10)",
                    border: "1px solid rgba(184,151,8,0.25)",
                    color: "var(--sb-gold-bright, #E9B948)",
                    fontWeight: 600, letterSpacing: "-0.1px",
                    fontFamily: "var(--font-atkinson)",
                    cursor: "pointer",
                    transition: "all 0.12s var(--sb-spring-snappy, cubic-bezier(0.16,1,0.3,1))",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(184,151,8,0.22)";
                    e.currentTarget.style.borderColor = "rgba(184,151,8,0.45)";
                    e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(184,151,8,0.10)";
                    e.currentTarget.style.borderColor = "rgba(184,151,8,0.25)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >{chip}</button>
              ))}
            </div>
          )}

          {/* Mini TM placement history — shown when a TM is assigned */}
          {a.tmId && (tmHistory || tmHistoryLoading) && (
            <MiniHistorySection
              history={tmHistory}
              loading={tmHistoryLoading}
              isDark={isDarkPanel}
              tmGender={tmGender}
              onViewAll={() => setHistoryOpen(true)}
            />
          )}
        </div>
      )}

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 5,
        paddingTop: 8,
        borderTop: "1px solid var(--sb-glass-border)",
        flexShrink: 0,
      }}>
        {/* Lock */}
        {onToggleLock && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleLock(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 32, borderRadius: 9,
              background: a.isLocked
                ? "rgba(255,159,10,0.22)"
                : isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)",
              border: a.isLocked
                ? "1px solid rgba(255,159,10,0.50)"
                : isDarkPanel ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.15)",
              color: a.isLocked ? "#FF9F0A" : isDarkPanel ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.22s var(--sb-spring-premium-snappy)",
            }}
            onMouseEnter={(e) => {
              if (!a.isLocked) {
                e.currentTarget.style.background = "rgba(255,255,255,0.16)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)";
                e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
              }
            }}
            onMouseLeave={(e) => {
              if (!a.isLocked) {
                e.currentTarget.style.background = isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)";
                e.currentTarget.style.borderColor = isDarkPanel ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.15)";
                e.currentTarget.style.boxShadow = "none";
              }
            }}
          >{a.isLocked ? "🔒 Locked" : "Lock"}</button>
        )}

        {/* Coverage — always present, highlighted when coverage mode is active */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setCoverageMode(v => !v); setCoverageConfirmed(false); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            flex: 1, height: 32, borderRadius: 9,
            background: coverageMode
              ? `${accent}44`
              : isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)",
            border: coverageMode
              ? `1px solid ${accent}`
              : isDarkPanel ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.15)",
            color: coverageMode ? accent : isDarkPanel ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
            fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px",
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
            cursor: "pointer",
            transition: "all 0.22s var(--sb-spring-premium-snappy)",
          }}
          onMouseEnter={(e) => {
            if (!coverageMode) {
              e.currentTarget.style.background = isDarkPanel ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)";
              e.currentTarget.style.borderColor = isDarkPanel ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.22)";
              e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
            }
          }}
          onMouseLeave={(e) => {
            if (!coverageMode) {
              e.currentTarget.style.background = isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)";
              e.currentTarget.style.borderColor = isDarkPanel ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.15)";
              e.currentTarget.style.boxShadow = "none";
            }
          }}
        >Coverage</button>

        {/* Swap — only when a TM is assigned and TM picker is not already open */}
        {onAssign && a.tmId && !coverageMode && !showTmPicker && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAssignMode(true); setAssignConfirmed(false); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 32, borderRadius: 9,
              background: isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)",
              border: isDarkPanel ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.15)",
              color: isDarkPanel ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.22s var(--sb-spring-premium-snappy)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDarkPanel ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)";
              e.currentTarget.style.borderColor = isDarkPanel ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.22)";
              e.currentTarget.style.boxShadow = "inset 0 1px 0 var(--sb-glass-highlight)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)";
              e.currentTarget.style.borderColor = isDarkPanel ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.15)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >Swap</button>
        )}

        {/* Clear */}
        {onClearSlot && a.tmId && !coverageMode && !showTmPicker && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClearSlot(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 32, borderRadius: 9,
              background: "rgba(229,57,53,0.18)",
              border: "1px solid rgba(229,57,53,0.45)",
              color: "#E53935",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.22s var(--sb-spring-premium-snappy)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(229,57,53,0.28)";
              e.currentTarget.style.borderColor = "rgba(229,57,53,0.65)";
              e.currentTarget.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(229,57,53,0.18)";
              e.currentTarget.style.borderColor = "rgba(229,57,53,0.45)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >Clear</button>
        )}
      </div>
      {/* ── Full history overlay (position:absolute, fills panel) ─────── */}
      {historyOpen && tmHistory && (
        <HistoryOverlay
          history={tmHistory}
          isDark={isDarkPanel}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
};

export default MarkerPad;

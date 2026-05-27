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
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { BreakGroup } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import {
  ZONE_DEFS, RR_DEFS, DEFAULT_AUX_DEFS,
  ZONE_ICONS, RR_ICONS, AUX_ICONS,
  getZoneColor, getRRAccent, getAuxAccent,
  nextBreakGroup,
} from "@/lib/shiftbuilder/constants";

export interface MarkerPadProps {
  slotKey: string | null;
  assignments: Record<string, any>;
  selectedTasks: Record<string, NightSlotTask[]>;
  recentTasks: string[];
  auxDefs?: AuxDef[];                  // operator-added aux slots
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onAddTask: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onToggleLock?: (slotKey: string) => void;
  onClearSlot?: (slotKey: string) => void;
  onAddCoverage?: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  onSwap?: (slotKey: string) => void;
  onClose: () => void;
  isDark?: boolean;
}

// ── Slot metadata lookup ─────────────────────────────────────────────────────

function getSlotMeta(slotKey: string): { label: string; loc: string; icon: string; accent: string } {
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

  const ad = DEFAULT_AUX_DEFS.find(a => a.key === slotKey);
  if (ad) return {
    label: ad.label,
    loc: ad.locations[0] ?? "",
    icon: AUX_ICONS[slotKey] ?? "❖",
    accent: getAuxAccent(slotKey),
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
              className="flex flex-col items-center py-2 rounded-xl transition-all"
              style={{
                background: active
                  ? `linear-gradient(180deg, ${accent}cc, ${accent}88)`
                  : "rgba(255,255,255,0.04)",
                border: active ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.07)",
                boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px ${accent}88` : "none",
                color: active ? "#fff" : "var(--sb-text-muted, #9CA3AF)",
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

const CoveragePicker: React.FC<{
  currentSlotKey: string;
  auxDefs: AuxDef[];
  onPick: (targetKey: string) => void;
  onCancel: () => void;
  confirmed: boolean;
}> = ({ currentSlotKey, auxDefs, onPick, onCancel, confirmed }) => {
  const sectionLabel: React.CSSProperties = {
    fontSize: 7.5, fontWeight: 700, letterSpacing: "1.4px",
    textTransform: "uppercase", color: "rgba(255,255,255,0.28)",
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

  if (confirmed) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <span style={{ fontSize: 28 }}>✓</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
          Coverage added
        </span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 10 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px", color: "rgba(255,255,255,0.85)" }}>
          Add coverage to…
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none",
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
                return (
                  <button
                    key={aux.key}
                    type="button"
                    disabled={isSelf}
                    onClick={(e) => { e.stopPropagation(); if (!isSelf) onPick(aux.key); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      ...chipBase,
                      borderColor: isSelf ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
                      color: isSelf ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.60)",
                      background: isSelf ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
                      cursor: isSelf ? "default" : "pointer",
                      fontSize: 8,
                    }}
                    onMouseEnter={e => {
                      if (!isSelf) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)";
                        (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelf) {
                        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                        (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)";
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

// ── Main component ────────────────────────────────────────────────────────────

const MarkerPad: React.FC<MarkerPadProps> = ({
  slotKey,
  assignments,
  selectedTasks,
  recentTasks,
  auxDefs = DEFAULT_AUX_DEFS,
  setBreakGroupForSlot,
  onAddTask,
  onRemoveTask,
  onToggleLock,
  onClearSlot,
  onAddCoverage,
  onSwap,
  onClose,
  isDark,
}) => {
  const [taskInput, setTaskInput] = useState("");
  const [coverageMode, setCoverageMode] = useState(false);
  const [coverageConfirmed, setCoverageConfirmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset all local state when the slot changes
  useEffect(() => {
    setTaskInput("");
    setCoverageMode(false);
    setCoverageConfirmed(false);
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

  const { label, loc, icon, accent } = getSlotMeta(slotKey);
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

  const isDarkPanel = isDark !== false;
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 68,
    right: 12,
    width: 284,
    bottom: 58,
    borderRadius: 20,
    background: isDarkPanel
      ? "rgba(20,20,22,0.82)"
      : "rgba(252,252,250,0.92)",
    backdropFilter: "blur(48px) saturate(200%)",
    WebkitBackdropFilter: "blur(48px) saturate(200%)",
    border: isDarkPanel
      ? "1px solid rgba(255,255,255,0.11)"
      : "1px solid rgba(0,0,0,0.09)",
    boxShadow: isDarkPanel
      ? `inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.04), 0 24px 48px -16px rgba(0,0,0,0.60), 0 0 0 1px ${accent}1a`
      : `inset 0 1px 0 rgba(255,255,255,0.90), 0 24px 48px -16px rgba(0,0,0,0.12), 0 0 0 1px ${accent}18`,
    display: "flex",
    flexDirection: "column",
    gap: coverageMode ? 8 : 10,
    padding: "14px 14px 10px",
    zIndex: 35,
    overflow: "hidden",
    animation: "sb-slide-right-in var(--sb-dur-fast, 0.22s) var(--sb-spring-snappy, cubic-bezier(0.16,1,0.3,1)) both",
  };

  return (
    <div ref={panelRef} style={panelStyle} onClick={(e) => e.stopPropagation()}>

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
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--sb-text-muted, #9CA3AF)",
          cursor: "pointer",
          fontSize: 13, lineHeight: 1,
        }}
        aria-label="Close marker pad"
      >×</button>

      {/* ── Slot identity ──────────────────────────────────────────────── */}
      <div style={{ paddingRight: 28, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 18, color: accent, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "1.2px",
            color: accent, textTransform: "uppercase",
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          }}>{label}</div>
          <div style={{
            fontSize: 9.5, marginTop: 1,
            color: "rgba(255,255,255,0.30)",
            fontFamily: "var(--font-jetbrains, monospace)",
            letterSpacing: "0.2px",
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

      {/* ── Break wave (hidden in coverage picker mode) ─────────────────── */}
      {!coverageMode && (
        <BreakWave
          current={currentBreak}
          accent={accent}
          onChange={(g) => setBreakGroupForSlot(slotKey, g)}
        />
      )}

      {/* ── Tasks section OR Coverage picker ───────────────────────────── */}
      {coverageMode ? (
        <CoveragePicker
          currentSlotKey={slotKey}
          auxDefs={auxDefs}
          onPick={handlePickCoverage}
          onCancel={() => { setCoverageMode(false); setCoverageConfirmed(false); }}
          confirmed={coverageConfirmed}
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

          {/* Task list */}
          {tasks.length > 0 && (
            <div className="no-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 120 }}>
              {tasks.map(t => (
                <div key={t.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", borderRadius: 10,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 2, flexShrink: 0,
                    background: t.color ?? accent,
                    boxShadow: `0 0 6px ${t.color ?? accent}88`,
                  }} />
                  <span style={{
                    fontSize: 12.5, fontWeight: 600, letterSpacing: "-0.15px", flex: 1,
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
                        fontSize: 13, lineHeight: 1, color: "var(--sb-text-muted, #6C6C72)",
                        background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                        flexShrink: 0,
                      }}
                      aria-label={`Remove task "${t.taskLabel}"`}
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
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${taskInput ? accent + "99" : "rgba(255,255,255,0.09)"}`,
            boxShadow: taskInput ? `0 0 0 3px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.08)` : "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
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
                    transition: "background 0.12s",
                  }}
                >{chip}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 5,
        paddingTop: 8,
        borderTop: isDarkPanel ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.10)",
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
              transition: "all 0.15s",
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
            transition: "all 0.15s",
          }}
        >Coverage</button>

        {/* Swap */}
        {onSwap && a.tmId && !coverageMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwap(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 32, borderRadius: 9,
              background: isDarkPanel ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.06)",
              border: isDarkPanel ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.15)",
              color: isDarkPanel ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
              fontSize: 10.5, fontWeight: 700, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >Swap</button>
        )}

        {/* Clear */}
        {onClearSlot && a.tmId && !coverageMode && (
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
              transition: "all 0.15s",
            }}
          >Clear</button>
        )}
      </div>
    </div>
  );
};

export default MarkerPad;

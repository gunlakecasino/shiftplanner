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
 *
 * All layout values match the Velvet spec (sb-velvet.jsx).
 * Uses --sb-* CSS tokens so light/dark mode is automatic.
 */

import React, { useRef, useEffect, useState } from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { BreakGroup } from "@/lib/shiftbuilder/constants";
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
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onAddTask: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onToggleLock?: (slotKey: string) => void;
  onClearSlot?: (slotKey: string) => void;
  onCoverage?: (slotKey: string) => void;
  onSwap?: (slotKey: string) => void;
  onClose: () => void;
  isDark?: boolean;
}

// ── Slot metadata lookup ─────────────────────────────────────────────────────

function getSlotMeta(slotKey: string): { label: string; loc: string; icon: string; accent: string } {
  // Zone
  const zd = ZONE_DEFS.find(z => z.key === slotKey);
  if (zd) return {
    label: zd.label,
    loc: zd.locations[0] ?? "",
    icon: ZONE_ICONS[slotKey] ?? "●",
    accent: getZoneColor(slotKey),
  };

  // RR side (MRR6, WRR7, …)
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

  // Aux / support
  const ad = DEFAULT_AUX_DEFS.find(a => a.key === slotKey);
  if (ad) return {
    label: ad.label,
    loc: ad.locations[0] ?? "",
    icon: AUX_ICONS[slotKey] ?? "❖",
    accent: getAuxAccent(slotKey),
  };

  return { label: slotKey, loc: "", icon: "●", accent: "#6B7280" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

const MarkerPad: React.FC<MarkerPadProps> = ({
  slotKey,
  assignments,
  selectedTasks,
  recentTasks,
  setBreakGroupForSlot,
  onAddTask,
  onRemoveTask,
  onToggleLock,
  onClearSlot,
  onCoverage,
  onSwap,
  onClose,
  isDark,
}) => {
  const [taskInput, setTaskInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset input when slot changes
  useEffect(() => {
    setTaskInput("");
    if (slotKey) {
      // Small delay so the panel is visible before focusing
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [slotKey]);

  if (!slotKey) return null;

  const { label, loc, icon, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const tasks = (selectedTasks[slotKey] || []).filter(t => !t.isCoverage);
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;

  const tmInitials = a.tmName
    ? a.tmName.split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()
    : null;

  const handleAddTask = () => {
    const label = taskInput.trim();
    if (!label) return;
    setTaskInput("");
    void onAddTask(slotKey, label);
  };

  // ── Glass panel styles (Velvet liquid-glass spec, light/dark aware) ─────────
  // top: 68px clears the 56px Velvet top bar + 12px gap.
  // bottom: 58px clears the 46px bottom dock + 12px gap.
  const isDarkPanel = isDark !== false; // default dark if unspecified
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
    gap: 10,
    padding: "14px 14px 10px",
    zIndex: 35,
    overflow: "hidden",
    animation: "sb-slide-right-in var(--sb-dur-fast, 0.22s) var(--sb-spring-snappy, cubic-bezier(0.16,1,0.3,1)) both",
  };

  return (
    <div style={panelStyle} onClick={(e) => e.stopPropagation()}>

      {/* Accent rail at left edge */}
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
      <div style={{ paddingRight: 28, display: "flex", alignItems: "center", gap: 8 }}>
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

      {/* ── Break wave ─────────────────────────────────────────────────── */}
      <BreakWave
        current={currentBreak}
        accent={accent}
        onChange={(g) => setBreakGroupForSlot(slotKey, g)}
      />

      {/* ── Tasks ──────────────────────────────────────────────────────── */}
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

        {/* Task list — scrollable if many */}
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

        {/* Task input — focused look */}
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

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 5,
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
      }}>
        {/* Lock */}
        {onToggleLock && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleLock(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 30, borderRadius: 9,
              background: a.isLocked ? "rgba(255,159,10,0.18)" : "rgba(255,255,255,0.05)",
              border: a.isLocked ? "1px solid rgba(255,159,10,0.40)" : "1px solid rgba(255,255,255,0.08)",
              color: a.isLocked ? "#FF9F0A" : "rgba(255,255,255,0.55)",
              fontSize: 10.5, fontWeight: 600, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >{a.isLocked ? "🔒 Locked" : "Lock"}</button>
        )}
        {/* Coverage */}
        {onCoverage && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCoverage(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 30, borderRadius: 9,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)",
              fontSize: 10.5, fontWeight: 600, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >Coverage</button>
        )}
        {/* Swap */}
        {onSwap && a.tmId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSwap(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 30, borderRadius: 9,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.55)",
              fontSize: 10.5, fontWeight: 600, letterSpacing: "-0.1px",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >Swap</button>
        )}
        {/* Clear */}
        {onClearSlot && a.tmId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClearSlot(slotKey); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              flex: 1, height: 30, borderRadius: 9,
              background: "rgba(229,57,53,0.10)",
              border: "1px solid rgba(229,57,53,0.28)",
              color: "#FF6B65",
              fontSize: 10.5, fontWeight: 600, letterSpacing: "-0.1px",
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

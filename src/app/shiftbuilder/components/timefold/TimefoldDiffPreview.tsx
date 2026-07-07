"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, ShieldCheck, Sparkles } from "lucide-react";
import {
  cardAccentInk,
  getAuxAccent,
  getRRAccent,
  getZoneColor,
  RR_ICONS,
  ZONE_ICONS,
} from "@/lib/shiftbuilder/constants";
import type { TimefoldSlotDiff } from "@/lib/shiftbuilder/timefold/timefoldTypes";

export interface TimefoldDiffPreviewProps {
  diffs: TimefoldSlotDiff[];
  /**
   * Triage selection (optional — omit for a read-only list). Keys are slotKeys.
   * When provided, every diff row gets a check circle and each group a
   * toggle-all pill, enabling partial import ("accept the fills and repeat
   * fixes, skip the shuffle").
   */
  selectedKeys?: Set<string>;
  onToggleKey?: (slotKey: string) => void;
  onToggleKeys?: (slotKeys: string[], selected: boolean) => void;
}

type TriageGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  diffs: TimefoldSlotDiff[];
  /** Collapsed by default — the low-consequence shuffle moves. */
  defaultCollapsed: boolean;
};

/** The board's own accent + glyph for a slot — same identity as its deployment card. */
function slotIdentity(slotKey: string): { accent: string; glyph: string } {
  const rr = slotKey.match(/^[MW]RR(\d+)$/);
  if (rr) {
    const num = Number(rr[1]);
    return { accent: getRRAccent(num), glyph: RR_ICONS[num] ?? "◆" };
  }
  if (/^Z\d+$/.test(slotKey)) {
    return { accent: getZoneColor(slotKey), glyph: ZONE_ICONS[slotKey] ?? "●" };
  }
  if (slotKey === "Z9SR") return { accent: getZoneColor("Z9"), glyph: ZONE_ICONS.Z9 ?? "☾" };
  return { accent: getAuxAccent(slotKey), glyph: "✦" };
}

/** Gold check circle — 22px tap target, glass ring when off. */
function CheckCircle({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className="flex size-[22px] shrink-0 items-center justify-center rounded-full transition-[background,box-shadow,transform] duration-150 active:scale-90"
      style={
        checked
          ? {
              // Optimize accent per Velvet redesign
              background: "linear-gradient(180deg, #339CFF, #007AFF)",
              border: "1px solid var(--sb-optimize-border)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
            }
          : {
              background: "var(--sb-glass-lowlight)",
              border: "1px solid var(--sb-glass-border)",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.08)",
            }
      }
    >
      {checked && <Check size={12} strokeWidth={3.5} style={{ color: "#fff" }} />}
    </button>
  );
}

/**
 * Consequence-triaged "was → proposed" review, rendered as miniature
 * deployment cards: 3px top accent stripe, glyph + accent-ink uppercase
 * header, the big bold proposed name over a tiny struck "was:" line — the
 * exact draft grammar the board itself uses, so a diff row is a faithful
 * preview of the card it becomes on import. Group headers speak the
 * artboard's section voice (ZONES · divider · gold count pill).
 */
export function TimefoldDiffPreview({
  diffs,
  selectedKeys,
  onToggleKey,
  onToggleKeys,
}: TimefoldDiffPreviewProps) {
  const selectable = !!selectedKeys && !!onToggleKey;

  const groups: TriageGroup[] = React.useMemo(() => {
    const fills = diffs.filter((d) => !d.previousTmId && d.proposedTmId);
    const healthFixes = diffs.filter((d) => d.previousTmId && d.improvesRotationHealth);
    const rest = diffs.filter((d) => !fills.includes(d) && !healthFixes.includes(d));
    return [
      {
        id: "fills",
        label: "Fills open slots",
        icon: null,
        diffs: fills,
        defaultCollapsed: false,
      },
      {
        id: "health",
        label: "Fixes rotation repeats",
        icon: null,
        diffs: healthFixes,
        defaultCollapsed: false,
      },
      {
        id: "neutral",
        label: "Enabling moves",
        icon: null,
        diffs: rest,
        defaultCollapsed: true,
      },
    ].filter((g) => g.diffs.length > 0);
  }, [diffs]);

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.id] = g.defaultCollapsed;
    setCollapsed(next);
  }, [groups]);

  if (diffs.length === 0) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
        No changes in this proposal.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-1">
      {groups.map((group) => {
        const keys = group.diffs.map((d) => d.slotKey);
        const selectedCount = selectable
          ? keys.filter((k) => selectedKeys!.has(k)).length
          : keys.length;
        const allSelected = selectedCount === keys.length;
        const isCollapsed = collapsed[group.id] ?? group.defaultCollapsed;

        return (
          <div key={group.id} className="flex flex-col gap-2">
            {/* Section header — the artboard's exact voice: LABEL · hairline · count pill. */}
            <div className="flex items-center gap-2 px-0.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setCollapsed((c) => ({ ...c, [group.id]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight size={11} className="shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown size={11} className="shrink-0 text-muted-foreground" />
                )}
                <span
                  className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase text-foreground/70"
                  style={{
                    fontFamily: "var(--font-atkinson), var(--font-geist-sans)",
                    letterSpacing: "1.5px",
                  }}
                >
                  {group.label}
                </span>
                <span
                  aria-hidden
                  className="h-px min-w-3 flex-1"
                  style={{ background: "var(--sb-glass-border)" }}
                />
              </button>
              {selectable ? (
                <button
                  type="button"
                  className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.5px] transition-opacity hover:opacity-85"
                  style={
                    allSelected
                      ? { background: "var(--sb-optimize-tint)", color: "var(--sb-optimize-ink)", border: "1px solid var(--sb-optimize-border)" }
                      : {
                          background: "var(--sb-glass-lowlight)",
                          color: "var(--muted-foreground)",
                          borderColor: "var(--sb-glass-border)",
                        }
                  }
                  onClick={() => onToggleKeys?.(keys, !allSelected)}
                  title={allSelected ? "Deselect this whole group" : "Select this whole group"}
                >
                  {selectedCount} / {keys.length} SELECTED
                </button>
              ) : (
                <span className="shrink-0 font-mono text-[9px] tracking-[0.5px] text-muted-foreground">
                  {keys.length}
                </span>
              )}
            </div>

            {!isCollapsed &&
              group.diffs.map((diff) => {
                const checked = !selectable || selectedKeys!.has(diff.slotKey);
                const { accent, glyph } = slotIdentity(diff.slotKey);
                const ink = cardAccentInk(accent);
                const opensSlot = !diff.proposedTmId;
                return (
                  <div
                    key={diff.slotKey}
                    className="relative flex flex-col overflow-hidden rounded-2xl transition-[opacity,filter] duration-200"
                    style={{
                      background: "#ffffff",
                      border: "1px solid #f0f0f0",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px -6px rgba(0,0,0,0.08)",
                      opacity: checked ? 1 : 0.45,
                      filter: checked ? undefined : "saturate(0.6)",
                    }}
                  >
                    {/* 3px top accent stripe — identical to CardAccentStripe. */}
                    <div
                      aria-hidden
                      className="h-[3px] w-full shrink-0"
                      style={{ backgroundColor: accent }}
                    />

                    {/* Card header: glyph + accent-ink uppercase label + trailing chips. */}
                    <div className="flex items-center gap-1 px-3 pt-2">
                      <span className="shrink-0 text-[12px] leading-none" style={{ color: ink }}>
                        {glyph}
                      </span>
                      <span
                        className="min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.07em]"
                        style={{ color: ink }}
                      >
                        {diff.slotLabel}
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {diff.improvesRotationHealth ? (
                          <span
                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold"
                            style={{
                              background: "var(--sb-optimize-tint)",
                              color: "var(--sb-optimize-ink)",
                              border: "1px solid var(--sb-optimize-border)",
                            }}
                          >
                            <ShieldCheck size={9.5} /> Improves rotation
                          </span>
                        ) : (
                          <span
                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium text-muted-foreground"
                            style={{
                              background: "var(--sb-glass-lowlight)",
                              border: "1px solid var(--sb-glass-border)",
                            }}
                          >
                            <Sparkles size={9.5} /> Enabling move
                          </span>
                        )}
                        {selectable && (
                          <CheckCircle
                            checked={checked}
                            onToggle={() => onToggleKey!(diff.slotKey)}
                            label={`Include change for ${diff.slotLabel}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Draft grammar — big bold proposed name, tiny struck "was:" below.
                        This row IS the card it becomes on import. */}
                    <div className="flex min-w-0 flex-col px-3.5 pt-1">
                      <span
                        className={`truncate font-bold tracking-[-0.35px] ${opensSlot ? "text-[#A1A1AA]" : "text-[#111] dark:text-[#F2F2F4]"}`}
                        style={{
                          fontSize: 17,
                          lineHeight: 1.05,
                          fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                        }}
                      >
                        {diff.proposedTmName || "— Unassigned —"}
                      </span>
                      {diff.previousTmName ? (
                        <span
                          className="mt-0.5 inline-block text-[9px] tracking-[0.2px] text-[#9CA3AF] line-through opacity-60"
                          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                        >
                          was: {diff.previousTmName}
                        </span>
                      ) : (
                        <span
                          className="mt-0.5 inline-block text-[9px] tracking-[0.2px] text-[#9CA3AF] opacity-60"
                          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                        >
                          was: open
                        </span>
                      )}
                    </div>

                    {/* Why — the fact line, in the card task-row voice. */}
                    <div className="mx-3.5 mt-1.5 h-px" style={{ background: "var(--ios-gray-6)" }} />
                    <p
                      className="px-3.5 pb-2.5 pt-1.5 text-[10.5px] leading-snug text-muted-foreground"
                      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                    >
                      {diff.reason}
                    </p>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CalendarRange,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Users,
  Target,
  AlertCircle,
} from "lucide-react";
import type { WeekPreviewResult } from "@/app/shiftbuilder/actions";
import type { Draft } from "@/lib/shiftbuilder/engine/types";

/** Match the night optimizer / Velvet redesign styling */
const BOARD_CARD_SHADOW = "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px -6px rgba(0,0,0,0.08)";
const PILL_MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </p>
  );
}

function HeroStat({
  icon,
  label,
  value,
  sub,
  accent = "var(--sb-optimize-ink)",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-3.5"
      style={{
        background: "#fff",
        border: "1px solid #f0f0f0",
        boxShadow: BOARD_CARD_SHADOW,
      }}
    >
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div
        className="mt-1 text-[26px] font-extrabold tabular-nums tracking-[-0.02em]"
        style={{ color: accent, fontFamily: PILL_MONO }}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export interface WeekEngineResultsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: WeekPreviewResult | null;
  onOpenNightInDraft: (nightIso: string, draft: Draft) => void;
}

function summarizeNight(draft: Draft) {
  const placements = Object.values(draft);
  const filled = placements.length;
  const criticals = placements.filter((p) => p.provenance.scorecard.isCritical).length;
  const healthValues = placements
    .map((p) => p.provenance.scorecard.healthPoints)
    .filter((n) => Number.isFinite(n));
  const avgHealth = healthValues.length
    ? Math.round(healthValues.reduce((a, b) => a + b, 0) / healthValues.length)
    : null;
  return { filled, criticals, avgHealth };
}

/** Read-only review of "Optimize Week" (unified week engine preview: rolling + cross-night polish + fairness ledger + violations).
 * Per-night apply still uses single-night Draft Mode. */
export function WeekEngineResultsSheet({
  open,
  onOpenChange,
  preview,
  onOpenNightInDraft,
}: WeekEngineResultsSheetProps) {
  if (!preview) return null;
  const { result, nightsMeta, missingNightIsos, existingAssignmentsByNight = {} } = preview;

  const weekHealth = Math.round(result.weekScorecard.weekHealth);
  const violationsCount = result.violations.length;
  const maxRepeat = result.weekScorecard.maxWeeklyRepeat;

  // Simple overall change estimate (across all nights)
  const totalProposed = Object.values(result.nights).reduce((sum, d) => sum + Object.keys(d).length, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="no-print w-full gap-3 rounded-l-3xl border-l-0 bg-transparent sm:max-w-[560px]"
        style={{
          background: "#ffffff",
          borderLeft: "1px solid #f0f0f0",
          boxShadow: "-10px 0 40px -12px rgba(0,0,0,0.12), -1px 0 3px rgba(0,0,0,0.05)",
          fontFamily: "var(--font-builder, 'Helvetica Neue', Helvetica, Arial, sans-serif)",
        }}
      >
        <SheetHeader className="pb-1">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "var(--sb-optimize-ink)",
                boxShadow: "0 2px 8px -2px color-mix(in srgb, var(--sb-optimize-ink) 55%, transparent)",
              }}
            >
              <CalendarRange size={18} color="#fff" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-px text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--sb-optimize-ink)" }}>
                Week Optimizer
              </p>
              <SheetTitle className="text-[17px] font-bold leading-tight tracking-[-0.01em] text-gray-900">
                Optimize Week
              </SheetTitle>
              <SheetDescription className="truncate text-[11px] tabular-nums text-gray-400">
                {nightsMeta.length} nights · Week health {weekHealth}pt · {violationsCount} violations
                {missingNightIsos.length > 0 && ` · ${missingNightIsos.length} nights missing data`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="mt-3 flex flex-1 flex-col overflow-hidden">
          <TabsList className="h-9 w-full rounded-2xl p-1 grid grid-cols-4 gap-px" style={{ background: "#f4f4f5", border: "1px solid #ececed" }}>
            <TabsTrigger value="overview" className="h-7 rounded-[10px] px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400 data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-[0_1px_3px_rgba(0,0,0,0.12)] data-selected:font-bold">Overview</TabsTrigger>
            <TabsTrigger value="nights" className="h-7 rounded-[10px] px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400 data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-[0_1px_3px_rgba(0,0,0,0.12)] data-selected:font-bold">Nights</TabsTrigger>
            <TabsTrigger value="fairness" className="h-7 rounded-[10px] px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400 data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-[0_1px_3px_rgba(0,0,0,0.12)] data-selected:font-bold">Fairness</TabsTrigger>
            <TabsTrigger value="violations" className="h-7 rounded-[10px] px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-400 data-selected:bg-white data-selected:text-gray-900 data-selected:shadow-[0_1px_3px_rgba(0,0,0,0.12)] data-selected:font-bold">
              Violations{violationsCount > 0 ? ` (${violationsCount})` : ""}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto py-3 space-y-4">
            {/* OVERVIEW — hero metrics matching night optimizer redesign */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <HeroStat icon={<Target size={12} />} label="Week Coverage" value={result.weekScorecard.coverage} sub="total slots" />
                <HeroStat icon={<TrendingUp size={12} />} label="Week Health" value={weekHealth} sub="pt (higher better)" accent="#1f9d4d" />
                <HeroStat icon={<AlertCircle size={12} />} label="Repeat Violations" value={violationsCount} sub="same-area this week" accent={violationsCount > 0 ? "#b45309" : "#1f9d4d"} />
                <HeroStat icon={<Users size={12} />} label="Max Weekly Repeat" value={maxRepeat} sub="any TM / area" accent={maxRepeat > 1 ? "#b45309" : "#1f9d4d"} />
              </div>

              <div>
                <SectionLabel>Summary</SectionLabel>
                <div className="rounded-2xl border p-3.5 text-[12px] text-muted-foreground" style={{ background: "var(--ios-background-secondary)", boxShadow: BOARD_CARD_SHADOW }}>
                  Optimized via the unified week engine (rolling night solves + cross-night polish for fairness). 
                  {totalProposed} proposed placements across {nightsMeta.length} nights.
                  {missingNightIsos.length > 0 && ` ${missingNightIsos.length} nights lacked prior board data.`}
                  <div className="mt-1 text-[10px] text-muted-foreground/70">Adopt nights individually via Draft Mode. Review before Apply to Live.</div>
                </div>
              </div>
            </TabsContent>

            {/* NIGHTS — enhanced cards with change awareness */}
            <TabsContent value="nights" className="space-y-2">
              <SectionLabel>Per-Night Proposals</SectionLabel>
              {nightsMeta.map((meta) => {
                const draft = result.nights[meta.nightIso] ?? {};
                const { filled, criticals, avgHealth } = summarizeNight(draft);
                const existing = existingAssignmentsByNight[meta.nightIso] || {};
                const changes = Object.entries(draft).filter(([k, prop]: [string, any]) => {
                  const ex = existing[k];
                  return !ex || ex.tmId !== prop?.tmId;
                }).length;

                return (
                  <div
                    key={meta.nightIso}
                    className="rounded-2xl p-3.5 flex flex-col gap-2"
                    style={{ background: "#fff", border: "1px solid #f0f0f0", boxShadow: BOARD_CARD_SHADOW }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[13px] font-semibold">{meta.dayName || meta.nightIso}</div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">{meta.nightIso}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenNightInDraft(meta.nightIso, draft)}
                        className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold transition-opacity hover:opacity-85"
                        style={{ background: "var(--sb-optimize-tint)", color: "var(--sb-optimize-ink)", border: "1px solid var(--sb-optimize-border)" }}
                      >
                        Open in Draft <ArrowRight size={12} />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div>
                        <div className="font-mono font-bold text-base tabular-nums">{filled}</div>
                        <div className="text-muted-foreground">filled</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-base tabular-nums">{avgHealth ?? "—"}</div>
                        <div className="text-muted-foreground">avg health</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-base tabular-nums" style={{ color: criticals > 0 ? "#b45309" : undefined }}>{criticals}</div>
                        <div className="text-muted-foreground">criticals</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-base tabular-nums" style={{ color: changes > 0 ? "var(--sb-optimize-ink)" : undefined }}>{changes}</div>
                        <div className="text-muted-foreground">changes</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </TabsContent>

            {/* FAIRNESS — improved table with better styling */}
            <TabsContent value="fairness" className="space-y-2">
              <SectionLabel>Fairness Ledger (week view)</SectionLabel>
              <div className="overflow-x-auto rounded-2xl border" style={{ boxShadow: BOARD_CARD_SHADOW }}>
                <table className="w-full text-[11px]">
                  <thead className="bg-[#f8f8f9] text-left text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">TM</th>
                      <th className="px-2 py-2 text-right font-semibold">Nights</th>
                      <th className="px-2 py-2 text-right font-semibold">Areas</th>
                      <th className="px-2 py-2 text-right font-semibold">Repeats</th>
                      <th className="px-2 py-2 text-right font-semibold">Load</th>
                      <th className="px-2 py-2 text-right font-semibold">Admin</th>
                      <th className="px-2 py-2 text-right font-semibold">RR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.fairnessLedger]
                      .sort((a, b) => b.nightsWorked - a.nightsWorked || b.repeatCount - a.repeatCount)
                      .map((row, idx) => {
                        const isHighRepeat = row.repeatCount > 1;
                        return (
                          <tr key={row.tmId} className={idx % 2 ? "bg-[#fafafa]" : ""}>
                            <td className="px-3 py-1.5 font-medium">{row.tmName}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{row.nightsWorked}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{row.uniqueAreas}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: isHighRepeat ? "#b45309" : undefined, fontWeight: isHighRepeat ? 600 : 400 }}>{row.repeatCount}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{row.difficultyLoad.toFixed(1)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{row.adminShare}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{row.rrShare}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <p className="px-1 text-[10px] text-muted-foreground">Sorted by nights worked, then repeats. High repeats highlighted.</p>
            </TabsContent>

            {/* VIOLATIONS — styled like constraint signals */}
            <TabsContent value="violations" className="space-y-2">
              <SectionLabel>Week Repeat Violations</SectionLabel>
              {result.violations.length === 0 ? (
                <div className="rounded-2xl border p-4 text-sm text-green-700 bg-green-50" style={{ boxShadow: BOARD_CARD_SHADOW }}>
                  No same-area repeat violations this week. Excellent rotation balance.
                </div>
              ) : (
                result.violations.map((v, i) => (
                  <div
                    key={`${v.tmId}-${v.slotKey}-${i}`}
                    className="flex items-start gap-3 rounded-2xl border p-3"
                    style={{ background: "#fff", boxShadow: BOARD_CARD_SHADOW }}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
                    <div className="text-sm">
                      <span className="font-semibold">{v.tmName}</span> repeated <span className="font-medium">{v.slotKey}</span> {v.count}× this week
                      <div className="text-xs text-muted-foreground mt-0.5">Nights: {v.nights.join(" · ")}</div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </div>
        </Tabs>

        <SheetFooter className="gap-2 pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 w-full rounded-full text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Close — keep board as is
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

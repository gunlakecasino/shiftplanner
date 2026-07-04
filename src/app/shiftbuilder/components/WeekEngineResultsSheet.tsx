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
import { CalendarRange, AlertTriangle, ArrowRight } from "lucide-react";
import type { WeekPreviewResult } from "@/app/shiftbuilder/actions";
import type { Draft } from "@/lib/shiftbuilder/engine/types";

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

/** Read-only review of a runWeekEngine preview — fairness ledger + violations +
 * per-night summary. Applying a night still goes through the existing single-
 * night Draft Mode flow via onOpenNightInDraft (no bulk multi-night write). */
export function WeekEngineResultsSheet({
  open,
  onOpenChange,
  preview,
  onOpenNightInDraft,
}: WeekEngineResultsSheetProps) {
  if (!preview) return null;
  const { result, nightsMeta, missingNightIsos } = preview;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" />
            Run Week Results
          </SheetTitle>
          <SheetDescription>
            {result.weekScorecard.coverage} slots covered across {nightsMeta.length} night
            {nightsMeta.length === 1 ? "" : "s"} · week health{" "}
            {Math.round(result.weekScorecard.weekHealth)}pt
            {missingNightIsos.length > 0 && (
              <>
                {" "}
                · {missingNightIsos.length} night{missingNightIsos.length === 1 ? "" : "s"} skipped
                (no board record yet — visit {missingNightIsos.join(", ")} once first)
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="nights" className="mt-4">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="nights">Nights</TabsTrigger>
            <TabsTrigger value="fairness">Fairness</TabsTrigger>
            <TabsTrigger value="violations">
              Violations{result.violations.length > 0 ? ` (${result.violations.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nights" className="mt-3 space-y-2">
            {nightsMeta.map((meta) => {
              const draft = result.nights[meta.nightIso] ?? {};
              const { filled, criticals, avgHealth } = summarizeNight(draft);
              return (
                <div
                  key={meta.nightIso}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {meta.dayName || meta.nightIso} · {meta.nightIso}
                    </p>
                    <p className="text-xs text-gray-500">
                      {filled} slots filled
                      {avgHealth != null ? ` · avg health ${avgHealth}pt` : ""}
                      {criticals > 0
                        ? ` · ${criticals} unavoidable repeat${criticals === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenNightInDraft(meta.nightIso, draft)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700"
                  >
                    Open in Draft
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="fairness" className="mt-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5">TM</th>
                    <th className="px-2 py-1.5 text-right">Nights</th>
                    <th className="px-2 py-1.5 text-right">Areas</th>
                    <th className="px-2 py-1.5 text-right">Repeats</th>
                    <th className="px-2 py-1.5 text-right">Load</th>
                    <th className="px-2 py-1.5 text-right">Admin</th>
                    <th className="px-2 py-1.5 text-right">RR</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.fairnessLedger]
                    .sort((a, b) => b.nightsWorked - a.nightsWorked)
                    .map((row) => (
                      <tr key={row.tmId} className="border-t">
                        <td className="px-2 py-1.5">{row.tmName}</td>
                        <td className="px-2 py-1.5 text-right">{row.nightsWorked}</td>
                        <td className="px-2 py-1.5 text-right">{row.uniqueAreas}</td>
                        <td className="px-2 py-1.5 text-right">{row.repeatCount}</td>
                        <td className="px-2 py-1.5 text-right">{row.difficultyLoad.toFixed(1)}</td>
                        <td className="px-2 py-1.5 text-right">{row.adminShare}</td>
                        <td className="px-2 py-1.5 text-right">{row.rrShare}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="violations" className="mt-3 space-y-2">
            {result.violations.length === 0 ? (
              <p className="text-sm text-gray-500">No same-area repeat violations this week.</p>
            ) : (
              result.violations.map((v, i) => (
                <div
                  key={`${v.tmId}-${v.slotKey}-${i}`}
                  className="flex items-start gap-2 rounded-lg border p-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <p className="text-sm">
                    <span className="font-medium">{v.tmName}</span> repeated{" "}
                    <span className="font-medium">{v.slotKey}</span> {v.count}× — {v.nights.join(", ")}
                  </p>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        <SheetFooter className="mt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            Close
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

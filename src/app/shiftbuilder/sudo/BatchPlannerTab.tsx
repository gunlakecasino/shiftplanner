"use client";

/**
 * Batch Planner tab — run the weighted placement engine for a whole week or
 * a single night from within the SUDO window.
 *
 * The engine is weighted-only (no Grok) for speed and predictability. Operator
 * can open any individual night on the main board and run Grok there for an
 * AI-assisted pass on top.
 *
 * UI flow:
 *   1. Pick a week from the dropdown (populated from listWeeksWithNights)
 *   2. See the 7 nights with current assignment-count indicators
 *   3. Hit "Run All" or "Run" next to any individual night
 *   4. Watch per-night status chips update as each night completes
 */

import React from "react";
import { cn } from "@/lib/utils";
import { BuilderBusyLabel } from "../components/builderPrimitives";
import { SudoTabLoading } from "./SudoGlass";
import { sudoIosClasses } from "./sudoIosTheme";
import { useConfirm } from "../components/ConfirmDialog";
import {
  listWeeksWithNights,
  listNightsForWeek,
  batchRunEngineForWeek,
  batchRunEngineForNight,
  type BatchNightResult,
  type BatchRunOptions,
} from "@/lib/shiftbuilder/sudoBatchPlanner";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface WeekOption {
  weekId: string;
  weekEnding: string;
  weekLabel: string;
  nightCount: number;
}

interface NightRow {
  nightId: string;
  nightDate: string;
  dayName: string;
  assignmentCount: number;
}

type NightRunState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: BatchNightResult };

export interface BatchPlannerTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export function BatchPlannerTab({ onDataChanged, isDark = false }: BatchPlannerTabProps) {
  const ios = sudoIosClasses(isDark);
  const confirm = useConfirm();
  const [weeks, setWeeks] = React.useState<WeekOption[]>([]);
  const [weeksLoading, setWeeksLoading] = React.useState(true);
  const [weeksError, setWeeksError] = React.useState<string | null>(null);

  const [selectedWeekId, setSelectedWeekId] = React.useState<string>("");
  const [selectedWeek, setSelectedWeek] = React.useState<WeekOption | null>(null);

  // Per-night running state
  const [nightStates, setNightStates] = React.useState<Record<string, NightRunState>>({});
  // Nights for the selected week
  const [nights, setNights] = React.useState<NightRow[]>([]);
  const [nightsLoading, setNightsLoading] = React.useState(false);

  const [batchRunning, setBatchRunning] = React.useState(false);
  const [batchError, setBatchError] = React.useState<string | null>(null);
  const [batchSummary, setBatchSummary] = React.useState<{
    totalAssigned: number;
    totalPreserved: number;
    totalUnfilled: number;
  } | null>(null);

  const [skipFilled, setSkipFilled] = React.useState(false);
  const [requireSchedule, setRequireSchedule] = React.useState(false);
  const [filterBySchedule, setFilterBySchedule] = React.useState(true);

  // -----------------------------------------------------------------------
  // Load weeks on mount
  // -----------------------------------------------------------------------
  React.useEffect(() => {
    (async () => {
      setWeeksLoading(true);
      setWeeksError(null);
      try {
        const rows = await listWeeksWithNights();
        setWeeks(rows);
        if (rows.length > 0) {
          setSelectedWeekId(rows[0].weekId);
          setSelectedWeek(rows[0]);
        }
      } catch (err) {
        setWeeksError(err instanceof Error ? err.message : String(err));
      } finally {
        setWeeksLoading(false);
      }
    })();
  }, []);

  // -----------------------------------------------------------------------
  // Load nights when selected week changes
  // -----------------------------------------------------------------------
  React.useEffect(() => {
    if (!selectedWeekId) {
      setNights([]);
      return;
    }
    setNights([]);
    setNightStates({});
    setBatchSummary(null);
    setBatchError(null);
    setNightsLoading(true);
    listNightsForWeek(selectedWeekId)
      .then((rows) => setNights(rows))
      .catch((err) => {
        console.error("[BatchPlannerTab] nights load error:", err);
        // Fallback: derive dates from week_ending so the UI isn't blank
        const week = weeks.find((w) => w.weekId === selectedWeekId);
        if (week) setNights(deriveDatesFromWeekEnding(week.weekEnding));
      })
      .finally(() => setNightsLoading(false));
  }, [selectedWeekId, weeks]);

  // -----------------------------------------------------------------------
  // Run all
  // -----------------------------------------------------------------------
  const handleRunAll = async () => {
    if (!selectedWeekId || batchRunning) return;
    const ok = await confirm("Continue?", {
      title: "Run the placement engine for the whole week?",
      summaryPoints: [
        "Writes LIVE to zone_assignments (no Draft Mode review)",
        "Only fills empty slots (does not overwrite filled/locked)",
        "No Grok — open a night on the board for AI review after",
      ],
      confirmLabel: "Run All Nights",
      tone: "danger",
    });
    if (!ok) return;
    setBatchRunning(true);
    setBatchError(null);
    setBatchSummary(null);
    // Mark all nights as running
    const runningState: Record<string, NightRunState> = {};
    nights.forEach((n) => { runningState[n.nightDate] = { phase: "running" }; });
    setNightStates(runningState);
    try {
      const options: BatchRunOptions = { skipFilledNights: skipFilled, requireSchedule, filterBySchedule };
      const result = await batchRunEngineForWeek(selectedWeekId, options);
      // Map results back to night state keyed by nightDate
      const doneState: Record<string, NightRunState> = {};
      result.nights.forEach((r) => {
        doneState[r.nightDate] = { phase: "done", result: r };
      });
      setNightStates(doneState);
      setBatchSummary({
        totalAssigned: result.totalAssigned,
        totalPreserved: result.totalPreserved,
        totalUnfilled: result.totalUnfilled,
      });
      onDataChanged?.();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : String(err));
      // Reset running nights on error
      setNightStates({});
    } finally {
      setBatchRunning(false);
    }
  };

  // -----------------------------------------------------------------------
  // Run single night
  // -----------------------------------------------------------------------
  const handleRunNight = async (nightId: string, nightDate: string) => {
    if (!nightId || nightId.startsWith("derived-")) {
      setBatchError("This night hasn't been created in the DB yet. Open the board for that date first, or ensure the week exists in Batch Planner.");
      return;
    }
    const ok = await confirm("Writes LIVE to empty slots only (no Draft Mode). Continue?", {
      title: `Run the placement engine for ${nightDate}?`,
      confirmLabel: "Run",
      tone: "danger",
    });
    if (!ok) return;
    setNightStates((prev) => ({ ...prev, [nightDate]: { phase: "running" } }));
    setBatchError(null);
    try {
      const options: BatchRunOptions = { skipFilledNights: false, requireSchedule, filterBySchedule };
      const result = await batchRunEngineForNight(nightId, options);
      setNightStates((prev) => ({ ...prev, [nightDate]: { phase: "done", result } }));
      onDataChanged?.();
    } catch (err) {
      setNightStates((prev) => ({
        ...prev,
        [nightDate]: {
          phase: "done",
          result: {
            nightId,
            nightDate,
            dayName: "",
            status: "error",
            assigned: 0,
            preserved: 0,
            unfilled: 0,
            notes: [],
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        },
      }));
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const weekLabel = selectedWeek?.weekLabel ?? "";
  const anyRunning = batchRunning || Object.values(nightStates).some((s) => s.phase === "running");

  return (
    <div className={cn("h-full flex flex-col overflow-hidden", ios.page)}>
      {/* Header bar */}
      <div className={cn(ios.actionBar, "flex items-center justify-between")}>
        <div className="flex items-center gap-2">
          <span className="ms text-amber-400" style={{ fontSize: 16 }}>bolt</span>
          <span className={cn("text-[13px] font-semibold", ios.actionTitle)}>Batch Planner</span>
          <span className="text-zinc-500 text-[11px] font-mono">· weighted engine · no Grok</span>
        </div>
        {batchSummary && (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-emerald-400">↑ {batchSummary.totalAssigned} assigned</span>
            <span className="text-zinc-500">· {batchSummary.totalPreserved} preserved</span>
            {batchSummary.totalUnfilled > 0 && (
              <span className="text-amber-400">· {batchSummary.totalUnfilled} unfilled</span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {/* Week picker */}
        <div className="space-y-1.5">
          <label className={cn("text-[11px] font-mono uppercase tracking-wider", isDark ? "text-zinc-400" : "text-neutral-600")}>Week</label>
          {weeksLoading ? (
            <SudoTabLoading>Loading weeks</SudoTabLoading>
          ) : weeksError ? (
            <div className="text-red-400 text-[12px]">{weeksError}</div>
          ) : (
            <div className="relative">
              <select
                value={selectedWeekId}
                onChange={(e) => {
                  setSelectedWeekId(e.target.value);
                  setSelectedWeek(weeks.find((w) => w.weekId === e.target.value) ?? null);
                }}
                disabled={anyRunning}
                className={cn(
                  "w-full appearance-none rounded-lg border",
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-100"
                    : "bg-white border-neutral-200 text-neutral-900",
                  "px-3 py-2 pr-8 text-[13px]",
                  "focus:outline-none focus:ring-1 focus:ring-amber-500/60",
                  anyRunning && "opacity-50 cursor-not-allowed"
                )}
                style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
              >
                {weeks.map((w) => (
                  <option key={w.weekId} value={w.weekId}>
                    {w.weekLabel} ({w.nightCount} nights)
                  </option>
                ))}
              </select>
              <span className="ms pointer-events-none absolute right-2.5 top-2.5 text-zinc-500" style={{ fontSize: 14 }}>expand_more</span>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={skipFilled}
              onChange={(e) => setSkipFilled(e.target.checked)}
              disabled={anyRunning}
              className="accent-amber-500"
            />
            <span className={cn("text-[12px]", isDark ? "text-zinc-300" : "text-neutral-700")}>Skip nights with existing assignments</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={requireSchedule}
              onChange={(e) => setRequireSchedule(e.target.checked)}
              disabled={anyRunning}
              className="accent-amber-500"
            />
            <span className={cn("text-[12px]", isDark ? "text-zinc-300" : "text-neutral-700")}>Skip nights with no schedule import</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterBySchedule}
              onChange={(e) => setFilterBySchedule(e.target.checked)}
              disabled={anyRunning}
              className="accent-amber-500"
            />
            <span className={cn("text-[12px]", isDark ? "text-zinc-300" : "text-neutral-700")}>
              Only roster scheduled TMs{" "}
              <span className={isDark ? "text-zinc-500" : "text-neutral-500"}>(uncheck to use full grave pool)</span>
            </span>
          </label>
        </div>

        {/* Run All button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAll}
            disabled={anyRunning || !selectedWeekId || nights.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold",
              "bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {!batchRunning && <span className="ms" style={{ fontSize: 16 }}>play_arrow</span>}
            {batchRunning ? (
              <BuilderBusyLabel>Running all nights</BuilderBusyLabel>
            ) : (
              "Run All Nights"
            )}
          </button>
          <button
            onClick={() => {
              setNightStates({});
              setBatchSummary(null);
              setBatchError(null);
            }}
            disabled={anyRunning}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] border transition-colors disabled:opacity-30",
              isDark
                ? "text-zinc-400 hover:text-zinc-100 border-zinc-700 hover:border-zinc-500"
                : "text-neutral-500 hover:text-neutral-900 border-neutral-300 hover:border-neutral-400"
            )}
          >
            <span className="ms" style={{ fontSize: 14 }}>refresh</span>
            Reset
          </button>
        </div>

        {/* Error */}
        {batchError && (
          <div className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px]",
            isDark
              ? "bg-red-950/40 border-red-800/50 text-red-300"
              : "bg-red-50 border-red-200 text-red-700"
          )}>
            <span className="ms shrink-0 mt-px" style={{ fontSize: 16 }}>cancel</span>
            <span>{batchError}</span>
          </div>
        )}

        {/* Info callout */}
        <div className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px]",
          isDark
            ? "bg-zinc-900/60 border-zinc-700/50 text-zinc-400"
            : "bg-neutral-50 border-neutral-200 text-neutral-600"
        )}>
          <span className={cn("ms shrink-0 mt-px", isDark ? "text-zinc-500" : "text-neutral-400")} style={{ fontSize: 14 }}>info</span>
          <span>
            Batch runner uses the weighted scoring engine only — no Grok. Results are written directly to{" "}
            <span className={cn("font-mono", isDark ? "text-zinc-300" : "text-neutral-800")}>zone_assignments</span>. Open any night on the main board to run Grok on top, or to review and adjust individual picks.
          </span>
        </div>

        {/* Night list */}
        {nightsLoading ? (
          <SudoTabLoading>Loading nights</SudoTabLoading>
        ) : nights.length === 0 ? (
          <div className="text-zinc-500 text-[12px]">No nights found for this week.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mb-2">
              {weekLabel} · {nights.length} nights
            </div>
            {nights.map((n) => (
              <NightRowItem
                key={n.nightDate}
                night={n}
                runState={nightStates[n.nightDate] ?? { phase: "idle" }}
                anyRunning={anyRunning}
                onRun={() => handleRunNight(n.nightId, n.nightDate)}
                isDark={isDark}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// NightRowItem
// -----------------------------------------------------------------------

function NightRowItem({
  night,
  runState,
  anyRunning,
  onRun,
  isDark = false,
}: {
  night: NightRow;
  runState: NightRunState;
  anyRunning: boolean;
  onRun: () => void;
  isDark?: boolean;
}) {
  const [notesOpen, setNotesOpen] = React.useState(false);
  const isDerived = night.nightId.startsWith("derived-");

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border transition-colors",
        runState.phase === "done" && runState.result.status === "ok"
          ? isDark ? "border-emerald-700/40 bg-emerald-950/20" : "border-emerald-300 bg-emerald-50"
          : runState.phase === "done" && runState.result.status === "skip"
          ? isDark ? "border-zinc-700/40 bg-zinc-900/40" : "border-neutral-200 bg-neutral-50"
          : runState.phase === "done" && runState.result.status === "error"
          ? isDark ? "border-red-800/40 bg-red-950/20" : "border-red-200 bg-red-50"
          : runState.phase === "running"
          ? isDark ? "border-amber-700/40 bg-amber-950/20" : "border-amber-300 bg-amber-50"
          : isDark ? "border-zinc-800 bg-zinc-900/30" : "border-neutral-200 bg-white"
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Status icon */}
        <div className="shrink-0 w-5 flex justify-center">
          {runState.phase === "running" && <span className="sb-status-dot sb-status-dot--syncing !w-3 !h-3" aria-hidden="true" />}
          {runState.phase === "done" && runState.result.status === "ok" && <span className={cn("ms", isDark ? "text-emerald-400" : "text-emerald-600")} style={{ fontSize: 16 }}>check_circle</span>}
          {runState.phase === "done" && runState.result.status === "skip" && <span className={cn("ms", isDark ? "text-zinc-500" : "text-neutral-400")} style={{ fontSize: 16 }}>skip_next</span>}
          {runState.phase === "done" && runState.result.status === "error" && <span className={cn("ms", isDark ? "text-red-400" : "text-red-500")} style={{ fontSize: 16 }}>cancel</span>}
          {runState.phase === "idle" && <span className={cn("ms", isDark ? "text-zinc-600" : "text-neutral-400")} style={{ fontSize: 16 }}>calendar_today</span>}
        </div>

        {/* Day + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={cn("text-[13px] font-semibold", isDark ? "text-zinc-200" : "text-neutral-900")}>{night.dayName || "—"}</span>
            <span className="text-[11px] text-zinc-500 font-mono">{night.nightDate}</span>
            {isDerived ? (
              <span className="text-[10px] text-amber-600/80 font-mono">no DB row</span>
            ) : runState.phase === "idle" && night.assignmentCount > 0 ? (
              <span className="text-[10px] text-zinc-500 font-mono">{night.assignmentCount} zones filled</span>
            ) : runState.phase === "idle" ? (
              <span className="text-[10px] text-zinc-600 font-mono">empty</span>
            ) : null}
          </div>
          {/* Result summary */}
          {runState.phase === "done" && (
            <div className="flex items-center gap-3 mt-0.5 text-[11px]">
              {runState.result.status === "ok" && (
                <>
                  <span className={isDark ? "text-emerald-400" : "text-emerald-600"}>↑ {runState.result.assigned} assigned</span>
                  {runState.result.preserved > 0 && (
                    <span className={isDark ? "text-zinc-500" : "text-neutral-500"}>{runState.result.preserved} preserved</span>
                  )}
                  {runState.result.unfilled > 0 && (
                    <span className={isDark ? "text-amber-400" : "text-amber-600"}>{runState.result.unfilled} unfilled</span>
                  )}
                </>
              )}
              {runState.result.status === "skip" && (
                <span className={isDark ? "text-zinc-500" : "text-neutral-500"}>{runState.result.notes[0] ?? "Skipped"}</span>
              )}
              {runState.result.status === "error" && (
                <span className={cn("truncate", isDark ? "text-red-400" : "text-red-600")}>{runState.result.errorMessage}</span>
              )}
              {/* Notes toggle */}
              {runState.result.notes.length > 0 && runState.result.status === "ok" && (
                <button
                  onClick={() => setNotesOpen((o) => !o)}
                  className={cn("transition-colors", isDark ? "text-zinc-500 hover:text-zinc-300" : "text-neutral-500 hover:text-neutral-700")}
                >
                  {notesOpen ? "hide notes" : `${runState.result.notes.length} note${runState.result.notes.length === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={anyRunning || runState.phase === "running"}
          className={cn(
            "sb-interactive flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium",
            isDark
              ? "border border-zinc-700 text-zinc-300 hover:border-amber-500/60 hover:text-amber-300"
              : "border border-neutral-300 text-neutral-700 hover:border-amber-500/60 hover:text-amber-600",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
        >
          {runState.phase === "running" ? (
            <BuilderBusyLabel className="text-[11px]">Run</BuilderBusyLabel>
          ) : (
            <>
              <span className="ms" style={{ fontSize: 12 }}>play_arrow</span>
              Run
            </>
          )}
        </button>
      </div>

      {/* Notes panel */}
      {notesOpen && runState.phase === "done" && runState.result.notes.length > 0 && (
        <div className={cn("border-t px-3 py-2 space-y-0.5", isDark ? "border-zinc-800" : "border-neutral-200")}>
          {runState.result.notes.map((note, i) => (
            <div key={i} className={cn("text-[11px] font-mono", isDark ? "text-zinc-400" : "text-neutral-600")}>
              · {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Derive the 7-night dates from a week_ending date (Friday → Thursday).
 * Used as a fallback when the server action fails.
 * Returns nights with `nightId = "derived-<date>"` as a placeholder.
 */
function deriveDatesFromWeekEnding(weekEnding: string): NightRow[] {
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const end = new Date(weekEnding + "T12:00:00Z");
  const nights = [];
  // Week is Friday (day -6) through Thursday (day 0, the week_ending)
  for (let offset = -6; offset <= 0; offset++) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() + offset);
    const iso = d.toISOString().slice(0, 10);
    nights.push({
      nightId: `derived-${iso}`,
      nightDate: iso,
      dayName: DAY_NAMES[d.getUTCDay()],
      assignmentCount: 0,
    });
  }
  return nights;
}

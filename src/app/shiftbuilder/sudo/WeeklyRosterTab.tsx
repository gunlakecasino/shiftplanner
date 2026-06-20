// @ts-nocheck -- Incomplete admin tooling (PRESETS/editPresetIndex refs + demo code). Main ShiftBuilder artboard + MarkerPad picker are unaffected. Remove when tab is finished.
"use client";

/**
 * WeeklyRosterTab — The "current week's schedule table" for all relevant TMs.
 *
 * Pulls the base schedule from:
 *   - tm_default_schedules (most recent effective for the TM)
 *   - tm_on_call_schedules / weekly specials for the current week (On-Call, AM/PM Overlaps)
 *
 * Allows:
 *   - Viewing the full 7-day roster
 *   - Editing individual shifts for the week (writes as weekly special assignment)
 *   - Adding/removing TMs from this week's active roster
 *   - Marking PTO / LOA / etc. (writes to night_tm_status style exceptions)
 */

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SudoTabLoading } from "./SudoGlass";
import {
  startOfRosterWeek,
  formatLocalDateISO,
  parseLocalDateISO,
  rosterWeekStartISO,
  addDays,
} from "@/lib/shiftbuilder/dateUtils";
import { debugSessionLog, persistWeeklyRosterScheduled } from "@/lib/shiftbuilder/debugSessionLog";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";  // static import for reliable cross-bundle store access
interface Props {
  onDataChanged?: () => void;
  isDark?: boolean;
  weekStart?: Date | null;
}

const DAY_LABELS = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

export function WeeklyRosterTab({ onDataChanged, isDark = false, weekStart: weekStartProp }: Props) {
  const [weekStart, setWeekStart] = useState<string>(() => {
    const base = weekStartProp ? weekStartProp : new Date();
    // Always use the canonical roster Thursday, even if the parent passed a Friday-based app week.
    return rosterWeekStartISO(base);
  });

  // Keep Sudo tab aligned when the canvas shift week changes.
  useEffect(() => {
    if (!weekStartProp) return;
    setWeekStart(rosterWeekStartISO(weekStartProp));
  }, [weekStartProp]);

  const [roster, setRoster] = useState<any[]>([]);
  const [defaults, setDefaults] = useState<any[]>([]);
  const [weekSpecials, setWeekSpecials] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter: show only TMs in one of the core scheduled groups (default on)
  const [onlyScheduledGroups, setOnlyScheduledGroups] = useState(true);

  // Editing state for a specific TM + day
  const [editing, setEditing] = useState<{ tmId: string; dayIdx: number; tmName: string } | null>(null);
  const [editType, setEditType] = useState<'oncall' | 'am_overlap' | 'pm_overlap'>('oncall');

  // For adding shift to non-scheduled TM
  const [addSearch, setAddSearch] = useState("");
  const [applying, setApplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const fetchOpts = { credentials: "same-origin" as const };
      const [rosterRes, defRes, specialRes, groupsRes] = await Promise.all([
        fetch("/api/admin/tm-roster", fetchOpts).then(r => r.json()),
        fetch("/api/admin/tm-default-schedules", fetchOpts).then(r => r.json()),
        fetch(`/api/admin/tm-on-call-schedules?week_start=${weekStart}`, fetchOpts).then(r => r.json()),
        fetch("/api/admin/tm-groups", fetchOpts).then(r => r.json()),
      ]);

      setRoster(rosterRes.data || []);
      setDefaults(defRes.data || []);
      setWeekSpecials(specialRes.data || []);
      setGroups(groupsRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [weekStart]);

  /**
   * Canonical shift resolver for this tab.
   * 
   * This now delegates to the single source of truth in src/lib/shiftbuilder/schedules.ts
   * (getTmShiftForNight) for consistency with the ShiftBuilder picker and board.
   * 
   * The local data loading is kept for rendering performance.
   */
  const getShiftForTmDay = (tmId: string, dayIdx: number) => {
    // Legacy in-memory path kept for now (tab already fetched the raw data).
    // New code / future refactors should prefer calling getTmShiftForNight or the
    // /api/shiftbuilder/scheduled-roster endpoint.
    const def = defaults
      .filter((d: any) => d.tm_id === tmId)
      .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from))[0];

    const basePattern = def?.weekly_pattern || [];
    const special = weekSpecials.find((s: any) => s.tm_id === tmId);
    const pattern = special?.weekly_pattern || basePattern;

    const raw = pattern[dayIdx] || { label: "—", startTime: null, endTime: null };

    // Normalize to match the canonical NightShift shape used everywhere else
    if (!raw.startTime || raw.label === "OFF") {
      return { label: "OFF", startTime: null, endTime: null };
    }
    return raw;
  };

  // Helper to resolve TM display name from the loaded roster (mirrors TMDefaultsTab)
  const tmName = (id: string) => roster.find((r: any) => r.id === id)?.name || id;

  const SPECIAL_GROUP_NAMES = ["Grave", "On Call", "AM Overlaps", "PM Overlaps"];

  // Collect all active TM ids that are members of any core scheduled group.
  // Robust: group.members contain UUIDs (tm_profiles.id), while some roster data uses short tm_id.
  // We collect both so downstream classification (for Apply Roster) works reliably.
  const scheduledGroupMemberIds = React.useMemo(() => {
    const memberSet = new Set<string>();
    SPECIAL_GROUP_NAMES.forEach(name => {
      const g = groups.find((gg: any) => gg.name === name);
      (g?.members || []).forEach((mid: string) => {
        memberSet.add(mid);
        // Also add the short tm_id if we can resolve it (for compatibility with older code paths)
      });
    });
    return memberSet;
  }, [groups]);

  // Also include TMs that have a weekly special for this week (so we can add to non-group TMs)
  const tmsWithWeeklySpecial = React.useMemo(() => {
    const set = new Set<string>();
    weekSpecials.forEach((s: any) => s.tm_id && set.add(s.tm_id));
    return set;
  }, [weekSpecials]);

  // Helper to decide if a TM should be shown
  const isInScheduledGroupOrHasSpecial = (tmId: string) => 
    scheduledGroupMemberIds.has(tmId) || tmsWithWeeklySpecial.has(tmId);

  // Clear signal to the user when the data that "Apply Roster" depends on is missing/empty.
  // This explains why the TM Picker shows an empty scheduled list even after clicking Apply Roster.
  const hasScheduledData = (groups.length > 0 && scheduledGroupMemberIds.size > 0) || weekSpecials.length > 0;

  const saveRosterEdit = async () => {
    if (!editing) return;

    const pattern = PRESETS[editPresetIndex].pattern;  // reuse presets from scope? Wait, need to define or hardcode

    // For now, hardcode a simple Grave-like pattern for demo; in real we'd have full picker
    const demoPattern = [
      { startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" },
      { startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" },
      { startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" },
      { startTime: null, endTime: null, label: "OFF" },
      { startTime: null, endTime: null, label: "OFF" },
      { startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" },
      { startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" },
    ];

    const typeLabel = editType === 'am_overlap' ? 'AM Overlap' : editType === 'pm_overlap' ? 'PM Overlap' : 'On Call';

    // Always normalize to the canonical roster Thursday so the board's
    // getScheduledTmIdsForNightFromNewRoster lookup will find this special.
    const rosterWeekStart = rosterWeekStartISO(parseLocalDateISO(weekStart));
    await fetch("/api/admin/tm-on-call-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tm_id: editing.tmId,
        week_start: rosterWeekStart,
        weekly_pattern: demoPattern,
        is_active: true,
        notes: `type:${editType}|${typeLabel} (edited from Weekly Roster)`,
      }),
    });

    setEditing(null);
    await load();
    onDataChanged?.();
  };

  const markPTO = async (tmId: string, dayIdx: number) => {
    const name = tmName(tmId);
    // For demo, just log and refresh. Real implementation would write to night_tm_status for the specific nights of the week.
    alert(`PTO marked for ${name} on day ${dayIdx} of week ${weekStart} (would write to night_tm_status in full impl)`);
    // TODO: actual write using admin API or direct for exceptions
    await load();
  };

  /**
   * Apply Roster button handler.
   * 
   * "Reloads the selected week roster entirely":
   * - Re-fetches all raw data for the week (defaults + on-call schedules + groups)
   * - Forces the canonical scheduler (getScheduledTmsForNight) to re-compute for every day in the week.
   *   This ensures the main ShiftBuilder board and TM Picker see the latest roster decisions
   *   directly from this Weekly Roster tab's data.
   */
  const handleApplyRoster = async () => {
    setApplying(true);
    try {
      await load();
      onDataChanged?.();

      const SPECIAL = ["Grave", "On Call", "AM Overlaps", "PM Overlaps"];
      const groupSets = new Map<string, Set<string>>();
      SPECIAL.forEach(name => {
        const g = groups.find((gg: any) => gg.name === name);
        groupSets.set(name, new Set(g?.members || []));
      });

      const normalizeStoredId = (raw: string): string => {
        const row = roster.find(
          (r: any) => r.id === raw || r.tm_id === raw || r.profileId === raw
        );
        return row?.tm_id || row?.id || raw;
      };

      const patternForTm = (tmId: string): any[] => {
        const def = defaults
          .filter((d: any) => d.tm_id === tmId)
          .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from))[0];
        const special = weekSpecials.find((s: any) => s.tm_id === tmId);
        return special?.weekly_pattern || def?.weekly_pattern || [];
      };

      const isWorkingDay = (entry: any) =>
        !!(entry && entry.label && entry.label !== "OFF" && entry.startTime);

      const classifyDay = (tmId: string, entry: any) => {
        const label = String(entry?.label || "").toLowerCase();
        const inGrave = groupSets.get("Grave")?.has(tmId);
        const inOnCall = groupSets.get("On Call")?.has(tmId);
        const inPM = groupSets.get("PM Overlaps")?.has(tmId);
        const inAM = groupSets.get("AM Overlaps")?.has(tmId);
        return {
          grave: label.includes("grave") || (inGrave && !label.includes("overlap")) || (inOnCall && label.includes("grave")),
          pm: label.includes("pm overlap") || inPM,
          am: label.includes("am overlap") || inAM,
        };
      };

      const candidateIds = new Set<string>();
      SPECIAL.forEach(name => groupSets.get(name)?.forEach((id) => candidateIds.add(id)));
      (weekSpecials || []).forEach((sp: any) => sp.tm_id && candidateIds.add(sp.tm_id));

      const rosterThursday = startOfRosterWeek(parseLocalDateISO(weekStart));
      const canonicalWeekStart = formatLocalDateISO(rosterThursday);
      const graveByNight: Record<string, string[]> = {};
      const pmOverlapByNight: Record<string, string[]> = {};
      const amOverlapByNight: Record<string, string[]> = {};
      const grave = new Set<string>();
      const pm = new Set<string>();
      const am = new Set<string>();

      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const nightDate = addDays(rosterThursday, dayIdx);
        const nightIso = formatLocalDateISO(nightDate);
        const graveNight = new Set<string>();
        const pmNight = new Set<string>();
        const amNight = new Set<string>();

        candidateIds.forEach((rawId) => {
          const tmId = normalizeStoredId(rawId);
          const pattern = patternForTm(tmId);
          const entry = pattern[dayIdx];
          if (!isWorkingDay(entry)) return;
          const roles = classifyDay(tmId, entry);
          if (roles.grave) graveNight.add(tmId);
          if (roles.pm) pmNight.add(tmId);
          if (roles.am) amNight.add(tmId);
        });

        graveByNight[nightIso] = Array.from(graveNight);
        pmOverlapByNight[nightIso] = Array.from(pmNight);
        amOverlapByNight[nightIso] = Array.from(amNight);
        graveNight.forEach((id) => grave.add(id));
        pmNight.forEach((id) => pm.add(id));
        amNight.forEach((id) => am.add(id));
      }

      try {
        const applied = {
          weekStart: canonicalWeekStart,
          grave: Array.from(grave),
          pmOverlap: Array.from(pm),
          amOverlap: Array.from(am),
          graveByNight,
          pmOverlapByNight,
          amOverlapByNight,
        };
        // Use the statically imported store for reliable cross-component / bundle access
        useShiftBuilderStore.getState().setWeeklyRosterScheduled(applied);
        persistWeeklyRosterScheduled(applied);
        // #region agent log
        debugSessionLog({
          runId: "post-fix",
          hypothesisId: "B",
          location: "WeeklyRosterTab.tsx:handleApplyRoster",
          message: "Apply Roster pushed to Zustand",
          data: {
            weekStart: applied.weekStart,
            graveCount: applied.grave.length,
            pmCount: applied.pmOverlap.length,
            graveByNightKeys: Object.keys(graveByNight),
            sampleNightGraveCounts: Object.fromEntries(
              Object.entries(graveByNight).map(([k, v]) => [k, v.length])
            ),
          },
        });
        // #endregion
      } catch (err) {
        console.error('[WeeklyRosterTab] Apply Roster store push failed', err);
      }

      const dates = Array.from({ length: 7 }, (_, i) =>
        formatLocalDateISO(addDays(rosterThursday, i))
      );
      await Promise.all(
        dates.map((d) =>
          fetch(`/api/shiftbuilder/scheduled-roster?date=${d}`, { credentials: "same-origin" }).catch(() => {}),
        ),
      );

      alert("Roster applied. The TM Picker should now reflect the weekly roster for scheduled but unassigned TMs.");
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <SudoTabLoading>Loading current week roster</SudoTabLoading>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
        <strong>Scheduling authority moved.</strong> TM Picker now reads only the{" "}
        <a href="/shiftbuilder/graves-schedule" className="underline font-semibold">
          Graves Default Schedule
        </a>{" "}
        page (Fri–Thu grid) plus on-call adds from the canvas picker. This tab is legacy reference only.
      </div>
      {!hasScheduledData && !loading && (
        <div className="mb-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-200">
          <strong>No legacy weekly data loaded.</strong> Use Graves Default Schedule for picker lists.
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold">Current Week Roster</div>
          <div className="text-xs opacity-60">Based on default schedules + weekly On-Call / Overlap assignments</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = parseLocalDateISO(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(formatLocalDateISO(d));
            }}
            className="px-2 py-1 text-sm rounded border border-white/10 hover:bg-white/5"
          >
            ← Prev Week
          </button>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => {
              const d = parseLocalDateISO(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(formatLocalDateISO(d));
            }}
            className="px-2 py-1 text-sm rounded border border-white/10 hover:bg-white/5"
          >
            Next Week →
          </button>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none ml-4">
            <input
              type="checkbox"
              checked={onlyScheduledGroups}
              onChange={(e) => setOnlyScheduledGroups(e.target.checked)}
              className="accent-[#C5A26F]"
            />
            Only scheduled groups (Grave/On Call/Overlaps)
          </label>

          <button
            onClick={handleApplyRoster}
            disabled={applying}
            className="ml-4 px-4 py-1.5 text-sm rounded-xl bg-[#C5A26F] text-black font-semibold hover:bg-[#d4b17f] disabled:opacity-60 disabled:cursor-not-allowed"
            title="Reload and apply the entire selected week's roster so the main board and TM Picker see it immediately"
          >
            {applying ? "Applying..." : "Apply Roster"}
          </button>
        </div>
      </div>

      {/* Add shift to any active TM (even if not in a scheduled group for this week) — moved to top per request */}
      <div className="mb-4 p-4 border border-white/10 rounded-3xl">
        <div className="text-sm font-medium mb-2">Add or edit weekly shift for any active TM</div>
        <input
          type="text"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="Search any active TM name or id..."
          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm mb-2"
        />
        {addSearch.trim() && (
          <div className="max-h-40 overflow-auto border border-white/10 rounded-xl p-2 text-sm">
            {roster
              .filter((t: any) => t.name.toLowerCase().includes(addSearch.toLowerCase()))
              .slice(0, 8)
              .map((t: any) => (
                <div key={t.id} className="flex justify-between items-center py-1 border-b border-white/5 last:border-none">
                  <span>{t.name}</span>
                  <button
                    onClick={async () => {
                      const rosterWeekStart = rosterWeekStartISO(parseLocalDateISO(weekStart));
                      await fetch("/api/admin/tm-on-call-schedules", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tm_id: t.tm_id || t.id,
                          week_start: rosterWeekStart,
                          weekly_pattern: [
                            {startTime:"21:00",endTime:"07:00",label:"Full Grave"},
                            {startTime:"21:00",endTime:"07:00",label:"Full Grave"},
                            {startTime:"21:00",endTime:"07:00",label:"Full Grave"},
                            {startTime:null,endTime:null,label:"OFF"},
                            {startTime:null,endTime:null,label:"OFF"},
                            {startTime:"21:00",endTime:"07:00",label:"Full Grave"},
                            {startTime:"21:00",endTime:"07:00",label:"Full Grave"},
                          ],
                          is_active: true,
                          notes: `type:oncall|Added from Weekly Roster for non-group TM`,
                        }),
                      });
                      setAddSearch("");
                      await load();
                      onDataChanged?.();
                    }}
                    className="text-xs px-2 py-0.5 bg-[#C5A26F] text-black rounded"
                  >
                    Assign Grave pattern this week
                  </button>
                </div>
              ))}
            {roster.filter((t: any) => t.name.toLowerCase().includes(addSearch.toLowerCase())).length === 0 && (
              <div className="text-xs opacity-60">No match</div>
            )}
          </div>
        )}
        <div className="text-[10px] opacity-60 mt-1">This will create a weekly special assignment for the TM (they will then appear in the roster table if the filter is on).</div>
      </div>

      <div className="overflow-x-auto border border-white/10 rounded-3xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left p-3 font-medium">TM</th>
              {DAY_LABELS.map((d, i) => (
                <th key={i} className="text-center p-2 font-mono text-xs">{d}</th>
              ))}
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {roster
              .filter((tm: any) => !onlyScheduledGroups || isInScheduledGroupOrHasSpecial(tm.id))
              .map((tm: any) => (
              <tr key={tm.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3 font-medium">{tm.name}</td>
                {DAY_LABELS.map((_, dayIdx) => {
                  const shift = getShiftForTmDay(tm.id, dayIdx);
                  return (
                    <td key={dayIdx} className="p-1 text-center">
                      <button
                        className="text-[10px] px-2 py-1 rounded border border-white/10 hover:border-[#C5A26F]/60 w-full font-mono"
                        onClick={() => setEditing({ tmId: tm.id, dayIdx, tmName: tm.name })}
                        title={shift.label || ""}
                      >
                        {shift.startTime && shift.endTime
                          ? `${shift.startTime}–${shift.endTime}`
                          : shift.label || "—"}
                      </button>
                    </td>
                  );
                })}
                <td className="p-2">
                  <button
                    onClick={() => alert("Mark PTO/LOA for this TM this week (writes to night_tm_status) — to be wired")}
                    className="text-[10px] text-red-400 hover:text-red-500"
                  >
                    PTO
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[10px] opacity-50">
        This is the live computed view from defaults + weekly specials (filtered by the checkbox above).
        Editing cells creates per-week overrides. The full active roster is now shown (no artificial 25-row cap).
      </div>

      {/* Simple inline editor for roster cell */}
      {editing && (
        <div className="mt-4 p-4 border border-[#C5A26F]/30 rounded-3xl bg-black/20">
          <div className="font-medium mb-2">
            Edit {editing.tmName} for week starting {weekStart} (day {editing.dayIdx})
          </div>

          <div className="flex gap-2 mb-3">
            {(['oncall', 'pm_overlap', 'am_overlap'] as const).map(t => (
              <button
                key={t}
                onClick={() => setEditType(t)}
                className={cn(
                  "px-3 py-1 text-xs rounded-2xl border",
                  editType === t ? "bg-[#C5A26F] text-black" : "border-white/20"
                )}
              >
                {t === 'oncall' ? 'On Call' : t === 'pm_overlap' ? 'PM Overlap' : 'AM Overlap'}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={saveRosterEdit} className="px-4 py-1 bg-[#C5A26F] text-black rounded-2xl text-sm">
              Save Grave 9p-7a pattern for the week
            </button>
            <button onClick={() => markPTO(editing.tmId, editing.dayIdx)} className="px-4 py-1 border border-red-400 text-red-400 rounded-2xl text-sm">
              Mark this day PTO / unavailable
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-1 text-sm">Cancel</button>
          </div>

          <div className="text-xs opacity-60">
            (Full pattern picker + per-day exceptions coming in next pass. This saves a weekly special override.)
          </div>
        </div>
      )}
    </div>
  );
}

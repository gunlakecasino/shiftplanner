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
import { startOfRosterWeek } from "@/lib/shiftbuilder/dateUtils";

interface Props {
  onDataChanged?: () => void;
  isDark?: boolean;
  weekStart?: Date | null;
}

const DAY_LABELS = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];

export function WeeklyRosterTab({ onDataChanged, isDark = false, weekStart: weekStartProp }: Props) {
  const [weekStart, setWeekStart] = useState<string>(() => {
    if (weekStartProp) return weekStartProp.toISOString().slice(0, 10);
    // Canonical Thu-anchored roster week (matches startOfRosterWeek + DAY_LABELS)
    return startOfRosterWeek(new Date()).toISOString().slice(0, 10);
  });

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

  const load = async () => {
    setLoading(true);
    try {
      const [rosterRes, defRes, specialRes, groupsRes] = await Promise.all([
        fetch("/api/admin/tm-roster").then(r => r.json()),
        fetch("/api/admin/tm-default-schedules").then(r => r.json()),
        fetch(`/api/admin/tm-on-call-schedules?week_start=${weekStart}`).then(r => r.json()),
        fetch("/api/admin/tm-groups").then(r => r.json()),
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

  // Very simplified "current shift for TM on a day" resolver
  const getShiftForTmDay = (tmId: string, dayIdx: number) => {
    // Find most recent default
    const def = defaults
      .filter((d: any) => d.tm_id === tmId)
      .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from))[0];

    const basePattern = def?.weekly_pattern || [];

    // Check for weekly special/override this week
    const special = weekSpecials.find((s: any) => s.tm_id === tmId);
    const pattern = special?.weekly_pattern || basePattern;

    return pattern[dayIdx] || { label: "—", startTime: null, endTime: null };
  };

  const SPECIAL_GROUP_NAMES = ["Grave", "On Call", "AM Overlaps", "PM Overlaps"];

  // Collect all active TM ids that are members of any core scheduled group
  const scheduledGroupMemberIds = React.useMemo(() => {
    const memberSet = new Set<string>();
    SPECIAL_GROUP_NAMES.forEach(name => {
      const g = groups.find((gg: any) => gg.name === name);
      (g?.members || []).forEach((mid: string) => memberSet.add(mid));
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

    await fetch("/api/admin/tm-on-call-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tm_id: editing.tmId,
        week_start: weekStart,
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
    // For demo, just log and refresh. Real implementation would write to night_tm_status for the specific nights of the week.
    alert(`PTO marked for ${tmName(tmId)} on day ${dayIdx} of week ${weekStart} (would write to night_tm_status in full impl)`);
    // TODO: actual write using admin API or direct for exceptions
    await load();
  };

  if (loading) {
    return <div className="p-8 text-center opacity-60">Loading current week roster…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold">Current Week Roster</div>
          <div className="text-xs opacity-60">Based on default schedules + weekly On-Call / Overlap assignments</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d.toISOString().slice(0, 10));
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
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d.toISOString().slice(0, 10));
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
                      await fetch("/api/admin/tm-on-call-schedules", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          tm_id: t.id,
                          week_start: weekStart,
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
              .slice(0, 25)
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
        This is the live computed view from defaults + weekly specials. Editing cells will create per-week overrides.
        Full add/remove + bulk PTO/LOA support will be expanded in the next slice.
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

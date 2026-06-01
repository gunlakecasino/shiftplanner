"use client";

/**
 * TMDefaultsTab — Sudo surface for the new static TM schedule system.
 *
 * Replaces the old ADP "Schedules" tab entirely.
 *
 * Three sections (switchable):
 *  1. Weekly Defaults — per-TM repeating 7-day patterns + effective_from dates
 *  2. Groups — tm_groups + membership (Grave group is the primary one)
 *  3. On-Call — per-week overrides using tm_on_call_schedules
 *
 * All data comes from the new canonical tables (tm_default_schedules etc.)
 * that were populated from the Graves Initial TM Schedule.csv.
 */

import React, { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import type {
  WeeklyPattern,
  WeeklyShift,
  TMDefaultSchedule,
  TMGroup,
  TMOnCallSchedule,
} from "@/lib/shiftbuilder/types/schedules";
import { startOfRosterWeek } from "@/lib/shiftbuilder/dateUtils";

interface Props {
  onDataChanged?: () => void;
  isDark?: boolean;
  currentOperator?: { full_name?: string } | null;
  weekStart?: Date | null;
}

type SubView = "defaults" | "groups" | "oncall";

type WeeklyAssignmentType = "oncall" | "am_overlap" | "pm_overlap";

interface RosterTM {
  id: string;
  name: string;
  pool?: string | null;
  gender?: string | null;
}

const DAY_LABELS = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]; // Grave week convention (adjust if needed)

/** Defensive normalizer so native <input type="time"> never receives a value
 *  that doesn't strictly match the "HH:MM" pattern the browser expects.
 *  This was causing "The string did not match the expected pattern." on some
 *  imported rows or preset switches.
 */
function toTimeInputValue(v: string | null | undefined): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = m[1].padStart(2, "0");
  return `${h}:${m[2]}`;
}

function toDateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const PRESETS: { label: string; pattern: WeeklyShift[] }[] = [
  { label: "OFF", pattern: Array(7).fill({ startTime: null, endTime: null, label: "OFF" }) },
  {
    label: "Grave 9p-7a",
    pattern: Array(7).fill({ startTime: "21:00", endTime: "07:00", label: "Full Grave 9p-7a" }),
  },
  {
    label: "PM Overlap 11p-7a",
    pattern: Array(7).fill({ startTime: "23:00", endTime: "07:00", label: "PM Overlap 11p-7a" }),
  },
];

export function TMDefaultsTab({ onDataChanged, isDark = false, currentOperator, weekStart }: Props) {
  const [subView, setSubView] = useState<SubView>("defaults");

  // Data
  const [defaults, setDefaults] = useState<TMDefaultSchedule[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [onCalls, setOnCalls] = useState<TMOnCallSchedule[]>([]);
  const [roster, setRoster] = useState<RosterTM[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor state for Defaults
  const [selectedTmId, setSelectedTmId] = useState<string | null>(null);
  const [editingPattern, setEditingPattern] = useState<WeeklyPattern | null>(null);
  // Default the Effective From to the start of the passed roster week if available,
  // otherwise today. This makes "mark OFF for this week" actually take effect
  // immediately for the weeks the user is managing in the board.
  const initialEffectiveFrom = React.useMemo(() => {
    if (weekStart) {
      // weekStart is the Thursday of the roster week
      return weekStart.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }, [weekStart]);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(initialEffectiveFrom);
  const [notes, setNotes] = useState("");

  // Keep effectiveFrom in sync if the parent passes a different week context
  React.useEffect(() => {
    if (weekStart) {
      const weekStartIso = weekStart.toISOString().slice(0, 10);
      setEffectiveFrom(weekStartIso);
    }
  }, [weekStart]);

  // Groups editor
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Weekly Special Assignments (On-Call + AM/PM Overlaps)
  const [onCallWeek, setOnCallWeek] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 3) % 7));
    return d.toISOString().slice(0, 10);
  });
  const [assignmentType, setAssignmentType] = useState<WeeklyAssignmentType>("oncall");

  // Always-present safe versions for controlled inputs (prevents the browser ever seeing a bad string)
  const safeEffectiveFrom = toDateInputValue(effectiveFrom);
  const safeOnCallWeek = toDateInputValue(onCallWeek);

  // Safe pattern for the 7-day editor grid (defensive against any raw DB data)
  const safeEditingPattern = React.useMemo(() => {
    if (!editingPattern) return null;
    return editingPattern.map(s => ({
      startTime: toTimeInputValue(s.startTime),
      endTime: toTimeInputValue(s.endTime),
      label: s.label || "",
    }));
  }, [editingPattern]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [defRes, groupRes, onCallRes, rosterRes] = await Promise.all([
        fetch("/api/admin/tm-default-schedules").then(r => r.json()),
        fetch("/api/admin/tm-groups").then(r => r.json()),
        fetch("/api/admin/tm-on-call-schedules").then(r => r.json()),
        fetch("/api/admin/tm-roster").then(r => r.json()),
      ]);

      if (defRes.error) throw new Error(defRes.error);
      if (groupRes.error) throw new Error(groupRes.error);
      if (onCallRes.error) throw new Error(onCallRes.error);
      if (rosterRes.error) throw new Error(rosterRes.error);

      setDefaults(defRes.data || []);
      setGroups(groupRes.data || []);
      setOnCalls(onCallRes.data || []);
      setRoster(rosterRes.data || []);
    } catch (e: any) {
      // Give a clearer message when the admin routes are missing the service role key
      const msg = e.message || "Failed to load";
      if (msg.includes('service role key') || msg.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        setError(
          "Admin endpoints are not configured. " +
          "Add SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) to your .env.local and restart the dev server."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ========== DEFAULTS EDITOR ==========
  const openDefaultEditor = (tmId: string, existing?: TMDefaultSchedule) => {
    setSelectedTmId(tmId);
    if (existing) {
      // Normalize on load so the controlled time inputs never see a bad string
      const normalized = (existing.weekly_pattern || []).map((s: any) => ({
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
        label: s.label ?? "",
      })) as WeeklyPattern;
      setEditingPattern(normalized);
      setEffectiveFrom(existing.effective_from);
      setNotes(existing.notes || "");
    } else {
      // Start with a sensible default (OFF everywhere or Grave)
      setEditingPattern(PRESETS[1].pattern);
      setEffectiveFrom(new Date().toISOString().slice(0, 10));
      setNotes("Imported / manual");
    }
  };

  const saveDefault = async () => {
    if (!selectedTmId || !editingPattern) return;

    try {
      // 1. Save the rolling default (as before)
      const defaultRes = await fetch("/api/admin/tm-default-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tm_id: selectedTmId,
          effective_from: effectiveFrom,
          weekly_pattern: editingPattern,
          source: "sudo-tm-defaults",
          notes,
        }),
      });
      const defaultJson = await defaultRes.json();
      if (defaultJson.error) throw new Error(defaultJson.error);

      // 2. If we have a specific roster week context (from Sudo), also write
      //    this exact pattern as a weekly special/override for that week.
      //    We *always* normalize to the canonical roster Thursday using startOfRosterWeek
      //    so that the lookup in getScheduledTmIdsForNightFromNewRoster (which does the
      //    exact same computation on the night date) will always find the special we just wrote.
      //    This is the key to making "mark OFF in defaults while a week is selected" actually
      //    remove the TM from the board picker for days in that week.
      if (weekStart) {
        const rosterThursday = startOfRosterWeek(weekStart);
        const weekStartIso = rosterThursday.toISOString().slice(0, 10);
        await fetch("/api/admin/tm-on-call-schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tm_id: selectedTmId,
            week_start: weekStartIso,
            weekly_pattern: editingPattern,
            is_active: true,
            notes: notes || "From Weekly Defaults edit",
          }),
        }).catch(() => {}); // best effort
      }

      await loadAll();
      setSelectedTmId(null);
      setEditingPattern(null);
      onDataChanged?.();
    } catch (e: any) {
      alert("Save failed: " + e.message);
    }
  };

  const deleteDefault = async (id: string) => {
    if (!confirm("Delete this default schedule entry?")) return;
    // Simple delete via direct (or extend API later). For now use service in a tiny call if needed.
    // For this version we just refresh after manual delete in DB or implement later.
    alert("Delete via direct DB or extend the API route. For now refreshing list.");
    await loadAll();
  };

  // ========== GROUPS (generalized for Grave + special weekly groups) ==========
  const SPECIAL_GROUPS = ["Grave", "On Call", "AM Overlaps", "PM Overlaps"];

  const getGroupByName = (name: string) => groups.find((g: any) => g.name === name);

  // All TMs that belong to any of the scheduled groups (so we can assign static defaults to them)
  const scheduledGroupTMs = React.useMemo(() => {
    const ids = new Set<string>();
    SPECIAL_GROUPS.forEach(name => {
      const g = getGroupByName(name);
      (g?.members || []).forEach((mid: string) => ids.add(mid));
    });
    // Robust matching: group members store UUIDs (from tm_profiles.id),
    // while roster items expose both short tm_id as .id and the UUID as .profileId.
    // This fixes the "defaults showing no TM" after importing schedules + group membership.
    return roster.filter((r: any) => ids.has(r.profileId) || ids.has(r.id));
  }, [groups, roster]);

  const addToGroup = async (groupName: string, tmId: string) => {
    const grp = getGroupByName(groupName);
    if (!grp) return alert(`${groupName} group not found (create it first if needed)`);
    await fetch("/api/admin/tm-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_member", group_id: grp.id, tm_id: tmId }),
    });
    await loadAll();
  };

  const removeFromGroup = async (groupName: string, tmId: string) => {
    const grp = getGroupByName(groupName);
    if (!grp) return;
    await fetch("/api/admin/tm-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_member", group_id: grp.id, tm_id: tmId }),
    });
    await loadAll();
  };

  // ========== WEEKLY SPECIALS (On-Call / AM Overlaps / PM Overlaps) ==========
  const saveWeeklyAssignment = async (tmId: string, pattern: WeeklyPattern, type: WeeklyAssignmentType) => {
    // For now we reuse the on-call table. We encode the type in notes so the UI can filter correctly.
    // In a follow-up we can add a proper `assignment_type` column.
    const typeLabel = type === "am_overlap" ? "AM Overlap" : type === "pm_overlap" ? "PM Overlap" : "On Call";
    await fetch("/api/admin/tm-on-call-schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tm_id: tmId,
        week_start: onCallWeek,
        weekly_pattern: pattern,
        is_active: true,
        notes: `type:${type}|${typeLabel}`,
      }),
    });
    await loadAll();
  };

  // Helper: get current default for a TM (most recent effective)
  const getCurrentDefault = (tmId: string) => {
    return defaults
      .filter((d) => d.tm_id === tmId)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  };

  const tmName = (id: string) => roster.find((r) => r.id === id)?.name || id;

  if (loading) {
    return <div className="p-8 text-center opacity-60">Loading TM schedule system…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold tracking-[-0.2px]">TM Default Schedules</div>
          <div className="text-[11px] opacity-60">Static weekly patterns • Groups • Per-week On-Call overrides</div>
        </div>
        <button
          onClick={loadAll}
          className="text-xs px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-red-400 text-sm">Error: {error}</div>}

      {/* Sub navigation */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {(["defaults", "groups", "oncall"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setSubView(v)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-2xl transition",
              subView === v
                ? "bg-[#C5A26F] text-black font-medium"
                : "hover:bg-white/5 text-[#C5A26F] border border-[#C5A26F]/30"
            )}
          >
            {v === "defaults" && "Weekly Defaults"}
            {v === "groups" && "Groups"}
            {v === "oncall" && "On-Call (per week)"}
          </button>
        ))}
      </div>

      {/* ========== WEEKLY DEFAULTS ========== */}
      {subView === "defaults" && (
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-widest opacity-60">
            Static repeating weekly shifts for Grave + On Call / AM &amp; PM Overlap groups. 
            Search below includes all TMs in these groups (use the Groups tab to manage membership).
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* List - now shows all TMs in scheduled groups (Grave + Overlaps + On Call) so you can assign static defaults to them */}
            <div className="border border-white/10 rounded-3xl p-4 max-h-[520px] overflow-auto">
              <div className="text-sm font-medium mb-3">TMs in Scheduled Groups ({scheduledGroupTMs.length}) — assign or edit their repeating weekly default here</div>
              {scheduledGroupTMs.length === 0 && <div className="text-xs opacity-60">No TMs in the special groups yet. Add them in the Groups tab or Team drawer.</div>}

              {scheduledGroupTMs
                .map((tm: any) => {
                  // Find if they already have a default
                  const existing = defaults
                    .filter((d: any) => d.tm_id === tm.id)
                    .sort((a: any, b: any) => b.effective_from.localeCompare(a.effective_from))[0];

                  return (
                    <div
                      key={tm.id}
                      className="flex items-center justify-between py-2 px-3 mb-1 rounded-2xl hover:bg-white/5 text-sm"
                    >
                      <div>
                        <span className="font-medium">{tm.name}</span>
                        {existing && (
                          <span className="ml-2 text-[10px] opacity-50">{existing.effective_from}</span>
                        )}
                        {!existing && (
                          <span className="ml-2 text-[10px] text-amber-400">No default yet</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openDefaultEditor(tm.id, existing)}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                        >
                          {existing ? "Edit" : "Assign"}
                        </button>
                        {existing && (
                          <button
                            onClick={() => deleteDefault(existing.id)}
                            className="text-xs px-2 py-0.5 rounded text-red-400 hover:bg-red-500/10"
                          >
                            Del
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Editor */}
            <div className="border border-white/10 rounded-3xl p-4">
              {!selectedTmId ? (
                <div className="text-sm opacity-60 py-8 text-center">
                  Select a TM from the list or add a new default entry.
                  <div className="mt-4">
                    <input
                      type="text"
                      placeholder="Search TM name or tm_id (shows group membership)…"
                      className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 w-full text-sm"
                      onChange={(e) => {
                        const match = roster.find((r) => r.name.toLowerCase().includes(e.target.value.toLowerCase()));
                        if (match) openDefaultEditor(match.id);
                      }}
                    />
                    <div className="text-[10px] opacity-60 mt-1">
                      TMs in special groups (On Call / AM/PM Overlaps) can have their own static default shifts here, just like Grave.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="font-medium">
                    Editing static default for {tmName(selectedTmId)}
                    {SPECIAL_GROUPS.filter(gn => {
                      const g = groups.find(gg => gg.name === gn);
                      return g?.members?.includes(selectedTmId);
                    }).map(gn => (
                      <span key={gn} className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-white/10">{gn}</span>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs opacity-60 block mb-1">Effective From</label>
                    <input
                      type="date"
                      value={safeEffectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm w-full"
                    />
                  </div>

                  <div>
                    <label className="text-xs opacity-60 block mb-1">Weekly Pattern (Grave week order)</label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {(safeEditingPattern || []).map((shift, idx) => {
                        const isOff = shift.label === "OFF" || (!shift.startTime && !shift.endTime);
                        return (
                          <div
                            key={idx}
                            className={`border rounded-2xl p-2 text-center text-[10px] transition-colors ${
                              isOff
                                ? "border-red-500/60 bg-red-950/30"
                                : "border-white/10"
                            }`}
                          >
                            <div className="font-mono mb-1 text-[#C5A26F]">{DAY_LABELS[idx]}</div>
                            <div className="space-y-1">
                              <input
                                type="time"
                                value={toTimeInputValue(shift.startTime)}
                                onChange={(e) => {
                                  const next = [...(editingPattern || [])];
                                  const newStart = e.target.value || null;
                                  // Typing a time automatically un-marks OFF and sets a working label
                                  const newLabel = newStart
                                    ? (next[idx]?.label === "OFF" ? "Custom" : (next[idx]?.label || "Custom"))
                                    : "OFF";
                                  next[idx] = {
                                    ...next[idx],
                                    startTime: newStart,
                                    endTime: newStart ? (next[idx]?.endTime ?? null) : null,
                                    label: newLabel,
                                  };
                                  setEditingPattern(next as WeeklyPattern);
                                }}
                                className="bg-black/40 text-xs w-full"
                              />
                              <input
                                type="time"
                                value={toTimeInputValue(shift.endTime)}
                                onChange={(e) => {
                                  const next = [...(editingPattern || [])];
                                  const newEnd = e.target.value || null;
                                  const current = next[idx] || {};
                                  // If we were OFF and now setting an end time, un-OFF it
                                  const newLabel = (current.startTime || newEnd)
                                    ? (current.label === "OFF" ? "Custom" : (current.label || "Custom"))
                                    : "OFF";
                                  next[idx] = {
                                    ...current,
                                    endTime: newEnd,
                                    label: newLabel,
                                  };
                                  setEditingPattern(next as WeeklyPattern);
                                }}
                                className="bg-black/40 text-xs w-full"
                              />

                              <div className="flex items-center justify-between gap-1 mt-1">
                                <div className={`text-[9px] truncate flex-1 text-left ${isOff ? "text-red-400 font-medium" : "opacity-70"}`}>
                                  {isOff ? "OFF" : (shift.label || "—")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...(editingPattern || [])];
                                    if (isOff) {
                                      // Un-mark OFF — set a sensible default shift or leave blank for user to fill
                                      next[idx] = {
                                        startTime: "21:00", // common default, user can change
                                        endTime: "07:00",
                                        label: "Custom",
                                      };
                                    } else {
                                      next[idx] = { startTime: null, endTime: null, label: "OFF" };
                                    }
                                    setEditingPattern(next as WeeklyPattern);
                                  }}
                                  className={`text-[8px] px-1.5 py-0 rounded border transition-colors ${
                                    isOff
                                      ? "border-green-500/60 bg-green-900/30 text-green-300 hover:bg-green-900/50"
                                      : "border-red-500/40 hover:bg-red-950/40 text-red-300"
                                  }`}
                                  title={isOff ? "Mark this day as working and set a shift time" : "Mark this day as OFF (no shift)"}
                                >
                                  {isOff ? "Set Working" : "OFF"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    {PRESETS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setEditingPattern(p.pattern)}
                        className="text-xs px-3 py-1 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10"
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const offPattern = Array.from({ length: 7 }, () => ({
                          startTime: null,
                          endTime: null,
                          label: "OFF" as const,
                        }));
                        setEditingPattern(offPattern);
                      }}
                      className="text-xs px-2.5 py-1 rounded-2xl border border-red-500/50 text-red-300 hover:bg-red-950/40"
                      title="Mark the entire weekly default as OFF (no shifts any day)"
                    >
                      All OFF
                    </button>
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full bg-black/30 border border-white/10 rounded-2xl p-3 text-sm h-16"
                  />

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={saveDefault}
                      className="flex-1 py-2 rounded-2xl bg-[#C5A26F] text-black font-medium text-sm"
                    >
                      Save Default
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTmId(null);
                        setEditingPattern(null);
                      }}
                      className="px-6 py-2 rounded-2xl border border-white/20 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== GROUPS ========== */}
      {subView === "groups" && (
        <div>
          <div className="mb-3 text-sm font-medium">
            Groups ({groups.length}) — These groups (Grave + On Call / AM/PM Overlaps) are used in the default scheduler for assigning static repeating weekly shifts.
          </div>

          {groups.map((g: any) => {
            const isSpecial = SPECIAL_GROUPS.includes(g.name);
            return (
              <div key={g.id} className="mb-6 border border-white/10 rounded-3xl p-5">
                <div className="flex items-center gap-3">
                  <div className="font-semibold text-lg" style={{ color: g.color || "#C5A26F" }}>{g.name}</div>
                  <div className="text-xs opacity-60">{g.description}</div>
                  <div className="ml-auto text-xs px-2 py-px rounded bg-white/5">{g.members?.length || 0} members</div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                  {g.members?.map((mid: string) => (
                    <div key={mid} className="flex items-center justify-between bg-white/5 rounded-2xl px-3 py-1.5">
                      <span>{tmName(mid)}</span>
                      <button 
                        onClick={() => removeFromGroup(g.name, mid)} 
                        className="text-red-400 text-xs hover:text-red-500"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                {isSpecial && (
                  <div className="mt-4">
                    <div className="text-xs opacity-60 mb-1">Add active TM to {g.name} group (for static default shifts)</div>
                    <div className="flex flex-wrap gap-2">
                      {roster
                        .filter((r) => !g.members?.includes(r.id))
                        .slice(0, 12)
                        .map((r) => (
                          <button
                            key={r.id}
                            onClick={() => addToGroup(g.name, r.id)}
                            className="text-xs px-3 py-1 bg-white/5 hover:bg-white/10 rounded-2xl"
                          >
                            + {r.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========== WEEKLY SPECIALS: On-Call + AM/PM Overlaps ========== */}
      {subView === "oncall" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div>Week starting</div>
            <input
              type="date"
              value={safeOnCallWeek}
              onChange={(e) => setOnCallWeek(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-sm"
            />
            <div className="text-xs opacity-60">(per-week overrides on top of default schedules)</div>
          </div>

          {/* Type selector */}
          <div className="flex gap-2 mb-4">
            {([
              { key: "oncall", label: "On Call", color: "#C5A26F" },
              { key: "pm_overlap", label: "PM Overlaps", color: "#AF52DE" },
              { key: "am_overlap", label: "AM Overlaps", color: "#34C759" },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setAssignmentType(t.key as WeeklyAssignmentType)}
                className={cn(
                  "px-4 py-1.5 rounded-2xl text-sm font-medium border transition",
                  assignmentType === t.key
                    ? "bg-white/10 border-white/30"
                    : "border-white/10 hover:bg-white/5"
                )}
                style={{ color: assignmentType === t.key ? t.color : undefined }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-sm mb-2 opacity-70">
            Current {assignmentType === "oncall" ? "On-Call" : assignmentType === "pm_overlap" ? "PM Overlap" : "AM Overlap"} assignments for this week
            ({onCalls.filter(o => o.week_start === onCallWeek && (o.notes || "").includes(`type:${assignmentType}`)).length})
          </div>

          <div className="space-y-2">
            {onCalls
              .filter((o) => o.week_start === onCallWeek && (o.notes || "").includes(`type:${assignmentType}`))
              .map((oc) => (
                <div key={oc.id} className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-2 text-sm">
                  <div className="font-medium w-48">{tmName(oc.tm_id)}</div>
                  <div className="text-xs opacity-60 flex-1 truncate">
                    {oc.weekly_pattern?.[0]?.label || "custom pattern"}
                  </div>
                </div>
              ))}

            {onCalls.filter((o) => o.week_start === onCallWeek && (o.notes || "").includes(`type:${assignmentType}`)).length === 0 && (
              <div className="text-xs opacity-60 py-4">No {assignmentType.replace("_", " ")} assignments for this week yet.</div>
            )}
          </div>

          <div className="mt-6 text-xs opacity-60">Quick-assign for this week (full editor coming in the Weekly Roster tab):</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {roster.slice(0, 12).map((r) => (
              <button
                key={r.id}
                onClick={() => saveWeeklyAssignment(r.id, PRESETS[assignmentType === "oncall" ? 1 : 2].pattern, assignmentType)}
                className="text-xs px-3 py-1 rounded-2xl border hover:bg-white/10"
                style={{ borderColor: assignmentType === "oncall" ? "#C5A26F" : assignmentType === "pm_overlap" ? "#AF52DE" : "#34C759" }}
              >
                + {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] opacity-40 pt-4 border-t border-white/10">
        All changes are effective-dated or week-specific. Night-by-night exceptions continue to live in night_tm_status.
        Data source: tm_default_schedules + tm_groups + tm_on_call_schedules.
      </div>
    </div>
  );
}

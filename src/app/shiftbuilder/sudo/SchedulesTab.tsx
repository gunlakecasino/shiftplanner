"use client";

/**
 * Schedules tab — the list-and-preview admin surface for uploaded ADP
 * exports stored in the `schedules` Supabase Storage bucket.
 *
 * Default view: list of every weeks row with a schedule_path, joined to
 * storage metadata + applied-row counts. Operator can View / Apply /
 * Unapply / Delete each one, or upload a new schedule.
 *
 * Preview view: parses the selected XLSX, overlays existing call_offs as
 * strike-throughs, and lets the operator click cells to add/remove call-offs
 * (call_offs are the model for "this scheduled person isn't actually
 * coming in" — same table the `remove <TM> from <date>` command writes to).
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  parseADPScheduleFile,
  parseWorkbook,
  parseWorkbookAggregate,
  buildNightStatusUpserts,
  resolveDisplayName,
  type ParsedSchedule,
} from "@/lib/shiftbuilder/adpSchedule";
import { getGraveAvailableTeamMembers, getActiveTeamMembers } from "@/lib/shiftbuilder/data";
import {
  listSchedules,
  downloadScheduleFile,
  upsertNightTmStatusBatch,
  unapplyScheduleForDates,
  deleteSchedule,
  uploadScheduleFile,
  linkScheduleToWeek,
  type ScheduleRecord,
} from "@/lib/shiftbuilder/sudoActions";
import {
  getCallOffsForDateRange,
  removeTMFromSchedule,
  undoRemoveFromSchedule,
} from "@/lib/shiftbuilder/tmCommands";
import * as XLSX from "xlsx";

type View = "list" | "preview";

interface PreviewState {
  record: ScheduleRecord;
  parsed: ParsedSchedule | null;
  callOffSet: Set<string>; // `${tmId}|${iso}`
  loading: boolean;
  error: string | null;
  /** Full grave roster, used by the debug summary to surface TMs missing from this schedule. */
  graveRoster: Array<{ id: string; name: string }>;
  /** tm_id → Display Name (the canonical name we show everywhere in the app). */
  displayNameById: Map<string, string>;
  /** tm_id → Full Name (fallback when Display Name is empty). */
  fullNameById: Map<string, string>;
}

/**
 * Build the two name lookups from an active+grave roster union.
 * Display Name preferred; Full Name as fallback. Both Maps store the
 * normalized (trimmed) value so consumers can just look up by tm_id.
 */
function buildNameLookups(
  rosters: Array<{ id: string; name?: string | null; fullName?: string | null }[]>
): { displayNameById: Map<string, string>; fullNameById: Map<string, string> } {
  const displayNameById = new Map<string, string>();
  const fullNameById = new Map<string, string>();
  for (const arr of rosters) {
    for (const t of arr) {
      const display = (t.name ?? "").trim();
      const full = (t.fullName ?? "").trim();
      if (display) displayNameById.set(t.id, display);
      if (full) fullNameById.set(t.id, full);
    }
  }
  return { displayNameById, fullNameById };
}

export interface SchedulesTabProps {
  onDataChanged?: () => void;
}

export function SchedulesTab({ onDataChanged }: SchedulesTabProps = {}) {
  const [view, setView] = React.useState<View>("list");
  const [schedules, setSchedules] = React.useState<ScheduleRecord[] | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<PreviewState | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null); // weekId currently running an action
  const [statusToast, setStatusToast] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const refreshList = React.useCallback(async () => {
    setListError(null);
    try {
      const rows = await listSchedules();
      setSchedules(rows);
    } catch (err) {
      console.error(err);
      setListError(err instanceof Error ? err.message : String(err));
      setSchedules([]);
    }
  }, []);

  React.useEffect(() => {
    refreshList();
  }, [refreshList]);

  const flashToast = (kind: "ok" | "err", msg: string) => {
    setStatusToast({ kind, msg });
    setTimeout(() => setStatusToast(null), 5000);
  };

  const handleView = async (record: ScheduleRecord) => {
    setPreview({
      record,
      parsed: null,
      callOffSet: new Set(),
      loading: true,
      error: null,
      graveRoster: [],
      displayNameById: new Map(),
      fullNameById: new Map(),
    });
    setView("preview");
    try {
      // Download + parse
      const [buffer, grave, active] = await Promise.all([
        downloadScheduleFile(record.schedulePath),
        getGraveAvailableTeamMembers(),
        getActiveTeamMembers(),
      ]);
      const byId = new Map(active.map((t) => [t.id, t]));
      grave.forEach((t) => byId.set(t.id, t));
      const roster = Array.from(byId.values());

      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      // Aggregate parse: pulls Days/Swings/Graves and tags each row.
      const parsed = parseWorkbookAggregate(wb, record.schedulePath, roster);

      // Overlay call-offs for any dates in the parsed range
      const isoDates = parsed.dateColumns.map((c) => c.iso);
      const callOffSet = await getCallOffsForDateRange(isoDates);

      // Build the Full Name → Display Name lookup layer once per preview load.
      const { displayNameById, fullNameById } = buildNameLookups([active as any, grave as any]);

      const graveRosterCompact = grave.map((t) => ({
        id: t.id,
        name: t.name || (t as any).fullName || t.id,
      }));

      setPreview({
        record,
        parsed,
        callOffSet,
        loading: false,
        error: null,
        graveRoster: graveRosterCompact,
        displayNameById,
        fullNameById,
      });
    } catch (err) {
      console.error(err);
      setPreview((p) =>
        p ? { ...p, loading: false, error: err instanceof Error ? err.message : String(err) } : null
      );
    }
  };

  const handleApply = async (record: ScheduleRecord, parsed: ParsedSchedule) => {
    setBusy(record.weekId);
    try {
      // Build lookups: gravePool (for the sheet filter) AND display name
      // (so night_tm_status.tm_name stores the Display Name we use
      // everywhere, not the Full Name from the ADP cell).
      const [grave, active] = await Promise.all([
        getGraveAvailableTeamMembers(),
        getActiveTeamMembers(),
      ]);
      const gravePoolById = new Map<string, string | null | undefined>();
      active.forEach((t) => gravePoolById.set(t.id, (t as any).gravePool ?? null));
      grave.forEach((t) => gravePoolById.set(t.id, (t as any).gravePool ?? null));
      const { displayNameById, fullNameById } = buildNameLookups([active as any, grave as any]);
      const upserts = buildNightStatusUpserts(parsed, gravePoolById, displayNameById, fullNameById);
      const result = await upsertNightTmStatusBatch(upserts);
      flashToast(
        "ok",
        `Applied — wrote ${result.written} per-night row${result.written === 1 ? "" : "s"}.${
          result.missingNights > 0
            ? ` ${result.missingNights} date(s) had no matching nights row.`
            : ""
        }`
      );
      await refreshList();
      onDataChanged?.();
    } catch (err) {
      flashToast("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleUnapply = async (record: ScheduleRecord) => {
    setBusy(record.weekId);
    try {
      // Fetch the date range for this week via the parsed schedule, OR
      // — simpler — compute it inline by querying nights for this week_id.
      // We have appliedRowCount in the record but not the dates. Reload by
      // parsing the file (cheap) OR query nights directly. Parse is more
      // truthful (matches what we'd Apply).
      if (!preview || preview.record.weekId !== record.weekId || !preview.parsed) {
        // For list-row triggered Unapply, we need the parsed dates. Easiest
        // path: download + parse here too.
        const buffer = await downloadScheduleFile(record.schedulePath);
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const parsed = parseWorkbook(wb, record.schedulePath, []);
        const dates = parsed.dateColumns.map((c) => c.iso);
        const result = await unapplyScheduleForDates(dates);
        flashToast("ok", `Unapplied — removed ${result.deleted} per-night row${result.deleted === 1 ? "" : "s"}.`);
      } else {
        const dates = preview.parsed.dateColumns.map((c) => c.iso);
        const result = await unapplyScheduleForDates(dates);
        flashToast("ok", `Unapplied — removed ${result.deleted} per-night row${result.deleted === 1 ? "" : "s"}.`);
      }
      await refreshList();
      onDataChanged?.();
    } catch (err) {
      flashToast("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (record: ScheduleRecord) => {
    if (!window.confirm(
      `Delete "${record.schedulePath}"?\n\nThis removes the file from storage, clears weeks.schedule_path, and unapplies night_tm_status for this week. Cannot be undone.`
    )) {
      return;
    }
    setBusy(record.weekId);
    try {
      await deleteSchedule({ weekId: record.weekId, schedulePath: record.schedulePath });
      flashToast("ok", `Deleted ${record.schedulePath}.`);
      if (preview?.record.weekId === record.weekId) {
        setView("list");
        setPreview(null);
      }
      await refreshList();
      onDataChanged?.();
    } catch (err) {
      flashToast("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // ===== Render =====

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="ms text-red-300" style={{ fontSize: 16 }}>table_chart</span>
            <h2 className="font-semibold text-[15px] text-zinc-100">
              {view === "list" ? "Schedules" : `Preview · ${preview?.record.schedulePath}`}
            </h2>
          </div>
          <p className="text-[12px] text-zinc-500 leading-snug max-w-2xl">
            {view === "list"
              ? "Manage uploaded ADP / Kronos schedules. View, apply per-night roster to night_tm_status, cross people off with call_offs, or delete a schedule entirely."
              : `Click cells to toggle call-off. Apply writes per-night roster to night_tm_status.`}
          </p>
        </div>
        {view === "list" && (
          <button
            onClick={refreshList}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
          >
            <span className="ms" style={{ fontSize: 12 }}>refresh</span>
            refresh
          </button>
        )}
        {view === "preview" && (
          <button
            onClick={() => {
              setView("list");
              setPreview(null);
            }}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 inline-flex items-center gap-1.5"
          >
            <span className="ms" style={{ fontSize: 12 }}>arrow_back</span> back to list
          </button>
        )}
      </div>

      {/* Toast */}
      {statusToast && (
        <div
          className={cn(
            "mx-6 mt-3 rounded-lg px-3 py-2 text-[12px] border",
            statusToast.kind === "ok"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
              : "bg-red-500/10 border-red-500/30 text-red-200"
          )}
        >
          {statusToast.msg}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
        {view === "list" && (
          <ScheduleList
            schedules={schedules}
            listError={listError}
            busy={busy}
            onView={handleView}
            onApply={async (rec) => {
              setBusy(rec.weekId);
              try {
                const buffer = await downloadScheduleFile(rec.schedulePath);
                const wb = XLSX.read(buffer, { type: "array", cellDates: true });
                const [grave, active] = await Promise.all([
                  getGraveAvailableTeamMembers(),
                  getActiveTeamMembers(),
                ]);
                const byId = new Map(active.map((t) => [t.id, t]));
                grave.forEach((t) => byId.set(t.id, t));
                const roster = Array.from(byId.values());
                // Aggregate parse: Days/Swings/Graves with sheet tagging
                // so the filter writes the right rows per sheet.
                const parsed = parseWorkbookAggregate(wb, rec.schedulePath, roster);
                await handleApply(rec, parsed);
              } catch (err) {
                flashToast("err", err instanceof Error ? err.message : String(err));
                setBusy(null);
              }
            }}
            onUnapply={handleUnapply}
            onDelete={handleDelete}
            onUpload={async (file) => {
              setBusy("__upload__");
              try {
                const arrayBuffer = await file.arrayBuffer();
                const blob = new Blob([arrayBuffer], { type: file.type });

                // Determine week_ending from the XLSX date range, not the filename.
                // parseWorkbook with an empty roster is cheap and gives us dateColumns.
                let weekEnding = new Date().toISOString().slice(0, 10);
                try {
                  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
                  const quickParsed = parseWorkbook(wb, file.name, []);
                  if (quickParsed.dateColumns.length > 0) {
                    // Last date in the schedule is the canonical week_ending
                    weekEnding = quickParsed.dateColumns[quickParsed.dateColumns.length - 1].iso;
                  }
                } catch (parseErr) {
                  // Parsing failed — fall back to filename heuristic
                  console.warn("[upload] XLSX date parse failed, falling back to filename", parseErr);
                  const m =
                    file.name.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/) ??
                    file.name.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
                  if (m) {
                    const parsed = new Date(m[0].replace(/-/g, "/"));
                    if (!isNaN(parsed.getTime())) {
                      weekEnding = parsed.toISOString().slice(0, 10);
                    }
                  }
                }

                await uploadScheduleFile(file.name, blob);
                await linkScheduleToWeek({
                  weekEnding,
                  schedulePath: file.name,
                  label: `Week ending ${weekEnding}`,
                });
                flashToast("ok", `Uploaded ${file.name} and linked to week ending ${weekEnding}.`);
                await refreshList();
                onDataChanged?.();
              } catch (err) {
                flashToast("err", err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(null);
              }
            }}
          />
        )}

        {view === "preview" && preview && (
          <SchedulePreview
            preview={preview}
            busy={busy}
            onApply={async () => {
              if (preview.parsed) await handleApply(preview.record, preview.parsed);
            }}
            onUnapply={() => handleUnapply(preview.record)}
            onDelete={() => handleDelete(preview.record)}
            onToggleCallOff={async (tmId, iso) => {
              const key = `${tmId}|${iso}`;
              try {
                const nightDate = new Date(iso + "T12:00:00");
                if (preview.callOffSet.has(key)) {
                  await undoRemoveFromSchedule({ tmId, nightDate });
                  setPreview((p) => {
                    if (!p) return p;
                    const next = new Set(p.callOffSet);
                    next.delete(key);
                    return { ...p, callOffSet: next };
                  });
                } else {
                  // We need a nightId for removeTMFromSchedule — query inline
                  const { supabase: sb } = await import("../../../lib/supabase");
                  const { data: nightRow } = await sb
                    .from("nights")
                    .select("id")
                    .eq("night_date", iso)
                    .limit(1)
                    .single();
                  if (!nightRow) {
                    flashToast("err", `No nights row exists for ${iso} — can't call off`);
                    return;
                  }
                  await removeTMFromSchedule({ tmId, nightId: (nightRow as any).id, nightDate });
                  setPreview((p) => {
                    if (!p) return p;
                    const next = new Set(p.callOffSet);
                    next.add(key);
                    return { ...p, callOffSet: next };
                  });
                }
              } catch (err) {
                flashToast("err", err instanceof Error ? err.message : String(err));
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// =====================================================================
// List view
// =====================================================================

function ScheduleList({
  schedules,
  listError,
  busy,
  onView,
  onApply,
  onUnapply,
  onDelete,
  onUpload,
}: {
  schedules: ScheduleRecord[] | null;
  listError: string | null;
  busy: string | null;
  onView: (r: ScheduleRecord) => void;
  onApply: (r: ScheduleRecord) => void | Promise<void>;
  onUnapply: (r: ScheduleRecord) => void | Promise<void>;
  onDelete: (r: ScheduleRecord) => void | Promise<void>;
  onUpload: (f: File) => void | Promise<void>;
}) {
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div className="space-y-4">
      {/* Upload affordance — compact */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onUpload(f);
        }}
        className={cn(
          "border-2 border-dashed rounded-xl p-3 transition-all flex items-center justify-between",
          dragOver
            ? "border-red-400/60 bg-red-500/5"
            : "border-zinc-700 bg-zinc-900/30 hover:border-zinc-600"
        )}
      >
        <div className="flex items-center gap-3">
          <span className={cn("ms", dragOver ? "text-red-300" : "text-zinc-500")} style={{ fontSize: 16 }}>upload</span>
          <span className="text-[12px] text-zinc-400">
            Drop an XLSX here to upload a new schedule
            {busy === "__upload__" && <span className="ml-2 text-zinc-500">(uploading…)</span>}
          </span>
        </div>
        <label className="text-[11px] px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
            className="hidden"
          />
          browse
        </label>
      </div>

      {/* List */}
      {listError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
          <span className="ms inline mr-1" style={{ fontSize: 12 }}>warning</span>
          {listError}
        </div>
      )}

      {schedules === null && (
        <div className="text-zinc-500 text-[12px] flex items-center gap-2">
          <span className="ms animate-spin" style={{ fontSize: 12 }}>sync</span> Loading schedules…
        </div>
      )}

      {schedules?.length === 0 && (
        <div className="text-center py-10 text-zinc-500 text-[12px]">
          No schedules uploaded yet. Drop an XLSX above to get started.
        </div>
      )}

      {schedules && schedules.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-zinc-950 text-zinc-400 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Week ending</th>
                <th className="text-left px-4 py-2.5 font-medium">File</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Size</th>
                <th className="text-right px-4 py-2.5 font-medium">Applied rows</th>
                <th className="text-right px-4 py-2.5 font-medium w-[280px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const isBusy = busy === s.weekId;
                return (
                  <tr key={s.weekId} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                    <td className="px-4 py-3 text-zinc-200 font-mono">{s.weekEnding}</td>
                    <td className="px-4 py-3 text-zinc-300 font-mono text-[11.5px] truncate max-w-[280px]">
                      {s.schedulePath}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-mono border",
                          s.status === "published"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                        )}
                      >
                        {s.status || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 font-mono text-[11px]">
                      {formatBytes(s.storageSizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400 font-mono text-[11px]">
                      {s.appliedRowCount > 0 ? (
                        <span className="text-emerald-300">{s.appliedRowCount}</span>
                      ) : (
                        <span className="text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => onView(s)}
                          disabled={isBusy}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-mono inline-flex items-center gap-1 disabled:opacity-50"
                          title="View"
                        >
                          <span className="ms" style={{ fontSize: 12 }}>visibility</span> view
                        </button>
                        <button
                          onClick={() => onApply(s)}
                          disabled={isBusy}
                          className="px-2 py-1 rounded bg-red-600/80 hover:bg-red-600 text-white text-[10px] font-mono inline-flex items-center gap-1 disabled:opacity-50"
                          title="Apply roster to night_tm_status"
                        >
                          {isBusy ? <span className="ms animate-spin" style={{ fontSize: 12 }}>sync</span> : "apply"}
                        </button>
                        <button
                          onClick={() => onUnapply(s)}
                          disabled={isBusy || s.appliedRowCount === 0}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono inline-flex items-center gap-1 disabled:opacity-30 disabled:hover:bg-zinc-800"
                          title="Remove this schedule's rows from night_tm_status"
                        >
                          <span className="ms" style={{ fontSize: 12 }}>undo</span> unapply
                        </button>
                        <button
                          onClick={() => onDelete(s)}
                          disabled={isBusy}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-red-600/30 text-zinc-400 hover:text-red-300 text-[10px] font-mono inline-flex items-center gap-1 disabled:opacity-50"
                          title="Delete file + clear schedule"
                        >
                          <span className="ms" style={{ fontSize: 12 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Preview view
// =====================================================================

function SchedulePreview({
  preview,
  busy,
  onApply,
  onUnapply,
  onDelete,
  onToggleCallOff,
}: {
  preview: PreviewState;
  busy: string | null;
  onApply: () => void | Promise<void>;
  onUnapply: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onToggleCallOff: (tmId: string, iso: string) => void | Promise<void>;
}) {
  const { record, parsed, callOffSet, loading, error } = preview;
  const isBusy = busy === record.weekId;

  if (loading) {
    return (
      <div className="text-zinc-500 text-[12px] flex items-center gap-2 py-6">
        <span className="ms animate-spin" style={{ fontSize: 16 }}>sync</span> Downloading and parsing {record.schedulePath}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-200">
        <div className="font-medium mb-1 flex items-center gap-2">
          <span className="ms" style={{ fontSize: 16 }}>warning</span>
          Couldn't load this schedule
        </div>
        <div className="text-red-300/90 font-mono text-[11px]">{error}</div>
      </div>
    );
  }

  if (!parsed) return null;

  const { stats, rows, dateColumns } = parsed;

  // Match-quality breakdown for debug summary
  const matchKindCounts = rows.reduce(
    (acc, r) => {
      acc[r.matchKind] = (acc[r.matchKind] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const unmatchedRows = rows.filter((r) => r.matchKind === "unmatched");

  // Cells classification across all matched TMs
  const cellCounts = { scheduled: 0, off: 0, unknown: 0 } as Record<string, number>;
  rows.forEach((r) => {
    Object.values(r.cells).forEach((c) => {
      cellCounts[c.status] = (cellCounts[c.status] ?? 0) + 1;
    });
  });

  // Grave-pool TMs MISSING from this schedule (sanity check —
  // if Cookie/Drew/Amanda aren't even in the file, that's the bug)
  const matchedIds = new Set(rows.map((r) => r.tmId).filter((id): id is string => !!id));
  const missingGraveTMs = preview.graveRoster.filter((t) => !matchedIds.has(t.id));

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 flex items-center justify-between gap-3">
        <div className="text-[12px] text-zinc-400">
          {stats.totalRows} TMs · {stats.matchedRows} matched · {stats.scheduledCells} scheduled cells ·{" "}
          {stats.dateRange ? `${stats.dateRange.first} → ${stats.dateRange.last}` : "no dates"}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onApply}
            disabled={isBusy}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {isBusy ? <span className="ms animate-spin" style={{ fontSize: 14 }}>sync</span> : null}
            Apply
          </button>
          <button
            onClick={onUnapply}
            disabled={isBusy || record.appliedRowCount === 0}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-30"
            title={record.appliedRowCount === 0 ? "Nothing applied yet" : "Remove from night_tm_status"}
          >
            <span className="ms" style={{ fontSize: 14 }}>undo</span> Unapply
          </button>
          <button
            onClick={onDelete}
            disabled={isBusy}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-600/30 text-zinc-300 hover:text-red-300 text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="ms" style={{ fontSize: 14 }}>delete</span> Delete
          </button>
        </div>
      </div>

      {/* Debug summary — surfaces why a schedule produces empty zones */}
      <details className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3" open={missingGraveTMs.length > 0 || unmatchedRows.length > 0}>
        <summary className="cursor-pointer text-[12px] font-semibold text-zinc-200 list-none flex items-center justify-between">
          <span>🔍 Parse diagnostics</span>
          <span className="text-zinc-500 text-[11px] font-mono">
            {matchKindCounts.exact ?? 0} exact · {matchKindCounts.full ?? 0} full · {matchKindCounts.fuzzy ?? 0} fuzzy · {unmatchedRows.length} unmatched
          </span>
        </summary>

        <div className="mt-3 grid grid-cols-2 gap-3 text-[11.5px]">
          {/* Cell classification */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Cell classification
            </div>
            <div className="font-mono text-zinc-300 space-y-0.5">
              <div>
                <span className="text-emerald-300">{cellCounts.scheduled ?? 0}</span>{" "}
                <span className="text-zinc-500">scheduled</span>
              </div>
              <div>
                <span className="text-zinc-400">{cellCounts.off ?? 0}</span>{" "}
                <span className="text-zinc-500">off</span>
              </div>
              <div>
                <span className="text-amber-300">{cellCounts.unknown ?? 0}</span>{" "}
                <span className="text-zinc-500">unknown</span>
              </div>
            </div>
          </div>

          {/* Grave roster coverage */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Grave-pool coverage
            </div>
            <div className="font-mono text-zinc-300 space-y-0.5">
              <div>
                <span className="text-emerald-300">{preview.graveRoster.length - missingGraveTMs.length}</span>{" "}
                <span className="text-zinc-500">of</span>{" "}
                <span className="text-zinc-300">{preview.graveRoster.length}</span>{" "}
                <span className="text-zinc-500">grave TMs in this schedule</span>
              </div>
              <div className="text-zinc-500 text-[10px]">
                {missingGraveTMs.length === 0
                  ? "✓ all grave-pool TMs appear in the schedule"
                  : `⚠ ${missingGraveTMs.length} not found — engine candidates will be limited`}
              </div>
            </div>
          </div>
        </div>

        {/* Unmatched rows from the XLSX */}
        {unmatchedRows.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-red-300 mb-1.5">
              Unmatched ADP cells ({unmatchedRows.length}) — raw, no display name available
            </div>
            <div className="font-mono text-[11px] text-zinc-300 space-y-0.5 max-h-[140px] overflow-auto">
              {unmatchedRows.map((r, i) => (
                <div key={i} className="text-red-200">
                  {r.rawName}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-zinc-500 mt-2 leading-snug">
              These rows weren't matched to any TM in the roster — the parser couldn't
              resolve them to a <span className="font-mono">tm_id</span>. Common causes:
              the ADP file uses payroll names instead of display names, or these are
              TMs not on file.
            </div>
          </div>
        )}

        {/* Grave-pool TMs missing from this schedule */}
        {missingGraveTMs.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-amber-300 mb-1.5">
              Grave-pool TMs not in this schedule ({missingGraveTMs.length})
            </div>
            <div className="font-mono text-[11px] text-zinc-300 max-h-[140px] overflow-auto grid grid-cols-3 gap-x-3">
              {missingGraveTMs.slice(0, 60).map((tm) => (
                <div key={tm.id} className="text-amber-200">
                  {tm.name}
                </div>
              ))}
            </div>
            {missingGraveTMs.length > 60 && (
              <div className="text-[10px] text-zinc-500 mt-1">
                … and {missingGraveTMs.length - 60} more
              </div>
            )}
            <div className="text-[10px] text-zinc-500 mt-2 leading-snug">
              These grave-pool TMs don't appear in the parsed XLSX. If you expected
              Cookie / Drew / Amanda / Carter etc. here, the file likely contains
              the wrong department's roster — or the parser is missing rows because
              of a different header layout.
            </div>
          </div>
        )}
      </details>

      {/* Grid */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <div className="overflow-auto max-h-[460px]">
          <table className="w-full text-[11.5px] font-mono">
            <thead className="bg-zinc-950 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 text-zinc-400 font-medium border-b border-zinc-800 min-w-[180px]">
                  TM
                </th>
                <th className="text-left px-2 py-2 text-zinc-400 font-medium border-b border-zinc-800 w-[80px]">
                  sheet
                </th>
                {dateColumns.map((col) => (
                  <th
                    key={col.iso}
                    className="text-left px-2 py-2 text-zinc-400 font-medium border-b border-zinc-800 min-w-[78px]"
                  >
                    <div className="text-zinc-300">{col.iso.slice(5)}</div>
                    <div className="text-zinc-600 text-[9px]">{col.rawHeader}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                // Full Name → Display Name layer. Unmatched rows have no
                // tmId, so we fall back to whatever ADP wrote.
                const resolvedName = row.tmId
                  ? resolveDisplayName(
                      row.tmId,
                      row.rawName,
                      preview.displayNameById,
                      preview.fullNameById
                    )
                  : row.rawName;
                const showRawSecondary =
                  row.tmId && resolvedName.trim().toLowerCase() !== row.rawName.trim().toLowerCase();
                return (
                <tr key={idx} className="border-b border-zinc-900/60">
                  <td
                    className="px-3 py-1.5 text-zinc-300 whitespace-nowrap"
                    title={showRawSecondary ? `ADP cell: ${row.rawName}` : undefined}
                  >
                    <span className="text-zinc-200">{resolvedName}</span>
                    {showRawSecondary && (
                      <span className="ml-1.5 text-[9px] text-zinc-600">
                        ({row.rawName})
                      </span>
                    )}
                    {!row.tmId && (
                      <span className="ml-1.5 text-[9px] text-red-400">unmatched</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {row.sourceSheetKind && (
                      <span
                        className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-mono border",
                          row.sourceSheetKind === "graves" && "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
                          row.sourceSheetKind === "swings" && "bg-purple-500/10 text-purple-300 border-purple-500/30",
                          row.sourceSheetKind === "days" && "bg-amber-500/10 text-amber-300 border-amber-500/30",
                          row.sourceSheetKind === "unknown" && "bg-zinc-800 text-zinc-500 border-zinc-700"
                        )}
                      >
                        {row.sourceSheetKind}
                      </span>
                    )}
                  </td>
                  {dateColumns.map((col) => {
                    const cell = row.cells[col.iso];
                    const tmId = row.tmId;
                    const isCalledOff = tmId
                      ? callOffSet.has(`${tmId}|${col.iso}`)
                      : false;
                    const interactive = !!tmId && cell?.status === "scheduled";
                    return (
                      <td
                        key={col.iso}
                        className={cn(
                          "px-2 py-1.5",
                          interactive && "cursor-pointer hover:bg-zinc-800/50"
                        )}
                        onClick={() => {
                          if (interactive) onToggleCallOff(tmId!, col.iso);
                        }}
                        title={
                          interactive
                            ? isCalledOff
                              ? "click to undo call-off"
                              : "click to call off"
                            : ""
                        }
                      >
                        <ScheduleCell raw={cell?.rawValue ?? ""} status={cell?.status ?? "off"} calledOff={isCalledOff} />
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ScheduleCell({
  raw,
  status,
  calledOff,
}: {
  raw: string;
  status: "scheduled" | "off" | "unknown";
  calledOff: boolean;
}) {
  if (status === "off") return <span className="text-zinc-700">—</span>;
  if (status === "unknown") {
    return (
      <span className="px-1 rounded bg-amber-500/10 text-amber-300 text-[10px]">
        ?{raw && ` ${raw}`}
      </span>
    );
  }
  // scheduled
  return (
    <span
      className={cn(
        "px-1 rounded text-[10px]",
        calledOff
          ? "bg-orange-500/15 text-orange-300 line-through"
          : "bg-emerald-500/15 text-emerald-300"
      )}
    >
      {raw || "✓"}
    </span>
  );
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

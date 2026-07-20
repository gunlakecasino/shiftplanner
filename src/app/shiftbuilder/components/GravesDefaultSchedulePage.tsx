"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { useConfirm } from "./ConfirmDialog";
import { BuilderBusyLabel, BuilderLoadingLine, BuilderLoadingShell } from "./builderPrimitives";
import { useQueryClient } from "@tanstack/react-query";
import { notifyGravesDefaultScheduleChanged } from "@/lib/shiftbuilder/scheduleCacheSync";
import {
  GRAVES_DAY_KEYS,
  gravesDayColumnLabel,
  type GravesBand,
  type GravesDaysMap,
  type GravesEligibleTm,
  type GravesScheduleRow,
} from "@/lib/shiftbuilder/gravesDefaultSchedule";

type GridData = {
  grave: GravesScheduleRow[];
  amOverlap: GravesScheduleRow[];
  pmOverlap: GravesScheduleRow[];
  eligible: {
    grave: GravesEligibleTm[];
    amOverlap: GravesEligibleTm[];
    pmOverlap: GravesEligibleTm[];
  };
};

function sectionKeyForBand(band: GravesBand): keyof Pick<GridData, "grave" | "amOverlap" | "pmOverlap"> {
  if (band === "grave") return "grave";
  if (band === "am_overlap") return "amOverlap";
  return "pmOverlap";
}

function eligibleKeyForBand(band: GravesBand): keyof GridData["eligible"] {
  return sectionKeyForBand(band);
}

function titleForBand(band: GravesBand): string {
  if (band === "grave") return "Graves";
  if (band === "am_overlap") return "AM Overlaps";
  return "PM Overlaps";
}

function parseGridPayload(data: unknown): GridData {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const elig = (d.eligible && typeof d.eligible === "object" ? d.eligible : {}) as Record<
    string,
    unknown
  >;
  const rows = (value: unknown): GravesScheduleRow[] =>
    (Array.isArray(value) ? value : []).map((row) => ({
      ...(row as GravesScheduleRow),
      overlapBreak: (row as GravesScheduleRow)?.overlapBreak === true,
    }));
  return {
    grave: rows(d.grave),
    amOverlap: rows(d.amOverlap),
    pmOverlap: rows(d.pmOverlap),
    eligible: {
      grave: (Array.isArray(elig.grave) ? elig.grave : []) as GravesEligibleTm[],
      amOverlap: (Array.isArray(elig.amOverlap) ? elig.amOverlap : []) as GravesEligibleTm[],
      pmOverlap: (Array.isArray(elig.pmOverlap) ? elig.pmOverlap : []) as GravesEligibleTm[],
    },
  };
}

function AddTmPicker({
  title,
  band,
  eligible,
  mutating,
  onAdd,
}: {
  title: string;
  band: GravesBand;
  eligible: GravesEligibleTm[];
  mutating: boolean;
  onAdd: (tmId: string, band: GravesBand) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = eligible.filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      t.tmName.toLowerCase().includes(q) ||
      (t.gravePool || "").toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = async (tm: GravesEligibleTm) => {
    setOpen(false);
    setQuery("");
    await onAdd(tm.tmId, band);
  };

  if (!eligible.length) {
    return (
      <p className="text-[11px] text-neutral-400">All eligible TMs are already on {title}.</p>
    );
  }

  return (
    <div ref={rootRef} className="relative z-30 min-w-[260px]">
      <label className="sr-only" htmlFor={`add-tm-${band}`}>
        Search to add TM to {title}
      </label>
      <input
        id={`add-tm-${band}`}
        type="search"
        value={query}
        disabled={mutating}
        placeholder={`Add TM (${eligible.length} available)…`}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered[0]) {
            e.preventDefault();
            void pick(filtered[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[12px] text-neutral-900 shadow-sm placeholder:text-neutral-400 disabled:opacity-50"
        autoComplete="off"
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 mt-1 max-h-[220px] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[11px] text-neutral-400">No matches</li>
          ) : (
            filtered.map((t) => (
              <li key={t.tmId} role="option">
                <button
                  type="button"
                  disabled={mutating}
                  className="sb-list-row w-full px-3 py-2 text-left text-[12px] hover:bg-neutral-100 disabled:opacity-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(t)}
                >
                  <span className="font-medium text-neutral-900">{t.tmName}</span>
                  {t.gravePool && (
                    <span className="ml-2 text-[10px] text-neutral-400">{t.gravePool}</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function ScheduleSection({
  title,
  band,
  rows,
  eligible,
  onToggle,
  onOverlapBreakToggle,
  onAdd,
  onRemove,
  saving,
  mutating,
}: {
  title: string;
  band: GravesBand;
  rows: GravesScheduleRow[];
  eligible: GravesEligibleTm[];
  onToggle: (tmId: string, band: GravesBand, day: keyof GravesDaysMap) => void;
  onOverlapBreakToggle: (tmId: string, band: GravesBand) => void;
  onAdd: (tmId: string, band: GravesBand) => Promise<void>;
  onRemove: (tmId: string, band: GravesBand) => void;
  saving: boolean;
  mutating: boolean;
}) {
  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-neutral-500">
          {title}
          <span className="ml-2 font-normal text-neutral-400">({rows.length})</span>
        </h2>
        <AddTmPicker
          title={title}
          band={band}
          eligible={eligible}
          mutating={mutating}
          onAdd={onAdd}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left font-semibold text-neutral-700 min-w-[140px]">
                Name
              </th>
              {GRAVES_DAY_KEYS.map((k) => (
                <th
                  key={k}
                  className={`px-2 py-2 text-center font-semibold text-neutral-600 ${
                    band === "am_overlap" ? "w-[58px] text-[10px]" : "w-[52px]"
                  }`}
                >
                  {gravesDayColumnLabel(k, band)}
                </th>
              ))}
              <th className="w-[76px] px-2 py-2 text-center font-semibold text-neutral-600">
                OL Break
              </th>
              <th className="px-2 py-2 text-center font-semibold text-neutral-500 w-[72px]">
                
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={GRAVES_DAY_KEYS.length + 3}
                  className="px-3 py-6 text-center text-neutral-400"
                >
                  No TMs on this schedule yet. Use Add above.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.tmId}-${band}`} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-neutral-900 border-r border-neutral-100">
                  {row.tmName}
                  {row.gravePool && (
                    <span className="ml-1.5 text-[10px] font-normal text-neutral-400">
                      {row.gravePool}
                    </span>
                  )}
                </td>
                {GRAVES_DAY_KEYS.map((day) => {
                  const on = row.days[day];
                  return (
                    <td key={day} className="p-0.5 text-center">
                      <button
                        type="button"
                        disabled={saving || mutating}
                        onClick={() => onToggle(row.tmId, band, day)}
                        className={`sb-interactive w-full min-h-[28px] rounded-md text-[10px] font-bold ${
                          on
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                        }`}
                        title={
                          on
                            ? `Scheduled ${gravesDayColumnLabel(day, band)} — click for Off`
                            : `Off ${gravesDayColumnLabel(day, band)} — click for Scheduled`
                        }
                      >
                        {on ? "ON" : "—"}
                      </button>
                    </td>
                  );
                })}
                <td className="p-1 text-center">
                  <label
                    className="sb-interactive inline-flex min-h-[28px] min-w-[48px] cursor-pointer items-center justify-center rounded-md bg-neutral-100 hover:bg-neutral-200"
                    title="Always place this TM on the overlap break"
                  >
                    <input
                      type="checkbox"
                      checked={row.overlapBreak}
                      disabled={saving || mutating}
                      onChange={() => onOverlapBreakToggle(row.tmId, band)}
                      className="h-4 w-4 accent-violet-600"
                      aria-label={`${row.tmName}: always use overlap break`}
                    />
                  </label>
                </td>
                <td className="p-1 text-center">
                  <button
                    type="button"
                    disabled={saving || mutating}
                    onClick={() => onRemove(row.tmId, band)}
                    className="sb-interactive rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                    title="Remove from default schedule"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function GravesDefaultSchedulePage({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { isAuthenticated, permissions } = useOpsAuth();
  const confirmDialog = useConfirm();
  const canApplySchedules = permissions?.canApplySchedules ?? false;
  const queryClient = useQueryClient();
  const [grid, setGrid] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingRef = useRef<
    Map<string, {
      tmId: string;
      band: GravesBand;
      days: GravesDaysMap;
      overlapBreak: boolean;
    }>
  >(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!canApplySchedules) {
      router.replace("/sheetbuilder");
    }
  }, [isAuthenticated, canApplySchedules, router]);

  const applyGrid = useCallback((data: unknown) => {
    setGrid(parseGridPayload(data));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shiftbuilder/graves-default-schedule");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      applyGrid(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applyGrid]);

  useEffect(() => {
    if (!canApplySchedules) return;
    load();
  }, [load, canApplySchedules]);

  const flushSave = useCallback(async () => {
    const pending = Array.from(pendingRef.current.values());
    if (!pending.length) return;
    pendingRef.current.clear();
    setSaving(true);
    try {
      const res = await fetch("/api/shiftbuilder/graves-default-schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: pending }),
      });
      if (!res.ok) throw new Error(await res.text());
      await notifyGravesDefaultScheduleChanged(queryClient);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      await load();
    } finally {
      setSaving(false);
    }
  }, [load, queryClient]);

  const queueSave = useCallback(
    (tmId: string, band: GravesBand, days: GravesDaysMap, overlapBreak: boolean) => {
      pendingRef.current.set(`${tmId}:${band}`, { tmId, band, days, overlapBreak });
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        flushSave();
      }, 400);
    },
    [flushSave],
  );

  const handleToggle = useCallback(
    (tmId: string, band: GravesBand, day: keyof GravesDaysMap) => {
      if (!grid) return;
      const sectionKey = sectionKeyForBand(band);
      const section = grid[sectionKey];
      const row = section.find((r) => r.tmId === tmId);
      if (!row) return;
      const nextDays = { ...row.days, [day]: !row.days[day] };
      setGrid((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [sectionKey]: section.map((r) =>
            r.tmId === tmId ? { ...r, days: nextDays } : r,
          ),
        };
      });
      queueSave(tmId, band, nextDays, row.overlapBreak);
    },
    [grid, queueSave],
  );

  const handleOverlapBreakToggle = useCallback(
    (tmId: string, band: GravesBand) => {
      if (!grid) return;
      const sectionKey = sectionKeyForBand(band);
      const section = grid[sectionKey];
      const row = section.find((candidate) => candidate.tmId === tmId);
      if (!row) return;
      const overlapBreak = !row.overlapBreak;
      setGrid((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [sectionKey]: section.map((candidate) =>
            candidate.tmId === tmId ? { ...candidate, overlapBreak } : candidate,
          ),
        };
      });
      queueSave(tmId, band, row.days, overlapBreak);
    },
    [grid, queueSave],
  );

  const handleAdd = useCallback(
    async (tmId: string, band: GravesBand) => {
      const name =
        grid?.eligible[eligibleKeyForBand(band)].find((t) => t.tmId === tmId)?.tmName || "TM";

      setMutating(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/shiftbuilder/graves-default-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmId, band }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof body?.error === "string" ? body.error : `Add failed (${res.status})`;
          throw new Error(msg);
        }
        applyGrid(body);
        await notifyGravesDefaultScheduleChanged(queryClient);
        setNotice(`Added ${name} to ${titleForBand(band)}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add TM");
        await load();
      } finally {
        setMutating(false);
      }
    },
    [applyGrid, grid, load, queryClient],
  );

  const handleRemove = useCallback(
    async (tmId: string, band: GravesBand) => {
      const sectionKey = sectionKeyForBand(band);
      const row = grid?.[sectionKey].find((r) => r.tmId === tmId);
      const name = row?.tmName || "this TM";
      const ok = await confirmDialog(
        `Remove ${name} from the ${band.replace("_", " ")} default schedule?`,
        { confirmLabel: "Remove", tone: "danger" },
      );
      if (!ok) {
        return;
      }
      setMutating(true);
      setError(null);
      pendingRef.current.delete(`${tmId}:${band}`);
      try {
        const res = await fetch(
          `/api/shiftbuilder/graves-default-schedule?tmId=${encodeURIComponent(tmId)}&band=${encodeURIComponent(band)}`,
          { method: "DELETE" },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof body?.error === "string" ? body.error : `Remove failed (${res.status})`;
          throw new Error(msg);
        }
        applyGrid(body);
        await notifyGravesDefaultScheduleChanged(queryClient);
        setNotice(`Removed ${name} from ${titleForBand(band)}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to remove TM");
        await load();
      } finally {
        setMutating(false);
      }
    },
    [grid, applyGrid, load, queryClient, confirmDialog],
  );

  if (!isAuthenticated || !canApplySchedules) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel="Graves default schedule requires planning access"
      />
    );
  }

  return (
    <div
      className={embedded ? "h-full min-h-0 bg-transparent text-[#1C1C1E]" : "min-h-screen bg-[#F8F8F9] text-[#1C1C1E]"}
      style={{ fontFamily: "var(--font-atkinson, system-ui, sans-serif)" }}
    >
      <header
        className={
          embedded
            ? "border-b border-neutral-200/80 px-1 pb-3 mb-4 flex items-center justify-between"
            : "border-b border-neutral-200 bg-white/90 backdrop-blur px-6 py-4 flex items-center justify-between"
        }
      >
        <div>
          {!embedded && (
            <Link
              href="/sheetbuilder"
              className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800"
            >
              ← ShiftBuilder
            </Link>
          )}
          <h1 className={embedded ? "text-[16px] font-bold tracking-tight" : "text-[22px] font-bold tracking-tight mt-1"}>
            Graves Default Schedule
          </h1>
          <p className="text-[12px] text-neutral-500 mt-0.5">
            Master Fri–Thu grid. Scheduled days use the fixed card break defaults; check OL Break for TMs who always use the overlap wave.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          {saving && (
            <BuilderBusyLabel className="text-amber-600 font-medium text-[11px]">Saving</BuilderBusyLabel>
          )}
          {mutating && (
            <BuilderBusyLabel className="text-amber-600 font-medium text-[11px]">Updating roster</BuilderBusyLabel>
          )}
          <button
            type="button"
            onClick={() => load()}
            disabled={loading || saving || mutating}
            className="sb-interactive rounded-lg border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className={embedded ? "max-w-none px-0 py-0 overflow-y-auto" : "max-w-[1100px] mx-auto px-6 py-8"}>
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-900">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-800">
            {error}
          </div>
        )}
        {loading && !grid && (
          <div className="sb-content-enter space-y-4" aria-busy="true">
            <BuilderLoadingLine className="!mt-0 text-[13px]">Loading schedule</BuilderLoadingLine>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="sb-skeleton h-8 rounded-lg" aria-hidden="true" />
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sb-skeleton sb-skeleton--lg w-full rounded-lg" aria-hidden="true" />
              ))}
            </div>
          </div>
        )}
        {grid && (
          <>
            <ScheduleSection
              title="Graves"
              band="grave"
              rows={grid.grave}
              eligible={grid.eligible?.grave ?? []}
              onToggle={handleToggle}
              onOverlapBreakToggle={handleOverlapBreakToggle}
              onAdd={handleAdd}
              onRemove={handleRemove}
              saving={saving}
              mutating={mutating}
            />
            <ScheduleSection
              title="AM Overlaps"
              band="am_overlap"
              rows={grid.amOverlap}
              eligible={grid.eligible?.amOverlap ?? []}
              onToggle={handleToggle}
              onOverlapBreakToggle={handleOverlapBreakToggle}
              onAdd={handleAdd}
              onRemove={handleRemove}
              saving={saving}
              mutating={mutating}
            />
            <ScheduleSection
              title="PM Overlaps"
              band="pm_overlap"
              rows={grid.pmOverlap}
              eligible={grid.eligible?.pmOverlap ?? []}
              onToggle={handleToggle}
              onOverlapBreakToggle={handleOverlapBreakToggle}
              onAdd={handleAdd}
              onRemove={handleRemove}
              saving={saving}
              mutating={mutating}
            />
          </>
        )}
      </main>
    </div>
  );
}

"use client";

/**
 * ReportsTab — zone placement frequency over a rolling date window.
 *
 * Two views (togglable):
 *   TM-first  — pick a TM, see how often they've landed in each zone.
 *   Zone-first — pick a zone, see which TMs have worked it most.
 *
 * Data source: zone_assignments history via getZoneFrequencyReport().
 * Only slot_type='zone' rows are counted (no RR, AUX, overlaps).
 * Colors match the Golden ShiftBuilder zone card palette exactly.
 */

import React from "react";
import { BarChart2, RefreshCw, User, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getZoneFrequencyReport,
  type ZoneFrequencyEntry,
  type ZoneFrequencyReport,
} from "@/lib/shiftbuilder/data";

// ---------------------------------------------------------------------------
// Zone constants — mirrors ShiftBuilderClient.tsx (not exported from there)
// ---------------------------------------------------------------------------

const ZONE_DEFS = [
  { key: "Z1",  label: "Zone 1"  },
  { key: "Z2",  label: "Zone 2"  },
  { key: "Z3",  label: "Zone 3"  },
  { key: "Z4",  label: "Zone 4"  },
  { key: "Z5",  label: "Zone 5"  },
  { key: "Z6",  label: "Zone 6"  },
  { key: "Z7",  label: "Zone 7"  },
  { key: "Z8",  label: "Zone 8"  },
  { key: "Z9",  label: "Zone 9"  },
  { key: "Z10", label: "Zone 10" },
];

const ZONE_COLORS: Record<string, string> = {
  Z1: "#B89708", Z2: "#B89708",
  Z3: "#E53935", Z4: "#E53935", Z5: "#E53935",
  Z6: "#B7679A",
  Z7: "#1976D2",
  Z8: "#6B5346",
  Z9: "#E53935",
  Z10: "#43A047",
};

const ZONE_ICONS: Record<string, string> = {
  Z1: "★", Z2: "◆", Z3: "▲", Z4: "■", Z5: "⬟",
  Z6: "♥", Z7: "●", Z8: "◐", Z9: "☾", Z10: "✚",
};

const zoneColor = (key: string) => ZONE_COLORS[key] ?? "#6B7280";
const zoneIcon  = (key: string) => ZONE_ICONS[key]  ?? "✦";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

/** Derive zone-first data from the TM list: zone → sorted TM entries. */
function buildZoneView(
  byTm: ZoneFrequencyEntry[]
): Record<string, Array<{ tmId: string; tmName: string; count: number; lastDate: string }>> {
  const out: Record<string, Array<{ tmId: string; tmName: string; count: number; lastDate: string }>> = {};
  for (const tm of byTm) {
    for (const [zKey, count] of Object.entries(tm.zoneCounts)) {
      if (!out[zKey]) out[zKey] = [];
      out[zKey].push({ tmId: tm.tmId, tmName: tm.tmName, count, lastDate: tm.lastDate });
    }
  }
  // Sort each zone's TM list by count DESC
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => b.count - a.count);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** A single horizontal frequency bar row. */
function FreqBar({
  label,
  icon,
  count,
  maxCount,
  color,
  sub,
}: {
  label: string;
  icon?: string;
  count: number;
  maxCount: number;
  color: string;
  sub?: string;
}) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-[5px] group">
      {/* Icon + label */}
      <div className="w-[88px] flex-shrink-0 flex items-center gap-1.5 min-w-0">
        {icon && (
          <span className="text-[11px] leading-none flex-shrink-0" style={{ color }}>
            {icon}
          </span>
        )}
        <span className="text-[11px] font-semibold text-zinc-200 truncate tracking-[-0.1px]">
          {label}
        </span>
      </div>

      {/* Bar track */}
      <div className="flex-1 h-[6px] rounded-full bg-zinc-800 relative overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
        />
      </div>

      {/* Count */}
      <div className="w-7 text-right flex-shrink-0">
        <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
          {count}x
        </span>
      </div>

      {/* Optional sub-label (e.g. last seen date) */}
      {sub && (
        <span className="text-[9px] text-zinc-600 w-12 text-right flex-shrink-0 hidden group-hover:block">
          {sub}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type View = "tm" | "zone";
type DayRange = 14 | 30 | 60;

export function ReportsTab() {
  const [view, setView]         = React.useState<View>("tm");
  const [days, setDays]         = React.useState<DayRange>(30);
  const [report, setReport]     = React.useState<ZoneFrequencyReport | null>(null);
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState<string | null>(null);
  const [selectedTm, setSelectedTm]     = React.useState<string | null>(null);
  const [selectedZone, setSelectedZone] = React.useState<string | null>(null);
  const [search, setSearch]     = React.useState("");

  const load = React.useCallback(async (d: DayRange) => {
    setLoading(true);
    setError(null);
    try {
      const r = await getZoneFrequencyReport(d);
      setReport(r);
      // Auto-select first item so the right panel isn't blank
      if (r.byTm.length > 0) setSelectedTm(r.byTm[0].tmId);
      setSelectedZone("Z1");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(days); }, [days, load]);

  // Derived data
  const zoneView = React.useMemo(
    () => (report ? buildZoneView(report.byTm) : {}),
    [report]
  );

  const filteredTms = React.useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return q
      ? report.byTm.filter((tm) => tm.tmName.toLowerCase().includes(q))
      : report.byTm;
  }, [report, search]);

  const activeTm   = report?.byTm.find((t) => t.tmId === selectedTm) ?? null;
  const activeZoneTms = selectedZone ? (zoneView[selectedZone] ?? []) : [];

  // Bar chart data for TM-first right panel
  const tmBars = React.useMemo(() => {
    if (!activeTm) return [];
    return ZONE_DEFS
      .map((z) => ({ ...z, count: activeTm.zoneCounts[z.key] ?? 0 }))
      .filter((z) => z.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [activeTm]);

  const tmMaxCount = tmBars[0]?.count ?? 1;

  // Bar chart data for Zone-first right panel
  const zoneMaxCount = activeZoneTms[0]?.count ?? 1;

  // Zone counts for the left zone list (how many distinct TMs have worked each zone)
  const zoneTmCounts = React.useMemo(() => {
    const out: Record<string, number> = {};
    for (const z of ZONE_DEFS) {
      out[z.key] = (zoneView[z.key] ?? []).length;
    }
    return out;
  }, [zoneView]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full min-h-0 text-zinc-100">

      {/* ── Control bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 flex-shrink-0">

        {/* View toggle */}
        <div className="flex rounded-md border border-zinc-700 overflow-hidden text-[11px] font-semibold">
          {(["tm", "zone"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1 flex items-center gap-1.5 transition-colors",
                view === v
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              )}
            >
              {v === "tm" ? <User className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
              {v === "tm" ? "By Team Member" : "By Zone"}
            </button>
          ))}
        </div>

        {/* Day range */}
        <div className="flex rounded-md border border-zinc-700 overflow-hidden text-[11px] font-semibold">
          {([14, 30, 60] as DayRange[]).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 transition-colors",
                days === d
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              )}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Summary */}
        {report && !loading && (
          <span className="text-[10px] text-zinc-500 ml-1">
            {report.totalNights} nights · {report.byTm.length} TMs ·{" "}
            {formatDate(report.dateRange.from)} – {formatDate(report.dateRange.to)}
          </span>
        )}

        <div className="flex-1" />

        {/* Refresh */}
        <button
          onClick={() => load(days)}
          disabled={loading}
          className="w-7 h-7 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
          {error}
        </div>
      ) : loading && !report ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
          Loading…
        </div>
      ) : !report || report.byTm.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
          No zone assignments found in the last {days} days.
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* ── Left rail ──────────────────────────────────────────────── */}
          <div className="w-[220px] flex-shrink-0 border-r border-zinc-800 flex flex-col min-h-0">

            {/* Search (TM view only) */}
            {view === "tm" && (
              <div className="px-3 pt-3 pb-2 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search TM…"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {view === "tm" ? (
                // TM list
                filteredTms.map((tm) => {
                  const isActive = tm.tmId === selectedTm;
                  // Show their top zone as a color hint
                  const topZone = Object.entries(tm.zoneCounts).sort((a, b) => b[1] - a[1])[0];
                  const topColor = topZone ? zoneColor(topZone[0]) : "#6B7280";
                  return (
                    <button
                      key={tm.tmId}
                      onClick={() => setSelectedTm(tm.tmId)}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-zinc-900",
                        isActive ? "bg-zinc-800" : "hover:bg-zinc-900/60"
                      )}
                    >
                      {/* Top-zone color dot */}
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: topColor }}
                      />
                      <span className={cn(
                        "flex-1 text-[11px] font-medium truncate",
                        isActive ? "text-zinc-100" : "text-zinc-400"
                      )}>
                        {tm.tmName}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold tabular-nums flex-shrink-0",
                        isActive ? "text-zinc-300" : "text-zinc-600"
                      )}>
                        {tm.totalShifts}
                      </span>
                    </button>
                  );
                })
              ) : (
                // Zone list
                ZONE_DEFS.map((z) => {
                  const isActive = z.key === selectedZone;
                  const color = zoneColor(z.key);
                  const tmCount = zoneTmCounts[z.key] ?? 0;
                  return (
                    <button
                      key={z.key}
                      onClick={() => setSelectedZone(z.key)}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors border-b border-zinc-900",
                        isActive ? "bg-zinc-800" : "hover:bg-zinc-900/60"
                      )}
                    >
                      <span className="text-[12px] leading-none flex-shrink-0" style={{ color }}>
                        {zoneIcon(z.key)}
                      </span>
                      <span className={cn(
                        "flex-1 text-[11px] font-medium",
                        isActive ? "text-zinc-100" : "text-zinc-400"
                      )}>
                        {z.label}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold tabular-nums flex-shrink-0",
                        isActive ? "text-zinc-300" : "text-zinc-600"
                      )}>
                        {tmCount}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right panel ────────────────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">

            {view === "tm" ? (
              // TM-first right panel
              activeTm ? (
                <>
                  {/* Header */}
                  <div className="mb-5">
                    <div className="text-[15px] font-bold text-zinc-100 tracking-[-0.2px]">
                      {activeTm.tmName}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      {activeTm.totalShifts} shift{activeTm.totalShifts !== 1 ? "s" : ""} in window
                      {activeTm.lastDate && ` · last assigned ${formatDate(activeTm.lastDate)}`}
                    </div>
                  </div>

                  {/* Zone bars */}
                  {tmBars.length === 0 ? (
                    <div className="text-[12px] text-zinc-600">No zone assignments in this window.</div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600 mb-2">
                        Zone Frequency
                      </div>
                      {tmBars.map((z) => (
                        <FreqBar
                          key={z.key}
                          label={z.label}
                          icon={zoneIcon(z.key)}
                          count={z.count}
                          maxCount={tmMaxCount}
                          color={zoneColor(z.key)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Zones not worked — shown as a dim list */}
                  {(() => {
                    const unworked = ZONE_DEFS.filter((z) => !activeTm.zoneCounts[z.key]);
                    if (unworked.length === 0) return null;
                    return (
                      <div className="mt-5 pt-4 border-t border-zinc-800/60">
                        <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-700 mb-2">
                          Not Worked in Window
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {unworked.map((z) => (
                            <span
                              key={z.key}
                              className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 text-zinc-700"
                            >
                              {zoneIcon(z.key)} {z.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-[12px] text-zinc-600">Select a team member.</div>
              )

            ) : (
              // Zone-first right panel
              selectedZone ? (
                <>
                  {/* Header */}
                  <div className="mb-5 flex items-center gap-3">
                    <span
                      className="text-[28px] leading-none"
                      style={{ color: zoneColor(selectedZone) }}
                    >
                      {zoneIcon(selectedZone)}
                    </span>
                    <div>
                      <div className="text-[15px] font-bold text-zinc-100 tracking-[-0.2px]">
                        {ZONE_DEFS.find((z) => z.key === selectedZone)?.label}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {activeZoneTms.length} TM{activeZoneTms.length !== 1 ? "s" : ""} worked this zone in window
                      </div>
                    </div>
                  </div>

                  {/* TM bars */}
                  {activeZoneTms.length === 0 ? (
                    <div className="text-[12px] text-zinc-600">
                      No assignments in this zone for the selected window.
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600 mb-2">
                        Times Assigned
                      </div>
                      {activeZoneTms.map((tm) => (
                        <FreqBar
                          key={tm.tmId}
                          label={tm.tmName}
                          count={tm.count}
                          maxCount={zoneMaxCount}
                          color={zoneColor(selectedZone)}
                          sub={formatDate(tm.lastDate)}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[12px] text-zinc-600">Select a zone.</div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

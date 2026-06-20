"use client";

/**
 * ReportsTab — placement history across zones, restrooms, and aux slots.
 *
 * Views:
 *   TM View    — left rail (searchable) + right panel with expandable slot history.
 *               "By Day" toggle shows DOW bias per slot in Fri–Thu grave order.
 *   Slot View  — left rail (all slots) + right panel with per-TM frequency + dates.
 *   Matrix     — full-width recency grid: TM rows × all-slot columns.
 *
 * Time windows: 14d / 30d / 60d / This Grave Week / Last 4 Grave Weeks.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { SudoTabLoading } from "./SudoGlass";
import { sudoIosClasses } from "./sudoIosTheme";
import {
  ZONE_DEFS, RR_DEFS, MAX_AUX_SLOTS,
  ZONE_ICONS, RR_ICONS, AUX_ICONS,
  getZoneColor, getRRAccent, getAuxAccent,
} from "@/lib/shiftbuilder/constants";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";
// getZoneDetailReport dynamically imported (avoids pulling heavy data.ts at top level for Turbopack HMR)
import type {
  ZoneDetailEntry,
  ZoneDetailReport,
  ReportWindow,
} from "@/lib/shiftbuilder/data";

// ---------------------------------------------------------------------------
// Slot helpers (work for zone / rr / aux keys)
// ---------------------------------------------------------------------------

function getSlotColor(uiKey: string): string {
  if (/^Z\d+$/.test(uiKey)) return getZoneColor(uiKey);
  const rr = uiKey.match(/^[MW]RR(\d+)$/);
  if (rr) return getRRAccent(parseInt(rr[1]));
  return getAuxAccent(uiKey);
}

function getSlotIcon(uiKey: string): string {
  if (ZONE_ICONS[uiKey]) return ZONE_ICONS[uiKey];
  const rr = uiKey.match(/^[MW]RR(\d+)$/);
  if (rr) return RR_ICONS[parseInt(rr[1])] ?? "●";
  return AUX_ICONS[uiKey] ?? "✦";
}

function getSlotShortLabel(uiKey: string): string {
  // Zones already short: Z1…Z10
  if (/^Z\d+$/.test(uiKey)) return uiKey;
  // RR: MRR1 → "RR 1+2 M", WRR7 → "RR 7 W"
  const rr = uiKey.match(/^([MW])RR(\d+)$/);
  if (rr) {
    const num = parseInt(rr[2]);
    const base = num === 1 ? "RR 1+2" : `RR ${num}`;
    return `${base} ${rr[1]}`;
  }
  // Aux: use slotKeyToLabel but keep it compact
  return slotKeyToLabel(uiKey);
}

/** Canonical sort order: zones → men's RR → women's RR → aux */
function sortedSlotKeys(keys: string[]): string[] {
  const zoneNum = (k: string) => { const m = k.match(/^Z(\d+)$/); return m ? parseInt(m[1]) : null; };
  const rrNum   = (k: string) => { const m = k.match(/^[MW]RR(\d+)$/); return m ? parseInt(m[1]) : null; };
  const isMens  = (k: string) => k.startsWith("M");

  return [...keys].sort((a, b) => {
    const za = zoneNum(a), zb = zoneNum(b);
    if (za !== null && zb !== null) return za - zb;
    if (za !== null) return -1;
    if (zb !== null) return 1;

    const ra = rrNum(a), rb = rrNum(b);
    if (ra !== null && rb !== null) {
      if (ra !== rb) return ra - rb;
      // M before W for same number
      return isMens(a) ? -1 : 1;
    }
    if (ra !== null) return -1;
    if (rb !== null) return 1;

    return a.localeCompare(b);
  });
}

// ---------------------------------------------------------------------------
// Static slot column list (zones + RR pairs + default aux)
// ---------------------------------------------------------------------------

const ALL_SLOT_KEYS: string[] = sortedSlotKeys([
  ...ZONE_DEFS.map((z) => z.key),
  ...RR_DEFS.flatMap((r) => [`MRR${r.num}`, `WRR${r.num}`]),
  ...Array.from({ length: MAX_AUX_SLOTS }, (_, i) => `AUX${i + 1}`),
]);

/** Left-rail slot list entry */
const ALL_SLOT_DEFS = ALL_SLOT_KEYS.map((key) => ({
  key,
  label: slotKeyToLabel(key),
  color: getSlotColor(key),
  icon:  getSlotIcon(key),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRAVE_DOW_IDX    = [5, 6, 0, 1, 2, 3, 4];
const GRAVE_DOW_LABELS = ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"];

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

function daysSince(iso: string): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86_400_000);
}

function recencyColor(days: number): string {
  if (days <= 7)  return "#34C759";
  if (days <= 14) return "#FFD60A";
  if (days <= 30) return "#FF9500";
  return "#FF453A";
}

function csvExport(entries: ZoneDetailEntry[], dr: { from: string; to: string }) {
  // Use the slots actually present in data so the CSV is meaningful
  const keys = sortedSlotKeys(
    Array.from(new Set(entries.flatMap((e) => Object.keys(e.zoneCounts))))
  );
  const header = [
    "TM", "Total Placements", "Nights in Window", "Last Date",
    ...keys.map((k) => `${k} Count`),
    ...keys.map((k) => `${k} Last Date`),
  ];
  const rows = entries.map((tm) => [
    tm.tmName,
    tm.totalAssignments,
    tm.totalNights,
    formatDate(tm.lastDate),
    ...keys.map((k) => tm.zoneCounts[k] ?? 0),
    ...keys.map((k) => {
      const d = tm.zoneDates[k]?.[0];
      return d ? formatDate(d) : "—";
    }),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((c) => `"${c}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `placement-report-${dr.from}-to-${dr.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Expandable slot row — date chips expand on click. */
function SlotHistoryRow({
  slotKey, count, maxCount, dates,
}: {
  slotKey: string; count: number; maxCount: number; dates: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const color = getSlotColor(slotKey);
  const pct   = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  const ago   = dates[0] ? daysSince(dates[0]) : null;

  return (
    <div className="border-b border-zinc-800/60 last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2.5 py-2.5 px-1 rounded hover:bg-zinc-800/40 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="w-[72px] flex-shrink-0 flex items-center gap-1.5">
          <span className="text-[11px] leading-none flex-shrink-0" style={{ color }}>
            {getSlotIcon(slotKey)}
          </span>
          <span className="text-[11px] font-bold leading-tight" style={{ color }}>
            {getSlotShortLabel(slotKey)}
          </span>
        </div>
        <div className="flex-1 h-[10px] rounded-full bg-zinc-800 relative overflow-hidden">
          <div
            className="sb-progress-bar absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
          />
        </div>
        <span className="text-[12px] font-bold tabular-nums w-8 text-right flex-shrink-0" style={{ color }}>
          {count}×
        </span>
        <span
          className="text-[10px] font-semibold w-[52px] text-right flex-shrink-0"
          style={{ color: ago !== null ? recencyColor(ago) : "#52525b" }}
        >
          {ago !== null ? `${ago}d ago` : "—"}
        </span>
        <span
          className="ms text-zinc-600 flex-shrink-0 transition-transform duration-150"
          style={{ fontSize: 14, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          chevron_right
        </span>
      </button>
      {open && (
        <div className="pb-3 pt-1 pl-[80px] pr-2 flex flex-wrap gap-1.5">
          {dates.map((d) => (
            <span
              key={d}
              className="text-[10px] px-2 py-0.5 rounded-full border font-mono"
              style={{ borderColor: `${color}55`, color: `${color}cc`, background: `${color}12` }}
            >
              {formatDate(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Expandable TM row inside a slot's detail panel. */
function SlotTmRow({
  tm, color, maxCount,
}: {
  tm: { tmId: string; tmName: string; count: number; dates: string[] };
  color: string;
  maxCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const pct = maxCount > 0 ? Math.round((tm.count / maxCount) * 100) : 0;
  const ago = tm.dates[0] ? daysSince(tm.dates[0]) : null;

  return (
    <div className="border-b border-zinc-800/60 last:border-0">
      <button
        type="button"
        className="w-full flex items-center gap-2.5 py-2.5 px-1 rounded hover:bg-zinc-800/40 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[12px] font-medium text-zinc-300 w-[140px] flex-shrink-0 truncate">
          {tm.tmName}
        </span>
        <div className="flex-1 h-[10px] rounded-full bg-zinc-800 relative overflow-hidden">
          <div
            className="sb-progress-bar absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
          />
        </div>
        <span className="text-[12px] font-bold tabular-nums w-8 text-right flex-shrink-0" style={{ color }}>
          {tm.count}×
        </span>
        <span
          className="text-[10px] font-semibold w-[52px] text-right flex-shrink-0"
          style={{ color: ago !== null ? recencyColor(ago) : "#52525b" }}
        >
          {ago !== null ? `${ago}d ago` : "—"}
        </span>
        <span
          className="ms text-zinc-600 flex-shrink-0 transition-transform duration-150"
          style={{ fontSize: 14, transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          chevron_right
        </span>
      </button>
      {open && (
        <div className="pb-3 pt-1 px-3 flex flex-wrap gap-1.5">
          {tm.dates.map((d) => (
            <span
              key={d}
              className="text-[10px] px-2 py-0.5 rounded-full border font-mono"
              style={{ borderColor: `${color}55`, color: `${color}cc`, background: `${color}12` }}
            >
              {formatDate(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 7-bar DOW mini-chart in Fri–Thu grave order. */
function DowChart({ dow, color }: { dow: number[]; color: string }) {
  const max = Math.max(...GRAVE_DOW_IDX.map((i) => dow[i] ?? 0), 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
      {GRAVE_DOW_IDX.map((dayIdx, col) => {
        const n = dow[dayIdx] ?? 0;
        const h = Math.max(2, Math.round((n / max) * 24));
        return (
          <div
            key={col}
            className="rounded-sm flex-shrink-0"
            style={{
              width: 10, height: h,
              backgroundColor: n > 0 ? color : "#27272a",
              opacity: n > 0 ? 0.85 : 1,
            }}
            title={`${GRAVE_DOW_LABELS[col]}: ${n}`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TM Detail panel
// ---------------------------------------------------------------------------

function TmDetail({ tm }: { tm: ZoneDetailEntry }) {
  const [showDow, setShowDow] = React.useState(false);
  const ago = daysSince(tm.lastDate);

  const slots = sortedSlotKeys(Object.keys(tm.zoneCounts))
    .map((key) => ({
      key,
      count:  tm.zoneCounts[key] ?? 0,
      dates:  tm.zoneDates[key]  ?? [],
      dow:    tm.zoneDow[key]    ?? [0, 0, 0, 0, 0, 0, 0],
    }))
    .filter((s) => s.count > 0);

  const maxCount = slots[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[17px] font-bold text-zinc-100 tracking-[-0.3px] leading-snug">
            {tm.tmName}
          </div>
          <div className="mt-1 space-y-0.5">
            <div className="text-[11px] text-zinc-500">
              {tm.totalAssignments} placement{tm.totalAssignments !== 1 ? "s" : ""} ·{" "}
              {tm.totalNights} night{tm.totalNights !== 1 ? "s" : ""} in window
            </div>
            {tm.lastDate && (
              <div
                className="text-[11px] font-semibold"
                style={{ color: ago < Infinity ? recencyColor(ago) : "#52525b" }}
              >
                last: {formatDate(tm.lastDate)} ({ago}d ago)
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowDow((v) => !v)}
          className={cn(
            "flex-shrink-0 text-[10px] px-2.5 py-1 rounded border font-semibold tracking-wide transition-colors",
            showDow
              ? "bg-zinc-700 border-zinc-600 text-zinc-200"
              : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
          )}
        >
          {showDow ? "← History" : "By Day →"}
        </button>
      </div>

      {slots.length === 0 ? (
        <div className="text-[12px] text-zinc-600">No assignments in this window.</div>
      ) : showDow ? (
        /* DOW view */
        <div>
          <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600 mb-3">
            Day-of-Week Pattern (Fri → Thu)
          </div>
          {/* Column header */}
          <div className="flex items-center gap-2.5 px-1 mb-1">
            <div className="w-[72px] flex-shrink-0" />
            <div className="flex-1" />
            <div className="flex gap-[3px] flex-shrink-0">
              {GRAVE_DOW_LABELS.map((l) => (
                <div key={l} className="text-[8px] text-zinc-600 text-center" style={{ width: 10 }}>
                  {l[0]}
                </div>
              ))}
            </div>
            <div className="w-8" />
            <div className="w-[52px]" />
            <div style={{ width: 14 }} />
          </div>
          {slots.map((s) => {
            const color = getSlotColor(s.key);
            const ago   = s.dates[0] ? daysSince(s.dates[0]) : null;
            return (
              <div
                key={s.key}
                className="flex items-center gap-2.5 py-2 px-1 border-b border-zinc-800/60 last:border-0"
              >
                <div className="w-[72px] flex-shrink-0 flex items-center gap-1.5">
                  <span className="text-[11px] leading-none" style={{ color }}>
                    {getSlotIcon(s.key)}
                  </span>
                  <span className="text-[11px] font-bold leading-tight" style={{ color }}>
                    {getSlotShortLabel(s.key)}
                  </span>
                </div>
                <div className="flex-1" />
                <DowChart dow={s.dow} color={color} />
                <span className="text-[12px] font-bold tabular-nums w-8 text-right flex-shrink-0" style={{ color }}>
                  {s.count}×
                </span>
                <span
                  className="text-[10px] font-semibold w-[52px] text-right flex-shrink-0"
                  style={{ color: ago !== null ? recencyColor(ago) : "#52525b" }}
                >
                  {ago !== null ? `${ago}d ago` : "—"}
                </span>
                <div style={{ width: 14 }} />
              </div>
            );
          })}
          {/* Footer labels */}
          <div className="flex items-center gap-2.5 px-1 mt-1">
            <div className="w-[72px] flex-shrink-0" />
            <div className="flex-1" />
            <div className="flex gap-[3px] flex-shrink-0">
              {GRAVE_DOW_LABELS.map((l) => (
                <div key={l} className="text-[8px] text-zinc-600 text-center" style={{ width: 10 }}>
                  {l.slice(0, 2)}
                </div>
              ))}
            </div>
            <div className="w-8" />
            <div className="w-[52px]" />
            <div style={{ width: 14 }} />
          </div>
        </div>
      ) : (
        /* History view */
        <div>
          <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600 mb-1">
            Placement History · tap row to expand dates
          </div>
          {slots.map((s) => (
            <SlotHistoryRow
              key={s.key}
              slotKey={s.key}
              count={s.count}
              maxCount={maxCount}
              dates={s.dates}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slot Detail panel
// ---------------------------------------------------------------------------

function SlotDetail({ slotKey, entries }: { slotKey: string; entries: ZoneDetailEntry[] }) {
  const color = getSlotColor(slotKey);
  const tms   = entries
    .filter((tm) => (tm.zoneCounts[slotKey] ?? 0) > 0)
    .map((tm) => ({
      tmId:   tm.tmId,
      tmName: tm.tmName,
      count:  tm.zoneCounts[slotKey]!,
      dates:  tm.zoneDates[slotKey] ?? [],
    }))
    .sort((a, b) => b.count - a.count);

  const maxCount = tms[0]?.count ?? 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-[28px] leading-none" style={{ color }}>
          {getSlotIcon(slotKey)}
        </span>
        <div>
          <div className="text-[17px] font-bold text-zinc-100 tracking-[-0.3px]">
            {slotKeyToLabel(slotKey)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            {tms.length} TM{tms.length !== 1 ? "s" : ""} worked this slot in window
          </div>
        </div>
      </div>

      {tms.length === 0 ? (
        <div className="text-[12px] text-zinc-600">No assignments in this slot for the selected window.</div>
      ) : (
        <div>
          <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600 mb-1">
            Times Assigned · tap row to expand dates
          </div>
          {tms.map((tm) => (
            <SlotTmRow key={tm.tmId} tm={tm} color={color} maxCount={maxCount} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix View
// ---------------------------------------------------------------------------

function MatrixView({ entries }: { entries: ZoneDetailEntry[] }) {
  // Build dynamic column set from actual data so operator-added slots appear
  const allKeysInData = sortedSlotKeys(
    Array.from(new Set(entries.flatMap((e) => Object.keys(e.zoneCounts))))
  );

  const LEGEND = [
    { label: "≤7d",   color: "#34C759" },
    { label: "8–14d", color: "#FFD60A" },
    { label: "15–30d",color: "#FF9500" },
    { label: ">30d",  color: "#FF453A" },
  ];

  return (
    <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[9px] font-bold tracking-[1.2px] uppercase text-zinc-600">
          Rotation Fairness Matrix — Days Since Last Placement
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {LEGEND.map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="text-[10px] text-zinc-600">·{" "}<span className="text-zinc-700">—</span> not in window</span>
        </div>
      </div>

      <table className="text-[11px] border-collapse" style={{ minWidth: "100%" }}>
        <thead>
          <tr className="border-b border-zinc-800">
            <th
              className="text-left text-zinc-500 font-semibold py-2 pr-4 sticky left-0 bg-zinc-950"
              style={{ minWidth: 130 }}
            >
              Team Member
            </th>
            {allKeysInData.map((k) => (
              <th
                key={k}
                className="text-center font-bold py-2 px-1.5"
                style={{ color: getSlotColor(k), minWidth: 46 }}
                title={slotKeyToLabel(k)}
              >
                {/* Short label in header: Z1, RR7M, ADM etc */}
                <span className="block text-[9px]">{getSlotShortLabel(k)}</span>
              </th>
            ))}
            <th
              className="text-right text-zinc-500 font-semibold py-2 pl-4"
              style={{ minWidth: 50 }}
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((tm) => (
            <tr
              key={tm.tmId}
              className="border-b border-zinc-800/40 hover:bg-zinc-800/25 transition-colors"
            >
              <td className="py-2.5 pr-4 font-medium text-zinc-300 sticky left-0 bg-zinc-950 max-w-[130px] truncate">
                {tm.tmName}
              </td>
              {allKeysInData.map((k) => {
                const lastDate = tm.zoneDates[k]?.[0];
                const count    = tm.zoneCounts[k] ?? 0;
                const ago      = lastDate ? daysSince(lastDate) : null;
                const color    = ago !== null ? recencyColor(ago) : null;
                return (
                  <td key={k} className="py-2.5 px-1.5 text-center">
                    {color ? (
                      <span
                        className="inline-block rounded px-1 py-0.5 text-[10px] font-bold tabular-nums"
                        style={{ color, background: `${color}1a` }}
                        title={`${tm.tmName} / ${slotKeyToLabel(k)}: last ${formatDate(lastDate!)} · ${count}×`}
                      >
                        {ago}d
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                );
              })}
              <td className="py-2.5 pl-4 text-right font-bold text-zinc-400 tabular-nums">
                {tm.totalAssignments}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type ReportView = "tm" | "slot" | "matrix";

const VIEW_OPTS: { label: string; value: ReportView; icon: string }[] = [
  { label: "By TM",   value: "tm",     icon: "person"      },
  { label: "By Slot", value: "slot",   icon: "location_on" },
  { label: "Matrix",  value: "matrix", icon: "grid_on"     },
];

const WINDOW_OPTS: { label: string; value: ReportWindow }[] = [
  { label: "14d",         value: 14             },
  { label: "30d",         value: 30             },
  { label: "60d",         value: 60             },
  { label: "This Wk",    value: "this-week"    },
  { label: "Last 4 Wks", value: "last-4-weeks" },
];

export interface ReportsTabProps {
  isDark?: boolean;
}

export function ReportsTab({ isDark = false }: ReportsTabProps = {}) {
  const ios = sudoIosClasses(isDark);
  const [reportView,   setReportView]   = React.useState<ReportView>("tm");
  const [reportWin,    setReportWin]    = React.useState<ReportWindow>(30);
  const [report,       setReport]       = React.useState<ZoneDetailReport | null>(null);
  const [loading,      setLoading]      = React.useState(false);
  const [error,        setError]        = React.useState<string | null>(null);
  const [selectedTm,   setSelectedTm]   = React.useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = React.useState<string>(ALL_SLOT_KEYS[0] ?? "Z1");
  const [search,       setSearch]       = React.useState("");

  const load = React.useCallback(async (w: ReportWindow) => {
    setLoading(true);
    setError(null);
    try {
      const { getZoneDetailReport } = await import("@/lib/shiftbuilder/data");
      const r = await getZoneDetailReport(w);
      setReport(r);
      if (r.entries.length > 0) setSelectedTm(r.entries[0].tmId);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(reportWin); }, [reportWin, load]);

  const filteredEntries = React.useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    return q ? report.entries.filter((e) => e.tmName.toLowerCase().includes(q)) : report.entries;
  }, [report, search]);

  const activeTm = report?.entries.find((e) => e.tmId === selectedTm) ?? null;

  // All slot keys present in the loaded data (for the Slot view left rail)
  const dataSlotKeys = React.useMemo(() => {
    if (!report) return ALL_SLOT_KEYS;
    const keys = new Set<string>([
      ...ALL_SLOT_KEYS,
      ...report.entries.flatMap((e) => Object.keys(e.zoneCounts)),
    ]);
    return sortedSlotKeys(Array.from(keys));
  }, [report]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", ios.page)}>

      {/* ── Control bar ─────────────────────────────────────────────────── */}
      <div className={cn(ios.actionBar, "flex flex-shrink-0 flex-wrap items-center gap-3")}>
        {/* View */}
        <div className="flex rounded-md border border-zinc-700 overflow-hidden text-[11px] font-semibold">
          {VIEW_OPTS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setReportView(v.value)}
              className={cn(
                "px-3 py-1.5 flex items-center gap-1.5 transition-colors",
                reportView === v.value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              )}
            >
              <span className="ms" style={{ fontSize: 12 }}>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        {/* Window */}
        <div className="flex rounded-md border border-zinc-700 overflow-hidden text-[11px] font-semibold">
          {WINDOW_OPTS.map((w) => (
            <button
              key={String(w.value)}
              type="button"
              onClick={() => setReportWin(w.value)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                reportWin === w.value
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        {report && !loading && (
          <span className="text-[10px] text-zinc-500">
            {report.totalNights} nights · {report.entries.length} TMs ·{" "}
            {formatDate(report.dateRange.from)} – {formatDate(report.dateRange.to)}
          </span>
        )}

        <div className="flex-1" />

        {report && report.entries.length > 0 && (
          <button
            type="button"
            onClick={() => csvExport(report.entries, report.dateRange)}
            className="w-7 h-7 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Export CSV"
          >
            <span className="ms" style={{ fontSize: 14 }}>download</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void load(reportWin)}
          disabled={loading}
          className="sb-interactive w-7 h-7 rounded-md border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          title="Refresh"
          aria-busy={loading}
        >
          <span className="ms" style={{ fontSize: 14 }}>refresh</span>

        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">{error}</div>
      ) : loading && !report ? (
        <div className="flex-1 flex items-center justify-center">
          <SudoTabLoading>Loading report</SudoTabLoading>
        </div>
      ) : !report || report.entries.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
          No assignments found in this window.
        </div>
      ) : reportView === "matrix" ? (
        <MatrixView entries={report.entries} />
      ) : (
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* ── Left rail ──────────────────────────────────────────────── */}
          <div className="w-[220px] flex-shrink-0 border-r border-zinc-800 flex flex-col min-h-0">
            {reportView === "tm" && (
              <div className="px-3 pt-3 pb-2 flex-shrink-0">
                <div className="relative">
                  <span className="ms absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" style={{ fontSize: 12 }}>
                    search
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search TM…"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded pl-6 pr-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              {reportView === "tm" ? (
                filteredEntries.map((tm) => {
                  const isActive = tm.tmId === selectedTm;
                  const topKey   = Object.entries(tm.zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
                  const dotColor = topKey ? getSlotColor(topKey) : "#52525b";
                  return (
                    <button
                      key={tm.tmId}
                      type="button"
                      onClick={() => setSelectedTm(tm.tmId)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors border-b border-zinc-900",
                        isActive ? "bg-zinc-800" : "hover:bg-zinc-900/60"
                      )}
                    >
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <span className={cn("flex-1 text-[12px] font-medium truncate", isActive ? "text-zinc-100" : "text-zinc-400")}>
                        {tm.tmName}
                      </span>
                      <span className={cn("text-[10px] font-bold tabular-nums flex-shrink-0", isActive ? "text-zinc-300" : "text-zinc-600")}>
                        {tm.totalAssignments}
                      </span>
                    </button>
                  );
                })
              ) : (
                dataSlotKeys.map((k) => {
                  const isActive = k === selectedSlot;
                  const color    = getSlotColor(k);
                  const count    = report.entries.filter((e) => e.zoneCounts[k]).length;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSelectedSlot(k)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors border-b border-zinc-900",
                        isActive ? "bg-zinc-800" : "hover:bg-zinc-900/60"
                      )}
                    >
                      <span className="text-[12px] leading-none flex-shrink-0" style={{ color }}>
                        {getSlotIcon(k)}
                      </span>
                      <span className={cn("flex-1 text-[11px] font-medium truncate", isActive ? "text-zinc-100" : "text-zinc-400")}>
                        {slotKeyToLabel(k)}
                      </span>
                      <span className={cn("text-[10px] font-bold tabular-nums flex-shrink-0", isActive ? "text-zinc-300" : "text-zinc-600")}>
                        {count}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right panel ────────────────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {reportView === "tm" ? (
              activeTm ? (
                <TmDetail tm={activeTm} />
              ) : (
                <div className="text-[12px] text-zinc-600">Select a team member.</div>
              )
            ) : (
              <SlotDetail slotKey={selectedSlot} entries={report.entries} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

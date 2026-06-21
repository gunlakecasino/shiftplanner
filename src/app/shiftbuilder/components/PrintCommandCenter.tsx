"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Moon,
  CalendarDays,
  LayoutGrid,
  Coffee,
  Pencil,
  Save,
  Printer,
  X,
  Info,
  Table2,
  FileText,
  Download,
  GripVertical,
  Sparkles,
  Trash2,
  Check,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import "./printCommandCenter.css";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  defaultPrintDays,
  countPrintPages,
  estimatePrintSeconds,
  buildPrintQueue,
  applyCustomQueueOrder,
  loadLastPrintConfig,
  syncOverviewMaster,
  syncOverviewFromDayChange,
} from "../print/printConfigUtils";


// ─── Exported Types & Constants ───────────────────────────────────────────────

export interface PrintDayConfig {
  dayIndex: number;
  printDeploy: boolean;
  printBreaks: boolean;
  inOverview: boolean;
}

export type PageOrder = "paired" | "deploy-first" | "breaks-first";
export type MarginSize = "none" | "narrow" | "normal" | "wide";
export type PrintVariant = "official" | "planning";

export interface PrintConfig {
  days: PrintDayConfig[];
  pageOrder: PageOrder;
  margins: MarginSize;
  includeOverview: boolean;
  overviewPosition: "first" | "last";
  includeCoverPage: boolean;
  coverPagePosition: "first" | "last";
  customQueueOrder?: string[] | null;
  printVariant: PrintVariant;
  includeShiftNotes: boolean;
}

export const MARGIN_VALUES: Record<MarginSize, string> = {
  none:   "0in",
  narrow: "0.15in",
  normal: "0.5in",
  wide:   "1in",
};

export const MARGIN_ZOOM: Record<MarginSize, number> = {
  none:   1.0,
  narrow: 0.965,
  normal: 0.882,
  wide:   0.765,
};

// ─── Saved Presets (localStorage) ────────────────────────────────────────────

const PRESETS_KEY = "glcr-print-presets-v2";

interface SavedPreset {
  id: string;
  name: string;
  config: PrintConfig;
  savedAt: number;
}

function loadPresets(): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]"); } catch { return []; }
}

function persistPresets(presets: SavedPreset[]): void {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch {}
}

export interface PrintProgress {
  current: number;
  total: number;
  label: string;
}

interface PrintCommandCenterProps {
  open: boolean;
  onClose: () => void;
  onPrint: (config: PrintConfig) => void;
  /** New: triggers PDF (or ZIP for multi-day) download using the same capture pipeline. */
  onExport?: (config: PrintConfig) => void;
  /** Jump to on-canvas Golden preview for a deploy/breaks sheet */
  onPreviewSheet?: (args: {
    dayIndex: number;
    view: "deployment" | "breaks";
    label: string;
    printVariant: PrintVariant;
    includeShiftNotes: boolean;
  }) => void;
  DAY_DEFS: DayDef[];
  selectedDayIndex: number;
  isPrinting: boolean;
  printProgress: PrintProgress | null;
  isDark?: boolean;
  /** Publish status for the currently selected night */
  currentNightStatus?: string | null;
}

function formatEstTime(secs: number): string {
  if (secs < 60) return `~${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

function formatPresetSavedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const BUILTIN_PRESET_HINTS: Record<string, string> = {
  tonight: "Tonight's deploy + breaks only",
  "tonight-planning": "Tonight's planning worksheet (zones/RR + aux/overlaps/notes)",
  "full-week": "All 7 nights, deploy + breaks + overview",
  "deploy-book": "Deploy sheets for every night",
  "break-book": "Break sheets for every night",
};

function resolveNightStatus(
  dayIndex: number,
  selectedDayIndex: number,
  currentNightStatus: string | null | undefined,
  statusByDay: Record<number, string | null | undefined>,
): string | null {
  if (statusByDay[dayIndex] !== undefined) return statusByDay[dayIndex] ?? null;
  if (dayIndex === selectedDayIndex) return currentNightStatus ?? null;
  return null;
}

function hasUnpublishedQueuedNights(
  days: PrintDayConfig[],
  selectedDayIndex: number,
  currentNightStatus: string | null | undefined,
  statusByDay: Record<number, string | null | undefined>,
): boolean {
  return days
    .filter((d) => d.printDeploy || d.printBreaks)
    .some((d) => {
      const status = resolveNightStatus(d.dayIndex, selectedDayIndex, currentNightStatus, statusByDay);
      return status !== "published";
    });
}

function detectActivePreset(
  days: PrintDayConfig[],
  todayIndex: number,
  includeOverview: boolean,
  includeCoverPage: boolean,
  printVariant: PrintVariant,
): "tonight" | "tonight-planning" | "full-week" | "deploy-book" | "break-book" | "custom" {
  const tonight = days[todayIndex];
  if (
    days.every(d => d.dayIndex === todayIndex
      ? (d.printDeploy && d.printBreaks)
      : (!d.printDeploy && !d.printBreaks)) &&
    !includeOverview && !includeCoverPage &&
    tonight?.printDeploy && tonight?.printBreaks
  ) {
    return printVariant === "planning" ? "tonight-planning" : "tonight";
  }

  if (
    days.every((d) => d.printDeploy && d.printBreaks && d.inOverview) &&
    includeOverview &&
    !includeCoverPage
  ) {
    return "full-week";
  }
  if (days.every(d => d.printDeploy && !d.printBreaks) && !includeOverview && !includeCoverPage)
    return "deploy-book";
  if (days.every(d => !d.printDeploy && d.printBreaks) && !includeOverview && !includeCoverPage)
    return "break-book";
  return "custom";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DayCardProps {
  def: DayDef;
  config: PrintDayConfig;
  onChange: (next: PrintDayConfig) => void;
  isDark: boolean;
}

const DayCard = React.memo(function DayCard({ def, config, onChange, isDark }: DayCardProps) {
  const hasAny = config.printDeploy || config.printBreaks || config.inOverview;
  const sheetCount =
    (config.printDeploy ? 1 : 0) + (config.printBreaks ? 1 : 0) + (config.inOverview ? 1 : 0);

  const bothSheetsOn = config.printDeploy && config.printBreaks;
  const toggleDeployBreaks = () => {
    const next = !bothSheetsOn;
    onChange({
      ...config,
      printDeploy: next,
      printBreaks: next,
    });
  };

  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${hasAny ? def.color : (isDark ? "rgba(72,72,74,0.35)" : "rgba(209,209,214,0.35)")}`,
      overflow: "hidden",
      opacity: hasAny ? 1 : 0.48,
      transition: "border-color 0.15s, opacity 0.15s, box-shadow 0.15s",
      minWidth: 76,
      flex: "1 1 0%",
      background: isDark ? "rgba(44,44,46,0.7)" : "rgba(255,255,255,0.8)",
      boxShadow: def.isToday && hasAny ? `0 0 0 2px ${def.color}33` : "none",
    }}>
      {/* Color header — click toggles all sheets for this night */}
      <button
        type="button"
        onClick={toggleDeployBreaks}
        title={bothSheetsOn ? "Clear deploy + breaks" : "Select deploy + breaks"}
        aria-label={`${def.short} ${def.dateNum}: ${bothSheetsOn ? "clear" : "select"} deploy and breaks`}
        className="sb-interactive pcc-day-header"
        style={{
          width: "100%",
          background: def.color,
          padding: "6px 6px 5px",
          textAlign: "center",
          position: "relative",
          border: "none",
          cursor: "pointer",
        }}
      >
        {def.isToday && (
          <span style={{
            display: "block",
            fontSize: 6.5,
            fontWeight: 800,
            letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.88)",
            marginBottom: 1,
          }}>
            TONIGHT
          </span>
        )}
        {sheetCount > 0 && (
          <span style={{
            position: "absolute",
            top: 4,
            right: 5,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: "rgba(255,255,255,0.95)",
            color: def.color,
            fontSize: 8,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
          }}>
            {sheetCount}
          </span>
        )}
        <div style={{ color: "#fff", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.07em", opacity: 0.85 }}>
          {def.short.toUpperCase()}
        </div>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>
          {def.dateNum}
        </div>
      </button>

      {/* Chips */}
      <div style={{ padding: "5px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
        <Chip
          label="Deploy"
          title="Deployment sheet"
          active={config.printDeploy}
          activeColor="rgba(52,199,89,0.9)"
          activeBg={isDark ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)"}
          activeBorder="rgba(52,199,89,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printDeploy: !config.printDeploy })}
        />
        <Chip
          label="Breaks"
          title="Break sheet"
          active={config.printBreaks}
          activeColor="rgba(255,159,10,0.9)"
          activeBg={isDark ? "rgba(255,159,10,0.15)" : "rgba(255,159,10,0.1)"}
          activeBorder="rgba(255,159,10,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printBreaks: !config.printBreaks })}
        />
        <Chip
          label="Overview"
          title="Include in overview table column"
          active={config.inOverview}
          activeColor="rgba(88,86,214,0.9)"
          activeBg={isDark ? "rgba(88,86,214,0.15)" : "rgba(88,86,214,0.1)"}
          activeBorder="rgba(88,86,214,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, inOverview: !config.inOverview })}
        />
      </div>
    </div>
  );
});

interface ChipProps {
  label: string;
  title: string;
  active: boolean;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
  isDark: boolean;
  onClick: () => void;
}

function Chip({ label, title, active, activeColor, activeBg, activeBorder, isDark, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} — ${active ? "on" : "off"}`}
      className="sb-interactive pcc-chip"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 3, padding: "4px 6px", borderRadius: 6, cursor: "pointer",
        background: active ? activeBg : (isDark ? "rgba(72,72,74,0.28)" : "rgba(209,209,214,0.25)"),
        border: `1px solid ${active ? activeBorder : "transparent"}`,
        transition: "background 0.12s, border-color 0.12s, transform 0.08s",
      }}
      title={title}
    >
      <span style={{
        fontSize: 8, fontWeight: 700, letterSpacing: "0.02em",
        color: active ? activeColor : (isDark ? "#8E8E93" : "#8E8E93"),
      }}>{label}</span>
      <CheckDot active={active} color={activeColor} />
    </button>
  );
}

function CheckDot({ active, color }: { active: boolean; color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10">
      {active ? (
        <>
          <circle cx="5" cy="5" r="4.5" fill={color} />
          <path d="M2.8 5l1.5 1.5 2.9-3.2" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      ) : (
        <circle cx="5" cy="5" r="4" stroke="rgba(120,120,128,0.35)" strokeWidth="1" fill="none" />
      )}
    </svg>
  );
}

interface MarginCardProps {
  value: MarginSize;
  label: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
  isDark: boolean;
}

function MarginCard({ value, label, sub, selected, onClick, isDark }: MarginCardProps) {
  const marginPx = { none: 0, narrow: 2, normal: 5, wide: 9 }[value];
  const pw = 34, ph = 26;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${label} margins (${sub})`}
      className="sb-select-card sb-interactive pcc-margin"
      style={{
        flex: "1 1 0%", display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        padding: "8px 6px", borderRadius: 9, cursor: "pointer",
        border: `1.5px solid ${selected ? "#0A84FF" : (isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)")}`,
        background: selected
          ? (isDark ? "rgba(10,132,255,0.14)" : "rgba(10,132,255,0.07)")
          : (isDark ? "rgba(44,44,46,0.5)" : "rgba(255,255,255,0.6)"),
        transition: "all 0.12s",
      }}
    >
      {/* Mini paper */}
      <div style={{ position: "relative", width: pw, height: ph }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: 2,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          background: isDark ? "rgba(60,60,62,0.8)" : "rgba(255,255,255,0.9)",
        }} />
        {marginPx > 0 && (
          <div style={{
            position: "absolute", top: marginPx, left: marginPx,
            width: pw - marginPx * 2, height: ph - marginPx * 2,
            background: selected ? "rgba(10,132,255,0.18)" : (isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)"),
            borderRadius: 1,
          }} />
        )}
        {marginPx > 0 && [
          { top: marginPx - 0.5, left: 0, right: 0, height: 1, width: "auto" },
          { bottom: marginPx - 0.5, left: 0, right: 0, height: 1, width: "auto" },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", ...s, background: selected ? "rgba(10,132,255,0.3)" : "rgba(120,120,128,0.18)" }} />
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: selected ? "#0A84FF" : (isDark ? "#E5E5E7" : "#1C1C1E") }}>{label}</div>
        <div style={{ fontSize: 9, color: "#8E8E93", marginTop: 1 }}>{sub}</div>
        {value === "narrow" && <span className="pcc-recommended">Default</span>}
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrintCommandCenter({
  open,
  onClose,
  onPrint,
  onExport,
  onPreviewSheet,
  DAY_DEFS,
  selectedDayIndex,
  isPrinting,
  printProgress,
  isDark = false,
  currentNightStatus = null,
}: PrintCommandCenterProps) {

  const applyConfig = useCallback((config: PrintConfig) => {
    setDays(config.days);
    setPageOrder(config.pageOrder);
    setMargins(config.margins);
    setIncludeOverview(config.includeOverview ?? false);
    setOverviewPosition(config.overviewPosition ?? "last");
    setIncludeCoverPage(config.includeCoverPage ?? false);
    setCoverPagePosition(config.coverPagePosition ?? "first");
    setCustomOrder(config.customQueueOrder ?? null);
    setPrintVariant(config.printVariant ?? "official");
    setIncludeShiftNotes(config.includeShiftNotes !== false);
  }, []);

  // ── Core config state ──────────────────────────────────────────────────────
  const [days, setDays] = useState<PrintDayConfig[]>(() => defaultPrintDays(selectedDayIndex));
  const [pageOrder, setPageOrder] = useState<PageOrder>("paired");
  const [margins, setMargins] = useState<MarginSize>("narrow");
  const [includeOverview, setIncludeOverview] = useState(false);
  const [overviewPosition, setOverviewPosition] = useState<"first" | "last">("last");
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [coverPagePosition, setCoverPagePosition] = useState<"first" | "last">("first");
  const [printVariant, setPrintVariant] = useState<PrintVariant>("official");
  const [includeShiftNotes, setIncludeShiftNotes] = useState(true);
  const [nightStatusByDay, setNightStatusByDay] = useState<Record<number, string | null>>({});

  // ── Saved presets ──────────────────────────────────────────────────────────
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveInputValue, setSaveInputValue] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevBodyOverflow = useRef<string>("");

  // ── Queue drag-to-reorder ──────────────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);

  // ── Animation mount ───────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Restore last-used config when opened; fall back to tonight-only defaults
  useEffect(() => {
    if (!open) return;
    const last = loadLastPrintConfig(selectedDayIndex);
    const defaultDays = defaultPrintDays(selectedDayIndex).map((d) =>
      d.dayIndex === selectedDayIndex
        ? { ...d, printDeploy: true, printBreaks: true }
        : d,
    );
    const defaultVariant: PrintVariant =
      currentNightStatus !== "published" ? "planning" : "official";

    if (last) {
      applyConfig(last);
    } else {
      applyConfig({
        days: defaultDays,
        pageOrder: "paired",
        margins: "narrow",
        includeOverview: false,
        overviewPosition: "last",
        includeCoverPage: false,
        coverPagePosition: "first",
        customQueueOrder: null,
        printVariant: defaultVariant,
        includeShiftNotes: true,
      });
    }
    setSavedPresets(loadPresets());
  }, [open, selectedDayIndex, applyConfig, currentNightStatus]);

  // Fetch publish status for queued nights (for defaults + official confirm)
  useEffect(() => {
    if (!open) return;
    const activeIndices = [
      ...new Set(
        days
          .filter((d) => d.printDeploy || d.printBreaks)
          .map((d) => d.dayIndex),
      ),
    ];
    if (activeIndices.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { getNightIdForDate, getNightMeta } = await import("@/lib/shiftbuilder/data");
        const entries = await Promise.all(
          activeIndices.map(async (dayIndex) => {
            const def = DAY_DEFS[dayIndex];
            if (!def) return [dayIndex, null] as const;
            const nightId = await getNightIdForDate(def.date);
            if (!nightId) return [dayIndex, "draft"] as const;
            const meta = await getNightMeta(nightId);
            return [dayIndex, meta.status ?? "draft"] as const;
          }),
        );
        if (cancelled) return;
        setNightStatusByDay((prev) => {
          const next = { ...prev };
          for (const [idx, status] of entries) next[idx] = status;
          return next;
        });
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, days, DAY_DEFS]);

  // Focus save input when shown
  useEffect(() => {
    if (showSaveInput) setTimeout(() => saveInputRef.current?.focus(), 50);
  }, [showSaveInput]);

  // Lock body scroll + focus modal when open
  useEffect(() => {
    if (!open) return;
    prevBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => modalRef.current?.focus(), 80);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevBodyOverflow.current;
    };
  }, [open]);

  // ── Derived values ────────────────────────────────────────────────────────
  const overviewNightCount = useMemo(() => days.filter((d) => d.inOverview).length, [days]);

  const pageCount = useMemo(
    () => countPrintPages(days, includeOverview, includeCoverPage),
    [days, includeOverview, includeCoverPage],
  );
  const estSecs = useMemo(
    () => estimatePrintSeconds(days, includeOverview),
    [days, includeOverview],
  );
  const autoQueue = useMemo(
    () =>
      buildPrintQueue(
        days,
        pageOrder,
        DAY_DEFS,
        includeOverview,
        overviewPosition,
        includeCoverPage,
        coverPagePosition,
        printVariant,
      ),
    [days, pageOrder, DAY_DEFS, includeOverview, overviewPosition, includeCoverPage, coverPagePosition, printVariant],
  );
  const queueItems = useMemo(
    () => applyCustomQueueOrder(autoQueue, customOrder),
    [autoQueue, customOrder],
  );

  useEffect(() => {
    if (!customOrder?.length) return;
    const autoIds = autoQueue.map((i) => i.id).join(",");
    const customIds = customOrder.join(",");
    if (autoIds !== customIds) setCustomOrder(null);
  }, [autoQueue, customOrder]);

  const activePreset = useMemo(
    () => detectActivePreset(days, selectedDayIndex, includeOverview, includeCoverPage, printVariant),
    [days, selectedDayIndex, includeOverview, includeCoverPage, printVariant],
  );

  const handlePrintVariantChange = useCallback(
    (next: PrintVariant) => {
      if (next === printVariant) return;
      if (
        next === "official" &&
        hasUnpublishedQueuedNights(days, selectedDayIndex, currentNightStatus, nightStatusByDay)
      ) {
        const ok = window.confirm(
          "One or more selected nights are still unpublished. Print the official floor sheet anyway?",
        );
        if (!ok) return;
      }
      setPrintVariant(next);
      setCustomOrder(null);
    },
    [printVariant, days, selectedDayIndex, currentNightStatus, nightStatusByDay],
  );

  const deployCount = useMemo(() => days.filter((d) => d.printDeploy).length, [days]);
  const breaksCount = useMemo(() => days.filter((d) => d.printBreaks).length, [days]);
  const activeNightCount = useMemo(
    () => days.filter((d) => d.printDeploy || d.printBreaks).length,
    [days],
  );
  const uniqueExportDays = useMemo(
    () => new Set(days.filter((d) => d.printDeploy || d.printBreaks).map((d) => d.dayIndex)).size,
    [days],
  );
  const exportDeliverable = useMemo(() => {
    if (pageCount === 0) return null;
    return uniqueExportDays > 1 ? "ZIP bundle" : "PDF";
  }, [pageCount, uniqueExportDays]);

  // Keep Tab focus inside the dialog
  useEffect(() => {
    if (!open || !mounted) return;
    const root = modalRef.current;
    if (!root) return;

    const getFocusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = getFocusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener("keydown", onTab);
    return () => root.removeEventListener("keydown", onTab);
  }, [open, mounted, showSaveInput, pageCount, isPrinting]);

  // ── Config snapshot (for save/apply) ──────────────────────────────────────
  const currentConfig = useCallback(
    (): PrintConfig => ({
      days,
      pageOrder,
      margins,
      includeOverview,
      overviewPosition,
      includeCoverPage,
      coverPagePosition,
      customQueueOrder: customOrder,
      printVariant,
      includeShiftNotes,
    }),
    [
      days,
      pageOrder,
      margins,
      includeOverview,
      overviewPosition,
      includeCoverPage,
      coverPagePosition,
      customOrder,
      printVariant,
      includeShiftNotes,
    ],
  );

  // ── Day change handler ────────────────────────────────────────────────────
  const handleDayChange = useCallback((updated: PrintDayConfig) => {
    setDays((prev) => {
      const synced = syncOverviewFromDayChange(prev, updated);
      setIncludeOverview(synced.includeOverview);
      return synced.days;
    });
    setCustomOrder(null);
  }, []);

  const handleOverviewMasterToggle = useCallback(() => {
    const next = !includeOverview;
    const synced = syncOverviewMaster(days, next, selectedDayIndex);
    setIncludeOverview(synced.includeOverview);
    setDays(synced.days);
    setCustomOrder(null);
  }, [includeOverview, days, selectedDayIndex]);

  // ── Bulk toggles ──────────────────────────────────────────────────────────
  const allDeploy = days.every(d => d.printDeploy);
  const allBreaks = days.every(d => d.printBreaks);
  const allOverview = days.every(d => d.inOverview);

  const bulkToggle = useCallback(
    (field: "printDeploy" | "printBreaks" | "inOverview") => {
      const currentAll = days.every((d) => d[field]);
      const nextVal = !currentAll;
      setDays((prev) => {
        const nextDays = prev.map((d) => ({ ...d, [field]: nextVal }));
        if (field === "inOverview") {
          setIncludeOverview(nextVal);
        }
        return nextDays;
      });
      setCustomOrder(null);
    },
    [days],
  );

  const bulkClear = useCallback(() => {
    setDays((prev) => prev.map((d) => ({ ...d, printDeploy: false, printBreaks: false, inOverview: false })));
    setIncludeOverview(false);
    setCustomOrder(null);
  }, []);

  // ── Presets ───────────────────────────────────────────────────────────────
  const applyBuiltinPreset = useCallback(
    (preset: "tonight" | "tonight-planning" | "full-week" | "deploy-book" | "break-book") => {
      setIncludeCoverPage(false);
      setCustomOrder(null);
      if (preset === "tonight" || preset === "tonight-planning") {
        applyConfig({
          days: defaultPrintDays(selectedDayIndex).map((d) =>
            d.dayIndex === selectedDayIndex
              ? { ...d, printDeploy: true, printBreaks: true }
              : { ...d, printDeploy: false, printBreaks: false },
          ),
          pageOrder: "paired",
          margins: "narrow",
          includeOverview: false,
          overviewPosition: "last",
          includeCoverPage: false,
          coverPagePosition: "first",
          customQueueOrder: null,
          printVariant: preset === "tonight-planning" ? "planning" : "official",
          includeShiftNotes: true,
        });
      } else if (preset === "full-week") {
        applyConfig({
          days: Array.from({ length: 7 }, (_, i) => ({
            dayIndex: i,
            printDeploy: true,
            printBreaks: true,
            inOverview: true,
          })),
          pageOrder: "paired",
          margins: "narrow",
          includeOverview: true,
          overviewPosition: "last",
          includeCoverPage: false,
          coverPagePosition: "first",
          customQueueOrder: null,
          printVariant: "official",
          includeShiftNotes: true,
        });
      } else if (preset === "deploy-book") {
        applyConfig({
          days: Array.from({ length: 7 }, (_, i) => ({
            dayIndex: i,
            printDeploy: true,
            printBreaks: false,
            inOverview: false,
          })),
          pageOrder: "deploy-first",
          margins: "narrow",
          includeOverview: false,
          overviewPosition: "last",
          includeCoverPage: false,
          coverPagePosition: "first",
          customQueueOrder: null,
          printVariant: "official",
          includeShiftNotes: true,
        });
      } else {
        applyConfig({
          days: Array.from({ length: 7 }, (_, i) => ({
            dayIndex: i,
            printDeploy: false,
            printBreaks: true,
            inOverview: false,
          })),
          pageOrder: "breaks-first",
          margins: "narrow",
          includeOverview: false,
          overviewPosition: "last",
          includeCoverPage: false,
          coverPagePosition: "first",
          customQueueOrder: null,
          printVariant: "official",
          includeShiftNotes: true,
        });
      }
    },
    [selectedDayIndex, applyConfig],
  );

  const applySavedPreset = useCallback(
    (preset: SavedPreset) => {
      applyConfig({ ...preset.config, customQueueOrder: null });
    },
    [applyConfig],
  );

  const handleSavePreset = useCallback(() => {
    const name = saveInputValue.trim();
    if (!name) return;
    if (savedPresets.some((p) => p.name.toLowerCase() === name.toLowerCase())) return;
    const preset: SavedPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      config: currentConfig(),
      savedAt: Date.now(),
    };
    const updated = [...savedPresets, preset];
    setSavedPresets(updated);
    persistPresets(updated);
    setShowSaveInput(false);
    setSaveInputValue("");
  }, [saveInputValue, savedPresets, currentConfig]);

  const handleDeletePreset = useCallback((id: string) => {
    const updated = savedPresets.filter(p => p.id !== id);
    setSavedPresets(updated);
    persistPresets(updated);
  }, [savedPresets]);

  // ── Queue drag-to-reorder ─────────────────────────────────────────────────
  const handleQueueDragStart = useCallback((id: string) => setDragId(id), []);
  const handleQueueDragOver = useCallback((id: string) => setDragOverId(id), []);
  const handleQueueDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const order = queueItems.map(i => i.id);
    const from = order.indexOf(dragId);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) { setDragId(null); setDragOverId(null); return; }
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    setCustomOrder(next);
    setDragId(null);
    setDragOverId(null);
  }, [dragId, queueItems]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (pageCount === 0) return;
    onPrint(currentConfig());
  }, [pageCount, currentConfig, onPrint]);

  // ── Export PDF / ZIP ──────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (pageCount === 0 || !onExport) return;
    onExport(currentConfig());
  }, [pageCount, currentConfig, onExport]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPrinting && !showSaveInput) { e.stopPropagation(); onClose(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.shiftKey && !isPrinting && pageCount > 0 && onExport) {
        e.preventDefault();
        handleExport();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !isPrinting && pageCount > 0) {
        e.preventDefault();
        handlePrint();
      }
      if (e.key === "Escape" && showSaveInput) { e.stopPropagation(); setShowSaveInput(false); }
      if (e.key === "Enter" && showSaveInput) { e.stopPropagation(); handleSavePreset(); }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, isPrinting, pageCount, onClose, onExport, handlePrint, handleExport, showSaveInput, handleSavePreset]);

  if (!mounted) return null;

  // ── Theme values ──────────────────────────────────────────────────────────
  const panelBg = isDark ? "rgba(28,28,30,0.97)" : "rgba(250,250,252,0.98)";
  const border = isDark ? "rgba(72,72,74,0.6)" : "rgba(209,209,214,0.7)";
  const tx = isDark ? "#F2F2F4" : "#1C1C1E";
  const ts = isDark ? "#8E8E93" : "#6B7280";
  const divider = isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.5)";
  const sectionBg = isDark ? "rgba(44,44,46,0.4)" : "rgba(240,240,242,0.4)";

  return createPortal(
    <div
      className={cn(
        "sb-overlay-backdrop sb-overlay-backdrop--fixed sb-overlay-fade z-[9000]",
        "flex items-center justify-center p-5",
        visible && "sb-overlay-fade--visible"
      )}
      style={{ 
        position: 'fixed', 
        inset: 0, 
        zIndex: 99999, 
        background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)" 
      }}
      onClick={e => { if (e.target === e.currentTarget && !isPrinting && !showSaveInput) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pcc-title"
        aria-describedby="pcc-summary"
        tabIndex={-1}
        className={cn(
          "sb-modal-shell pcc-modal flex flex-col overflow-hidden relative outline-none",
          visible && "sb-modal-shell--visible"
        )}
        style={{
          width: "min(780px, 100%)",
          maxHeight: "min(92vh, 800px)",
          background: panelBg,
          borderRadius: 20,
          border: `1px solid ${border}`,
          boxShadow: isDark
            ? "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)"
            : "0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 14px", borderBottom: `1px solid ${divider}`, flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: isDark ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Printer size={17} color="#0A84FF" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="pcc-title" style={{ fontSize: 15, fontWeight: 700, color: tx, letterSpacing: "-0.02em" }}>Print &amp; Export</div>
            {DAY_DEFS.length > 0 && (
              <div style={{ fontSize: 11, color: ts, marginTop: 2 }}>
                Graves week · {DAY_DEFS[0]?.short} {DAY_DEFS[0]?.dateNum} – {DAY_DEFS[6]?.short} {DAY_DEFS[6]?.dateNum} · {DAY_DEFS[0]?.monthYear}
              </div>
            )}
          </div>
          {isPrinting ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: ts, whiteSpace: "nowrap" }}>
              <span className="sb-progress-pulse" style={{ width: 7, height: 7, borderRadius: 4, background: "#0A84FF", display: "inline-block" }} />
              {printProgress?.label ?? "Working…"}
            </div>
          ) : pageCount > 0 ? (
            <div style={{
              padding: "5px 10px",
              borderRadius: 20,
              background: isDark ? "rgba(10,132,255,0.18)" : "rgba(10,132,255,0.1)",
              border: "1px solid rgba(10,132,255,0.28)",
              fontSize: 11,
              fontWeight: 700,
              color: "#0A84FF",
              whiteSpace: "nowrap",
            }}>
              {pageCount} sheet{pageCount !== 1 ? "s" : ""}
            </div>
          ) : null}
          <button type="button" onClick={onClose} disabled={isPrinting} aria-label="Close print dialog" className="sb-interactive pcc-icon-btn" style={{ width: 28, height: 28, borderRadius: 14, background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)", border: "none", cursor: isPrinting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: ts, opacity: isPrinting ? 0.4 : 1 }} title="Close (Esc)">
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* ── SELECTION SUMMARY ─────────────────────────────────────────────── */}
        <div
          id="pcc-summary"
          style={{
            padding: "10px 20px",
            borderBottom: `1px solid ${divider}`,
            background: sectionBg,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {pageCount === 0 ? (
            <span style={{ fontSize: 11, color: ts, lineHeight: 1.45 }}>
              Pick nights and sheet types below — your queue builds automatically.
            </span>
          ) : (
            <>
              {printVariant === "planning" && (
                <SummaryPill label="Planning worksheet" color="#8E8E93" isDark={isDark} />
              )}
              {deployCount > 0 && <SummaryPill label={`${deployCount} deploy`} color="rgba(52,199,89,0.9)" isDark={isDark} />}
              {breaksCount > 0 && (
                <SummaryPill
                  label={
                    printVariant === "planning"
                      ? `${breaksCount} aux + overlaps`
                      : `${breaksCount} breaks`
                  }
                  color="rgba(255,159,10,0.9)"
                  isDark={isDark}
                />
              )}
              {includeOverview && overviewNightCount > 0 && (
                <SummaryPill label={`Overview · ${overviewNightCount} col${overviewNightCount !== 1 ? "s" : ""}`} color="#5856D6" isDark={isDark} />
              )}
              {includeCoverPage && <SummaryPill label="Cover" color="#0A84FF" isDark={isDark} />}
              {customOrder && <SummaryPill label="Custom order" color="#FF9F0A" isDark={isDark} />}
              <span style={{ fontSize: 10.5, color: ts, marginLeft: 2 }}>
                {activeNightCount} night{activeNightCount !== 1 ? "s" : ""} · {formatEstTime(estSecs)}
                {exportDeliverable ? ` · ${exportDeliverable}` : ""}
              </span>
            </>
          )}
        </div>

        {/* ── SCROLLABLE BODY ───────────────────────────────────────────────── */}
        <div className="pcc-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", opacity: isPrinting ? 0.45 : 1, pointerEvents: isPrinting ? "none" : "auto", transition: "opacity 0.2s" }}>

          {/* ── BUILT-IN PRESETS ──────────────────────────────────────────── */}
          <div style={{ padding: "14px 20px 0" }}>
            <SectionLabel text="QUICK PRESETS" isDark={isDark} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {([
                { id: "tonight", label: "Tonight", icon: <Moon size={12} strokeWidth={2.2} /> },
                { id: "tonight-planning", label: "Tonight — Planning", icon: <Pencil size={12} strokeWidth={2.2} /> },
                { id: "full-week", label: "Full Week", icon: <CalendarDays size={12} strokeWidth={2.2} /> },
                { id: "deploy-book", label: "Deploy Book", icon: <LayoutGrid size={12} strokeWidth={2.2} /> },
                { id: "break-book", label: "Break Book", icon: <Coffee size={12} strokeWidth={2.2} /> },
              ] as const).map(({ id, label, icon }) => (
                <PresetPill
                  key={id}
                  label={label}
                  icon={icon}
                  active={activePreset === id}
                  onClick={() => applyBuiltinPreset(id)}
                  isDark={isDark}
                  title={BUILTIN_PRESET_HINTS[id]}
                />
              ))}
              {activePreset === "custom" && (
                <span
                  title="Manual selection — not matching a quick preset"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 10px",
                    borderRadius: 20,
                    border: "1.5px solid rgba(255,159,10,0.45)",
                    background: isDark ? "rgba(255,159,10,0.14)" : "rgba(255,159,10,0.1)",
                    color: "#FF9F0A",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <Pencil size={12} strokeWidth={2.2} />
                  Custom
                </span>
              )}
            </div>

            {/* Saved presets row */}
            {savedPresets.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: ts, letterSpacing: "0.06em", width: "100%", opacity: 0.7 }}>SAVED</span>
                {savedPresets.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 20, border: `1.5px solid ${isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)"}`, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => applySavedPreset(p)}
                      title={formatPresetSavedAt(p.savedAt) ? `Saved ${formatPresetSavedAt(p.savedAt)}` : undefined}
                      className="sb-interactive pcc-saved-preset"
                      style={{ padding: "5px 10px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: ts, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <Save size={11} strokeWidth={2} />
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePreset(p.id)}
                      aria-label={`Delete preset ${p.name}`}
                      className="sb-interactive pcc-delete-preset"
                      style={{ padding: "5px 7px", background: "transparent", border: "none", cursor: "pointer", color: ts, display: "flex", alignItems: "center" }}
                    >
                      <Trash2 size={11} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SectionDivider isDark={isDark} />

          {/* ── DAY CARDS ─────────────────────────────────────────────────── */}
          <div style={{ padding: "14px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SectionLabel text="NIGHTS" isDark={isDark} />
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <BulkBtn label="All Deploy" active={allDeploy} color="rgba(52,199,89,0.85)" onClick={() => bulkToggle("printDeploy")} isDark={isDark} />
                <BulkBtn label="All Breaks" active={allBreaks} color="rgba(255,159,10,0.85)" onClick={() => bulkToggle("printBreaks")} isDark={isDark} />
                <BulkBtn label="All Overview" active={allOverview} color="rgba(88,86,214,0.85)" onClick={() => bulkToggle("inOverview")} isDark={isDark} />
                <BulkBtn label="Clear" active={false} color="#FF3B30" onClick={bulkClear} isDark={isDark} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: ts, marginBottom: 8, opacity: 0.85 }}>
              Header toggles deploy + breaks · chips toggle individual sheets
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {DAY_DEFS.map((def, i) => (
                <DayCard
                  key={def.index}
                  def={def}
                  config={days[i] ?? { dayIndex: i, printDeploy: false, printBreaks: false, inOverview: false }}
                  onChange={handleDayChange}
                  isDark={isDark}
                />
              ))}
            </div>
          </div>

          <SectionDivider isDark={isDark} />

          {/* ── SETTINGS ──────────────────────────────────────────────────── */}
          <div style={{ padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Sheet type */}
            <div>
              <SectionLabel text="SHEET TYPE" isDark={isDark} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {([
                  { v: "planning" as const, l: "Planning Worksheet", d: "Muted review sheet · overlaps-only breaks" },
                  { v: "official" as const, l: "Official Floor Sheet", d: "Standard deploy + break waves for floor" },
                ]).map(({ v, l, d }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handlePrintVariantChange(v)}
                    aria-pressed={printVariant === v}
                    className="sb-interactive pcc-seg"
                    style={{
                      flex: "1 1 180px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 2,
                      padding: "8px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      textAlign: "left",
                      border: `1.5px solid ${printVariant === v ? "#0A84FF" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                      background: printVariant === v ? (isDark ? "rgba(10,132,255,0.12)" : "rgba(10,132,255,0.07)") : (isDark ? "rgba(44,44,46,0.38)" : "rgba(255,255,255,0.5)"),
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: printVariant === v ? "#0A84FF" : tx }}>{l}</div>
                      {printVariant === v && <Check size={12} color="#0A84FF" strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                    </div>
                    <div style={{ fontSize: 9.5, color: ts }}>{d}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIncludeShiftNotes((v) => !v)}
                aria-pressed={includeShiftNotes}
                className="sb-interactive"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  marginTop: 8,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1px solid ${includeShiftNotes ? "rgba(10,132,255,0.35)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                  background: includeShiftNotes ? (isDark ? "rgba(10,132,255,0.1)" : "rgba(10,132,255,0.06)") : "transparent",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <CheckDot active={includeShiftNotes} color="#0A84FF" />
                <span style={{ fontSize: 11, fontWeight: 600, color: includeShiftNotes ? "#0A84FF" : tx }}>
                  Include shift notes
                </span>
                <span style={{ fontSize: 9.5, color: ts, marginLeft: "auto" }}>
                  Pre-fills saved notes + ruled lines
                </span>
              </button>
            </div>

            {/* Page Order — horizontal segmented */}
            <div>
              <SectionLabel text="PAGE ORDER" isDark={isDark} />
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {([
                  { v: "paired", l: "Paired", d: "Deploy + Breaks each night" },
                  { v: "deploy-first", l: "Deploy First", d: "All deploy, then breaks" },
                  { v: "breaks-first", l: "Breaks First", d: "All breaks, then deploy" },
                ] as const).map(({ v, l, d }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setPageOrder(v); setCustomOrder(null); }}
                    aria-pressed={pageOrder === v}
                    className="sb-interactive pcc-seg"
                    style={{
                      flex: "1 1 140px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 2,
                      padding: "8px 10px",
                      borderRadius: 10,
                      cursor: "pointer",
                      textAlign: "left",
                      border: `1.5px solid ${pageOrder === v ? "#0A84FF" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                      background: pageOrder === v ? (isDark ? "rgba(10,132,255,0.12)" : "rgba(10,132,255,0.07)") : (isDark ? "rgba(44,44,46,0.38)" : "rgba(255,255,255,0.5)"),
                      transition: "all 0.12s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: pageOrder === v ? "#0A84FF" : tx }}>{l}</div>
                      {pageOrder === v && <Check size={12} color="#0A84FF" strokeWidth={2.5} style={{ marginLeft: "auto" }} />}
                    </div>
                    <div style={{ fontSize: 9.5, color: ts }}>{d}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Margins */}
            <div>
              <SectionLabel text="MARGINS" isDark={isDark} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
                {([
                  { v: "none", l: "None", s: "0in" },
                  { v: "narrow", l: "Narrow", s: "0.15in" },
                  { v: "normal", l: "Normal", s: "0.5in" },
                  { v: "wide", l: "Wide", s: "1in" },
                ] as const).map(({ v, l, s }) => (
                  <MarginCard key={v} value={v} label={l} sub={s} selected={margins === v} onClick={() => setMargins(v)} isDark={isDark} />
                ))}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <Info size={13} color={ts} strokeWidth={2} />
                <span style={{ fontSize: 10, color: ts }}>
                  Auto-scale <strong style={{ color: tx }}>{Math.round(MARGIN_ZOOM[margins] * 100)}%</strong>
                  <span style={{ opacity: 0.55 }}> · 11×8.5″ landscape</span>
                </span>
              </div>
            </div>

            {/* Extra pages */}
            <div>
              <SectionLabel text="EXTRA PAGES" isDark={isDark} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                {/* Overview */}
                <div style={{ borderRadius: 8, border: `1.5px solid ${includeOverview ? "rgba(88,86,214,0.5)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`, background: includeOverview ? (isDark ? "rgba(88,86,214,0.1)" : "rgba(88,86,214,0.06)") : "transparent", overflow: "hidden" }}>
                  <button type="button" onClick={handleOverviewMasterToggle} aria-pressed={includeOverview} className="sb-interactive pcc-extra" style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", width: "100%", background: "transparent", border: "none", cursor: "pointer" }}>
                    <CheckDot active={includeOverview} color="rgba(88,86,214,0.9)" />
                    <div style={{ textAlign: "left", flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: includeOverview ? "#5856D6" : tx, display: "flex", alignItems: "center", gap: 5 }}>
                        <Table2 size={12} strokeWidth={2} />
                        Overview Table
                      </div>
                      <div style={{ fontSize: 9, color: ts }}>
                        {includeOverview
                          ? overviewNightCount === 1
                            ? "Daily layout · 1 night column"
                            : `Weekly layout · ${overviewNightCount} night columns`
                          : "Slot grid — enable Overview chips on nights"}
                      </div>
                    </div>
                  </button>
                  {includeOverview && (
                    <div style={{ padding: "0 9px 7px", display: "flex", gap: 4 }}>
                      <PosBtn label="First" active={overviewPosition === "first"} onClick={() => setOverviewPosition("first")} color="#5856D6" isDark={isDark} />
                      <PosBtn label="Last" active={overviewPosition === "last"} onClick={() => setOverviewPosition("last")} color="#5856D6" isDark={isDark} />
                    </div>
                  )}
                </div>

                {/* Cover page */}
                <div style={{ borderRadius: 8, border: `1.5px solid ${includeCoverPage ? "rgba(10,132,255,0.45)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`, background: includeCoverPage ? (isDark ? "rgba(10,132,255,0.1)" : "rgba(10,132,255,0.06)") : "transparent", overflow: "hidden" }}>
                  <button type="button" onClick={() => setIncludeCoverPage((v) => !v)} aria-pressed={includeCoverPage} className="sb-interactive pcc-extra" style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", width: "100%", background: "transparent", border: "none", cursor: "pointer" }}>
                    <CheckDot active={includeCoverPage} color="rgba(10,132,255,0.9)" />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: includeCoverPage ? "#0A84FF" : tx, display: "flex", alignItems: "center", gap: 5 }}>
                        <FileText size={12} strokeWidth={2} />
                        Cover Page
                      </div>
                      <div style={{ fontSize: 9, color: ts }}>Dark title + contents</div>
                    </div>
                  </button>
                  {includeCoverPage && (
                    <div style={{ padding: "0 9px 7px", display: "flex", gap: 4 }}>
                      <PosBtn label="First" active={coverPagePosition === "first"} onClick={() => setCoverPagePosition("first")} color="#0A84FF" isDark={isDark} />
                      <PosBtn label="Last" active={coverPagePosition === "last"} onClick={() => setCoverPagePosition("last")} color="#0A84FF" isDark={isDark} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <SectionDivider isDark={isDark} />

          {/* ── PRINT QUEUE ───────────────────────────────────────────────── */}
          <div style={{ padding: "14px 20px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SectionLabel text="SHEET QUEUE" isDark={isDark} />
              {pageCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 600, color: ts }}>{pageCount} total</span>
              )}
              {customOrder && (
                <button type="button" onClick={() => setCustomOrder(null)} className="sb-interactive" style={{ marginLeft: "auto", fontSize: 9.5, color: "#FF9F0A", background: "rgba(255,159,10,0.12)", border: "1px solid rgba(255,159,10,0.3)", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                  Reset custom order
                </button>
              )}
            </div>

            {queueItems.length === 0 ? (
              <div style={{ padding: "18px 14px", borderRadius: 12, background: sectionBg, border: `1px dashed ${divider}`, textAlign: "center", color: ts, fontSize: 11.5 }}>
                <Sparkles size={16} style={{ margin: "0 auto 8px", opacity: 0.45 }} />
                No sheets queued yet — select nights above
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: ts, marginBottom: 8, opacity: 0.8 }}>
                  Drag to reorder · eye icon previews deploy/breaks on canvas
                </div>
                <div
                  role="list"
                  aria-label="Sheet print order"
                  className="pcc-scroll"
                  style={{
                    display: "flex",
                    gap: 6,
                    overflowX: "auto",
                    paddingBottom: 6,
                    alignItems: "stretch",
                  }}
                  onDragLeave={() => setDragOverId(null)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                >
                  {queueItems.map((item, idx) => {
                    const isBeingDragged = dragId === item.id;
                    const isDropTarget = dragOverId === item.id && dragId !== item.id;
                    const typeLabel =
                      item.type === "breaks" && printVariant === "planning"
                        ? "Aux + Overlaps"
                        : { deploy: "Deploy", breaks: "Breaks", overview: "Overview", cover: "Cover" }[item.type];
                    const canPreview =
                      onPreviewSheet &&
                      (item.type === "deploy" || item.type === "breaks") &&
                      item.dayIndex !== undefined;
                    return (
                      <div
                        key={item.id}
                        role="listitem"
                        draggable
                        tabIndex={0}
                        aria-grabbed={isBeingDragged}
                        aria-label={`${idx + 1}. ${item.label}, ${typeLabel}`}
                        onDragStart={(e) => {
                          handleQueueDragStart(item.id);
                          if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", item.id);
                          }
                        }}
                        onDragOver={(e) => { e.preventDefault(); handleQueueDragOver(item.id); }}
                        onDrop={() => handleQueueDrop(item.id)}
                        className="pcc-queue-card"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          flexShrink: 0,
                          minWidth: 108,
                          padding: "8px 8px 7px",
                          borderRadius: 10,
                          cursor: "grab",
                          opacity: isBeingDragged ? 0.35 : 1,
                          transform: isDropTarget ? "translateY(-2px)" : "none",
                          transition: "transform 0.12s, opacity 0.12s, box-shadow 0.12s",
                          background: isDark ? "rgba(44,44,46,0.55)" : "rgba(255,255,255,0.75)",
                          border: `1.5px solid ${isDropTarget ? item.color : (isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.55)")}`,
                          boxShadow: isDropTarget ? `0 4px 14px ${item.color}33` : "none",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                          <span style={{ fontSize: 9, color: ts, fontWeight: 700 }}>#{idx + 1}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            {canPreview && (
                              <button
                                type="button"
                                className="sb-interactive pcc-icon-btn"
                                aria-label={`Preview ${item.label}`}
                                title="Preview on canvas"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onPreviewSheet({
                                    dayIndex: item.dayIndex!,
                                    view: item.type === "breaks" ? "breaks" : "deployment",
                                    label: item.label,
                                    printVariant,
                                    includeShiftNotes,
                                  });
                                }}
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 5,
                                  border: "none",
                                  background: isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.45)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  color: ts,
                                  padding: 0,
                                }}
                              >
                                <Eye size={11} strokeWidth={2.2} />
                              </button>
                            )}
                            <GripVertical size={11} color={ts} strokeWidth={2.2} style={{ opacity: 0.45 }} />
                          </div>
                        </div>
                        <div style={{
                          height: 3,
                          borderRadius: 2,
                          background: item.type === "overview" ? "#5856D6" : item.type === "cover" ? "#3A3A3C" : item.color,
                          opacity: item.type === "breaks" ? 0.65 : 1,
                        }} />
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: tx, lineHeight: 1.25 }}>{item.label}</div>
                        <div style={{ fontSize: 9, color: ts, fontWeight: 600 }}>{typeLabel}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 20px",
          borderTop: `1px solid ${divider}`,
          background: isDark ? "rgba(22,22,24,0.75)" : "rgba(245,245,247,0.92)",
          flexShrink: 0,
        }}>
          {showSaveInput ? (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  ref={saveInputRef}
                  value={saveInputValue}
                  onChange={(e) => setSaveInputValue(e.target.value.slice(0, 32))}
                  onFocus={(e) => e.target.select()}
                  maxLength={32}
                  placeholder="Name this preset…"
                  aria-label="Preset name"
                  className="pcc-save-input"
                  style={{
                    width: "100%", padding: "6px 10px", borderRadius: 8, fontSize: 12,
                    background: isDark ? "rgba(44,44,46,0.8)" : "rgba(255,255,255,0.9)",
                    border: `1.5px solid ${isDark ? "rgba(72,72,74,0.7)" : "rgba(209,209,214,0.8)"}`,
                    color: tx, outline: "none",
                  }}
                />
                {saveInputValue.trim() &&
                  savedPresets.some((p) => p.name.toLowerCase() === saveInputValue.trim().toLowerCase()) && (
                  <div style={{ fontSize: 10, color: "#FF3B30", marginTop: 4 }}>That name is already saved</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={
                  !saveInputValue.trim() ||
                  savedPresets.some((p) => p.name.toLowerCase() === saveInputValue.trim().toLowerCase())
                }
                style={{
                  padding: "6px 14px", borderRadius: 8, background: "#0A84FF", color: "#fff", border: "none",
                  cursor: saveInputValue.trim() && !savedPresets.some((p) => p.name.toLowerCase() === saveInputValue.trim().toLowerCase()) ? "pointer" : "not-allowed",
                  fontSize: 12, fontWeight: 600,
                  opacity: saveInputValue.trim() && !savedPresets.some((p) => p.name.toLowerCase() === saveInputValue.trim().toLowerCase()) ? 1 : 0.5,
                }}
              >
                Save
              </button>
              <button type="button" onClick={() => { setShowSaveInput(false); setSaveInputValue(""); }} style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", color: ts, border: `1.5px solid ${divider}`, cursor: "pointer", fontSize: 12 }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Stats + shortcuts */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {pageCount > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 11, color: ts }}>
                      <span style={{ color: tx, fontWeight: 700 }}>{pageCount} sheet{pageCount !== 1 ? "s" : ""}</span>
                      {" · "}{formatEstTime(estSecs)}
                      {exportDeliverable && (
                        <span style={{ opacity: 0.75 }}> · {exportDeliverable}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <KbdHint label="Print" keys={["⌘", "↩"]} isDark={isDark} />
                      {onExport && <KbdHint label="Export" keys={["⌘", "⇧", "↩"]} isDark={isDark} />}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: ts, opacity: 0.55 }}>Select nights to enable actions</span>
                )}
              </div>

              {/* Save preset */}
              <button type="button" onClick={() => setShowSaveInput(true)} disabled={pageCount === 0} className="sb-interactive pcc-footer-btn" style={{ padding: "7px 12px", borderRadius: 9, border: `1.5px solid ${divider}`, background: "transparent", color: ts, fontSize: 11.5, fontWeight: 500, cursor: pageCount === 0 ? "not-allowed" : "pointer", opacity: pageCount === 0 ? 0.4 : 1, display: "flex", alignItems: "center", gap: 5 }} title="Save current config as a preset">
                <Save size={13} strokeWidth={2} />
                Save
              </button>

              {/* Cancel */}
              <button type="button" onClick={onClose} disabled={isPrinting} className="sb-interactive pcc-footer-btn" style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${divider}`, background: "transparent", color: ts, fontSize: 12.5, fontWeight: 600, cursor: isPrinting ? "not-allowed" : "pointer", opacity: isPrinting ? 0.4 : 1 }}>
                Cancel
              </button>

              {/* Export PDF (single PDF or ZIP of per-day PDFs) */}
              <button type="button" onClick={handleExport} disabled={isPrinting || pageCount === 0 || !onExport} className="sb-interactive" style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10,
                border: `1.5px solid ${uniqueExportDays > 1 ? "rgba(10,132,255,0.35)" : divider}`,
                background: uniqueExportDays > 1
                  ? (isDark ? "rgba(10,132,255,0.12)" : "rgba(10,132,255,0.08)")
                  : "transparent",
                color: uniqueExportDays > 1 ? "#0A84FF" : ts,
                fontSize: 12.5, fontWeight: 600,
                cursor: (isPrinting || pageCount === 0 || !onExport) ? "not-allowed" : "pointer",
                opacity: (isPrinting || !onExport) ? 0.4 : 1,
              }} title="Download Golden PDF. Multiple nights → ZIP of per-day PDFs.">
                <Download size={15} strokeWidth={2.2} />
                {uniqueExportDays > 1 ? "Export ZIP" : "Export PDF"}
              </button>

              {/* Print */}
              <button type="button" onClick={handlePrint} disabled={isPrinting || pageCount === 0} className="sb-interactive" style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 18px", borderRadius: 10, border: "none",
                background: pageCount === 0 ? (isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.4)") : "linear-gradient(135deg,#0A84FF 0%,#0060D0 100%)",
                color: pageCount === 0 ? ts : "#fff",
                fontSize: 12.5, fontWeight: 700,
                cursor: (isPrinting || pageCount === 0) ? "not-allowed" : "pointer",
                opacity: isPrinting ? 0.6 : 1,
                boxShadow: pageCount > 0 ? "0 2px 10px rgba(10,132,255,0.35)" : "none",
              }}>
                <Printer size={15} strokeWidth={2.2} />
                {pageCount > 0 ? `Print ${pageCount}` : "Print"}
              </button>
            </>
          )}
        </div>


      </div>
    </div>,
    document.body
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────

function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "#8E8E93" : "#6B7280", letterSpacing: "0.08em" }}>{text}</div>;
}

function SectionDivider({ isDark }: { isDark: boolean }) {
  return (
    <div
      style={{
        height: 1,
        margin: "0 20px",
        background: isDark ? "rgba(72,72,74,0.35)" : "rgba(209,209,214,0.45)",
        flexShrink: 0,
      }}
    />
  );
}

function PresetPill({ label, icon, active, onClick, isDark, accent, title }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void; isDark: boolean; accent?: string; title?: string }) {
  const a = accent ?? "#0A84FF";
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={title} className="sb-interactive pcc-pill" style={{
      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20,
      border: `1.5px solid ${active ? a : (isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)")}`,
      background: active ? (isDark ? `${a}22` : `${a}14`) : (isDark ? "rgba(44,44,46,0.45)" : "rgba(255,255,255,0.55)"),
      color: active ? a : (isDark ? "#8E8E93" : "#6B7280"),
      fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
      transition: "all 0.12s",
    }}>
      {icon}
      {label}
    </button>
  );
}

function BulkBtn({ label, active, color, onClick, isDark }: { label: string; active: boolean; color: string; onClick: () => void; isDark: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="sb-interactive pcc-bulk" style={{
      padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, cursor: "pointer",
      border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

function PosBtn({ label, active, onClick, color, isDark }: { label: string; active: boolean; onClick: () => void; color: string; isDark: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="sb-interactive pcc-bulk" style={{
      flex: 1, padding: "3px 6px", borderRadius: 5, fontSize: 9.5, fontWeight: active ? 700 : 500,
      cursor: "pointer", border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s",
    }}>{label}</button>
  );
}

function SummaryPill({ label, color, isDark }: { label: string; color: string; isDark: boolean }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 8px",
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 700,
      color,
      background: isDark ? `${color}22` : `${color}14`,
      border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function KbdHint({ label, keys, isDark }: { label: string; keys: string[]; isDark: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, color: isDark ? "#8E8E93" : "#6B7280" }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      {keys.map((k) => (
        <kbd
          key={k}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            fontFamily: "inherit",
            color: isDark ? "#C7C7CC" : "#3C3C43",
            background: isDark ? "rgba(72,72,74,0.55)" : "rgba(255,255,255,0.9)",
            border: `1px solid ${isDark ? "rgba(120,120,128,0.35)" : "rgba(209,209,214,0.8)"}`,
            boxShadow: isDark ? "none" : "0 1px 0 rgba(0,0,0,0.06)",
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

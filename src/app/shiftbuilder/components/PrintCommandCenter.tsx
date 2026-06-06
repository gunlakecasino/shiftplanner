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
} from "lucide-react";
import { cn } from "@/lib/utils";
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

export interface PrintConfig {
  days: PrintDayConfig[];
  pageOrder: PageOrder;
  margins: MarginSize;
  includeOverview: boolean;
  overviewPosition: "first" | "last";
  includeCoverPage: boolean;
  coverPagePosition: "first" | "last";
  customQueueOrder?: string[] | null;
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
  DAY_DEFS: DayDef[];
  selectedDayIndex: number;
  isPrinting: boolean;
  printProgress: PrintProgress | null;
  isDark?: boolean;
}

function detectActivePreset(
  days: PrintDayConfig[],
  todayIndex: number,
  includeOverview: boolean,
  includeCoverPage: boolean,
): "tonight" | "full-week" | "deploy-book" | "break-book" | "custom" {
  const tonight = days[todayIndex];
  if (
    days.every(d => d.dayIndex === todayIndex
      ? (d.printDeploy && d.printBreaks)
      : (!d.printDeploy && !d.printBreaks)) &&
    !includeOverview && !includeCoverPage &&
    tonight?.printDeploy && tonight?.printBreaks
  ) return "tonight";

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
  return (
    <div style={{
      borderRadius: 12,
      border: `1.5px solid ${hasAny ? def.color : (isDark ? "rgba(72,72,74,0.35)" : "rgba(209,209,214,0.35)")}`,
      overflow: "hidden",
      opacity: hasAny ? 1 : 0.42,
      transition: "border-color 0.15s, opacity 0.15s",
      minWidth: 72,
      flex: "1 1 0%",
      background: isDark ? "rgba(44,44,46,0.7)" : "rgba(255,255,255,0.8)",
    }}>
      {/* Color header */}
      <div style={{ background: def.color, padding: "5px 6px 4px", textAlign: "center", position: "relative" }}>
        {def.isToday && (
          <span style={{ position: "absolute", top: 4, right: 5, width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
        )}
        <div style={{ color: "#fff", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.07em", opacity: 0.85 }}>
          {def.short.toUpperCase()}
        </div>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>
          {def.dateNum}
        </div>
      </div>

      {/* Chips */}
      <div style={{ padding: "5px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
        <Chip
          label="DEP"
          title="Deployment sheet"
          active={config.printDeploy}
          activeColor="rgba(52,199,89,0.9)"
          activeBg={isDark ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)"}
          activeBorder="rgba(52,199,89,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printDeploy: !config.printDeploy })}
        />
        <Chip
          label="BRK"
          title="Break sheet"
          active={config.printBreaks}
          activeColor="rgba(255,159,10,0.9)"
          activeBg={isDark ? "rgba(255,159,10,0.15)" : "rgba(255,159,10,0.1)"}
          activeBorder="rgba(255,159,10,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printBreaks: !config.printBreaks })}
        />
        <Chip
          label="OVW"
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
      className="sb-interactive"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 3, padding: "3px 5px", borderRadius: 5, cursor: "pointer",
        background: active ? activeBg : (isDark ? "rgba(72,72,74,0.28)" : "rgba(209,209,214,0.25)"),
        border: `1px solid ${active ? activeBorder : "transparent"}`,
        transition: "background 0.12s, border-color 0.12s",
      }}
      title={title}
    >
      <span style={{
        fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em",
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
      className="sb-select-card sb-interactive"
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
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PrintCommandCenter({
  open,
  onClose,
  onPrint,
  DAY_DEFS,
  selectedDayIndex,
  isPrinting,
  printProgress,
  isDark = false,
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
  }, []);

  // ── Core config state ──────────────────────────────────────────────────────
  const [days, setDays] = useState<PrintDayConfig[]>(() => defaultPrintDays(selectedDayIndex));
  const [pageOrder, setPageOrder] = useState<PageOrder>("paired");
  const [margins, setMargins] = useState<MarginSize>("narrow");
  const [includeOverview, setIncludeOverview] = useState(false);
  const [overviewPosition, setOverviewPosition] = useState<"first" | "last">("last");
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [coverPagePosition, setCoverPagePosition] = useState<"first" | "last">("first");

  // ── Saved presets ──────────────────────────────────────────────────────────
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveInputValue, setSaveInputValue] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);

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
    if (last) {
      applyConfig(last);
    } else {
      applyConfig({
        days: defaultPrintDays(selectedDayIndex).map((d) =>
          d.dayIndex === selectedDayIndex
            ? { ...d, printDeploy: true, printBreaks: true }
            : d,
        ),
        pageOrder: "paired",
        margins: "narrow",
        includeOverview: false,
        overviewPosition: "last",
        includeCoverPage: false,
        coverPagePosition: "first",
        customQueueOrder: null,
      });
    }
    setSavedPresets(loadPresets());
  }, [open, selectedDayIndex, applyConfig]);

  // Focus save input when shown
  useEffect(() => {
    if (showSaveInput) setTimeout(() => saveInputRef.current?.focus(), 50);
  }, [showSaveInput]);

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
      ),
    [days, pageOrder, DAY_DEFS, includeOverview, overviewPosition, includeCoverPage, coverPagePosition],
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
    () => detectActivePreset(days, selectedDayIndex, includeOverview, includeCoverPage),
    [days, selectedDayIndex, includeOverview, includeCoverPage]
  );

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

  const bulkSetAll = useCallback(() => {
    setDays((prev) => prev.map((d) => ({ ...d, printDeploy: true, printBreaks: true, inOverview: true })));
    setIncludeOverview(true);
    setCustomOrder(null);
  }, []);

  const bulkClear = useCallback(() => {
    setDays((prev) => prev.map((d) => ({ ...d, printDeploy: false, printBreaks: false, inOverview: false })));
    setIncludeOverview(false);
    setCustomOrder(null);
  }, []);

  // ── Presets ───────────────────────────────────────────────────────────────
  const applyBuiltinPreset = useCallback(
    (preset: "tonight" | "full-week" | "deploy-book" | "break-book") => {
      setIncludeCoverPage(false);
      setCustomOrder(null);
      if (preset === "tonight") {
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

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPrinting && !showSaveInput) { e.stopPropagation(); onClose(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isPrinting && pageCount > 0) handlePrint();
      if (e.key === "Escape" && showSaveInput) { e.stopPropagation(); setShowSaveInput(false); }
      if (e.key === "Enter" && showSaveInput) { e.stopPropagation(); handleSavePreset(); }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, isPrinting, pageCount, onClose, handlePrint, showSaveInput, handleSavePreset]);

  if (!mounted) return null;

  // ── Theme values ──────────────────────────────────────────────────────────
  const panelBg = isDark ? "rgba(28,28,30,0.97)" : "rgba(250,250,252,0.98)";
  const border = isDark ? "rgba(72,72,74,0.6)" : "rgba(209,209,214,0.7)";
  const tx = isDark ? "#F2F2F4" : "#1C1C1E";
  const ts = isDark ? "#8E8E93" : "#6B7280";
  const divider = isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.5)";
  const sectionBg = isDark ? "rgba(44,44,46,0.4)" : "rgba(240,240,242,0.4)";

  const pct = printProgress && printProgress.total > 0
    ? Math.round((printProgress.current / printProgress.total) * 100)
    : 0;

  return createPortal(
    <div
      className={cn(
        "sb-overlay-backdrop sb-overlay-backdrop--fixed sb-overlay-fade z-[9000]",
        "flex items-center justify-center p-5",
        visible && "sb-overlay-fade--visible"
      )}
      style={{ background: visible ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)" }}
      onClick={e => { if (e.target === e.currentTarget && !isPrinting && !showSaveInput) onClose(); }}
    >
      <div
        className={cn(
          "sb-modal-shell flex flex-col overflow-hidden relative",
          visible && "sb-modal-shell--visible"
        )}
        style={{
          width: "min(740px, 100%)",
          maxHeight: "min(92vh, 760px)",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 18px 13px", borderBottom: `1px solid ${divider}`, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: isDark ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Printer size={16} color="#0A84FF" strokeWidth={2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: tx, letterSpacing: "-0.01em" }}>Print Command Center</div>
            {DAY_DEFS.length > 0 && (
              <div style={{ fontSize: 10.5, color: ts, marginTop: 1 }}>
                {DAY_DEFS[0]?.short} {DAY_DEFS[0]?.dateNum} – {DAY_DEFS[6]?.short} {DAY_DEFS[6]?.dateNum} · {DAY_DEFS[0]?.monthYear}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={isPrinting} className="sb-interactive" style={{ width: 26, height: 26, borderRadius: 13, background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)", border: "none", cursor: isPrinting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: ts, opacity: isPrinting ? 0.4 : 1 }} title="Close (Esc)">
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* ── BUILT-IN PRESETS ──────────────────────────────────────────── */}
          <div style={{ padding: "12px 18px 0" }}>
            <SectionLabel text="PRESETS" isDark={isDark} />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
              {([
                { id: "tonight", label: "Tonight", icon: <Moon size={12} strokeWidth={2.2} /> },
                { id: "full-week", label: "Full Week", icon: <CalendarDays size={12} strokeWidth={2.2} /> },
                { id: "deploy-book", label: "Deploy Book", icon: <LayoutGrid size={12} strokeWidth={2.2} /> },
                { id: "break-book", label: "Break Book", icon: <Coffee size={12} strokeWidth={2.2} /> },
              ] as const).map(({ id, label, icon }) => (
                <PresetPill key={id} label={label} icon={icon} active={activePreset === id} onClick={() => applyBuiltinPreset(id)} isDark={isDark} />
              ))}
              {activePreset === "custom" && (
                <PresetPill label="Custom" icon={<Pencil size={12} strokeWidth={2.2} />} active onClick={() => {}} isDark={isDark} accent="#FF9F0A" />
              )}
            </div>

            {/* Saved presets row */}
            {savedPresets.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {savedPresets.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 20, border: `1.5px solid ${isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)"}`, overflow: "hidden" }}>
                    <button type="button" onClick={() => applySavedPreset(p)} style={{ padding: "5px 10px 5px 10px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: ts, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                      <Save size={11} strokeWidth={2} />
                      {p.name}
                    </button>
                    <button type="button" onClick={() => handleDeletePreset(p.id)} style={{ padding: "5px 8px 5px 4px", background: "transparent", border: "none", cursor: "pointer", color: ts, fontSize: 10, opacity: 0.5, lineHeight: 1 }} title="Delete preset">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── BULK TOGGLES ──────────────────────────────────────────────── */}
          <div style={{ padding: "10px 18px 0" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: ts, letterSpacing: "0.08em", marginRight: 2 }}>BULK:</span>
              <BulkBtn label="All Nights" active={allDeploy && allBreaks} color="#0A84FF" onClick={() => { setDays(p => p.map(d => ({ ...d, printDeploy: true, printBreaks: true }))); setCustomOrder(null); }} isDark={isDark} />
              <BulkBtn label="All Deploy" active={allDeploy} color="rgba(52,199,89,0.85)" onClick={() => bulkToggle("printDeploy")} isDark={isDark} />
              <BulkBtn label="All Breaks" active={allBreaks} color="rgba(255,159,10,0.85)" onClick={() => bulkToggle("printBreaks")} isDark={isDark} />
              <BulkBtn label="All Overview" active={allOverview} color="rgba(88,86,214,0.85)" onClick={() => bulkToggle("inOverview")} isDark={isDark} />
              <div style={{ flex: 1 }} />
              <BulkBtn label="Select All" active={false} color="#0A84FF" onClick={bulkSetAll} isDark={isDark} />
              <BulkBtn label="Clear All" active={false} color="#FF3B30" onClick={bulkClear} isDark={isDark} />
            </div>
          </div>

          {/* ── DAY CARDS ─────────────────────────────────────────────────── */}
          <div style={{ padding: "10px 18px 0" }}>
            <SectionLabel text="DAYS" isDark={isDark} />
            <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
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

          {/* ── SETTINGS ROW ──────────────────────────────────────────────── */}
          <div style={{ padding: "12px 18px 0", display: "flex", gap: 10 }}>

            {/* Left: Page Order */}
            <div style={{ flex: "0 0 auto", minWidth: 190 }}>
              <SectionLabel text="PAGE ORDER" isDark={isDark} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                {([
                  { v: "paired", l: "Paired", d: "Deploy + Breaks per night" },
                  { v: "deploy-first", l: "Deploy First", d: "All deployment, then breaks" },
                  { v: "breaks-first", l: "Breaks First", d: "All breaks, then deployment" },
                ] as const).map(({ v, l, d }) => (
                  <button key={v} type="button" onClick={() => setPageOrder(v)} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "6px 9px",
                    borderRadius: 7, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${pageOrder === v ? "#0A84FF" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                    background: pageOrder === v ? (isDark ? "rgba(10,132,255,0.12)" : "rgba(10,132,255,0.07)") : (isDark ? "rgba(44,44,46,0.38)" : "rgba(255,255,255,0.5)"),
                    transition: "all 0.12s",
                  }}>
                    <div style={{ width: 13, height: 13, borderRadius: 6.5, flexShrink: 0, border: `2px solid ${pageOrder === v ? "#0A84FF" : (isDark ? "rgba(120,120,128,0.45)" : "rgba(180,180,188,0.65)")}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {pageOrder === v && <div style={{ width: 5, height: 5, borderRadius: 2.5, background: "#0A84FF" }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: pageOrder === v ? "#0A84FF" : tx }}>{l}</div>
                      <div style={{ fontSize: 9, color: ts }}>{d}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: divider, flexShrink: 0 }} />

            {/* Middle: Overview + Cover toggles */}
            <div style={{ flex: "0 0 auto", minWidth: 170 }}>
              <SectionLabel text="EXTRA PAGES" isDark={isDark} />
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
                {/* Overview */}
                <div style={{ borderRadius: 8, border: `1.5px solid ${includeOverview ? "rgba(88,86,214,0.5)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`, background: includeOverview ? (isDark ? "rgba(88,86,214,0.1)" : "rgba(88,86,214,0.06)") : "transparent", overflow: "hidden" }}>
                  <button type="button" onClick={handleOverviewMasterToggle} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", width: "100%", background: "transparent", border: "none", cursor: "pointer" }}>
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
                          : "Slot grid — pick nights with OVW chips"}
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
                  <button type="button" onClick={() => setIncludeCoverPage(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", width: "100%", background: "transparent", border: "none", cursor: "pointer" }}>
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

            {/* Divider */}
            <div style={{ width: 1, background: divider, flexShrink: 0 }} />

            {/* Right: Margins */}
            <div style={{ flex: 1 }}>
              <SectionLabel text="MARGINS" isDark={isDark} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5, marginTop: 6 }}>
                {([
                  { v: "none", l: "None", s: "0in" },
                  { v: "narrow", l: "Narrow", s: "0.15in" },
                  { v: "normal", l: "Normal", s: "0.5in" },
                  { v: "wide", l: "Wide", s: "1in" },
                ] as const).map(({ v, l, s }) => (
                  <MarginCard key={v} value={v} label={l} sub={s} selected={margins === v} onClick={() => setMargins(v)} isDark={isDark} />
                ))}
              </div>
              <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 5 }}>
                <Info size={13} color={ts} strokeWidth={2} />
                <span style={{ fontSize: 10, color: ts }}>
                  Auto-scale: <strong style={{ color: tx }}>{Math.round(MARGIN_ZOOM[margins] * 100)}%</strong>
                  <span style={{ opacity: 0.55 }}> · 11×8.5in landscape</span>
                </span>
              </div>
            </div>
          </div>

          {/* ── PRINT QUEUE ───────────────────────────────────────────────── */}
          <div style={{ padding: "12px 18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <SectionLabel text={`PRINT QUEUE · ${pageCount} PAGE${pageCount !== 1 ? "S" : ""}`} isDark={isDark} />
              {customOrder && (
                <button type="button" onClick={() => setCustomOrder(null)} style={{ marginLeft: 4, fontSize: 9, color: "#FF9F0A", background: "rgba(255,159,10,0.12)", border: "1px solid rgba(255,159,10,0.3)", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontWeight: 600 }}>
                  Reset order
                </button>
              )}
            </div>

            {queueItems.length === 0 ? (
              <div style={{ padding: "14px", borderRadius: 9, background: sectionBg, border: `1px dashed ${divider}`, textAlign: "center", color: ts, fontSize: 11.5 }}>
                No pages selected — enable days above
              </div>
            ) : (
              <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", alignItems: "flex-end" }}
                onDragLeave={() => setDragOverId(null)}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              >
                {queueItems.map((item, idx) => {
                  const isBeingDragged = dragId === item.id;
                  const isDropTarget = dragOverId === item.id && dragId !== item.id;
                  const typeIcon = { deploy: "D", breaks: "B", overview: "◼", cover: "★" }[item.type];
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => handleQueueDragStart(item.id)}
                      onDragOver={(e) => { e.preventDefault(); handleQueueDragOver(item.id); }}
                      onDrop={() => handleQueueDrop(item.id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                        flexShrink: 0, cursor: "grab",
                        opacity: isBeingDragged ? 0.3 : 1,
                        transform: isDropTarget ? "scale(1.05)" : "scale(1)",
                        transition: "transform 0.1s, opacity 0.1s",
                      }}
                    >
                      <span style={{ fontSize: 8, color: ts, fontWeight: 600 }}>{idx + 1}</span>
                      <div style={{
                        padding: "4px 7px", borderRadius: 6, fontSize: 9.5, fontWeight: 700,
                        whiteSpace: "nowrap", color: "#fff", display: "flex", alignItems: "center", gap: 3,
                        background: item.type === "deploy" ? item.color
                          : item.type === "breaks" ? `${item.color}99`
                          : item.type === "overview" ? "#5856D6"
                          : "#3A3A3C",
                        border: item.type === "breaks" ? `1.5px solid ${item.color}` : "none",
                        boxShadow: isDropTarget ? `0 0 0 2px ${item.color}` : "none",
                      }}>
                        <span style={{ opacity: 0.7, fontSize: 8 }}>{typeIcon}</span>
                        {item.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "11px 18px",
          borderTop: `1px solid ${divider}`,
          background: isDark ? "rgba(22,22,24,0.6)" : "rgba(245,245,247,0.8)",
          flexShrink: 0,
        }}>
          {showSaveInput ? (
            <>
              <input
                ref={saveInputRef}
                value={saveInputValue}
                onChange={e => setSaveInputValue(e.target.value)}
                placeholder="Name this preset…"
                style={{
                  flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 12,
                  background: isDark ? "rgba(44,44,46,0.8)" : "rgba(255,255,255,0.9)",
                  border: `1.5px solid ${isDark ? "rgba(72,72,74,0.7)" : "rgba(209,209,214,0.8)"}`,
                  color: tx, outline: "none",
                }}
              />
              <button type="button" onClick={handleSavePreset} disabled={!saveInputValue.trim()} style={{ padding: "6px 14px", borderRadius: 8, background: "#0A84FF", color: "#fff", border: "none", cursor: saveInputValue.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, opacity: saveInputValue.trim() ? 1 : 0.5 }}>
                Save
              </button>
              <button type="button" onClick={() => { setShowSaveInput(false); setSaveInputValue(""); }} style={{ padding: "6px 10px", borderRadius: 8, background: "transparent", color: ts, border: `1.5px solid ${divider}`, cursor: "pointer", fontSize: 12 }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Stats */}
              <div style={{ flex: 1, fontSize: 11, color: ts }}>
                {pageCount > 0 ? (
                  <>
                    <span style={{ color: tx, fontWeight: 600 }}>{pageCount} page{pageCount !== 1 ? "s" : ""}</span>
                    {" · ~"}{estSecs}s {" · "}
                    <span style={{ opacity: 0.6 }}>⌘↩ print · ⌘⇧P quick tonight</span>
                  </>
                ) : <span style={{ opacity: 0.45 }}>Select days above</span>}
              </div>

              {/* Save preset */}
              <button type="button" onClick={() => setShowSaveInput(true)} style={{ padding: "7px 12px", borderRadius: 9, border: `1.5px solid ${divider}`, background: "transparent", color: ts, fontSize: 11.5, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }} title="Save current config as a preset">
                <Save size={13} strokeWidth={2} />
                Save
              </button>

              {/* Cancel */}
              <button type="button" onClick={onClose} disabled={isPrinting} style={{ padding: "7px 14px", borderRadius: 9, border: `1.5px solid ${divider}`, background: "transparent", color: ts, fontSize: 12.5, fontWeight: 600, cursor: isPrinting ? "not-allowed" : "pointer", opacity: isPrinting ? 0.4 : 1 }}>
                Cancel
              </button>

              {/* Print */}
              <button type="button" onClick={handlePrint} disabled={isPrinting || pageCount === 0} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 16px", borderRadius: 9, border: "none",
                background: pageCount === 0 ? (isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.4)") : "linear-gradient(135deg,#0A84FF 0%,#0060D0 100%)",
                color: pageCount === 0 ? ts : "#fff",
                fontSize: 12.5, fontWeight: 700,
                cursor: (isPrinting || pageCount === 0) ? "not-allowed" : "pointer",
                opacity: isPrinting ? 0.6 : 1,
                boxShadow: pageCount > 0 ? "0 2px 8px rgba(10,132,255,0.3)" : "none",
              }}>
                <Printer size={15} strokeWidth={2.2} />
                {pageCount > 0 ? `Print ${pageCount} Page${pageCount !== 1 ? "s" : ""}` : "Print"}
              </button>
            </>
          )}
        </div>

        {/* ── PROGRESS OVERLAY ──────────────────────────────────────────────── */}
        {isPrinting && (
          <div className="sb-content-enter absolute inset-0 z-10 flex flex-col items-center justify-center gap-[18px] rounded-[20px]" style={{ background: isDark ? "rgba(28,28,30,0.93)" : "rgba(250,250,252,0.93)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
            <div className="sb-progress-pulse flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 15, background: "linear-gradient(135deg,#0A84FF 0%,#0060D0 100%)", boxShadow: "0 8px 24px rgba(10,132,255,0.4)" }}>
              <Printer size={26} color="#fff" strokeWidth={2} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p className="text-[14px] font-bold" style={{ color: tx, marginBottom: 3 }} aria-busy="true" aria-live="polite">
                {printProgress?.label ?? "Preparing"}
                <span className="sb-loading-dots" aria-hidden="true" />
              </p>
              {printProgress && printProgress.total > 0 && (
                <div style={{ fontSize: 11, color: ts }}>
                  Page {printProgress.current} of {printProgress.total}
                </div>
              )}
            </div>
            <div style={{ width: 260, height: 4, borderRadius: 2, background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)", overflow: "hidden" }}>
              <div className="sb-progress-bar" style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#0A84FF,#30D158)", borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: ts, opacity: 0.55 }}>Please wait — do not close this window</div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────

function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "#8E8E93" : "#6B7280", letterSpacing: "0.08em" }}>{text}</div>;
}

function PresetPill({ label, icon, active, onClick, isDark, accent }: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void; isDark: boolean; accent?: string }) {
  const a = accent ?? "#0A84FF";
  return (
    <button type="button" onClick={onClick} className="sb-interactive" style={{
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
    <button type="button" onClick={onClick} className="sb-interactive" style={{
      padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, cursor: "pointer",
      border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

function PosBtn({ label, active, onClick, color, isDark }: { label: string; active: boolean; onClick: () => void; color: string; isDark: boolean }) {
  return (
    <button type="button" onClick={onClick} className="sb-interactive" style={{
      flex: 1, padding: "3px 6px", borderRadius: 5, fontSize: 9.5, fontWeight: active ? 700 : 500,
      cursor: "pointer", border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s",
    }}>{label}</button>
  );
}

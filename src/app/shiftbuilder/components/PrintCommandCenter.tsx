"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

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

// ─── Component Types ──────────────────────────────────────────────────────────

interface DayDef {
  index: number;
  name: string;
  short: string;
  color: string;
  dateNum: number;
  monthYear: string;
  isToday: boolean;
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

// ─── Queue item type ──────────────────────────────────────────────────────────

type QueueItemType = "deploy" | "breaks" | "overview" | "cover";
interface QueueItem {
  id: string;
  label: string;
  type: QueueItemType;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultDays(todayIndex: number): PrintDayConfig[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    printDeploy: i === todayIndex,
    printBreaks: i === todayIndex,
    inOverview: i === todayIndex,
  }));
}

function countTotalPages(
  days: PrintDayConfig[],
  includeOverview: boolean,
  includeCoverPage: boolean,
): number {
  let n = days.reduce((s, d) => s + (d.printDeploy ? 1 : 0) + (d.printBreaks ? 1 : 0), 0);
  if (includeOverview && days.some(d => d.inOverview)) n++;
  if (includeCoverPage) n++;
  return n;
}

function estimateRenderSeconds(days: PrintDayConfig[], includeOverview: boolean): number {
  const deployBreaks = new Set(days.filter(d => d.printDeploy || d.printBreaks).map(d => d.dayIndex));
  const overviewOnly = includeOverview
    ? days.filter(d => d.inOverview && !deployBreaks.has(d.dayIndex)).length
    : 0;
  return (deployBreaks.size + overviewOnly) * 4 + (includeOverview ? 2 : 0);
}

function buildQueue(
  days: PrintDayConfig[],
  pageOrder: PageOrder,
  dayDefs: DayDef[],
  includeOverview: boolean,
  overviewPosition: "first" | "last",
  includeCoverPage: boolean,
  coverPagePosition: "first" | "last",
): QueueItem[] {
  const items: QueueItem[] = [];
  const active = days.filter(d => d.printDeploy || d.printBreaks);

  const coverItem: QueueItem = { id: "__cover", label: "Cover Page", type: "cover", color: "#1C1C1E" };
  const overviewItem: QueueItem = { id: "__overview", label: "Week Overview", type: "overview", color: "#5856D6" };

  const dayItems: QueueItem[] = [];
  if (pageOrder === "paired") {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (!def) continue;
      if (d.printDeploy) dayItems.push({ id: `${d.dayIndex}-d`, label: `${def.short} Deploy`, type: "deploy", color: def.color });
      if (d.printBreaks) dayItems.push({ id: `${d.dayIndex}-b`, label: `${def.short} Breaks`, type: "breaks", color: def.color });
    }
  } else if (pageOrder === "deploy-first") {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printDeploy) dayItems.push({ id: `${d.dayIndex}-d`, label: `${def.short} Deploy`, type: "deploy", color: def.color });
    }
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printBreaks) dayItems.push({ id: `${d.dayIndex}-b`, label: `${def.short} Breaks`, type: "breaks", color: def.color });
    }
  } else {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printBreaks) dayItems.push({ id: `${d.dayIndex}-b`, label: `${def.short} Breaks`, type: "breaks", color: def.color });
    }
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printDeploy) dayItems.push({ id: `${d.dayIndex}-d`, label: `${def.short} Deploy`, type: "deploy", color: def.color });
    }
  }

  const hasOverview = includeOverview && days.some(d => d.inOverview);

  if (includeCoverPage && coverPagePosition === "first") items.push(coverItem);
  if (hasOverview && overviewPosition === "first") items.push(overviewItem);
  items.push(...dayItems);
  if (hasOverview && overviewPosition === "last") items.push(overviewItem);
  if (includeCoverPage && coverPagePosition === "last") items.push(coverItem);

  return items;
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

  if (days.every(d => d.printDeploy && d.printBreaks) && !includeOverview && !includeCoverPage)
    return "full-week";
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
          active={config.printDeploy}
          activeColor="rgba(52,199,89,0.9)"
          activeBg={isDark ? "rgba(52,199,89,0.15)" : "rgba(52,199,89,0.1)"}
          activeBorder="rgba(52,199,89,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printDeploy: !config.printDeploy })}
        />
        <Chip
          label="BRK"
          active={config.printBreaks}
          activeColor="rgba(255,159,10,0.9)"
          activeBg={isDark ? "rgba(255,159,10,0.15)" : "rgba(255,159,10,0.1)"}
          activeBorder="rgba(255,159,10,0.35)"
          isDark={isDark}
          onClick={() => onChange({ ...config, printBreaks: !config.printBreaks })}
        />
        <Chip
          label="OVW"
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
  active: boolean;
  activeColor: string;
  activeBg: string;
  activeBorder: string;
  isDark: boolean;
  onClick: () => void;
}

function Chip({ label, active, activeColor, activeBg, activeBorder, isDark, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 3, padding: "3px 5px", borderRadius: 5, cursor: "pointer",
        background: active ? activeBg : (isDark ? "rgba(72,72,74,0.28)" : "rgba(209,209,214,0.25)"),
        border: `1px solid ${active ? activeBorder : "transparent"}`,
        transition: "background 0.12s, border-color 0.12s",
      }}
      title={label}
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

  // ── Core config state ──────────────────────────────────────────────────────
  const [days, setDays] = useState<PrintDayConfig[]>(() => defaultDays(selectedDayIndex));
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

  // Reset config when opened; load saved presets
  useEffect(() => {
    if (open) {
      setDays(defaultDays(selectedDayIndex));
      setPageOrder("paired");
      setMargins("narrow");
      setIncludeOverview(false);
      setOverviewPosition("last");
      setIncludeCoverPage(false);
      setCoverPagePosition("first");
      setCustomOrder(null);
      setSavedPresets(loadPresets());
    }
  }, [open, selectedDayIndex]);

  // Focus save input when shown
  useEffect(() => {
    if (showSaveInput) setTimeout(() => saveInputRef.current?.focus(), 50);
  }, [showSaveInput]);

  // ── Derived values ────────────────────────────────────────────────────────
  const pageCount = useMemo(
    () => countTotalPages(days, includeOverview, includeCoverPage),
    [days, includeOverview, includeCoverPage]
  );
  const estSecs = useMemo(
    () => estimateRenderSeconds(days, includeOverview),
    [days, includeOverview]
  );
  const autoQueue = useMemo(
    () => buildQueue(days, pageOrder, DAY_DEFS, includeOverview, overviewPosition, includeCoverPage, coverPagePosition),
    [days, pageOrder, DAY_DEFS, includeOverview, overviewPosition, includeCoverPage, coverPagePosition]
  );
  // Apply customOrder if item IDs still match
  const queueItems = useMemo(() => {
    if (!customOrder) return autoQueue;
    const autoIds = new Set(autoQueue.map(i => i.id));
    const customIds = new Set(customOrder);
    if ([...autoIds].every(id => customIds.has(id)) && [...customIds].every(id => autoIds.has(id))) {
      const map = new Map(autoQueue.map(i => [i.id, i]));
      return customOrder.map(id => map.get(id)!).filter(Boolean);
    }
    setCustomOrder(null);
    return autoQueue;
  }, [autoQueue, customOrder]);

  const activePreset = useMemo(
    () => detectActivePreset(days, selectedDayIndex, includeOverview, includeCoverPage),
    [days, selectedDayIndex, includeOverview, includeCoverPage]
  );

  // ── Config snapshot (for save/apply) ──────────────────────────────────────
  const currentConfig = useCallback((): PrintConfig => ({
    days, pageOrder, margins,
    includeOverview, overviewPosition,
    includeCoverPage, coverPagePosition,
  }), [days, pageOrder, margins, includeOverview, overviewPosition, includeCoverPage, coverPagePosition]);

  // ── Day change handler ────────────────────────────────────────────────────
  const handleDayChange = useCallback((updated: PrintDayConfig) => {
    setDays(prev => prev.map(d => d.dayIndex === updated.dayIndex ? updated : d));
    setCustomOrder(null);
  }, []);

  // ── Bulk toggles ──────────────────────────────────────────────────────────
  const allDeploy = days.every(d => d.printDeploy);
  const allBreaks = days.every(d => d.printBreaks);
  const allOverview = days.every(d => d.inOverview);

  const bulkToggle = useCallback((field: "printDeploy" | "printBreaks" | "inOverview") => {
    const currentAll = days.every(d => d[field]);
    setDays(prev => prev.map(d => ({ ...d, [field]: !currentAll })));
    setCustomOrder(null);
  }, [days]);

  const bulkSetAll = useCallback(() => {
    setDays(prev => prev.map(d => ({ ...d, printDeploy: true, printBreaks: true, inOverview: true })));
    setCustomOrder(null);
  }, []);

  const bulkClear = useCallback(() => {
    setDays(prev => prev.map(d => ({ ...d, printDeploy: false, printBreaks: false, inOverview: false })));
    setCustomOrder(null);
  }, []);

  // ── Presets ───────────────────────────────────────────────────────────────
  const applyBuiltinPreset = useCallback((preset: "tonight" | "full-week" | "deploy-book" | "break-book") => {
    setIncludeOverview(false);
    setIncludeCoverPage(false);
    setCustomOrder(null);
    if (preset === "tonight") {
      setDays(Array.from({ length: 7 }, (_, i) => ({
        dayIndex: i,
        printDeploy: i === selectedDayIndex,
        printBreaks: i === selectedDayIndex,
        inOverview: i === selectedDayIndex,
      })));
    } else if (preset === "full-week") {
      setDays(Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, printDeploy: true, printBreaks: true, inOverview: true })));
    } else if (preset === "deploy-book") {
      setDays(Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, printDeploy: true, printBreaks: false, inOverview: false })));
    } else {
      setDays(Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, printDeploy: false, printBreaks: true, inOverview: false })));
    }
  }, [selectedDayIndex]);

  const applySavedPreset = useCallback((preset: SavedPreset) => {
    const c = preset.config;
    setDays(c.days);
    setPageOrder(c.pageOrder);
    setMargins(c.margins);
    setIncludeOverview(c.includeOverview ?? false);
    setOverviewPosition(c.overviewPosition ?? "last");
    setIncludeCoverPage(c.includeCoverPage ?? false);
    setCoverPagePosition(c.coverPagePosition ?? "first");
    setCustomOrder(null);
  }, []);

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
    // Apply custom queue order to the config if set
    onPrint({ ...currentConfig(), _customQueueOrder: customOrder } as any);
  }, [pageCount, currentConfig, customOrder, onPrint]);

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
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        background: `rgba(0,0,0,${visible ? 0.55 : 0})`,
        backdropFilter: visible ? "blur(8px)" : "none",
        WebkitBackdropFilter: visible ? "blur(8px)" : "none",
        transition: "background 0.2s",
        pointerEvents: visible ? "auto" : "none",
      }}
      onClick={e => { if (e.target === e.currentTarget && !isPrinting && !showSaveInput) onClose(); }}
    >
      <div style={{
        width: "min(740px, 100%)",
        maxHeight: "min(92vh, 760px)",
        background: panelBg,
        borderRadius: 20,
        border: `1px solid ${border}`,
        boxShadow: isDark
          ? "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)"
          : "0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(10px)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease",
        position: "relative",
      }}>

        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 18px 13px", borderBottom: `1px solid ${divider}`, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: isDark ? "rgba(10,132,255,0.2)" : "rgba(10,132,255,0.1)", border: "1px solid rgba(10,132,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="ms" style={{ fontSize: 17, color: '#0A84FF', fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>print</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: tx, letterSpacing: "-0.01em" }}>Print Command Center</div>
            {DAY_DEFS.length > 0 && (
              <div style={{ fontSize: 10.5, color: ts, marginTop: 1 }}>
                {DAY_DEFS[0]?.short} {DAY_DEFS[0]?.dateNum} – {DAY_DEFS[6]?.short} {DAY_DEFS[6]?.dateNum} · {DAY_DEFS[0]?.monthYear}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={isPrinting} style={{ width: 26, height: 26, borderRadius: 13, background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)", border: "none", cursor: isPrinting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: ts, opacity: isPrinting ? 0.4 : 1 }} title="Close (Esc)">
            <span className="ms" style={{ fontSize: 14, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>close</span>
          </button>
        </div>

        {/* ── SCROLLABLE BODY ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* ── BUILT-IN PRESETS ──────────────────────────────────────────── */}
          <div style={{ padding: "12px 18px 0" }}>
            <SectionLabel text="PRESETS" isDark={isDark} />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
              {([
                { id: "tonight", label: "Tonight", icon: "🌙" },
                { id: "full-week", label: "Full Week", icon: "📅" },
                { id: "deploy-book", label: "Deploy Book", icon: "📋" },
                { id: "break-book", label: "Break Book", icon: "☕" },
              ] as const).map(({ id, label, icon }) => (
                <PresetPill key={id} label={`${icon} ${label}`} active={activePreset === id} onClick={() => applyBuiltinPreset(id)} isDark={isDark} />
              ))}
              {activePreset === "custom" && (
                <PresetPill label="✏️ Custom" active onClick={() => {}} isDark={isDark} accent="#FF9F0A" />
              )}
            </div>

            {/* Saved presets row */}
            {savedPresets.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {savedPresets.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 20, border: `1.5px solid ${isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)"}`, overflow: "hidden" }}>
                    <button type="button" onClick={() => applySavedPreset(p)} style={{ padding: "5px 10px 5px 10px", background: "transparent", border: "none", cursor: "pointer", fontSize: 11, color: ts, fontWeight: 500 }}>
                      💾 {p.name}
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
              <BulkBtn label="All OVW" active={allOverview} color="rgba(88,86,214,0.85)" onClick={() => bulkToggle("inOverview")} isDark={isDark} />
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
                  <button type="button" onClick={() => setIncludeOverview(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", width: "100%", background: "transparent", border: "none", cursor: "pointer" }}>
                    <CheckDot active={includeOverview} color="rgba(88,86,214,0.9)" />
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: includeOverview ? "#5856D6" : tx }}>Week Overview</div>
                      <div style={{ fontSize: 9, color: ts }}>All-nights slot grid</div>
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
                      <div style={{ fontSize: 11, fontWeight: 600, color: includeCoverPage ? "#0A84FF" : tx }}>Cover Page</div>
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
                <span className="ms" style={{ fontSize: 13, color: ts, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>info</span>
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
                    <span style={{ opacity: 0.6 }}>⌘↩ print</span>
                  </>
                ) : <span style={{ opacity: 0.45 }}>Select days above</span>}
              </div>

              {/* Save preset */}
              <button type="button" onClick={() => setShowSaveInput(true)} style={{ padding: "7px 12px", borderRadius: 9, border: `1.5px solid ${divider}`, background: "transparent", color: ts, fontSize: 11.5, fontWeight: 500, cursor: "pointer" }} title="Save current config as a preset">
                💾 Save
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
                <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>print</span>
                {pageCount > 0 ? `Print ${pageCount} Page${pageCount !== 1 ? "s" : ""}` : "Print"}
              </button>
            </>
          )}
        </div>

        {/* ── PROGRESS OVERLAY ──────────────────────────────────────────────── */}
        {isPrinting && (
          <div style={{ position: "absolute", inset: 0, background: isDark ? "rgba(28,28,30,0.93)" : "rgba(250,250,252,0.93)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, borderRadius: 20, zIndex: 10 }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: "linear-gradient(135deg,#0A84FF 0%,#0060D0 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(10,132,255,0.4)", animation: "pcc-pulse 1.6s ease-in-out infinite" }}>
              <span className="ms" style={{ fontSize: 28, color: '#fff', fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 24' }}>print</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: tx, marginBottom: 3 }}>{printProgress?.label ?? "Preparing…"}</div>
              {printProgress && printProgress.total > 0 && (
                <div style={{ fontSize: 11, color: ts }}>Day {printProgress.current} of {printProgress.total}</div>
              )}
            </div>
            <div style={{ width: 260, height: 4, borderRadius: 2, background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#0A84FF,#30D158)", borderRadius: 2, transition: "width 0.4s ease" }} />
            </div>
            <div style={{ fontSize: 10, color: ts, opacity: 0.55 }}>Please wait — do not close this window</div>
          </div>
        )}

        <style>{`@keyframes pcc-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.05);} }`}</style>
      </div>
    </div>,
    document.body
  );
}

// ─── Small shared sub-components ─────────────────────────────────────────────

function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
  return <div style={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "#8E8E93" : "#6B7280", letterSpacing: "0.08em" }}>{text}</div>;
}

function PresetPill({ label, active, onClick, isDark, accent }: { label: string; active: boolean; onClick: () => void; isDark: boolean; accent?: string }) {
  const a = accent ?? "#0A84FF";
  return (
    <button type="button" onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20,
      border: `1.5px solid ${active ? a : (isDark ? "rgba(72,72,74,0.45)" : "rgba(209,209,214,0.55)")}`,
      background: active ? (isDark ? `${a}22` : `${a}14`) : (isDark ? "rgba(44,44,46,0.45)" : "rgba(255,255,255,0.55)"),
      color: active ? a : (isDark ? "#8E8E93" : "#6B7280"),
      fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap",
      transition: "all 0.12s",
    }}>{label}</button>
  );
}

function BulkBtn({ label, active, color, onClick, isDark }: { label: string; active: boolean; color: string; onClick: () => void; isDark: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "4px 9px", borderRadius: 6, fontSize: 10, fontWeight: active ? 700 : 500, cursor: "pointer",
      border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

function PosBtn({ label, active, onClick, color, isDark }: { label: string; active: boolean; onClick: () => void; color: string; isDark: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "3px 6px", borderRadius: 5, fontSize: 9.5, fontWeight: active ? 700 : 500,
      cursor: "pointer", border: `1px solid ${active ? color : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
      background: active ? `${color}18` : "transparent", color: active ? color : (isDark ? "#8E8E93" : "#6B7280"),
      transition: "all 0.1s",
    }}>{label}</button>
  );
}

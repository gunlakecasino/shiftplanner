"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  X,
  ChevronDown,
  Check,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "./ConfirmDialog";
import "./printCommandCenter.css";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  defaultPrintDays,
  countPrintPages,
  estimatePrintSeconds,
  tonightPrintConfig,
  tonightPlanningPrintConfig,
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
  planningBlankSlate: boolean;
  includeTimestamp: boolean;
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

export interface PrintProgress {
  current: number;
  total: number;
  label: string;
}

interface PrintCommandCenterProps {
  open: boolean;
  onClose: () => void;
  onPrint: (config: PrintConfig) => void;
  /**
   * Direct Golden PDF download (same capture pipeline as Print).
   * Multi-night selection → ZIP of per-day PDFs.
   */
  onExport?: (config: PrintConfig) => void;
  /** Jump to on-canvas Golden preview for a deploy/breaks sheet */
  onPreviewSheet?: (args: {
    dayIndex: number;
    view: "deployment" | "breaks";
    label: string;
    printVariant: PrintVariant;
    includeShiftNotes: boolean;
    planningBlankSlate: boolean;
    includeTimestamp?: boolean;
  }) => void;
  DAY_DEFS: DayDef[];
  selectedDayIndex: number;
  isPrinting: boolean;
  printProgress: PrintProgress | null;
  isDark?: boolean;
  /** Publish status for the currently selected night */
  currentNightStatus?: string | null;
  /** Only sudo admins see the footer toggle */
  canAccessSudo?: boolean;
}

function formatEstTime(secs: number): string {
  if (secs < 60) return `~${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

interface DayCardProps {
  def: DayDef;
  config: PrintDayConfig;
  onChange: (next: PrintDayConfig) => void;
  isDark: boolean;
}

const DayCard = React.memo(function DayCard({ def, config, onChange, isDark }: DayCardProps) {
  const hasAny = config.printDeploy || config.printBreaks;
  const sheetCount = (config.printDeploy ? 1 : 0) + (config.printBreaks ? 1 : 0);

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
  canAccessSudo = false,
}: PrintCommandCenterProps) {
  const confirmDialog = useConfirm();

  const applyConfig = useCallback((config: PrintConfig) => {
    setDays(config.days.map((d) => ({ ...d, inOverview: false })));
    setPrintVariant(config.printVariant ?? "official");
    setIncludeShiftNotes(config.includeShiftNotes !== false);
    setPlanningBlankSlate(config.planningBlankSlate === true);
    setIncludeTimestamp(config.includeTimestamp ?? true);
  }, []);

  // ── Core config state ──────────────────────────────────────────────────────
  const [days, setDays] = useState<PrintDayConfig[]>(() => defaultPrintDays(selectedDayIndex));
  const [printVariant, setPrintVariant] = useState<PrintVariant>("official");
  const [includeShiftNotes, setIncludeShiftNotes] = useState(true);
  const [planningBlankSlate, setPlanningBlankSlate] = useState(false);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [nightStatusByDay, setNightStatusByDay] = useState<Record<number, string | null>>({});

  const modalRef = useRef<HTMLDivElement>(null);
  const prevBodyOverflow = useRef<string>("");

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

  // Default to tonight's deploy + breaks when opened
  useEffect(() => {
    if (!open) return;
    const defaultVariant: PrintVariant =
      currentNightStatus !== "published" ? "planning" : "official";
    applyConfig(
      defaultVariant === "planning"
        ? tonightPlanningPrintConfig(selectedDayIndex)
        : tonightPrintConfig(selectedDayIndex, defaultVariant),
    );
    setShowAdvanced(false);
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
  const pageCount = useMemo(() => countPrintPages(days), [days]);
  const estSecs = useMemo(() => estimatePrintSeconds(days), [days]);
  const uniqueExportDays = useMemo(
    () => new Set(days.filter((d) => d.printDeploy || d.printBreaks).map((d) => d.dayIndex)).size,
    [days],
  );
  const exportLabel = uniqueExportDays > 1 ? "Export ZIP" : "Export PDF";

  const sheetTypeLabel = printVariant === "planning" ? "Planning Worksheet" : "Floor Sheet";

  const handlePrintVariantChange = useCallback(
    async (next: PrintVariant) => {
      if (next === printVariant) return;
      if (
        next === "official" &&
        hasUnpublishedQueuedNights(days, selectedDayIndex, currentNightStatus, nightStatusByDay)
      ) {
        const ok = await confirmDialog(
          "One or more selected nights are still unpublished. Print the floor sheet anyway?",
          { confirmLabel: "Print anyway" },
        );
        if (!ok) return;
      }
      setPrintVariant(next);
    },
    [printVariant, days, selectedDayIndex, currentNightStatus, nightStatusByDay, confirmDialog],
  );

  const deployCount = useMemo(() => days.filter((d) => d.printDeploy).length, [days]);
  const breaksCount = useMemo(() => days.filter((d) => d.printBreaks).length, [days]);
  const activeNightCount = useMemo(
    () => days.filter((d) => d.printDeploy || d.printBreaks).length,
    [days],
  );
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
  }, [open, mounted, pageCount, isPrinting]);

  // ── Config snapshot (for save/apply) ──────────────────────────────────────
  const currentConfig = useCallback(
    (): PrintConfig => ({
      days: days.map((d) => ({ ...d, inOverview: false })),
      pageOrder: "paired",
      margins: "narrow",
      includeOverview: false,
      overviewPosition: "last",
      includeCoverPage: false,
      coverPagePosition: "first",
      customQueueOrder: null,
      printVariant,
      includeShiftNotes,
      planningBlankSlate,
      includeTimestamp,
    }),
    [days, printVariant, includeShiftNotes, planningBlankSlate, includeTimestamp],
  );

  // ── Day change handler ────────────────────────────────────────────────────
  const handleDayChange = useCallback((updated: PrintDayConfig) => {
    setDays((prev) =>
      prev.map((d) =>
        d.dayIndex === updated.dayIndex ? { ...updated, inOverview: false } : d,
      ),
    );
  }, []);

  // ── Bulk toggles ──────────────────────────────────────────────────────────
  const allDeploy = days.every(d => d.printDeploy);
  const allBreaks = days.every(d => d.printBreaks);

  const bulkToggle = useCallback(
    (field: "printDeploy" | "printBreaks") => {
      const currentAll = days.every((d) => d[field]);
      const nextVal = !currentAll;
      setDays((prev) => prev.map((d) => ({ ...d, [field]: nextVal, inOverview: false })));
    },
    [days],
  );

  const bulkClear = useCallback(() => {
    setDays((prev) => prev.map((d) => ({ ...d, printDeploy: false, printBreaks: false, inOverview: false })));
  }, []);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (pageCount === 0) return;
    onPrint(currentConfig());
  }, [pageCount, currentConfig, onPrint]);

  // ── Export PDF / ZIP (Golden raster pipeline) ─────────────────────────────
  const handleExport = useCallback(() => {
    if (pageCount === 0 || !onExport) return;
    onExport(currentConfig());
  }, [pageCount, currentConfig, onExport]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPrinting) { e.stopPropagation(); onClose(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !isPrinting && pageCount > 0) {
        e.preventDefault();
        // ⌘⇧↩ = export PDF; ⌘↩ = browser print
        if (e.shiftKey && onExport) {
          handleExport();
        } else {
          handlePrint();
        }
      }
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, isPrinting, pageCount, onClose, onExport, handlePrint, handleExport]);

  if (!mounted) return null;

  // ── Theme values ──────────────────────────────────────────────────────────
  const panelBg = isDark ? "rgba(28,28,30,0.97)" : "rgba(250,250,252,0.98)";
  const border = isDark ? "rgba(72,72,74,0.6)" : "rgba(209,209,214,0.7)";
  const tx = isDark ? "#F2F2F4" : "#1C1C1E";
  const ts = isDark ? "#8E8E93" : "#6B7280";
  const divider = isDark ? "rgba(72,72,74,0.4)" : "rgba(209,209,214,0.5)";
  const sectionBg = isDark ? "rgba(22,22,24,0.5)" : "rgba(245,245,247,0.6)";
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
      onClick={e => { if (e.target === e.currentTarget && !isPrinting) onClose(); }}
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
              Pick nights — then print.
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
              <span style={{ fontSize: 10.5, color: ts, marginLeft: 2 }}>
                {activeNightCount} night{activeNightCount !== 1 ? "s" : ""} · {formatEstTime(estSecs)}
              </span>
            </>
          )}
        </div>

        {/* ── SCROLLABLE BODY ───────────────────────────────────────────────── */}
        <div className="pcc-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", opacity: isPrinting ? 0.45 : 1, pointerEvents: isPrinting ? "none" : "auto", transition: "opacity 0.2s" }}>

          {/* ── DAY CARDS ─────────────────────────────────────────────────── */}
          <div style={{ padding: "14px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <SectionLabel text="NIGHTS" isDark={isDark} />
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <BulkBtn label="All Deploy" active={allDeploy} color="rgba(52,199,89,0.85)" onClick={() => bulkToggle("printDeploy")} isDark={isDark} />
                <BulkBtn label="All Breaks" active={allBreaks} color="rgba(255,159,10,0.85)" onClick={() => bulkToggle("printBreaks")} isDark={isDark} />
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

          {/* ── ADVANCED ────────────────────────────────────────────────────── */}
          <div style={{ padding: "0 20px 16px" }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="sb-interactive"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 0 6px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: ts,
              }}
            >
              <SectionLabel text="ADVANCED" isDark={isDark} />
              <span style={{ fontSize: 10, color: ts, opacity: 0.75 }}>
                {sheetTypeLabel}
              </span>
              <ChevronDown
                size={14}
                strokeWidth={2.2}
                style={{
                  marginLeft: "auto",
                  transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.15s",
                }}
              />
            </button>

            {showAdvanced && (
              <div style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <SectionLabel text="SHEET TYPE" isDark={isDark} />
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {([
                      { v: "planning" as const, l: "Planning Worksheet", d: "Muted review sheet · overlaps-only breaks" },
                      { v: "official" as const, l: "Floor Sheet", d: "Deploy + break waves for the floor" },
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
                      Pre-fills saved notes + dot grid
                    </span>
                  </button>
                  {printVariant === "planning" && (
                    <button
                      type="button"
                      onClick={() => setPlanningBlankSlate((v) => !v)}
                      aria-pressed={planningBlankSlate}
                      className="sb-interactive"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginTop: 6,
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: `1px solid ${planningBlankSlate ? "rgba(10,132,255,0.35)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                        background: planningBlankSlate ? (isDark ? "rgba(10,132,255,0.1)" : "rgba(10,132,255,0.06)") : "transparent",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      <CheckDot active={planningBlankSlate} color="#0A84FF" />
                      <span style={{ fontSize: 11, fontWeight: 600, color: planningBlankSlate ? "#0A84FF" : tx }}>
                        Blank slate worksheet
                      </span>
                      <span style={{ fontSize: 9.5, color: ts, marginLeft: "auto" }}>
                        No notes prefill · no covered-by hints
                      </span>
                    </button>
                  )}

                  {canAccessSudo && (
                    <button
                      type="button"
                      onClick={() => setIncludeTimestamp((v) => !v)}
                      aria-pressed={includeTimestamp}
                      className="sb-interactive"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginTop: 6,
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: `1px solid ${includeTimestamp ? "rgba(10,132,255,0.35)" : (isDark ? "rgba(72,72,74,0.38)" : "rgba(209,209,214,0.5)")}`,
                        background: includeTimestamp ? (isDark ? "rgba(10,132,255,0.1)" : "rgba(10,132,255,0.06)") : "transparent",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      <CheckDot active={includeTimestamp} color="#0A84FF" />
                      <span style={{ fontSize: 11, fontWeight: 600, color: includeTimestamp ? "#0A84FF" : tx }}>
                        Print timestamp stamp (admin)
                      </span>
                      <span style={{ fontSize: 9.5, color: ts, marginLeft: "auto" }}>
                        High-quality UPDATED time in header
                      </span>
                    </button>
                  )}
                </div>
              </div>
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
          <div style={{ flex: 1, minWidth: 0 }}>
            {pageCount > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 11, color: ts }}>
                  <span style={{ color: tx, fontWeight: 700 }}>{pageCount} sheet{pageCount !== 1 ? "s" : ""}</span>
                  {" · "}{formatEstTime(estSecs)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <KbdHint label="Print" keys={["⌘", "↩"]} isDark={isDark} />
                  {onExport ? <KbdHint label="Export" keys={["⌘", "⇧", "↩"]} isDark={isDark} /> : null}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: ts, opacity: 0.55 }}>Select nights to enable print</span>
            )}
          </div>

          {onExport ? (
            <button
              type="button"
              onClick={handleExport}
              disabled={isPrinting || pageCount === 0}
              className="sb-interactive"
              title={
                uniqueExportDays > 1
                  ? "Download ZIP of per-day Golden PDFs"
                  : "Download Golden PDF (same fidelity as Print → Save as PDF)"
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 10,
                border: `1.5px solid ${uniqueExportDays > 1 ? "rgba(10,132,255,0.35)" : divider}`,
                background: uniqueExportDays > 1
                  ? (isDark ? "rgba(10,132,255,0.12)" : "rgba(10,132,255,0.08)")
                  : (isDark ? "rgba(72,72,74,0.35)" : "rgba(255,255,255,0.9)"),
                color: uniqueExportDays > 1 ? "#0A84FF" : ts,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: (isPrinting || pageCount === 0) ? "not-allowed" : "pointer",
                opacity: isPrinting ? 0.5 : 1,
              }}
            >
              <Download size={15} strokeWidth={2.2} />
              {exportLabel}
            </button>
          ) : null}

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

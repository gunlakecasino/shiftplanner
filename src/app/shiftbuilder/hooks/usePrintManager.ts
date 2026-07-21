"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  buildPrintQueue,
  applyCustomQueueOrder,
  normalizePrintConfigForExecution,
  loadLastPrintConfig,
  saveLastPrintConfig,
  tonightPrintConfig,
  fullWeekPrintConfig,
} from "../print/printConfigUtils";
import { generatePrintPreviewGoldenPages } from "../print/printPreviewPipeline";
import type { LiveBoardOverlay } from "../print/mergePrintSnapshot";
import {
  mountGoldenPrintSession,
  runBrowserPrint,
} from "../print/printSession";
import type {
  PrintConfig,
  PrintVariant,
  PrintProgress,
} from "../components/PrintCommandCenter";
import type { PrintPreviewFocus } from "../print/LivePrintPreviewArtboard";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";

export interface UsePrintManagerParams {
  selectedDayIndex: number;
  DAY_DEFS: DayDef[];
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
  currentView: "deployment" | "breaks" | "weekly";
  setCurrentView: React.Dispatch<React.SetStateAction<"deployment" | "breaks" | "weekly">>;
  changeDay: (newIndex: number) => void;
  flushAuxLayoutSave: () => Promise<void>;
  isDraftMode: boolean;
  draftAssignments: Record<string, any>;
  auxDefs: any[];
  notesRef: React.RefObject<HTMLDivElement | null>;
  currentNight: { notes?: string } | null;
  handleSlotClose: () => void;
  loadingAssignmentsRef: React.RefObject<boolean>;
  selectedTasksLatestRef: React.RefObject<Record<string, any>>;
  // Optional for full context
  getCurrentAssignmentsSnapshot?: () => Record<string, any>;
}

export interface UsePrintManagerReturn {
  // Core print UI state
  isPrintCenterOpen: boolean;
  setIsPrintCenterOpen: (open: boolean) => void;
  coverGuideOpen: boolean;
  setCoverGuideOpen: (open: boolean) => void;

  isPrinting: boolean;
  printBusyMode: "print" | "export";
  printProgress: PrintProgress | null;

  // Canvas / preview mode (tightly coupled to print preview)
  canvasMode: "builder" | "print-preview";
  setCanvasMode: (mode: "builder" | "print-preview") => void;
  handleCanvasModeChange: (mode: "builder" | "print-preview") => void;
  isPrintPreview: boolean;

  // Preview specific
  printPreviewFocus: PrintPreviewFocus;
  setPrintPreviewFocus: React.Dispatch<React.SetStateAction<PrintPreviewFocus>>;
  printPreviewQueueContext: {
    queueIds: string[];
    queuePageId: string;
    printVariant?: PrintVariant;
    includeShiftNotes?: boolean;
    planningBlankSlate?: boolean;
    includeTimestamp?: boolean;
  } | null;
  setPrintPreviewQueueContext: (ctx: any) => void;

  // Computed Golden frame / preview sizing (for layout)
  printPreviewSheetCount: number;
  printPreviewContentWidth: number;
  printPreviewContentHeight: number;
  goldenFrameWidth: number;
  goldenFrameHeight: number;
  printPreviewArtboardSize: { w: number; h: number } | undefined;

  // Handlers
  handlePrintWithConfig: (config: PrintConfig, options?: { exportMode?: boolean }) => Promise<void>;
  handlePreviewSheet: (args: {
    dayIndex: number;
    view: "deployment" | "breaks";
    label: string;
    printVariant: PrintVariant;
    includeShiftNotes: boolean;
    planningBlankSlate: boolean;
    includeTimestamp?: boolean;
  }) => void;
  handlePrintWeek: () => Promise<void>;
  handleQuickPrintTonight: () => Promise<void>;
}

/**
 * usePrintManager
 *
 * Extracted for world-class decomposition (run 1).
 * Owns all Print Command Center state, preview canvas mode coordination,
 * the heavy handlePrintWithConfig (multi-day Golden capture + export/print),
 * keyboard shortcuts, and related progress / busy state.
 *
 * Keeps the rich /print/ pipeline intact. Client is thinner composer.
 */
export function usePrintManager(params: UsePrintManagerParams): UsePrintManagerReturn {
  const {
    selectedDayIndex,
    DAY_DEFS,
    showToast,
    currentView,
    setCurrentView,
    changeDay,
    flushAuxLayoutSave,
    isDraftMode,
    draftAssignments,
    auxDefs,
    notesRef,
    currentNight,
    handleSlotClose,
    loadingAssignmentsRef,
    selectedTasksLatestRef,
    getCurrentAssignmentsSnapshot,
  } = params;

  // === Print Command Center state ===
  const [isPrintCenterOpen, setIsPrintCenterOpen] = useState(false);
  const [coverGuideOpen, setCoverGuideOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printBusyMode, setPrintBusyMode] = useState<"print" | "export">("print");
  const [printProgress, setPrintProgress] = useState<PrintProgress | null>(null);

  // Canvas authoring mode (print-preview drives Golden live preview)
  const [canvasMode, setCanvasMode] = useState<"builder" | "print-preview">(() => {
    if (typeof window === "undefined") return "builder";
    try {
      const saved = localStorage.getItem("oms_canvas_mode");
      return (saved === "print-preview" || saved === "builder") ? saved : "builder";
    } catch {
      return "builder";
    }
  });

  const isPrintPreview = canvasMode === "print-preview";

  const [printPreviewFocus, setPrintPreviewFocus] = useState<PrintPreviewFocus>("duplex");
  const [printPreviewQueueContext, setPrintPreviewQueueContext] = useState<{
    queueIds: string[];
    queuePageId: string;
    printVariant?: PrintVariant;
    includeShiftNotes?: boolean;
    planningBlankSlate?: boolean;
    includeTimestamp?: boolean;
  } | null>(null);

  // Persist canvasMode (moved from Client)
  useEffect(() => {
    try {
      localStorage.setItem("oms_canvas_mode", canvasMode);
    } catch {
      /* ignore */
    }
  }, [canvasMode]);

  // Duplex default when entering preview without explicit queue
  useEffect(() => {
    if (isPrintPreview && printPreviewQueueContext === null) {
      setPrintPreviewFocus("duplex");
    }
  }, [isPrintPreview, printPreviewQueueContext]);

  // Computed preview sizing (same logic as before)
  const printPreviewSheetCount = printPreviewFocus === "duplex" ? 2 : 1;

  // NOTE: These helpers are defined in Client scope (printPreviewStageWidth/Height)
  // For extraction we import from the same module path used by scaled sheet.
  // To avoid circular issues we re-compute dimensions here using constants if possible,
  // but to keep fidelity we duplicate the minimal computation or import.
  // For simplicity and fidelity we define local versions based on known golden.
  const NATURAL_WIDTH = 1056;
  const NATURAL_HEIGHT = 816;
  const printPreviewContentWidth = printPreviewSheetCount === 2 ? 2112 : NATURAL_WIDTH; // approx from scaled logic
  const printPreviewContentHeight = NATURAL_HEIGHT;

  const goldenFrameWidth = isPrintPreview ? printPreviewContentWidth : NATURAL_WIDTH;
  const goldenFrameHeight = isPrintPreview ? printPreviewContentHeight : NATURAL_HEIGHT;
  const printPreviewArtboardSize = isPrintPreview
    ? { w: printPreviewContentWidth, h: printPreviewContentHeight }
    : undefined;

  // Core generalized print handler (extracted verbatim logic + minor param wiring)
  const handlePrintWithConfig = useCallback(
    async (config: PrintConfig, options: { exportMode?: boolean } = {}) => {
      const { exportMode = false } = options;
      config = normalizePrintConfigForExecution(config, DAY_DEFS);
      handleSlotClose();

      const originalDayIndex = selectedDayIndex;
      const originalView = currentView;
      const originalCanvasMode = canvasMode;

      const waitForLoad = (timeoutMs = 15000) =>
        new Promise<void>((resolve, reject) => {
          if (!loadingAssignmentsRef.current) {
            resolve();
            return;
          }
          const start = Date.now();
          const check = () => {
            if (!loadingAssignmentsRef.current) {
              resolve();
              return;
            }
            if (Date.now() - start > timeoutMs) {
              reject(new Error("Timeout loading night data"));
              return;
            }
            setTimeout(check, 60);
          };
          setTimeout(check, 60);
        });

      const activeDays = config.days.filter((d) => d.printDeploy || d.printBreaks);

      if (activeDays.length === 0) {
        showToast(exportMode ? "Nothing to export. (no pages selected)" : "No pages selected to print.", "error");
        return;
      }

      const customQueueOrder = config.customQueueOrder ?? null;
      const plannedQueue = applyCustomQueueOrder(
        buildPrintQueue(
          config.days,
          config.pageOrder,
          DAY_DEFS,
          config.includeOverview,
          config.overviewPosition,
          config.includeCoverPage,
          config.coverPagePosition,
          config.printVariant ?? "official",
        ),
        customQueueOrder,
      );
      const totalPages = plannedQueue.length;

      const dayIndices = [...new Set(activeDays.map((d) => d.dayIndex))].sort((a, b) => a - b);

      setPrintBusyMode(exportMode ? "export" : "print");
      setIsPrinting(true);
      setPrintProgress({
        current: 0,
        total: totalPages,
        label: exportMode ? "Gathering schedule data…" : "Preparing sheets…",
      });

      let pageProgress = 0;
      const bumpProgress = (label: string) => {
        pageProgress = Math.min(pageProgress + 1, totalPages);
        setPrintProgress({ current: pageProgress, total: totalPages, label });
      };

      try {
        await flushAuxLayoutSave().catch(() => {});

        const liveOverlaysByDay = new Map<number, LiveBoardOverlay>();
        if (dayIndices.includes(originalDayIndex)) {
          const assignmentsSnap =
            getCurrentAssignmentsSnapshot?.() ??
            useShiftBuilderStore.getState().assignments ??
            {};
          liveOverlaysByDay.set(originalDayIndex, {
            assignments: assignmentsSnap,
            auxDefs,
            tasksBySlot: selectedTasksLatestRef.current,
            notes: notesRef.current?.innerText ?? currentNight?.notes ?? "",
          });
        }

        const goldenPages = await generatePrintPreviewGoldenPages({
          config,
          dayDefs: DAY_DEFS,
          activeDays,
          coverHTML: null,
          overviewHTML: null,
          liveOverlaysByDay,
          draftAssignments: isDraftMode ? draftAssignments : undefined,
          isDraftMode,
          onProgress: (label) => {
            bumpProgress(label);
          },
        });

        if (goldenPages.length === 0) {
          showToast(exportMode ? "Nothing to export." : "Nothing to print.", "error");
          return;
        }

        if (goldenPages.length !== totalPages) {
          console.warn("[shiftbuilder] Print page count mismatch", {
            expected: totalPages,
            rendered: goldenPages.length,
            keys: goldenPages.map((p) => p.key),
          });
        }

        if (exportMode) {
          setPrintProgress({ current: 0, total: goldenPages.length, label: "Rendering Golden sheets…" });
          // html-to-image + jsPDF are print/export-only and among the largest
          // client dependencies. Keep them out of the board startup path.
          const { exportGoldenPdf } = await import("../print/exportPdf");
          const result = await exportGoldenPdf({
            pages: goldenPages,
            config,
            dayDefs: DAY_DEFS,
            onProgress: (p) => setPrintProgress(p),
          });
          saveLastPrintConfig(config);
          showToast(
            result.usedZip
              ? `ZIP downloaded (${result.filename}).`
              : "PDF downloaded (Golden print fidelity).",
            "success",
          );
          setIsPrintCenterOpen(false);
        } else {
          // Native browser print preserves the already-verified Golden DOM.
          // The prior html-to-image raster hop could corrupt individual overlap
          // cards in the PDF (for example, rendering a valid name as a dash).
          setPrintProgress({ current: 0, total: goldenPages.length, label: "Preparing browser print sheets…" });
          setPrintProgress({ current: totalPages, total: totalPages, label: "Sending to printer…" });
          saveLastPrintConfig(config);
          const session = await mountGoldenPrintSession(
            goldenPages,
            config,
            "print",
          );
          await runBrowserPrint(session);
          setIsPrintCenterOpen(false);
        }
      } catch (e) {
        console.error("[shiftbuilder] print-with-config error", e);
        const detail =
          e instanceof Error && e.message
            ? e.message.slice(0, 140)
            : null;
        showToast(
          exportMode
            ? detail
              ? `Export failed: ${detail}`
              : "Export failed — try again."
            : detail
              ? `Print failed: ${detail}`
              : "Print failed — try again.",
          "error",
        );
        document.body.classList.remove(
          "printing-dual-mode",
          "sb-print-export-busy",
          "golden-export-raster",
        );
        document.querySelector(".print-dual-container")?.remove();
        document.getElementById("__pcc-print-override")?.remove();
        document.getElementById("__pcc-export-override")?.remove();
      } finally {
        flushSync(() => changeDay(originalDayIndex));
        await waitForLoad().catch(() => {});
        flushSync(() => {
          setCurrentView(originalView);
          setCanvasMode(originalCanvasMode);
        });
        setIsPrinting(false);
        setPrintProgress(null);
      }
    },
    [
      DAY_DEFS,
      selectedDayIndex,
      currentView,
      showToast,
      handleSlotClose,
      canvasMode,
      flushAuxLayoutSave,
      isDraftMode,
      draftAssignments,
      auxDefs,
      notesRef,
      currentNight,
      loadingAssignmentsRef,
      selectedTasksLatestRef,
      getCurrentAssignmentsSnapshot,
      changeDay,
      setCurrentView,
    ],
  );

  const handleCanvasModeChange = useCallback(
    (mode: "builder" | "print-preview") => {
      setCanvasMode(mode);
      if (mode === "print-preview") {
        setPrintPreviewFocus("duplex");
        setPrintPreviewQueueContext(null);
      }
    },
    [],
  );

  const handlePreviewSheet = useCallback(
    (args: {
      dayIndex: number;
      view: "deployment" | "breaks";
      label: string;
      printVariant: PrintVariant;
      includeShiftNotes: boolean;
      planningBlankSlate: boolean;
      includeTimestamp?: boolean;
    }) => {
      const lastConfig = loadLastPrintConfig(args.dayIndex);
      const config = lastConfig ?? tonightPrintConfig(args.dayIndex);
      const printVariant = args.printVariant ?? config.printVariant ?? "official";
      const includeShiftNotes = args.includeShiftNotes ?? config.includeShiftNotes !== false;
      const planningBlankSlate = args.planningBlankSlate ?? config.planningBlankSlate === true;
      const includeTimestamp = args.includeTimestamp ?? config.includeTimestamp ?? true;

      const queueIds = applyCustomQueueOrder(
        buildPrintQueue(
          config.days,
          config.pageOrder,
          DAY_DEFS,
          config.includeOverview,
          config.overviewPosition,
          config.includeCoverPage,
          config.coverPagePosition,
          printVariant,
        ),
        config.customQueueOrder ?? null,
      ).map((item) => item.id);

      const queuePageId = args.view === "breaks" ? `${args.dayIndex}-b` : `${args.dayIndex}-d`;

      setIsPrintCenterOpen(false);
      flushSync(() => {
        setPrintPreviewFocus(args.view);
        setPrintPreviewQueueContext({
          queueIds,
          queuePageId,
          printVariant,
          includeShiftNotes,
          planningBlankSlate,
          includeTimestamp,
        });
        setCanvasMode("print-preview");
        changeDay(args.dayIndex);
        setCurrentView(args.view);
      });
      showToast(`Preview: ${args.label}`, "info");
    },
    [DAY_DEFS, showToast, changeDay, setCurrentView],
  );

  const handlePrintWeek = useCallback(async () => {
    showToast("Preparing full week print…", "info");
    await handlePrintWithConfig(fullWeekPrintConfig());
  }, [handlePrintWithConfig, showToast]);

  const handleQuickPrintTonight = useCallback(async () => {
    await handlePrintWithConfig(tonightPrintConfig(selectedDayIndex));
  }, [handlePrintWithConfig, selectedDayIndex]);

  // Keyboard shortcuts for print (Cmd/Ctrl+P)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isPrintCenter = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p" && !e.shiftKey;
      const isQuickPrintTonight = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p" && e.shiftKey;
      if (isPrintCenter) {
        e.preventDefault();
        setIsPrintCenterOpen(true);
      }
      if (isQuickPrintTonight) {
        e.preventDefault();
        void handleQuickPrintTonight();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleQuickPrintTonight]);

  // Re-computed live values (some are passed through for layout)
  const printPreviewSheetCountMemo = printPreviewFocus === "duplex" ? 2 : 1;
  const printPreviewContentWidthMemo = printPreviewSheetCountMemo === 2 ? 2112 : 1056; // matches prior
  const printPreviewContentHeightMemo = 816;

  return {
    isPrintCenterOpen,
    setIsPrintCenterOpen,
    coverGuideOpen,
    setCoverGuideOpen,
    isPrinting,
    printBusyMode,
    printProgress,

    canvasMode,
    setCanvasMode,
    handleCanvasModeChange,
    isPrintPreview,

    printPreviewFocus,
    setPrintPreviewFocus,
    printPreviewQueueContext,
    setPrintPreviewQueueContext,

    printPreviewSheetCount: printPreviewSheetCountMemo,
    printPreviewContentWidth: printPreviewContentWidthMemo,
    printPreviewContentHeight: printPreviewContentHeightMemo,
    goldenFrameWidth: isPrintPreview ? printPreviewContentWidthMemo : 1056,
    goldenFrameHeight: isPrintPreview ? printPreviewContentHeightMemo : 816,
    printPreviewArtboardSize: isPrintPreview
      ? { w: printPreviewContentWidthMemo, h: printPreviewContentHeightMemo }
      : undefined,

    handlePrintWithConfig,
    handlePreviewSheet,
    handlePrintWeek,
    handleQuickPrintTonight,
  };
}

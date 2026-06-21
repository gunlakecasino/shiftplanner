"use client";

import React, { useCallback, useState } from "react";
import {
  buildDayDefs,
  currentShiftDate,
  startOfShiftWeek,
} from "@/lib/shiftbuilder/dateUtils";
import type { GoldenPrintPage } from "../../print/assemblePages";
import { buildPrintDaySnapshot } from "../../print/buildPrintDaySnapshot";
import {
  rasterizeGoldenArtboardElement,
  rasterizeGoldenPageHtml,
} from "../../print/goldenExportDocument";
import { renderPrintPreviewHtml } from "../../print/renderPrintPreviewHtml";
import { prepareExportSessionForRaster } from "../../print/rasterPrep";
import { mountGoldenPrintSession, waitForGoldenRenderSettled } from "../../print/printSession";
import { shiftBuilderVersionLabel } from "../../version";
import type { PrintConfig } from "../../components/PrintCommandCenter";

export default function ExportDebugPage() {
  const [dayIndex, setDayIndex] = useState(3);
  const [view, setView] = useState<"deployment" | "breaks">("deployment");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [livePngSrc, setLivePngSrc] = useState<string | null>(null);
  const [iframePngSrc, setIframePngSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const runDebug = useCallback(async () => {
    setError(null);
    setStatus("Building snapshot + HTML…");
    setLivePngSrc(null);
    setIframePngSrc(null);

    try {
      const today = currentShiftDate();
      const dayDefs = buildDayDefs(startOfShiftWeek(today), today);
      const def = dayDefs[dayIndex];
      if (!def) throw new Error("invalid dayIndex");

      const snapshot = await buildPrintDaySnapshot(def, dayIndex);
      const html = renderPrintPreviewHtml({
        view,
        snapshot,
        pageLabel: "— debug —",
        versionLabel: shiftBuilderVersionLabel(),
        weekDayDefs: dayDefs,
        activeBreakGroup: 1,
      });

      const shell = `<!DOCTYPE html><html class="${document.documentElement.className}"><head><link rel="stylesheet" href="/shiftbuilder-print-preview.css" /></head><body class="printing-dual-mode" style="margin:0;background:#fff"><div class="print-dual-container">${html}</div></body></html>`;
      setIframeSrc(shell);

      const kind = view === "breaks" ? "breaks" : "deploy";
      const pages: GoldenPrintPage[] = [{ key: `${dayIndex}-d`, html, kind }];
      const config: PrintConfig = {
        margins: "normal",
        pageOrder: "paired",
        days: [{ dayIndex, printDeploy: true, printBreaks: false, inOverview: false }],
        includeOverview: false,
        overviewPosition: "first",
        includeCoverPage: false,
        coverPagePosition: "first",
        customQueueOrder: null,
        printVariant: "official",
        includeShiftNotes: true,
      };

      setStatus("Rasterizing from mounted Golden session (live DOM — export path)…");
      const session = await mountGoldenPrintSession(pages, config, "export");
      let liveRasterWidth = 0;
      let liveRasterHeight = 0;
      try {
        prepareExportSessionForRaster(session);
        await waitForGoldenRenderSettled();
        const artboard = session.container.querySelector(".print-artboard") as HTMLElement | null;
        if (!artboard) throw new Error("No .print-artboard in export session");
        const liveRaster = await rasterizeGoldenArtboardElement({
          artboard,
          kind,
          pixelRatio: 2,
          usePng: true,
        });
        liveRasterWidth = liveRaster.width;
        liveRasterHeight = liveRaster.height;
        setLivePngSrc(liveRaster.dataUrl);
      } finally {
        session.cleanup();
      }

      setStatus("Rasterizing isolated iframe (legacy fallback)…");
      const iframeRaster = await rasterizeGoldenPageHtml({
        pageHtml: html,
        kind,
        pixelRatio: 2,
        usePng: true,
      });
      setIframePngSrc(iframeRaster.dataUrl);
      setStatus(`Done — live ${liveRasterWidth}×${liveRasterHeight}px`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("Failed");
    }
  }, [dayIndex, view]);

  return (
    <div className="min-h-screen bg-zinc-100 p-6 text-zinc-900">
      <h1 className="text-lg font-bold mb-2">ShiftBuilder Export Debug</h1>
      <p className="text-sm text-zinc-600 mb-4 max-w-2xl">
        Compare iframe Golden HTML vs live-DOM raster (export path) vs iframe raster (legacy).
        Export PDF now uses the live-DOM raster so fonts match the Print button.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm">
          Day index{" "}
          <input
            type="number"
            min={0}
            max={6}
            value={dayIndex}
            onChange={(e) => setDayIndex(Number(e.target.value))}
            className="border rounded px-2 py-1 w-16 ml-1"
          />
        </label>
        <label className="text-sm">
          View{" "}
          <select
            value={view}
            onChange={(e) => setView(e.target.value as "deployment" | "breaks")}
            className="border rounded px-2 py-1 ml-1"
          >
            <option value="deployment">deployment</option>
            <option value="breaks">breaks</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void runDebug()}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-semibold"
        >
          Run export debug
        </button>
        <span className="text-xs text-zinc-500">{status}</span>
      </div>

      {error ? (
        <pre className="text-red-700 text-xs bg-red-50 border border-red-200 rounded p-3 mb-4">{error}</pre>
      ) : null}

      <div className="flex flex-wrap gap-6 items-start">
        <div>
          <div className="text-xs font-semibold mb-1 uppercase tracking-wide text-zinc-500">Iframe preview</div>
          {iframeSrc ? (
            <iframe
              title="export-debug-iframe"
              srcDoc={iframeSrc}
              style={{ width: 1056, height: 816, border: "1px solid #ccc", background: "#fff" }}
            />
          ) : (
            <div style={{ width: 1056, height: 816 }} className="border border-dashed border-zinc-300 bg-white" />
          )}
        </div>
        <div>
          <div className="text-xs font-semibold mb-1 uppercase tracking-wide text-zinc-500">Live DOM raster (PDF source)</div>
          {livePngSrc ? (
            <img
              src={livePngSrc}
              alt="live export raster"
              style={{ width: 1056, height: 816, border: "1px solid #ccc", background: "#fff" }}
            />
          ) : (
            <div style={{ width: 1056, height: 816 }} className="border border-dashed border-zinc-300 bg-white" />
          )}
        </div>
        <div>
          <div className="text-xs font-semibold mb-1 uppercase tracking-wide text-zinc-500">Iframe raster (legacy)</div>
          {iframePngSrc ? (
            <img
              src={iframePngSrc}
              alt="iframe export raster"
              style={{ width: 1056, height: 816, border: "1px solid #ccc", background: "#fff" }}
            />
          ) : (
            <div style={{ width: 1056, height: 816 }} className="border border-dashed border-zinc-300 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  activeGoldenPrintDays,
  clearGoldenPrintReady,
  dayDefForPrintDate,
  goldenPrintArtboardsReady,
  goldenPrintConfigForSheets,
  markGoldenPrintReady,
  markGoldenPrintRoute,
  weekDayDefsForPrintDate,
  type GoldenPrintSheet,
} from "./goldenPrintRoute";
import {
  hydrateNightForPrint,
  waitForPrintArtboardSettled,
} from "./printHydrateNight";
import { generatePrintPreviewGoldenPages } from "./printPreviewPipeline";
import {
  mountGoldenPrintSession,
  waitForGoldenRenderSettled,
  type GoldenPrintSession,
} from "./printSession";

type Props = {
  date: string;
  sheets: GoldenPrintSheet[];
};

const noopPrintHydrateApply = {
  setNightId: (_id: string | null) => {},
  setSelectedTasks: (_tasks: Record<string, NightSlotTask[]>) => {},
  setCardBorders: (_borders: Record<string, string>) => {},
  setNightBreakRows: (
    _rows: Array<{ tmId: string; groupNum: number; slotRef: string | null }>,
  ) => {},
  setLoadingAssignments: (_loading: boolean) => {},
  loadingAssignmentsRef: { current: false },
};

export function GoldenPrintRouteClient({ date, sheets }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<GoldenPrintSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    markGoldenPrintRoute();
    clearGoldenPrintReady();

    const run = async () => {
      const day = dayDefForPrintDate(date);
      const dayDefs = weekDayDefsForPrintDate(date);
      const config = goldenPrintConfigForSheets(day.index, sheets);
      const activeDays = activeGoldenPrintDays(config);

      await hydrateNightForPrint(day, queryClient, noopPrintHydrateApply);
      if (cancelled) return;

      const pages = await generatePrintPreviewGoldenPages({
        config,
        dayDefs,
        activeDays,
        coverHTML: null,
        overviewHTML: null,
        hydrateFromNightCoreOnly: true,
      });
      if (cancelled) return;

      if (pages.length === 0) {
        setError("Nothing to print for this night.");
        return;
      }

      const session = await mountGoldenPrintSession(pages, config, "print", {
        target: "document",
      });
      sessionRef.current = session;

      await waitForGoldenRenderSettled();
      await waitForPrintArtboardSettled();
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      if (cancelled) return;

      if (!goldenPrintArtboardsReady(session.container, pages.length)) {
        setError("Print artboards did not finish painting.");
        return;
      }

      markGoldenPrintReady();
    };

    run().catch((err) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : "Print hydrate failed";
      setError(message);
    });

    return () => {
      cancelled = true;
      clearGoldenPrintReady();
      sessionRef.current?.cleanup();
      sessionRef.current = null;
    };
  }, [date, queryClient, sheets]);

  if (error) {
    return (
      <p data-sb-print-error="1" style={{ padding: 24, fontFamily: "system-ui" }}>
        {error}
      </p>
    );
  }

  return null;
}

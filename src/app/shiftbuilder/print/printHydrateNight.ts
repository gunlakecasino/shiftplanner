import type { QueryClient } from "@tanstack/react-query";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { dbToUi } from "@/lib/shiftbuilder/slot-keys";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { fetchNightCoreData } from "@/app/shiftbuilder/hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "@/app/shiftbuilder/hooks/fetchNightSecondaryData";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";

export type PrintHydrateResult = {
  dateKey: string;
  nightId: string | null;
  assignments: Record<string, any>;
};

function tasksByUiKeyFromRows(nightTaskRows: NightSlotTask[]): Record<string, NightSlotTask[]> {
  const tasksByUiKey: Record<string, NightSlotTask[]> = {};
  nightTaskRows.forEach((row) => {
    const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
    if (uiKey.startsWith("UNK:")) {
      if (row.slotType === "overlap" && (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")) {
        const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
        for (let i = 0; i < 6; i++) {
          (tasksByUiKey[`OL-${half}-${i}`] ??= []).push(row);
        }
        return;
      }
      return;
    }
    (tasksByUiKey[uiKey] ??= []).push(row);
  });
  return tasksByUiKey;
}

function breakRowsForSheet(
  breakRows: any[],
  assignments: Record<string, any>,
): Array<{ tmId: string; groupNum: number; slotRef: string | null }> {
  const placed = new Set(
    Object.values(assignments)
      .map((a: any) => a?.tmId)
      .filter(Boolean),
  );
  return (breakRows as any[])
    .filter(
      (r: any) =>
        r.groupNum &&
        r.groupNum > 0 &&
        (placed.size === 0 || placed.has(r.tmId)),
    )
    .map((r: any) => ({
      tmId: r.tmId,
      groupNum: r.groupNum,
      slotRef: r.slotRef ?? null,
    }));
}

/**
 * Load a night's data from Supabase and push into Query cache + Zustand + caller state
 * before print capture. Avoids racing the legacy loader / keepPreviousData placeholder.
 */
export async function hydrateNightForPrint(
  day: DayDef,
  queryClient: QueryClient | undefined,
  apply: {
    setNightId: (id: string | null) => void;
    setSelectedTasks: (tasks: Record<string, NightSlotTask[]>) => void;
    setCardBorders: (borders: Record<string, string>) => void;
    setNightBreakRows: (
      rows: Array<{ tmId: string; groupNum: number; slotRef: string | null }>,
    ) => void;
    setLoadingAssignments: (loading: boolean) => void;
    loadingAssignmentsRef: { current: boolean };
  },
): Promise<PrintHydrateResult> {
  const dateKey = formatLocalDateISO(day.date);
  apply.setLoadingAssignments(true);
  apply.loadingAssignmentsRef.current = true;

  try {
    const [core, secondary] = await Promise.all([
      fetchNightCoreData(day),
      fetchNightSecondaryData(day),
    ]);

    if (queryClient) {
      queryClient.setQueryData(["nightCore", dateKey], core);
      queryClient.setQueryData(["nightSecondary", dateKey], secondary);
    }

    const assignments = core.assignments ?? {};
    useShiftBuilderStore.getState().setAssignments(assignments);
    apply.setNightId(core.nightId ?? null);

    const tasksByUiKey = tasksByUiKeyFromRows((secondary.tasks ?? []) as NightSlotTask[]);
    apply.setSelectedTasks(tasksByUiKey);
    apply.setCardBorders(secondary.cardBorders ?? {});
    apply.setNightBreakRows(
      breakRowsForSheet(secondary.rawBreakRows ?? [], assignments),
    );

    return { dateKey, nightId: core.nightId ?? null, assignments };
  } finally {
    apply.setLoadingAssignments(false);
    apply.loadingAssignmentsRef.current = false;
  }
}

export async function waitForPrintArtboardSettled(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const loadingCards = document.querySelectorAll(
        ".print-artboard .sb-skeleton, .print-artboard .animate-pulse"
      );
      if (loadingCards.length === 0) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Print capture timed out waiting for cards to finish loading"));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

export function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const tick = () => {
      count++;
      if (count >= n) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
import type { PrintPreviewView } from "./printPreviewTypes";

/** Footer label for a sheet in an ordered print queue (1-based index). */
export function formatGoldenPageLabel(pageIndex: number, totalPages: number): string {
  const total = Math.max(1, totalPages);
  const index = Math.min(Math.max(1, pageIndex), total);
  return `— ${index} of ${total} —`;
}

/** Legacy paired book: deploy = odd, breaks = even across a 7-night week (14 sheets). */
export function pairedWeekPageNumber(dayIndex: number, view: PrintPreviewView): number {
  return view === "deployment" ? dayIndex * 2 + 1 : dayIndex * 2 + 2;
}

/** On-canvas duplex preview for one night (front + back). */
export function duplexNightPageLabel(view: PrintPreviewView): string {
  return formatGoldenPageLabel(view === "deployment" ? 1 : 2, 2);
}

/** Single-sheet focus preview from Print Command Center eye icon. */
export function singleSheetPageLabel(): string {
  return formatGoldenPageLabel(1, 1);
}

export function pageLabelForQueueId(
  queueIds: string[],
  queueId: string,
): string {
  const idx = queueIds.indexOf(queueId);
  if (idx === -1) return formatGoldenPageLabel(1, queueIds.length || 1);
  return formatGoldenPageLabel(idx + 1, queueIds.length);
}
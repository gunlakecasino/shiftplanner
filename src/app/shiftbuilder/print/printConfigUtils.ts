import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig, PageOrder } from "../components/PrintCommandCenter";

export type PrintQueueItemType = "deploy" | "breaks" | "overview" | "cover";

export interface PrintQueueItem {
  id: string;
  label: string;
  type: PrintQueueItemType;
  color: string;
  dayIndex?: number;
}

export function defaultPrintDays(todayIndex: number): PrintDayConfig[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    printDeploy: i === todayIndex,
    printBreaks: i === todayIndex,
    inOverview: false,
  }));
}

export function countPrintPages(
  days: PrintDayConfig[],
  includeOverview: boolean,
  includeCoverPage: boolean,
): number {
  let n = days.reduce((s, d) => s + (d.printDeploy ? 1 : 0) + (d.printBreaks ? 1 : 0), 0);
  if (includeOverview && days.some((d) => d.inOverview)) n++;
  if (includeCoverPage) n++;
  return n;
}

export function estimatePrintSeconds(days: PrintDayConfig[], includeOverview: boolean): number {
  const deployBreaks = new Set(days.filter((d) => d.printDeploy || d.printBreaks).map((d) => d.dayIndex));
  const overviewOnly = includeOverview
    ? days.filter((d) => d.inOverview && !deployBreaks.has(d.dayIndex)).length
    : 0;
  return (deployBreaks.size + overviewOnly) * 4 + (includeOverview ? 2 : 0);
}

export function buildPrintQueue(
  days: PrintDayConfig[],
  pageOrder: PageOrder,
  dayDefs: DayDef[],
  includeOverview: boolean,
  overviewPosition: "first" | "last",
  includeCoverPage: boolean,
  coverPagePosition: "first" | "last",
): PrintQueueItem[] {
  const items: PrintQueueItem[] = [];
  const active = days.filter((d) => d.printDeploy || d.printBreaks);

  const coverItem: PrintQueueItem = { id: "__cover", label: "Cover Page", type: "cover", color: "#1C1C1E" };
  const overviewItem: PrintQueueItem = { id: "__overview", label: "Overview", type: "overview", color: "#5856D6" };

  const dayItems: PrintQueueItem[] = [];
  if (pageOrder === "paired") {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (!def) continue;
      if (d.printDeploy) {
        dayItems.push({
          id: `${d.dayIndex}-d`,
          label: `${def.short} Deploy`,
          type: "deploy",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
      if (d.printBreaks) {
        dayItems.push({
          id: `${d.dayIndex}-b`,
          label: `${def.short} Breaks`,
          type: "breaks",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
    }
  } else if (pageOrder === "deploy-first") {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printDeploy) {
        dayItems.push({
          id: `${d.dayIndex}-d`,
          label: `${def.short} Deploy`,
          type: "deploy",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
    }
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printBreaks) {
        dayItems.push({
          id: `${d.dayIndex}-b`,
          label: `${def.short} Breaks`,
          type: "breaks",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
    }
  } else {
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printBreaks) {
        dayItems.push({
          id: `${d.dayIndex}-b`,
          label: `${def.short} Breaks`,
          type: "breaks",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
    }
    for (const d of active) {
      const def = dayDefs[d.dayIndex];
      if (def && d.printDeploy) {
        dayItems.push({
          id: `${d.dayIndex}-d`,
          label: `${def.short} Deploy`,
          type: "deploy",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
    }
  }

  const hasOverview = includeOverview && days.some((d) => d.inOverview);
  if (includeCoverPage && coverPagePosition === "first") items.push(coverItem);
  if (hasOverview && overviewPosition === "first") items.push(overviewItem);
  items.push(...dayItems);
  if (hasOverview && overviewPosition === "last") items.push(overviewItem);
  if (includeCoverPage && coverPagePosition === "last") items.push(coverItem);

  return items;
}

export function applyCustomQueueOrder(
  autoQueue: PrintQueueItem[],
  customOrder: string[] | null | undefined,
): PrintQueueItem[] {
  if (!customOrder?.length) return autoQueue;
  const autoIds = new Set(autoQueue.map((i) => i.id));
  const customIds = new Set(customOrder);
  if (![...autoIds].every((id) => customIds.has(id)) || ![...customIds].every((id) => autoIds.has(id))) {
    return autoQueue;
  }
  const map = new Map(autoQueue.map((i) => [i.id, i]));
  return customOrder.map((id) => map.get(id)!).filter(Boolean);
}

export function tonightPrintConfig(selectedDayIndex: number): PrintConfig {
  return {
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
  };
}

export function fullWeekPrintConfig(): PrintConfig {
  return {
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
  };
}

const LAST_CONFIG_KEY = "glcr-print-last-config-v3";

export function loadLastPrintConfig(selectedDayIndex: number): PrintConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PrintConfig>;
    if (!parsed.days || parsed.days.length !== 7) return null;
    return {
      days: parsed.days,
      pageOrder: parsed.pageOrder ?? "paired",
      margins: parsed.margins ?? "narrow",
      includeOverview: parsed.includeOverview ?? false,
      overviewPosition: parsed.overviewPosition ?? "last",
      includeCoverPage: parsed.includeCoverPage ?? false,
      coverPagePosition: parsed.coverPagePosition ?? "first",
      customQueueOrder: parsed.customQueueOrder ?? null,
    };
  } catch {
    return null;
  }
}

export function saveLastPrintConfig(config: PrintConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

export function syncOverviewMaster(
  days: PrintDayConfig[],
  includeOverview: boolean,
  selectedDayIndex: number,
): { days: PrintDayConfig[]; includeOverview: boolean } {
  if (!includeOverview) {
    return {
      includeOverview: false,
      days: days.map((d) => ({ ...d, inOverview: false })),
    };
  }
  if (days.some((d) => d.inOverview)) {
    return { includeOverview: true, days };
  }
  return {
    includeOverview: true,
    days: days.map((d) => ({
      ...d,
      inOverview: d.printDeploy || d.printBreaks || d.dayIndex === selectedDayIndex,
    })),
  };
}

export function syncOverviewFromDayChange(
  days: PrintDayConfig[],
  updated: PrintDayConfig,
): { days: PrintDayConfig[]; includeOverview: boolean } {
  const nextDays = days.map((d) => (d.dayIndex === updated.dayIndex ? updated : d));
  const includeOverview = nextDays.some((d) => d.inOverview);
  return { days: nextDays, includeOverview };
}
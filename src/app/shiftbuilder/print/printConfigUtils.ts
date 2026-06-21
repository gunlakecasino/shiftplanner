import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig, PageOrder, PrintVariant } from "../components/PrintCommandCenter";

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

function sheetSuffix(printVariant: PrintVariant): string {
  return printVariant === "planning" ? " (Planning)" : "";
}

function deployLabel(short: string, printVariant: PrintVariant): string {
  return `${short} Deploy${sheetSuffix(printVariant)}`;
}

function breaksLabel(short: string, printVariant: PrintVariant): string {
  return printVariant === "planning"
    ? `${short} Overlaps (Planning)`
    : `${short} Breaks`;
}

export function buildPrintQueue(
  days: PrintDayConfig[],
  pageOrder: PageOrder,
  dayDefs: DayDef[],
  includeOverview: boolean,
  overviewPosition: "first" | "last",
  includeCoverPage: boolean,
  coverPagePosition: "first" | "last",
  printVariant: PrintVariant = "official",
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
          label: deployLabel(def.short, printVariant),
          type: "deploy",
          color: def.color,
          dayIndex: d.dayIndex,
        });
      }
      if (d.printBreaks) {
        dayItems.push({
          id: `${d.dayIndex}-b`,
          label: breaksLabel(def.short, printVariant),
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
          label: deployLabel(def.short, printVariant),
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
          label: breaksLabel(def.short, printVariant),
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
          label: breaksLabel(def.short, printVariant),
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
          label: deployLabel(def.short, printVariant),
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

/** Drop stale drag-order when it no longer matches the active print queue. */
export function normalizePrintConfigForExecution(
  config: PrintConfig,
  dayDefs: DayDef[],
): PrintConfig {
  const autoQueue = buildPrintQueue(
    config.days,
    config.pageOrder,
    dayDefs,
    config.includeOverview,
    config.overviewPosition,
    config.includeCoverPage,
    config.coverPagePosition,
    config.printVariant ?? "official",
  );
  const custom = config.customQueueOrder;
  if (!custom?.length) return config;

  const autoIds = autoQueue.map((i) => i.id).join("\0");
  const customIds = custom.join("\0");
  if (autoIds === customIds) return config;

  const validated = applyCustomQueueOrder(autoQueue, custom);
  const validatedIds = validated.map((i) => i.id).join("\0");
  if (validated.length === autoQueue.length && validatedIds === autoIds) {
    return config;
  }

  return { ...config, customQueueOrder: null };
}

export function tonightPrintConfig(
  selectedDayIndex: number,
  printVariant: PrintVariant = "official",
): PrintConfig {
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
    printVariant,
    includeShiftNotes: true,
  };
}

export function tonightPlanningPrintConfig(selectedDayIndex: number): PrintConfig {
  return tonightPrintConfig(selectedDayIndex, "planning");
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
    printVariant: "official",
    includeShiftNotes: true,
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
      days: parsed.days.map((d) => ({
        dayIndex: d.dayIndex,
        printDeploy: Boolean(d.printDeploy),
        printBreaks: Boolean(d.printBreaks),
        inOverview: Boolean(d.inOverview),
      })),
      pageOrder: parsed.pageOrder ?? "paired",
      margins: parsed.margins ?? "narrow",
      includeOverview: parsed.includeOverview ?? false,
      overviewPosition: parsed.overviewPosition ?? "last",
      includeCoverPage: parsed.includeCoverPage ?? false,
      coverPagePosition: parsed.coverPagePosition ?? "first",
      printVariant: parsed.printVariant === "planning" ? "planning" : "official",
      includeShiftNotes: parsed.includeShiftNotes !== false,
      // Stale saved drag-order (e.g. deploy-only) must not drop breaks at print time.
      customQueueOrder: null,
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
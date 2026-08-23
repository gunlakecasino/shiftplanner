import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig, PageOrder, PrintVariant } from "../components/PrintCommandCenter";

export type PrintQueueItemType = "deploy" | "breaks" | "planner";

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
    printPlanner: false,
    inOverview: false,
  }));
}

export function dayHasPrintPages(d: PrintDayConfig): boolean {
  return Boolean(d.printDeploy || d.printBreaks || d.printPlanner);
}

export function countPrintPages(days: PrintDayConfig[]): number {
  return days.reduce(
    (s, d) => s + (d.printDeploy ? 1 : 0) + (d.printBreaks ? 1 : 0) + (d.printPlanner ? 1 : 0),
    0,
  );
}

export function estimatePrintSeconds(days: PrintDayConfig[]): number {
  const active = new Set(days.filter(dayHasPrintPages).map((d) => d.dayIndex));
  return active.size * 4;
}

function sheetSuffix(printVariant: PrintVariant): string {
  return printVariant === "planning" ? " (Planning)" : "";
}

function deployLabel(short: string, printVariant: PrintVariant): string {
  return `${short} Assignments${sheetSuffix(printVariant)}`;
}

function breaksLabel(short: string, printVariant: PrintVariant): string {
  return printVariant === "planning"
    ? `${short} Aux + Overlaps (Planning)`
    : `${short} Tasks + Overlaps`;
}

/** Paired deploy + breaks per night (only supported print order). */
export function buildPrintQueue(
  days: PrintDayConfig[],
  _pageOrder: PageOrder,
  dayDefs: DayDef[],
  _includeOverview: boolean,
  _overviewPosition: "first" | "last",
  _includeCoverPage: boolean,
  _coverPagePosition: "first" | "last",
  printVariant: PrintVariant = "official",
): PrintQueueItem[] {
  const items: PrintQueueItem[] = [];
  const active = days.filter(dayHasPrintPages);

  for (const d of active) {
    const def = dayDefs[d.dayIndex];
    if (!def) continue;
    if (d.printDeploy) {
      items.push({
        id: `${d.dayIndex}-d`,
        label: deployLabel(def.short, printVariant),
        type: "deploy",
        color: def.color,
        dayIndex: d.dayIndex,
      });
    }
    if (d.printBreaks) {
      items.push({
        id: `${d.dayIndex}-b`,
        label: breaksLabel(def.short, printVariant),
        type: "breaks",
        color: def.color,
        dayIndex: d.dayIndex,
      });
    }
    if (d.printPlanner) {
      items.push({
        id: `${d.dayIndex}-p`,
        label: `${def.short} Planner sheet`,
        type: "planner",
        color: def.color,
        dayIndex: d.dayIndex,
      });
    }
  }

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
  const stripped: PrintConfig = {
    ...config,
    pageOrder: "paired",
    margins: config.margins ?? "narrow",
    includeOverview: false,
    includeCoverPage: false,
    customQueueOrder: null,
    days: config.days.map((d) => ({ ...d, inOverview: false })),
  };

  const autoQueue = buildPrintQueue(
    stripped.days,
    stripped.pageOrder,
    dayDefs,
    false,
    stripped.overviewPosition,
    false,
    stripped.coverPagePosition,
    stripped.printVariant ?? "official",
  );
  const custom = config.customQueueOrder;
  if (!custom?.length) return stripped;

  const autoIds = autoQueue.map((i) => i.id).join("\0");
  const customIds = custom.join("\0");
  if (autoIds === customIds) return stripped;

  const validated = applyCustomQueueOrder(autoQueue, custom);
  const validatedIds = validated.map((i) => i.id).join("\0");
  if (validated.length === autoQueue.length && validatedIds === autoIds) {
    return { ...stripped, customQueueOrder: custom };
  }

  return stripped;
}

export function tonightPrintConfig(
  selectedDayIndex: number,
  printVariant: PrintVariant = "official",
): PrintConfig {
  return {
    days: defaultPrintDays(selectedDayIndex).map((d) =>
      d.dayIndex === selectedDayIndex
        ? { ...d, printDeploy: true, printBreaks: true, printPlanner: false }
        : { ...d, printDeploy: false, printBreaks: false, printPlanner: false },
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
    planningBlankSlate: false,
    includeTimestamp: true,
    editableTmNames: false,
  };
}

export function tonightPlanningPrintConfig(selectedDayIndex: number): PrintConfig {
  return tonightPrintConfig(selectedDayIndex, "planning");
}

/** Sudo admins default to a clean header but can turn the timestamp back on. */
export function applyPrintRoleDefaults(
  config: PrintConfig,
  canAccessSudo: boolean,
): PrintConfig {
  return canAccessSudo ? { ...config, includeTimestamp: false } : config;
}

export function fullWeekPrintConfig(): PrintConfig {
  return {
    days: Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      printDeploy: true,
      printBreaks: true,
      printPlanner: false,
      inOverview: false,
    })),
    pageOrder: "paired",
    margins: "narrow",
    includeOverview: false,
    overviewPosition: "last",
    includeCoverPage: false,
    coverPagePosition: "first",
    customQueueOrder: null,
    printVariant: "official",
    includeShiftNotes: true,
    planningBlankSlate: false,
    includeTimestamp: true,
    editableTmNames: false,
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
        printPlanner: Boolean((d as PrintDayConfig).printPlanner),
        inOverview: false,
      })),
      pageOrder: "paired",
      margins: parsed.margins ?? "narrow",
      includeOverview: false,
      overviewPosition: "last",
      includeCoverPage: false,
      coverPagePosition: "first",
      printVariant: parsed.printVariant === "planning" ? "planning" : "official",
      includeShiftNotes: parsed.includeShiftNotes !== false,
      planningBlankSlate: parsed.planningBlankSlate === true,
      includeTimestamp: parsed.includeTimestamp ?? true,
      editableTmNames: parsed.editableTmNames === true,
      customQueueOrder: null,
    };
  } catch {
    return null;
  }
}

export function saveLastPrintConfig(config: PrintConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LAST_CONFIG_KEY,
      JSON.stringify({
        ...config,
        includeOverview: false,
        includeCoverPage: false,
        customQueueOrder: null,
        pageOrder: "paired",
        days: config.days.map((d) => ({ ...d, inOverview: false })),
      }),
    );
  } catch {
    /* ignore quota */
  }
}

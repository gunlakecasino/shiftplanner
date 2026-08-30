import {
  buildDayDefs,
  formatLocalDateISO,
  parseLocalDateISO,
  startOfShiftWeek,
  type DayDef,
} from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig } from "../components/PrintCommandCenter";
import { dayHasPrintPages, tonightPrintConfig } from "./printConfigUtils";

export const GOLDEN_PRINT_HOSTNAME = "sheetbuilder.origintwelve.com";
export const GOLDEN_PRINT_PATH = "/sheetbuilder/print/golden";
export const GOLDEN_PRINT_PATH_ALIAS = "/shiftbuilder/print/golden";
export const SB_PRINT_READY_ATTR = "data-sb-print-ready";
export const SB_PRINT_ROUTE_ATTR = "data-sb-print-route";

export type GoldenPrintSheet = "assignments" | "tasks" | "planner";

export const DEFAULT_GOLDEN_PRINT_SHEETS: readonly GoldenPrintSheet[] = [
  "assignments",
  "tasks",
];

const SHEET_ALIASES: Record<string, GoldenPrintSheet> = {
  assignments: "assignments",
  deploy: "assignments",
  printdeploy: "assignments",
  tasks: "tasks",
  breaks: "tasks",
  printbreaks: "tasks",
  planner: "planner",
  printplanner: "planner",
};

export function isGoldenPrintPathname(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path === GOLDEN_PRINT_PATH || path === GOLDEN_PRINT_PATH_ALIAS;
}

export function hostnameFromHostHeader(host: string): string {
  return host.split(":")[0]?.trim().toLowerCase() ?? "";
}

/** Production: sheetbuilder.origintwelve.com only. Dev also allows localhost. */
export function isAllowedGoldenPrintHost(
  host: string,
  env: string | undefined = process.env.NODE_ENV,
): boolean {
  const hostname = hostnameFromHostHeader(host);
  if (hostname === GOLDEN_PRINT_HOSTNAME) return true;
  if (env !== "production") {
    return hostname === "localhost" || hostname === "127.0.0.1";
  }
  return false;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseGoldenPrintDate(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (!DATE_KEY_RE.test(value)) return null;
  const date = parseLocalDateISO(value);
  if (Number.isNaN(date.getTime())) return null;
  if (formatLocalDateISO(date) !== value) return null;
  return value;
}

export function parseGoldenPrintSheets(
  raw: string | null | undefined,
): GoldenPrintSheet[] {
  if (!raw?.trim()) return [...DEFAULT_GOLDEN_PRINT_SHEETS];
  const seen = new Set<GoldenPrintSheet>();
  const sheets: GoldenPrintSheet[] = [];
  for (const token of raw.split(",")) {
    const key = token.trim().toLowerCase().replace(/[\s_-]/g, "");
    const sheet = SHEET_ALIASES[key];
    if (!sheet || seen.has(sheet)) continue;
    seen.add(sheet);
    sheets.push(sheet);
  }
  return sheets.length > 0 ? sheets : [...DEFAULT_GOLDEN_PRINT_SHEETS];
}

export function dayDefForPrintDate(dateKey: string): DayDef {
  const date = parseLocalDateISO(dateKey);
  const weekStart = startOfShiftWeek(date);
  const defs = buildDayDefs(weekStart, date);
  return defs.find((def) => formatLocalDateISO(def.date) === dateKey) ?? defs[0]!;
}

export function weekDayDefsForPrintDate(dateKey: string): DayDef[] {
  const date = parseLocalDateISO(dateKey);
  return buildDayDefs(startOfShiftWeek(date), date);
}

export function goldenPrintConfigForSheets(
  dayIndex: number,
  sheets: readonly GoldenPrintSheet[],
): PrintConfig {
  const printDeploy = sheets.includes("assignments");
  const printBreaks = sheets.includes("tasks");
  const printPlanner = sheets.includes("planner");
  const base = tonightPrintConfig(dayIndex);
  return {
    ...base,
    days: base.days.map((day) =>
      day.dayIndex === dayIndex
        ? {
            ...day,
            printDeploy,
            printBreaks,
            printPlanner,
            inOverview: false,
          }
        : {
            ...day,
            printDeploy: false,
            printBreaks: false,
            printPlanner: false,
            inOverview: false,
          },
    ),
  };
}

export function activeGoldenPrintDays(config: PrintConfig) {
  return config.days.filter(dayHasPrintPages);
}

export function expectedGoldenArtboardCount(
  sheets: readonly GoldenPrintSheet[],
): number {
  return sheets.length;
}

/** Headless / Dyno print never overlays the live canvas. */
export function shouldApplyLiveCanvasOverlay(opts: {
  hydrateFromNightCoreOnly?: boolean;
}): boolean {
  return opts.hydrateFromNightCoreOnly !== true;
}

export function markGoldenPrintReady(doc: Document = document): void {
  doc.documentElement.setAttribute(SB_PRINT_READY_ATTR, "1");
}

export function clearGoldenPrintReady(doc: Document = document): void {
  doc.documentElement.removeAttribute(SB_PRINT_READY_ATTR);
}

export function markGoldenPrintRoute(doc: Document = document): void {
  doc.documentElement.setAttribute(SB_PRINT_ROUTE_ATTR, "1");
}

export function goldenPrintArtboardsReady(
  container: ParentNode,
  expectedCount: number,
): boolean {
  const artboards = container.querySelectorAll(".print-artboard");
  if (artboards.length < expectedCount) return false;
  return (
    container.querySelectorAll(
      ".print-artboard .sb-skeleton, .print-artboard .animate-pulse",
    ).length === 0
  );
}

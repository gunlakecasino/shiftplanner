import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";
import {
  applyCustomQueueOrder,
  buildPrintQueue,
} from "./printConfigUtils";

export type PrintPageKind = "deploy" | "breaks" | "overview" | "cover";

export type GoldenPrintPage = {
  key: string;
  html: string;
  kind: PrintPageKind;
};

export type CapturedDayPages = Map<number, { deployHTML?: string; breaksHTML?: string }>;

function kindFromKey(key: string): PrintPageKind {
  if (key === "__cover") return "cover";
  if (key === "__overview") return "overview";
  if (key.endsWith("-b")) return "breaks";
  return "deploy";
}

function pushPage(
  out: GoldenPrintPage[],
  html: string,
  key: string,
): void {
  out.push({ key, html, kind: kindFromKey(key) });
}

/**
 * Build ordered Golden pages from captured day HTML + optional cover/overview.
 * Order always comes from the validated print queue (same as PCC UI + progress).
 */
export function assembleGoldenPrintPages(args: {
  config: PrintConfig;
  dayDefs: DayDef[];
  capturedPages: CapturedDayPages;
  activeDays: PrintDayConfig[];
  coverHTML: string | null;
  overviewHTML: string | null;
}): GoldenPrintPage[] {
  const { config, dayDefs, capturedPages, activeDays, coverHTML, overviewHTML } =
    args;

  const pageMap = new Map<string, { html: string; key: string }>();
  if (coverHTML) {
    pageMap.set("__cover", { html: coverHTML, key: "__cover" });
  }
  if (overviewHTML) {
    pageMap.set("__overview", { html: overviewHTML, key: "__overview" });
  }

  for (const d of activeDays) {
    const c = capturedPages.get(d.dayIndex);
    if (!c) continue;
    if (d.printDeploy && c.deployHTML) {
      pageMap.set(`${d.dayIndex}-d`, {
        html: c.deployHTML,
        key: `${d.dayIndex}-d`,
      });
    }
    if (d.printBreaks && c.breaksHTML) {
      pageMap.set(`${d.dayIndex}-b`, {
        html: c.breaksHTML,
        key: `${d.dayIndex}-b`,
      });
    }
  }

  const queue = applyCustomQueueOrder(
    buildPrintQueue(
      config.days,
      config.pageOrder,
      dayDefs,
      config.includeOverview,
      config.overviewPosition,
      config.includeCoverPage,
      config.coverPagePosition,
    ),
    config.customQueueOrder ?? null,
  );

  const pages: GoldenPrintPage[] = [];
  for (const item of queue) {
    const page = pageMap.get(item.id);
    if (page) pushPage(pages, page.html, page.key);
  }

  return pages;
}
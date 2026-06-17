import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";

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
 */
export function assembleGoldenPrintPages(args: {
  config: PrintConfig;
  capturedPages: CapturedDayPages;
  activeDays: PrintDayConfig[];
  coverHTML: string | null;
  overviewHTML: string | null;
}): GoldenPrintPage[] {
  const { config, capturedPages, activeDays, coverHTML, overviewHTML } = args;
  const pages: GoldenPrintPage[] = [];
  const customQueueOrder = config.customQueueOrder ?? null;
  const hasCover = config.includeCoverPage && coverHTML;
  const hasOverview = Boolean(overviewHTML);

  if (customQueueOrder && customQueueOrder.length > 0) {
    const pageMap = new Map<string, { html: string; key: string }>();
    if (coverHTML) pageMap.set("__cover", { html: coverHTML, key: "__cover" });
    if (overviewHTML) pageMap.set("__overview", { html: overviewHTML, key: "__overview" });
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (!c) continue;
      if (d.printDeploy && c.deployHTML) {
        pageMap.set(`${d.dayIndex}-d`, { html: c.deployHTML, key: `${d.dayIndex}-d` });
      }
      if (d.printBreaks && c.breaksHTML) {
        pageMap.set(`${d.dayIndex}-b`, { html: c.breaksHTML, key: `${d.dayIndex}-b` });
      }
    }
    for (const queueId of customQueueOrder) {
      const page = pageMap.get(queueId);
      if (page) pushPage(pages, page.html, page.key);
    }
    return pages;
  }

  const insertSpecial = (
    pos: "first" | "last" | null,
    html: string | null,
    key: string,
  ) => {
    if (html && pos === "first") pushPage(pages, html, key);
  };
  const appendSpecial = (
    pos: "first" | "last" | null,
    html: string | null,
    key: string,
  ) => {
    if (html && pos === "last") pushPage(pages, html, key);
  };

  insertSpecial(hasCover ? config.coverPagePosition : null, coverHTML, "__cover");
  insertSpecial(hasOverview ? config.overviewPosition : null, overviewHTML, "__overview");

  if (config.pageOrder === "paired") {
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (!c) continue;
      if (d.printDeploy && c.deployHTML) pushPage(pages, c.deployHTML, `${d.dayIndex}-d`);
      if (d.printBreaks && c.breaksHTML) pushPage(pages, c.breaksHTML, `${d.dayIndex}-b`);
    }
  } else if (config.pageOrder === "deploy-first") {
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (c?.deployHTML && d.printDeploy) pushPage(pages, c.deployHTML, `${d.dayIndex}-d`);
    }
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (c?.breaksHTML && d.printBreaks) pushPage(pages, c.breaksHTML, `${d.dayIndex}-b`);
    }
  } else {
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (c?.breaksHTML && d.printBreaks) pushPage(pages, c.breaksHTML, `${d.dayIndex}-b`);
    }
    for (const d of activeDays) {
      const c = capturedPages.get(d.dayIndex);
      if (c?.deployHTML && d.printDeploy) pushPage(pages, c.deployHTML, `${d.dayIndex}-d`);
    }
  }

  appendSpecial(hasOverview ? config.overviewPosition : null, overviewHTML, "__overview");
  appendSpecial(hasCover ? config.coverPagePosition : null, coverHTML, "__cover");

  return pages;
}
"use client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { PortraitPlannerPage } from "./PortraitPlannerPage";
import {
  buildPortraitPlannerPages,
} from "./buildPortraitPlannerModel";
import type { PrintDaySnapshot } from "./printPreviewTypes";

/**
 * Client-side static HTML for the US Letter portrait planner.
 * Same createRoot + flushSync path as Golden preview (Next.js 16).
 */
export function renderPortraitPlannerHtmlPages(snapshot: PrintDaySnapshot): string[] {
  const models = buildPortraitPlannerPages(snapshot);
  return models.map((model) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      flushSync(() => {
        root.render(createElement(PortraitPlannerPage, { model }));
      });
      const artboard = container.querySelector(".print-artboard");
      return artboard?.outerHTML ?? container.innerHTML;
    } finally {
      root.unmount();
    }
  });
}

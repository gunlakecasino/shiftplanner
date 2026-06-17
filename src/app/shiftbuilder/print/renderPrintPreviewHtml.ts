"use client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { PrintPreviewPage } from "./PrintPreviewPage";
import type { PrintPreviewPageProps } from "./printPreviewTypes";

/**
 * Client-side static HTML for Golden print/export.
 * Next.js 16 blocks react-dom/server in app bundles; createRoot + flushSync is the supported alternative.
 */
export function renderPrintPreviewHtml(props: PrintPreviewPageProps): string {
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    flushSync(() => {
      root.render(createElement(PrintPreviewPage, props));
    });
    const artboard = container.querySelector(".print-artboard");
    return artboard?.outerHTML ?? container.innerHTML;
  } finally {
    root.unmount();
  }
}
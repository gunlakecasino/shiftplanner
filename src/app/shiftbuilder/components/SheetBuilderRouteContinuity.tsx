"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  captureSheetBuilderRouteHold,
  isSameSheetBuilderPathname,
  isSheetBuilderInternalHref,
  scheduleSheetBuilderRouteHoldRelease,
} from "@/lib/shiftbuilder/sheetBuilderRouteHold";

/**
 * Keeps the outgoing SheetBuilder paint visible across Settings ↔ canvas ↔ Team
 * until the next view marks `data-sb-route-ready`. Quiet hold — no spinner.
 */
export default function SheetBuilderRouteContinuity({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const nav = target?.closest?.("a[href], [data-sb-nav]") as
        | HTMLAnchorElement
        | HTMLElement
        | null;
      if (!nav) return;

      const href =
        nav instanceof HTMLAnchorElement
          ? nav.getAttribute("href") || nav.href
          : nav.getAttribute("data-sb-nav");
      if (!href || href.startsWith("#")) return;
      if ((nav as HTMLAnchorElement).target === "_blank") return;
      if (!isSheetBuilderInternalHref(href, location.origin)) return;
      if (isSameSheetBuilderPathname(href)) return;
      captureSheetBuilderRouteHold();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useLayoutEffect(() => {
    return scheduleSheetBuilderRouteHoldRelease();
  }, [pathname, search]);

  return (
    <div data-sb-route-root="" className="sb-route-continuity min-h-full">
      {children}
    </div>
  );
}

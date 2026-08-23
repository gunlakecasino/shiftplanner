"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  captureSheetBuilderRouteHold,
  isSameSheetBuilderPathname,
  isSheetBuilderInternalHref,
} from "@/lib/shiftbuilder/sheetBuilderRouteHold";

function maybeHold(href: string) {
  if (!isSheetBuilderInternalHref(href)) return;
  if (isSameSheetBuilderPathname(href)) return;
  captureSheetBuilderRouteHold();
}

/** router.push/replace that holds the outgoing paint until the next view is ready. */
export function useSheetBuilderNav() {
  const router = useRouter();

  const push = useCallback(
    (href: string) => {
      maybeHold(href);
      router.push(href);
    },
    [router],
  );

  const replace = useCallback(
    (href: string, opts?: { scroll?: boolean }) => {
      maybeHold(href);
      router.replace(href, opts);
    },
    [router],
  );

  return { push, replace };
}

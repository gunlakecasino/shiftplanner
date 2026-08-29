"use client";

import { useLayoutEffect, useState } from "react";
import {
  IPAD_DESK_CLASS,
  IPAD_DESK_MQ,
  isIpadDeskDevice,
} from "./tabletDevice";

/**
 * Live 13-inch iPad desk. Syncs `html.sb-ipad-desk` so CSS is a real
 * variant, not a late JS paint. Print / preview must pass enabled=false.
 */
export function useIpadDesk(enabled = true): boolean {
  const [on, setOn] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains(IPAD_DESK_CLASS) || isIpadDeskDevice();
  });

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (!enabled) {
      document.documentElement.classList.remove(IPAD_DESK_CLASS);
      document.body.classList.remove(IPAD_DESK_CLASS);
      setOn(false);
      return;
    }

    const apply = () => {
      const match = isIpadDeskDevice();
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      setOn(match);
      document.documentElement.classList.toggle(IPAD_DESK_CLASS, match);
      document.body.classList.toggle(IPAD_DESK_CLASS, match);
      document.documentElement.classList.toggle("sb-ipad-portrait", match && portrait);
    };

    apply();
    const mq = window.matchMedia(IPAD_DESK_MQ);
    const portraitMq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener?.("change", apply);
    portraitMq.addEventListener?.("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      portraitMq.removeEventListener?.("change", apply);
      window.removeEventListener("resize", apply);
      document.documentElement.classList.remove(IPAD_DESK_CLASS, "sb-ipad-portrait");
      document.body.classList.remove(IPAD_DESK_CLASS);
    };
  }, [enabled]);

  return enabled && on;
}

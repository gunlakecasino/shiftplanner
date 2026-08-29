"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  IPAD_DESK_CLASS,
  IPAD_DESK_MQ,
  isIpadDeskDevice,
} from "./tabletDevice";

const IpadDeskContext = createContext<boolean | null>(null);

/** Fixture / tests can force the night desk without coarse-pointer matchMedia. */
export function IpadDeskProvider({
  value,
  children,
}: {
  value: boolean;
  children: ReactNode;
}) {
  return <IpadDeskContext.Provider value={value}>{children}</IpadDeskContext.Provider>;
}

/**
 * Live 13-inch iPad desk. Syncs `html.sb-ipad-desk` so CSS is a real
 * variant, not a late JS paint. Print / preview must pass enabled=false.
 */
function ipadDeskForced(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-sb-ipad-desk") === "force";
}

export function useIpadDesk(enabled = true): boolean {
  const forcedCtx = useContext(IpadDeskContext);
  const [on, setOn] = useState(() => {
    if (typeof document === "undefined") return false;
    return ipadDeskForced() || document.documentElement.classList.contains(IPAD_DESK_CLASS) || isIpadDeskDevice();
  });

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (!enabled) {
      if (!ipadDeskForced()) {
        document.documentElement.classList.remove(IPAD_DESK_CLASS);
        document.body.classList.remove(IPAD_DESK_CLASS);
      }
      setOn(false);
      return;
    }

    const apply = () => {
      const match = ipadDeskForced() || isIpadDeskDevice();
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
      if (!ipadDeskForced()) {
        document.documentElement.classList.remove(IPAD_DESK_CLASS, "sb-ipad-portrait");
        document.body.classList.remove(IPAD_DESK_CLASS);
      }
    };
  }, [enabled]);

  const forced = typeof document !== "undefined" && ipadDeskForced();
  return enabled && (forcedCtx === true || forced || on);
}

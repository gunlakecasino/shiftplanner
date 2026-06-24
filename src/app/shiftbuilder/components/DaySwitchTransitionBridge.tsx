"use client";

import { useEffect } from "react";
import {
  beginDayCardContentVeil,
  dayKeyFromSwitchDetail,
  prefersReducedMotion,
} from "./state/dayCardContentVeil";

/**
 * Applies inner-content blur veil on existing day-switch performance marks.
 * Card shells stay put; contents unblur after max(250ms, assignments hydrated).
 */
export function DaySwitchTransitionBridge() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (typeof PerformanceObserver === "undefined") return;

    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType !== "mark" || entry.name !== "day-switch-start") continue;
          const detail = (entry as PerformanceMark).detail;
          beginDayCardContentVeil({
            source: "performance-mark",
            targetDayKey: dayKeyFromSwitchDetail(detail),
          });
          break;
        }
      });
      observer.observe({ entryTypes: ["mark"] });
    } catch {
      /* unsupported */
    }

    return () => observer?.disconnect();
  }, []);

  return null;
}

export default DaySwitchTransitionBridge;
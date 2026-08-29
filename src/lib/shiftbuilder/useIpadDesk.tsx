"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import {
  IPAD_DESK_CLASS,
  IPAD_DESK_FORCE_ATTR,
  IPAD_DESK_FORCE_VALUE,
  IPAD_DESK_MQ,
  IPAD_DESK_PORTRAIT_CLASS,
  isIpadDeskDevice,
} from "./tabletDevice";

const IpadDeskContext = createContext<boolean | null>(null);

export function isIpadDeskForced(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute(IPAD_DESK_FORCE_ATTR) === IPAD_DESK_FORCE_VALUE;
}

export function readIpadDeskDocumentClass(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(IPAD_DESK_CLASS);
}

/** Sole writer of html.sb-ipad-desk. html only. Never strips on card unmount. */
export function writeIpadDeskDocumentClass(on: boolean) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.toggle(IPAD_DESK_CLASS, on);
  html.classList.toggle(
    IPAD_DESK_PORTRAIT_CLASS,
    on && window.matchMedia("(orientation: portrait)").matches,
  );
}

function readIpadDeskNow(): boolean {
  return isIpadDeskForced() || readIpadDeskDocumentClass() || isIpadDeskDevice();
}

/**
 * One owner of the document class: boot script + this provider at the live shell.
 * ZoneCard / RRCard must only read. Cleanup never strips the page variant.
 */
export function IpadDeskProvider({
  value,
  enabled = true,
  children,
}: {
  /** Fixture override. true = force desk, false = force Mac. Omit to follow device. */
  value?: boolean;
  /** Print / preview pass false — readers return false; html class is left alone. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const [on, setOn] = useState(() => {
    if (value === true || value === false) return value;
    return readIpadDeskNow();
  });

  useLayoutEffect(() => {
    if (!enabled) return;

    const apply = () => {
      const match = value === true || value === false ? value : readIpadDeskNow();
      writeIpadDeskDocumentClass(match);
      setOn(match);
    };

    apply();
    if (value === true || value === false) return;

    const mq = window.matchMedia(IPAD_DESK_MQ);
    const portraitMq = window.matchMedia("(orientation: portrait)");
    mq.addEventListener?.("change", apply);
    portraitMq.addEventListener?.("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      portraitMq.removeEventListener?.("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, [enabled, value]);

  const resolved = enabled && (value === true || (value !== false && on));
  return <IpadDeskContext.Provider value={resolved}>{children}</IpadDeskContext.Provider>;
}

/**
 * Reader. First commit follows html.sb-ipad-desk (boot script).
 * Print / preview must pass enabled=false. Does not write the document class.
 */
export function useIpadDesk(enabled = true): boolean {
  const ctx = useContext(IpadDeskContext);
  const [fallback] = useState(() => {
    if (typeof document === "undefined") return false;
    return readIpadDeskNow();
  });

  if (!enabled) return false;
  if (ctx !== null) return ctx;
  return fallback;
}

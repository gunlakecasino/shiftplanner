/**
 * Quiet route hold — keep the outgoing SheetBuilder paint on screen until
 * the next view marks itself ready. No spinner, no empty remount flash.
 */

export const SB_ROUTE_HOLD_ATTR = "data-sb-route-hold";
export const SB_ROUTE_ROOT_SEL = "[data-sb-route-root]";
export const SB_ROUTE_READY_SEL = "[data-sb-route-ready]";

const HOLD_FADE_MS = 120;
const HOLD_CAP_MS = 280;

export function isSheetBuilderInternalHref(href: string, origin = ""): boolean {
  try {
    const base = origin || (typeof location !== "undefined" ? location.origin : "http://local");
    const url = new URL(href, base);
    if (origin && url.origin !== origin) return false;
    if (typeof location !== "undefined" && url.origin !== location.origin) return false;
    return (
      url.pathname.startsWith("/sheetbuilder") || url.pathname.startsWith("/shiftbuilder")
    );
  } catch {
    return false;
  }
}

export function isSameSheetBuilderLocation(href: string): boolean {
  if (typeof location === "undefined") return false;
  try {
    const url = new URL(href, location.origin);
    return url.pathname === location.pathname && url.search === location.search;
  } catch {
    return false;
  }
}

/** Tab/query changes on the same surface stay in place — do not hold. */
export function isSameSheetBuilderPathname(href: string): boolean {
  if (typeof location === "undefined") return false;
  try {
    const url = new URL(href, location.origin);
    return url.pathname === location.pathname;
  } catch {
    return false;
  }
}

export function captureSheetBuilderRouteHold(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`[${SB_ROUTE_HOLD_ATTR}]`)) return;

  const root =
    document.querySelector<HTMLElement>(SB_ROUTE_ROOT_SEL) ||
    document.querySelector<HTMLElement>(".sb-builder-shell") ||
    document.querySelector<HTMLElement>(".sb-settings-shell") ||
    document.querySelector<HTMLElement>(".sb-team-shell");
  if (!root) return;

  const rect = root.getBoundingClientRect();
  const clone = root.cloneNode(true) as HTMLElement;
  clone.setAttribute(SB_ROUTE_HOLD_ATTR, "1");
  clone.removeAttribute("data-sb-route-ready");
  clone.setAttribute("aria-hidden", "true");
  clone.style.position = "fixed";
  clone.style.left = `${Math.round(rect.left)}px`;
  clone.style.top = `${Math.round(rect.top)}px`;
  clone.style.width = `${Math.round(rect.width)}px`;
  clone.style.height = `${Math.round(rect.height)}px`;
  clone.style.margin = "0";
  clone.style.zIndex = "420";
  clone.style.pointerEvents = "none";
  clone.style.overflow = "hidden";
  clone.style.opacity = "1";
  document.body.appendChild(clone);
}

export function releaseSheetBuilderRouteHold(immediate = false): void {
  if (typeof document === "undefined") return;
  const hold = document.querySelector<HTMLElement>(`[${SB_ROUTE_HOLD_ATTR}]`);
  if (!hold) return;

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (immediate || reduce) {
    hold.remove();
    return;
  }

  hold.style.transition = `opacity ${HOLD_FADE_MS}ms ease`;
  hold.style.opacity = "0";
  window.setTimeout(() => hold.remove(), HOLD_FADE_MS + 20);
}

export function incomingSheetBuilderRouteReady(): boolean {
  if (typeof document === "undefined") return true;
  const roots = document.querySelectorAll<HTMLElement>(SB_ROUTE_ROOT_SEL);
  for (const root of roots) {
    if (root.hasAttribute(SB_ROUTE_HOLD_ATTR)) continue;
    if (root.querySelector(SB_ROUTE_READY_SEL) || root.hasAttribute("data-sb-route-ready")) {
      return true;
    }
  }
  return false;
}

/** Release the hold once the incoming view is ready, or after a short cap. */
export function scheduleSheetBuilderRouteHoldRelease(): () => void {
  if (typeof window === "undefined") return () => {};
  const started = Date.now();
  let raf = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    if (incomingSheetBuilderRouteReady() || Date.now() - started >= HOLD_CAP_MS) {
      releaseSheetBuilderRouteHold();
      return;
    }
    raf = window.requestAnimationFrame(tick);
  };

  raf = window.requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf);
  };
}

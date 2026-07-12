import type { Viewport } from "next";

/**
 * Full-bleed PWA on iPad Pro — respect Face ID bar + home indicator.
 * Keep zoom available for a11y (no maximumScale:1 lock). Focus-zoom is blocked
 * separately via 16px minimum on coarse-pointer inputs in globals.css.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Prefer interactive-widget=resizes-content so keyboard doesn't cover fixed pads.
  // (Supported in Chromium; ignored harmlessly elsewhere.)
  interactiveWidget: "resizes-content",
} as Viewport;
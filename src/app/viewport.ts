import type { Viewport } from "next";

/** Full-bleed PWA on iPad Pro — respect Face ID bar + home indicator. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
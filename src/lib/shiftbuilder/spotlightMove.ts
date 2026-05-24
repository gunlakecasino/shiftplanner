import type React from "react";

// Spotlight cursor tracker — attached to every .assignment-card via
// onPointerMove. Updates --mouse-x/--mouse-y CSS variables directly on the
// DOM node (no React re-render) so the spotlight radial gradient defined in
// .assignment-card::before follows the cursor smoothly. The card's accent
// color comes from a separate inline style (--card-accent) so the glow
// inherits whatever the zone/RR/AUX color is.
export const handleSpotlightMove = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - r.top}px`);
};

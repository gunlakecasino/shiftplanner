"use client";

import NightwatchClient from "./NightwatchClient";

// Nightwatch is a heavy interactive canvas surface (freeform notes, stamps, timelines).
// Marked "use client" to avoid prerender errors under cacheComponents (PPR) in Phase 0.
// The primary perf target (ShiftBuilder) continues to use the dynamic ssr:false pattern.

export default function NightwatchPage() {
  return <NightwatchClient />;
}

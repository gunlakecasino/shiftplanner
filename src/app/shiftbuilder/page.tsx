"use client";

/**
 * Shift Builder route — thin shell.
 *
 * The actual editor (ShiftBuilderClient.tsx) is loaded via next/dynamic with
 * ssr: false. This makes the page client-only and eliminates the entire class
 * of hydration mismatches caused by:
 *   • Viewport measurements (fitScale, stageHostRef.clientWidth/Height)
 *   • Date.now() / new Date() (todayDate, weekStart)
 *   • Timezone-sensitive formatting
 *   • dnd-kit's SSR-unfriendly internals
 *
 * The trade-off is a brief "Loading…" flash on first paint. For an internal
 * ops editor with no SEO value, this is the right call.
 */

import dynamic from "next/dynamic";

const ShiftBuilderClient = dynamic(
  () => import("./ShiftBuilderClient"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F8F8F9",
          color: "#8E8E93",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontSize: 14,
        }}
      >
        Loading Shift Builder…
      </div>
    ),
  }
);

export default function ShiftBuilderPage() {
  return <ShiftBuilderClient />;
}

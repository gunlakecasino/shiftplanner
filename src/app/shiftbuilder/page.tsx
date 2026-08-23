// v1.1 — iPad UI/UX world-class release
// PRODUCTION — ShiftBuilder v1.1 floor release
// UI frozen. Hardening only: security headers, structured logging, audit API, route aliases, UX transitions.
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
 * First visit still waits on the dynamic chunk; returning to the canvas
 * must not flash a skeleton — route hold + Zustand resume keep paint.
 */

import dynamic from "next/dynamic";
import PwaRegister from "./components/PwaRegister";
import ShiftBuilderHelpButton from "./components/ShiftBuilderHelpButton";
import ShiftBuilderAuthenticatedShell from "./components/ShiftBuilderAuthenticatedShell";
import DaySwitchTransitionBridge from "./components/DaySwitchTransitionBridge";
const ShiftBuilderClient = dynamic(() => import("./ShiftBuilderClient"), {
  ssr: false,
  // Returning to the canvas must not flash a skeleton over the route hold.
  loading: () => null,
});

export default function ShiftBuilderPage() {
  return (
    <>
      <PwaRegister />
      <DaySwitchTransitionBridge />
      <ShiftBuilderAuthenticatedShell>
        <ShiftBuilderClient />
      </ShiftBuilderAuthenticatedShell>
      <ShiftBuilderHelpButton />
    </>
  );
}

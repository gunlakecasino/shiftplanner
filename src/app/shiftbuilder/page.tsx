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
 * The trade-off is a brief "Loading…" flash on first paint. For an internal
 * ops editor with no SEO value, this is the right call.
 */

import dynamic from "next/dynamic";
import PwaRegister from "./components/PwaRegister";
import ShiftBuilderHelpButton from "./components/ShiftBuilderHelpButton";
import ShiftBuilderAuthenticatedShell from "./components/ShiftBuilderAuthenticatedShell";
import DaySwitchTransitionBridge from "./components/DaySwitchTransitionBridge";
import { BuilderArtboardSkeletonPreview } from "./components/builderPrimitives";

const ShiftBuilderClient = dynamic(() => import("./ShiftBuilderClient"), {
  ssr: false,
  loading: () => (
    <div className="sb-content-enter p-6" aria-busy="true" aria-label="Loading shift builder">
      <BuilderArtboardSkeletonPreview />
    </div>
  ),
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

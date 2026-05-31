/**
 * Velvet Performance Telemetry — Phase 0 Foundation
 *
 * Uses the official web-vitals library (tiny, battle-tested).
 * In Phase 0 we only log + expose a hook so the rest of the app can opt-in.
 *
 * Phase 1+ will:
 *   - Write to Supabase `perf_events` table (add migration when ready)
 *   - Surface a tiny "Perf" pill in Sudo
 *   - Feed Lighthouse CI + Playwright traces
 *
 * Usage:
 *   import { reportWebVitals } from "@/lib/perf";
 *   reportWebVitals(); // call once in a root client component or layout effect
 */
import { onCLS, onFID, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";

export type VelvetMetric = Metric & {
  route?: string;
  nightId?: string | null;
};

let reported = false;

/**
 * Starts reporting Core Web Vitals + INP (the 2024–2026 king metric).
 * Safe to call multiple times — guards itself.
 */
export function reportWebVitals(onReport?: (metric: VelvetMetric) => void) {
  if (reported || typeof window === "undefined") return;
  reported = true;

  const report = (metric: Metric) => {
    const enhanced: VelvetMetric = {
      ...metric,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
    };

    // Phase 0: Always log (helps during Railway/Vercel deploys)
    console.log(`[Velvet Vitals] ${metric.name}`, {
      value: Math.round(metric.value),
      rating: metric.rating,
      route: enhanced.route,
    });

    // Future: write to Supabase here (non-blocking, with batching)
    // if (onReport) onReport(enhanced);

    // For now, also expose on window for easy console debugging from the floor
    (window as any).__velvetVitals = (window as any).__velvetVitals || [];
    (window as any).__velvetVitals.push(enhanced);
  };

  // Core Web Vitals + INP (Interaction to Next Paint — the one that matters most for ShiftBuilder)
  onCLS(report);
  onFID(report); // fallback for older browsers
  onFCP(report);
  onINP(report); // THE metric for 2026 interactive apps
  onLCP(report);
  onTTFB(report);
}

/**
 * Optional: Call this from ShiftBuilderClient once we have a real nightId
 * so metrics are contextualized.
 */
export function setPerfContext(nightId: string | null) {
  (window as any).__velvetNightId = nightId;
}

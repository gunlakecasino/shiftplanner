"use client";

import React, { useEffect } from "react";
import { warmSupabaseConnection } from "@/lib/supabase";

/** Unified skeleton sizes for assignment card name rows. */
export type SkeletonSize = "sm" | "md" | "lg" | "xl";

/** Pastel accent cycle — matches zone / RR / aux loading card top stripes. */
export const BUILDER_LOADING_ACCENTS = ["#D4C48A", "#E8B4B4", "#A8C4E8"] as const;

export function AssignmentSkeleton({
  size = "lg",
  className = "",
}: {
  size?: SkeletonSize;
  className?: string;
}) {
  return (
    <div
      className={`sb-skeleton sb-skeleton--${size} sb-skeleton--ghost w-3/4 ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

/** Single artboard card placeholder — washed-out shell with pastel top stripe + ghost lines. */
export function BuilderSkeletonCard({
  index = 0,
  className = "",
  minHeight,
}: {
  index?: number;
  className?: string;
  minHeight?: number | string;
}) {
  const accent = BUILDER_LOADING_ACCENTS[index % BUILDER_LOADING_ACCENTS.length];
  return (
    <div
      className={`sb-loading-card relative overflow-hidden rounded-xl p-3 flex flex-col gap-2 ${className}`.trim()}
      style={minHeight != null ? { minHeight } : undefined}
      aria-hidden="true"
    >
      <div className="sb-loading-card-accent" style={{ background: accent }} />
      <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-12 mt-0.5" />
      <div className="sb-skeleton sb-skeleton--lg sb-skeleton--ghost w-[78%]" />
      <div className="sb-skeleton sb-skeleton--md sb-skeleton--ghost w-[52%]" />
    </div>
  );
}

function BuilderSectionSkeleton({ labelWidth = "4.5rem" }: { labelWidth?: string }) {
  return (
    <div className="sb-section-skeleton flex items-center gap-2 mb-1.5" aria-hidden="true">
      <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost" style={{ width: labelWidth }} />
      <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost flex-1 opacity-60" />
      <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-14 opacity-50" />
    </div>
  );
}

/** Golden-layout skeleton grid for live builder cold load (builder only — never print). */
export function BuilderBoardSkeletonGrid({
  auxCount = 6,
  className = "",
}: {
  auxCount?: number;
  className?: string;
}) {
  return (
    <div
      className={`sb-board-skeleton no-print flex flex-col flex-1 min-h-0 gap-2 ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading deployment board"
    >
      <section className="mb-0.5">
        <BuilderSectionSkeleton labelWidth="3rem" />
        <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "minmax(0, 1fr)" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <BuilderSkeletonCard key={`z-${i}`} index={i} className="h-full min-h-[84px]" />
          ))}
        </div>
      </section>

      <section className="mb-0.5">
        <BuilderSectionSkeleton labelWidth="5.5rem" />
        <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "minmax(0, 1fr)" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <BuilderSkeletonCard key={`rr-${i}`} index={i + 1} className="h-full min-h-[84px]" />
          ))}
        </div>
      </section>

      <section>
        <BuilderSectionSkeleton labelWidth="4.75rem" />
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${Math.max(auxCount, 1)}, minmax(0, 1fr))`,
            gridAutoRows: "minmax(0, 1fr)",
          }}
        >
          {Array.from({ length: auxCount }).map((_, i) => (
            <BuilderSkeletonCard key={`aux-${i}`} index={i + 2} className="h-full min-h-[84px]" />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Breaks view cold-load skeleton — three wave columns + overlap band. */
export function BuilderBreaksSkeletonGrid({ className = "" }: { className?: string }) {
  return (
    <div
      className={`sb-board-skeleton no-print flex flex-col flex-1 min-h-0 ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading break sheet"
    >
      <div className="grid grid-cols-3 gap-1 mb-2">
        {[0, 1, 2].map((wave) => (
          <div key={wave} className="sb-loading-card rounded-[3px] p-3 space-y-2 min-h-[120px]">
            <div
              className="sb-loading-card-accent"
              style={{ background: BUILDER_LOADING_ACCENTS[wave % 3] }}
            />
            <div className="sb-skeleton sb-skeleton--xl sb-skeleton--ghost w-8" />
            <div className="sb-skeleton sb-skeleton--md sb-skeleton--ghost w-2/3" />
            <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-full" />
            <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-4/5" />
          </div>
        ))}
      </div>
      <BuilderSectionSkeleton labelWidth="4.5rem" />
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <BuilderSkeletonCard key={`ol-${i}`} index={i} className="min-h-[56px]" />
        ))}
      </div>
    </div>
  );
}

/** Caption under the artboard during builder cold load. */
export function BuilderArtboardLoadingCaption({
  label = "LOADING OPS SESSION",
  sublabel = "Preparing computer context",
}: {
  label?: string;
  sublabel?: string;
}) {
  return (
    <div
      className="sb-artboard-loading-caption no-print absolute left-0 right-0 flex flex-col items-center pointer-events-none"
      style={{ bottom: -36 }}
      aria-live="polite"
    >
      <p className="sb-loading-caption text-center font-mono tracking-[0.16em]">
        {label}
        <span className="sb-loading-dots" aria-hidden="true" />
      </p>
      {sublabel ? (
        <p className="sb-loading-caption text-center mt-0.5 tracking-[0.12em] opacity-60 text-[9px]">
          {sublabel}
        </p>
      ) : null}
    </div>
  );
}

/** Succinct loading copy with animated ellipsis — one voice across pads/cards. */
export function BuilderLoadingLine({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`sb-loading-line ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      {children}
      <span className="sb-loading-dots" aria-hidden="true" />
    </p>
  );
}

/** Subtle artboard veil during background sync only (not cold load). */
export function BuilderCanvasVeil({ active }: { active: boolean }) {
  return (
    <div
      className={`sb-canvas-veil no-print ${active ? "sb-canvas-veil--active" : ""}`}
      aria-hidden={!active}
      aria-busy={active}
    />
  );
}

/** Compact artboard preview for route / auth / dynamic-import shells. */
export function BuilderArtboardSkeletonPreview({
  cardCount = 12,
  showHeader = true,
}: {
  cardCount?: number;
  showHeader?: boolean;
}) {
  return (
    <div
      className="sb-loading-artboard mx-auto rounded-2xl overflow-hidden"
      style={{ width: "100%", maxWidth: 1056, aspectRatio: "1056 / 816" }}
    >
      {showHeader ? (
        <div className="h-10 flex items-center px-4 gap-3">
          <div className="sb-skeleton sb-skeleton--md sb-skeleton--ghost w-40" />
          <div className="flex-1" />
          <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-16" />
        </div>
      ) : null}

      <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: cardCount }).map((_, i) => (
          <BuilderSkeletonCard key={i} index={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}

/** Shared full-screen loading shell (route, auth gate, dynamic import). */
export function BuilderLoadingShell({
  label = "LOADING OPS SESSION",
  sublabel = "Preparing computer context",
}: {
  label?: string;
  sublabel?: string;
}) {
  useEffect(() => {
    void warmSupabaseConnection();
  }, []);

  return (
    <div className="sb-loading-shell min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-[1080px] sb-content-enter">
        <div className="sb-loading-chrome h-14 mb-4 rounded-xl flex items-center px-6 gap-4">
          <div className="sb-skeleton sb-skeleton--md sb-skeleton--ghost w-24" />
          <div className="flex-1" />
          <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-8 rounded-full" />
          <div className="sb-skeleton sb-skeleton--sm sb-skeleton--ghost w-8 rounded-full" />
        </div>

        <BuilderArtboardSkeletonPreview />

        <p className="sb-loading-caption text-center mt-4 font-mono tracking-[0.16em]">
          {label}
          <span className="sb-loading-dots" aria-hidden="true" />
          {sublabel ? (
            <span className="block mt-1 tracking-[0.12em] opacity-60 text-[9px]">
              {sublabel}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** Pencil hover ring — replaces generic Tailwind animate-pulse on cards. */
export function penHoverClass(active: boolean): string {
  return active ? "sb-pen-ring ring-2 ring-[#FFD60A] ring-offset-1" : "";
}

/** Drawer expand/collapse — shared by OpsStatusBar + CanvasEngineCluster. */
export const SB_DRAWER_TRANSITION =
  "max-width var(--sb-dur-mid) var(--sb-spring-gentle), opacity var(--sb-dur-fast) var(--sb-spring-gentle), padding var(--sb-dur-mid) var(--sb-spring-gentle), gap var(--sb-dur-fast) ease, border-color var(--sb-dur-fast) ease";

export type StatusDotState = "live" | "syncing" | "offline" | "connecting";

/** Unified realtime / connection indicator. */
export function BuilderStatusDot({ state }: { state: StatusDotState }) {
  return <span className={`sb-status-dot sb-status-dot--${state}`} aria-hidden="true" />;
}

/** Inline button/action busy — ellipsis only, no spinners. */
export function BuilderBusyLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`.trim()}
      aria-busy="true"
      aria-live="polite"
    >
      {children}
      <span className="sb-loading-dots" aria-hidden="true" />
    </span>
  );
}

/** Thin indeterminate strip — background day sync without blocking the canvas. */
export function BuilderSyncStrip({ active }: { active: boolean }) {
  return (
    <div
      className={`sb-sync-strip no-print ${active ? "sb-sync-strip--active" : ""}`}
      aria-hidden={!active}
      aria-busy={active}
      role="progressbar"
    />
  );
}

/** Sudo tab / admin surface loading — one voice, no spinners. */
export function SudoTabLoading({
  children = "Loading",
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BuilderLoadingLine className={`py-4 text-[12px] ${className}`.trim()}>
      {children}
    </BuilderLoadingLine>
  );
}

/** Unified "drop to assign" hint for empty/unassigned card states (builder-only, no-print). */
export function UnassignedDropHint({ showDigitalAssists = true, className = "" }: { showDigitalAssists?: boolean; className?: string }) {
  if (!showDigitalAssists) return null;
  return (
    <span className={`sb-unassigned-hint no-print flex items-center gap-1 text-[9.5px] text-[#9CA3AF] opacity-50 hover:opacity-65 ${className}`}>
      <span className="ms" style={{ fontSize: 10, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20' }}>south</span>
      <span>Drop to assign</span>
    </span>
  );
}
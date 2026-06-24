"use client";

import React from "react";
import {
  BREAK_GROUP_OVERLAPS,
  breakGroupLabel,
  cardAccentInk,
} from "@/lib/shiftbuilder/constants";
import { CardAccentStripe } from "./assignmentCardChrome";

export type BreakWaveAssignment = {
  slotKey: string;
  tmName?: string;
  type: "zone" | "rr" | "aux" | "overlap";
  notPlaced?: boolean;
};

type BreakCategory = "zone" | "rr" | "aux" | "overlap";

const CATEGORY_LABELS: Record<BreakCategory, string> = {
  zone: "ZONES",
  rr: "RESTROOMS",
  aux: "AUXILIARY",
  overlap: "OVERLAPS",
};

function waveAccentColor(wave: number): string {
  if (wave === 1) return "#1a2332";
  if (wave === 2) return "#5a6b7d";
  if (wave === BREAK_GROUP_OVERLAPS) return "#B45309";
  return "#c8d3dc";
}

function BreakWavePersonRow({
  tmName,
  chip,
  accent,
  sideLetter,
}: {
  tmName: string;
  chip: string;
  accent: string;
  sideLetter?: string;
}) {
  const ink = cardAccentInk(accent);

  return (
    <div
      className="sb-break-wave-person sb-refined-card overflow-hidden rounded-xl"
      style={{ ["--card-accent" as string]: accent }}
    >
      <CardAccentStripe color={accent} />
      <div className="px-2 py-1.5 min-w-0">
        <div
          className="font-bold leading-tight tracking-[-0.02em] text-gray-900 dark:text-[#F2F2F4] truncate"
          style={{ fontSize: 13 }}
        >
          {tmName || " "}
        </div>
        <div className="mt-1 flex items-center gap-1 min-w-0">
          <span
            className="inline-flex items-center rounded-md border px-1.5 py-px text-[8px] font-extrabold uppercase tracking-[0.35px] whitespace-nowrap shrink-0"
            style={{
              borderColor: accent,
              color: ink,
              fontFamily: "var(--font-atkinson)",
              background: "color-mix(in srgb, var(--ios-background-secondary) 88%, transparent)",
            }}
          >
            {chip}
          </span>
          {sideLetter ? (
            <span
              className="text-[8px] font-bold uppercase tracking-[0.4px] text-[#9CA3AF] shrink-0"
              style={{ fontFamily: "var(--font-atkinson)" }}
            >
              {sideLetter}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoldenBreakWaveColumn({
  wave,
  assignments,
  accentFor,
  chipLabel,
  isOlWave,
}: {
  wave: number;
  assignments: BreakWaveAssignment[];
  accentFor: (a: BreakWaveAssignment) => string;
  chipLabel: (a: BreakWaveAssignment) => string;
  isOlWave: boolean;
}) {
  const waveColor = waveAccentColor(wave);
  const count = assignments.length;

  return (
    <div
      className="border border-[#E5E5E7] dark:border-[#3A3A3C] rounded-[3px] bg-white dark:bg-[#1C1C1E] overflow-hidden flex flex-col h-full min-h-0"
      style={{ borderTop: `3px solid ${waveColor}` }}
    >
      <div className="px-3 pt-2 pb-1 flex items-end gap-2.5 border-b border-[#F2F2F4] dark:border-[#2C2C2E]">
        <div
          className="font-black tabular-nums leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
          style={{
            fontSize: isOlWave ? 28 : 42,
            letterSpacing: isOlWave ? "-1px" : "-2px",
            fontFamily: "var(--font-atkinson)",
          }}
        >
          {breakGroupLabel(wave)}
        </div>
        <div className="-mb-0.5">
          <div
            className="font-extrabold tracking-[1px] uppercase leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
            style={{ fontSize: 13, fontFamily: "var(--font-atkinson)" }}
          >
            {isOlWave ? "Overlaps" : `Break ${wave}`}
          </div>
          <div className="text-[10px] text-[#6B7280] dark:text-[#8E8E93] mt-0.5">{count} people</div>
        </div>
      </div>

      <div className="px-2 pb-1 pt-1 space-y-1 text-[9px] flex-1 min-h-0 overflow-y-auto">
        {(["zone", "rr", "aux", "overlap"] as const).map((cat) => {
          const items = assignments.filter((a) => a.type === cat);
          if (!items.length) return null;

          return (
            <div key={cat}>
              <div className="flex items-center gap-1 mb-1">
                <span
                  className="text-[#6B7280] dark:text-[#8E8E93] font-bold tracking-[1.2px] uppercase text-[7.5px]"
                  style={{ fontFamily: "var(--font-atkinson)" }}
                >
                  {CATEGORY_LABELS[cat]}
                </span>
                <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#3A3A3C]" />
              </div>
              <div className="space-y-1">
                {items.map((a, idx) => {
                  const accent = accentFor(a);
                  const showChip = !a.notPlaced;
                  return (
                    <div key={`${a.slotKey}-${idx}`} className="flex items-center gap-1.5">
                      <div className="flex-1 border-b border-dashed border-[#C8C8CC] dark:border-[#48484A] pb-px min-w-0">
                        <div
                          className="sb-golden-assignee-name font-bold text-[#111] dark:text-[#F2F2F4] truncate text-[9px] leading-tight"
                          style={{ fontFamily: "var(--font-atkinson)", fontWeight: 700 }}
                        >
                          {a.tmName || " "}
                        </div>
                      </div>
                      {showChip ? (
                        <div
                          className="text-[8.5px] font-extrabold tracking-[0.4px] px-1.5 py-px rounded-[2px] whitespace-nowrap border bg-white dark:bg-[#2C2C2E]"
                          style={{ borderColor: accent, color: accent, fontFamily: "var(--font-atkinson)" }}
                        >
                          {chipLabel(a)}
                        </div>
                      ) : (
                        <div className="w-3" />
                      )}
                      <span className="text-[7.5px] text-[#9CA3AF] uppercase tracking-[0.5px] w-3 text-center">
                        {showChip && a.type === "rr"
                          ? (a.slotKey.startsWith("M") ? "M" : "W")
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BuilderBreakWaveColumn({
  wave,
  assignments,
  accentFor,
  chipLabel,
  isOlWave,
}: {
  wave: number;
  assignments: BreakWaveAssignment[];
  accentFor: (a: BreakWaveAssignment) => string;
  chipLabel: (a: BreakWaveAssignment) => string;
  isOlWave: boolean;
}) {
  const waveColor = waveAccentColor(wave);
  const ink = cardAccentInk(waveColor);
  const count = assignments.length;

  return (
    <div
      className={`sb-break-wave-col-card sb-refined-card sb-breaks-wave-col flex flex-col overflow-hidden rounded-2xl min-h-0 max-h-full ${
        isOlWave ? "sb-breaks-wave-col--ol" : ""
      }`}
      style={{ ["--card-accent" as string]: waveColor }}
    >
      <CardAccentStripe color={waveColor} />

      <div className="px-2.5 pt-2 pb-1.5 flex items-end gap-2 border-b border-black/[0.06] dark:border-white/[0.08] shrink-0">
        <div
          className="font-black tabular-nums leading-none shrink-0"
          style={{
            fontSize: isOlWave ? 26 : 36,
            letterSpacing: isOlWave ? "-0.8px" : "-1.5px",
            fontFamily: "var(--font-atkinson)",
            color: ink,
          }}
        >
          {breakGroupLabel(wave)}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-bold tracking-[0.07em] uppercase leading-none truncate"
            style={{ fontSize: 10, fontFamily: "var(--font-atkinson)", color: ink }}
          >
            {isOlWave ? "Overlaps" : `Break ${wave}`}
          </div>
          <div className="mt-1 flex items-center gap-1">
            <span className="sb-section-count--filled text-[9px] font-bold tabular-nums px-1.5 py-px rounded-md">
              {count}
            </span>
            <span className="text-[9px] text-[#6B7280] dark:text-[#8E8E93]">people</span>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1.5 space-y-2">
        {(["zone", "rr", "aux", "overlap"] as const).map((cat) => {
          const items = assignments.filter((a) => a.type === cat);
          if (!items.length) return null;

          return (
            <div key={cat}>
              <div className="sheet-section-header mb-1">
                <span className="label">{CATEGORY_LABELS[cat]}</span>
                <div className="divider" />
              </div>
              <div className="space-y-1.5">
                {items.map((a, idx) => {
                  if (a.notPlaced) {
                    return (
                      <div
                        key={`${a.slotKey}-${idx}`}
                        className="sb-break-wave-person sb-refined-card overflow-hidden rounded-xl px-2 py-1.5 opacity-60"
                      >
                        <div className="font-semibold text-[12px] text-[#9CA3AF] truncate">
                          {a.tmName || " "}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <BreakWavePersonRow
                      key={`${a.slotKey}-${idx}`}
                      tmName={a.tmName || " "}
                      chip={chipLabel(a)}
                      accent={accentFor(a)}
                      sideLetter={
                        a.type === "rr"
                          ? (a.slotKey.startsWith("M") ? "M" : "W")
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface BreakWaveColumnProps {
  wave: number;
  assignments: BreakWaveAssignment[];
  accentFor: (a: BreakWaveAssignment) => string;
  chipLabel: (a: BreakWaveAssignment) => string;
  variant?: "builder" | "golden";
}

const BreakWaveColumn: React.FC<BreakWaveColumnProps> = React.memo(({
  wave,
  assignments,
  accentFor,
  chipLabel,
  variant = "builder",
}) => {
  const isOlWave = wave === BREAK_GROUP_OVERLAPS;

  if (variant === "golden") {
    return (
      <GoldenBreakWaveColumn
        wave={wave}
        assignments={assignments}
        accentFor={accentFor}
        chipLabel={chipLabel}
        isOlWave={isOlWave}
      />
    );
  }

  return (
    <BuilderBreakWaveColumn
      wave={wave}
      assignments={assignments}
      accentFor={accentFor}
      chipLabel={chipLabel}
      isOlWave={isOlWave}
    />
  );
});

BreakWaveColumn.displayName = "BreakWaveColumn";

export default BreakWaveColumn;
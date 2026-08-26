"use client";

import React from "react";
import {
  CARD_VECTOR_IDS,
  CARD_VECTOR_META,
  type CardVector,
} from "@/lib/shiftbuilder/cardVectors";

export type CardVectorMarkSize = "desk" | "planner" | "pad";

const SIZE: Record<CardVectorMarkSize, { className: string; ariaHidden?: boolean }> = {
  desk: { className: "sb-card-vector sb-card-vector--desk" },
  planner: { className: "sb-card-vector sb-card-vector--planner", ariaHidden: true },
  pad: { className: "sb-card-vector sb-card-vector--pad" },
};

function SweepInk({
  codes,
  ink,
}: {
  codes: string;
  ink: string;
}) {
  return (
    <svg
      viewBox="0 0 158 28"
      className="sb-card-vector-svg"
      aria-hidden="true"
      focusable="false"
    >
      <text
        x="2"
        y="20"
        fill={ink}
        fontFamily="BrianKillianInk-Regular, 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive"
        fontSize="17"
        fontStyle="italic"
        letterSpacing="-0.02em"
      >
        Sweep
      </text>
      <text
        x="68"
        y="20"
        fill={ink}
        fontFamily="BrianKillianInk-Regular, 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive"
        fontSize="15"
        fontStyle="italic"
        letterSpacing="0.01em"
      >
        {codes}
      </text>
    </svg>
  );
}

function LaundryInk({ ink }: { ink: string }) {
  return (
    <svg
      viewBox="0 0 92 28"
      className="sb-card-vector-svg"
      aria-hidden="true"
      focusable="false"
    >
      <text
        x="2"
        y="20"
        fill={ink}
        fontFamily="BrianKillianInk-Regular, 'Segoe Script', 'Bradley Hand', 'Snell Roundhand', cursive"
        fontSize="18"
        fontStyle="italic"
        letterSpacing="-0.01em"
      >
        Laundry
      </text>
    </svg>
  );
}

export function CardVectorMark({
  vector,
  size = "desk",
}: {
  vector: CardVector | null | undefined;
  size?: CardVectorMarkSize;
}) {
  if (!vector) return null;
  const meta = CARD_VECTOR_META[vector];
  const box = SIZE[size];

  return (
    <span
      className={`${box.className} ${
        vector === "laundry" ? "sb-card-vector--laundry" : "sb-card-vector--sweep"
      }`}
      style={{ color: meta.ink }}
      title={meta.label}
      aria-label={box.ariaHidden ? undefined : meta.ariaLabel}
      aria-hidden={box.ariaHidden ? true : undefined}
    >
      {vector === "laundry" ? (
        <LaundryInk ink={meta.ink} />
      ) : (
        <SweepInk
          ink={meta.ink}
          codes={vector === "sweep_9_10_sr" ? "9 | 10 | SR" : "5 | 8 | HL"}
        />
      )}
    </span>
  );
}

export function CardVectorPicker({
  value,
  disabled,
  onChange,
}: {
  value: CardVector | null | undefined;
  disabled?: boolean;
  onChange: (next: CardVector | null) => void;
}) {
  return (
    <div className="sb-card-vector-picker">
      <p className="sb-card-vector-picker-title">Vector</p>
      <div className="sb-card-vector-picker-row">
        {CARD_VECTOR_IDS.map((id) => {
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              title={CARD_VECTOR_META[id].label}
              onClick={(event) => {
                event.stopPropagation();
                onChange(selected ? null : id);
              }}
              className={`sb-card-vector-picker-btn${selected ? " is-selected" : ""}`}
            >
              <CardVectorMark vector={id} size="pad" />
            </button>
          );
        })}
      </div>
      {value ? (
        <button
          type="button"
          disabled={disabled}
          className="sb-card-vector-picker-clear"
          onClick={(event) => {
            event.stopPropagation();
            onChange(null);
          }}
        >
          Clear vector
        </button>
      ) : null}
    </div>
  );
}

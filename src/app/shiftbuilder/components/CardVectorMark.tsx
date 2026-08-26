"use client";

import React from "react";
import {
  CARD_VECTOR_IDS,
  CARD_VECTOR_META,
  CARD_VECTOR_SRC,
  CARD_VECTOR_VIEWBOX,
  type CardVector,
} from "@/lib/shiftbuilder/cardVectors";

export type CardVectorMarkSize = "desk" | "planner" | "pad" | "golden";

const SIZE: Record<CardVectorMarkSize, { className: string; ariaHidden?: boolean }> = {
  desk: { className: "sb-card-vector sb-card-vector--desk" },
  planner: { className: "sb-card-vector sb-card-vector--planner", ariaHidden: true },
  pad: { className: "sb-card-vector sb-card-vector--pad" },
  golden: { className: "sb-card-vector sb-card-vector--golden", ariaHidden: true },
};

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
  const view = CARD_VECTOR_VIEWBOX[vector];

  return (
    <span
      className={`${box.className} ${
        vector === "laundry" ? "sb-card-vector--laundry" : "sb-card-vector--sweep"
      }`}
      title={meta.label}
      aria-label={box.ariaHidden ? undefined : meta.ariaLabel}
      aria-hidden={box.ariaHidden ? true : undefined}
    >
      <img
        src={CARD_VECTOR_SRC[vector]}
        alt=""
        width={view.width}
        height={view.height}
        className="sb-card-vector-svg"
        draggable={false}
      />
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

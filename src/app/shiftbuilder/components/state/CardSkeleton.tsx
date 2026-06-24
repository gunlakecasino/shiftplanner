"use client";

import React from "react";
import { BuilderSkeletonCard } from "../builderPrimitives";

export type CardSkeletonProps = {
  /** Stagger accent stripe — cycles pastel top bar colors. */
  index?: number;
  className?: string;
  minHeight?: number | string;
};

/**
 * Single shared assignment-card skeleton — thin wrapper over BuilderSkeletonCard.
 * Drop in anywhere a card shell is loading (board, aux, breaks, dynamic import).
 */
export function CardSkeleton({ index = 0, className = "", minHeight }: CardSkeletonProps) {
  return (
    <BuilderSkeletonCard index={index} className={className} minHeight={minHeight} />
  );
}

/** Minimal grid of CardSkeleton placeholders for a board row or dynamic-import shell. */
export function CardSkeletonRow({
  count = 5,
  className = "",
  minHeight,
}: {
  count?: number;
  className?: string;
  minHeight?: number | string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} index={i} className={className} minHeight={minHeight} />
      ))}
    </>
  );
}
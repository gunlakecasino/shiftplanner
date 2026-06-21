"use client";

import React from "react";
import dynamic from "next/dynamic";
import { rotationHealthOrbPalette } from "./shiftRotationHealth";

const HealthOrb = dynamic(() => import("./HealthOrb"), { ssr: false });

const ORB_SIZE_PX = 77;

export type RotationHealthOrbProps = {
  percent: number | null;
  size?: number;
  title?: string;
  "aria-label"?: string;
};

/** Jewel-like rotation-health orb with slim bezel + hover readout. */
export function RotationHealthOrb({
  percent,
  size = ORB_SIZE_PX,
  title,
  "aria-label": ariaLabel,
}: RotationHealthOrbProps) {
  const [hovered, setHovered] = React.useState(false);
  const display = percent !== null ? `${percent}%` : "—%";
  const fontSize = Math.round(size * 0.19);
  const palette = rotationHealthOrbPalette(percent);

  return (
    <div
      className={`sb-rotation-health-orb shrink-0${hovered ? " is-hovered" : ""}`}
      style={{
        ["--orb-ring" as string]: palette.ring,
        width: size,
        height: size,
      }}
      title={title}
      aria-label={ariaLabel}
      role="img"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="sb-rotation-health-orb__bezel" aria-hidden />
      <div className="sb-rotation-health-orb__canvas">
        <HealthOrb
          primaryColor={palette.primary}
          secondaryColor={palette.secondary}
          tailColor={palette.tail}
          backgroundColor={palette.background}
          pixelSize={size}
          hoverIntensity={0.14}
          forceHoverState={hovered}
        />
        <div className="sb-rotation-health-orb__vignette" aria-hidden />
        <div className="sb-rotation-health-orb__readout" aria-hidden={!hovered}>
          <span className="sb-rotation-health-orb__readout-scrim" />
          <span
            className="sb-rotation-health-orb__readout-value"
            style={{ fontSize }}
          >
            {display}
          </span>
        </div>
      </div>
    </div>
  );
}
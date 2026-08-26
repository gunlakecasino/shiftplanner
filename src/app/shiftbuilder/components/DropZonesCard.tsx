"use client";

import React from "react";
import {
  DROP_ZONE_DISC_VIEWBOX,
  DROP_ZONE_GROUP_IDS,
  DROP_ZONE_PLATE_SRC,
  DROP_ZONE_PLATE_VIEWBOX,
  dropZoneDiscSrc,
  type DropZoneGroup,
  type DropZonesResolution,
} from "@/lib/shiftbuilder/dropZones";

export function DropZonesCard({
  resolution,
  showPicker = false,
  disabled = false,
  onSelectGroup,
}: {
  resolution: DropZonesResolution;
  showPicker?: boolean;
  disabled?: boolean;
  onSelectGroup?: (group: DropZoneGroup) => void;
}) {
  const plate = DROP_ZONE_PLATE_VIEWBOX;
  const disc = DROP_ZONE_DISC_VIEWBOX;

  return (
    <div className="sb-drop-zones-wrap">
      <div
        className="sb-drop-zones-card"
        data-drop-zone-group={resolution.scheduledGroup}
        data-drop-zone-display={resolution.displayGroup}
        aria-label={`DROP ZONES group ${resolution.scheduledGroup}`}
      >
        <img
          src={DROP_ZONE_PLATE_SRC}
          alt=""
          width={plate.width}
          height={plate.height}
          className="sb-drop-zone-svg sb-drop-zones-plate"
          draggable={false}
        />
        {resolution.zones.length > 0 ? (
          <div className="sb-drop-zones-discs" aria-hidden="true">
            {resolution.zones.map((zone) => (
              <img
                key={zone}
                src={dropZoneDiscSrc(zone)}
                alt=""
                width={disc.width}
                height={disc.height}
                className="sb-drop-zone-svg sb-drop-zone-disc"
                draggable={false}
              />
            ))}
          </div>
        ) : null}
      </div>
      {showPicker ? (
        <div className="sb-drop-zones-picker" role="group" aria-label="Drop zone group">
          {DROP_ZONE_GROUP_IDS.map((group) => {
            const selected = resolution.scheduledGroup === group;
            return (
              <button
                key={group}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                className={`sb-drop-zones-picker-btn${selected ? " is-selected" : ""}`}
                onClick={() => onSelectGroup?.(group)}
              >
                {group}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

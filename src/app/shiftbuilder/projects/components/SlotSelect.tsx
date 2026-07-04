"use client";

import * as React from "react";
import {
  SLOT_CATALOG,
  SLOT_CATALOG_SECTIONS,
  slotEntryFromValue,
  slotValue,
} from "@/lib/shiftbuilder/slotCatalog";

export interface SlotSelection {
  slotKey: string | null;
  slotType: string | null;
  rrSide: string | null;
}

/**
 * Grouped location picker for assigning a task to a zone / restroom / aux /
 * overlap slot. Emits the DB-shaped {slotKey, slotType, rrSide} so it lines up
 * with the deployment board. Empty selection clears the slot.
 */
export function SlotSelect({
  slotKey,
  rrSide,
  onChange,
  disabled = false,
  className = "",
  placeholder = "No location",
}: {
  slotKey: string | null;
  rrSide: string | null;
  onChange: (sel: SlotSelection) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const value = slotValue(slotKey, rrSide);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const entry = slotEntryFromValue(e.target.value);
        onChange(
          entry
            ? { slotKey: entry.slotKey, slotType: entry.slotType, rrSide: entry.rrSide || null }
            : { slotKey: null, slotType: null, rrSide: null },
        );
      }}
      className={className}
    >
      <option value="">{placeholder}</option>
      {SLOT_CATALOG_SECTIONS.map((sec) => (
        <optgroup key={sec.id} label={sec.label}>
          {SLOT_CATALOG.filter((s) => s.section === sec.id).map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

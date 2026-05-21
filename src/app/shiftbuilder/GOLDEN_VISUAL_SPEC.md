# ZDS Golden Visual Fidelity Spec

This document captures the exact visual language from `ZDS Golden.pdf` so the digital `/shiftbuilder` can feel like you are directly authoring the printed sheets.

**Primary Target View**: Deployment Sheet (ZONES + RESTROOMS + AUXILIARY + RR)
**Secondary Views** (later): Break Sheet, Overlaps

---

## 1. Overall Sheet Aesthetic

- White "paper" surface with very subtle border and soft drop shadow (feels like real printed paper on a desk).
- Tight but readable density — high information per square inch, but calm.
- Typography: Clean sans, strong weight contrast (bold names, lighter location text).
- Color usage is purposeful — each zone/RR has an assigned accent color used for top bar, labels, and icons.

---

## 2. Per-Zone Definitions (Deployment View)

Each zone has a **fixed identity** used consistently across the Golden:

| Zone | Icon (in Golden) | Accent Color | Typical Location Lines |
|------|------------------|--------------|------------------------|
| Z1   | Star ★           | #E85D04 (orange-red) | Outdoor Smoking Area |
| Z2   | Diamond ◆        | #F59E0B (gold)       | Elevators & Stairwells |
| Z3   | Heart ♥          | #0EA5E9 (cyan)       | Family Restrooms |
| Z4   | Triangle ▲       | #EF4444 (red)        | Support in needed areas |
| Z5   | Square ■         | #22C55E (green)      | High Traffic Areas |
| Z6   | Circle ●         | #3B82F6 (blue)       | Outdoor Smoking Area |
| Z7   | Diamond ◆        | #8B5CF6 (purple)     | Family Restrooms |
| Z8   | Star ★           | #854D0E (brown)      | Social Hall & Lobby |
| Z9   | Triangle ▲       | #DC2626 (deep red)   | Indoor Break Areas |
| Z10  | Circle ●         | #16A34A (forest)     | High Traffic Areas |

**Card Anatomy (left to right, top to bottom):**
1. Colored top bar (5px solid accent color)
2. Left area: Icon (in accent color) + "ZONE N" label (in accent color, bold)
3. Top-right small dark pill/badge (gray #374151 or similar, rounded, 14-16px, contains number or symbol)
4. Bold TM name (or "— Unfilled —")
5. 1–3 lines of location text with small symbols (□, ♦, etc.) in muted gray

---

## 3. Ride Ready (RR) Treatment

- RR uses the same card shell as Zones but with internal split.
- Inside each RR card:
  - Header: "RR N" in accent color
  - Two columns: **MEN'S** (left) and **WOMEN'S** (right)
  - Each column shows TM name + small location line
- Accent colors for RR1–RR5 are distinct (cyan, pink, green, gold, purple in the Golden).

---

## 4. Auxiliary Cards

- Same card shell.
- Label is the position name (e.g. "AUX - ZSR", "AUX - ADMIN").
- Often has a small icon or symbol in the label area.
- Same top-right badge treatment.

---

## 5. Section Headers

- Uppercase, tight letter-spacing, small bold label ("ZONES", "RESTROOMS", "AUXILIARY")
- Thin horizontal divider line
- Right-aligned count: "X / 10 FILLED" (or /5 for Aux) in slightly muted style

---

## 6. Header Block (Top of Sheet)

- Large left decorative mark (big stylized black "J" / calligraphic element with small circle accent — very prominent in Golden)
- Large day number (64–72px, heavy)
- Day name in strong color (Friday = warm red, Saturday = blue, Sunday = purple, etc.)
- Date + "Day X of Y"
- "IN ROTATION" or shift meta
- Right side:
  - GRAVE shift time block
  - Horizontal day pills (F S S M T W T) with current day filled in matching color
  - GROUP colored dots (4–5 small circles)
  - BREAKS / OVERLAPS count pills

---

## 7. Footer

- "GLCR • GRAVE SHIFT DEPLOYMENT"
- Date + "Zone Deployment Sheet"
- Version / context on right

---

## 8. Interaction Notes (Digital Layer on Top of Print Look)

- Cards remain fully interactive (drag target, tap to assign/unassign, lock).
- Drag feedback and hover states should be subtle so they don't fight the print aesthetic.
- Source badges ("M" for manual, "E" for engine) and lock indicators should feel like small stamps on the card, not loud UI.

---

## Current Gaps (as of May 2026)

- No per-zone icons in labels
- No top-right status badges on cards
- Location text is single-line and lacks symbols
- RR cards lack clean internal "MEN'S / WOMEN'S" visual split
- Header is missing the big left mark and precise pill/dot treatment
- Card internal padding and typography not yet matching Golden density

---

**Next Work**: Phase 2 — Card System Overhaul (icons, badges, RR split, richer location text) using this spec as the source of truth.

This spec should be updated whenever we discover new details from the Golden PDF.
# Reports Tab — Implementation Plan
**Date**: 2026-05-23  
**Author**: Claude Sonnet 4.6 (Cowork)  
**Status**: ✅ COMPLETE (Phase 1)

---

## What We're Building

A new **Reports** tab inside SudoWindow. Primary use case: understand zone frequency per TM over the last 30 days to inform smarter assignments. Two views in one tab (togglable):

- **TM-first**: Pick a TM → see a bar breakdown of how often they've been in each zone.
- **Zone-first**: Pick a zone → see a ranked list of TMs who've worked it most.

Phase 2 (separate session): surface "last worked" badges on zone cards in the main ShiftBuilder.

---

## What Already Exists (Reuse)

| Existing asset | What it does | How we use it |
|---|---|---|
| `getRecentZoneHistory(beforeDate, nights)` in `data.ts` | Fetches raw tmId → [{nightDate, slotKey}] for N nights back | Build aggregation on top of it |
| `slotKeyToLabel()` in `slot-keys.ts` | Maps `zone_1` → `"Zone 1"` etc. | Display names in the UI |
| Dark zinc sudo aesthetic | All tabs use same design language | Match exactly — no new design tokens |
| `ZONE_DEFS` slot key list | Ordered list of all zone slot keys | Drive the zone-first view list |

---

## Files to Create / Edit

### New file: `src/app/shiftbuilder/sudo/ReportsTab.tsx`
Self-contained. ~300 lines. Owns its own data fetch + state.

### New function in `src/lib/shiftbuilder/data.ts`
`getZoneFrequencyReport(days: number): Promise<ZoneFrequencyReport>`

Builds on `getRecentZoneHistory`. Returns:
```typescript
interface ZoneFrequencyEntry {
  tmId: string;
  tmName: string;
  zoneCounts: Record<string, number>; // slot_key (db format) → count
  totalShifts: number;                // distinct nights with any assignment
  lastDate: string;                   // most recent night assigned (ISO)
}

interface ZoneFrequencyReport {
  byTm: ZoneFrequencyEntry[];         // all TMs who had ≥1 assignment
  dateRange: { from: string; to: string };
  totalNights: number;                // distinct nights in the window
}
```

The zone-first view is derived client-side from `byTm` — no second query needed.

### Edit: `src/app/shiftbuilder/sudo/SudoWindow.tsx`
- Add `"reports"` to `SudoTab` type
- Add to `TABS` array: `{ id: "reports", label: "Reports", icon: BarChart2, status: "ready" }`
- Import `BarChart2` from lucide-react (already available)
- Import `ReportsTab`
- Add render: `{activeTab === "reports" && <ReportsTab />}`
- Position: between Tasks and Engine Config

---

## ReportsTab Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [TM View] [Zone View]          14d · [30d] · 60d         ↻     │  ← control bar
├──────────────┬──────────────────────────────────────────────────┤
│ TM list      │  Zone frequency for: JESSICA SMITH               │
│              │  12 shifts in window · last seen May 22          │
│ > Jessica  12│                                                   │
│   Gary      9│  Zone 1   ████████░░░░░░░░  5x                   │
│   Peter     7│  Zone 2   ██░░░░░░░░░░░░░░  2x                   │
│   Cookie    6│  Zone 9   ████████████████  8x  ← most frequent  │
│   Sherry    5│  Zone 10  ████░░░░░░░░░░░░  3x                   │
│   ...        │  Admin    ██░░░░░░░░░░░░░░  1x                   │
│              │                                                   │
└──────────────┴──────────────────────────────────────────────────┘
```

Zone-first view swaps: left panel = zone list, right panel = ranked TMs for that zone.

**Bar style**: Pure CSS width percentages (no chart library). Max-count TM/zone gets 100% width, others scaled proportionally. Matches sudo dark aesthetic — zinc bars with color accents matching zone colors from `getZoneColor()`.

---

## Data Layer Details

`getZoneFrequencyReport` steps:
1. Call `getRecentZoneHistory(today, days)` — gets raw tmId → [{nightDate, slotKey}]
2. Filter to only `slot_type = 'zone'` slots — `getRecentZoneHistory` already filters by its own query; I need to add `slot_type` to its SELECT and filter here
3. Aggregate: count per (tmId, slotKey)
4. Fetch display names for all tmIds from `tm_profiles` (small single query)
5. Compute `totalShifts` = distinct nightDates per TM
6. Sort `byTm` by `totalShifts DESC`

> **Note**: `getRecentZoneHistory` currently doesn't return `slot_type`. Two options:
> - Option A: Add `slot_type` to its select and filter caller-side
> - Option B: Write a dedicated `getZoneFrequencyReport` query from scratch (cleaner, no side effects on the engine planner which uses `getRecentZoneHistory`)
>
> **Decision: Option B** — new dedicated function. `getRecentZoneHistory` serves the engine; `getZoneFrequencyReport` serves the UI. Different contracts, different callers.

---

## Phase 2 Card Badges (Not This Session)

After Reports tab ships: add a small "last worked" chip to each `ZoneCard`. Approach:
- New prop `recentTm?: { name: string; daysAgo: number }` on ZoneCard
- Parent loads a lightweight version of zone history on mount (last 5 nights only)
- Chip renders as a subtle `text-[8px]` line below the zone label: `"↩ Gary · 2d ago"`
- Tooltip on hover: "Last 3: Gary, Peter, Jessica"

Keeps the card clean, gives operators instant rotation context.

---

## Implementation Order

1. **New data function** — `getZoneFrequencyReport` in `data.ts`
2. **ReportsTab.tsx** — UI component with both views
3. **SudoWindow.tsx** — wire in the new tab
4. **tsc + live validation** — confirm no type errors, load data in browser

---

## Open Questions (Resolved)

| Question | Decision |
|---|---|
| Include AUX/RR in frequency counts? | Zones only for v1. AUX/RR can be added as a filter toggle later. |
| How to handle TMs with 0 assignments in the window? | Exclude — only show TMs with ≥1 assignment. |
| Sort order of zone bars? | By count DESC (highest frequency at top). Makes patterns obvious. |
| What if a TM has data but no display name? | Fall back to tmId (same pattern as rest of app). |
| Date range options? | 14 / 30 / 60 days, defaulting to 30. Stored in component state (not persisted). |

---

**Ready to implement on approval.**

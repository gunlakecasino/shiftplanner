# Zone Deployment Builder — Historical Interactive Prototype

**Status**: Historical reference / design exploration (superseded).  
**Date range**: Pre-2026-05 (early Velvet / Golden canvas thinking).  
**Location context**: This folder lives inside the Agentic Command Post for discoverability by future agents.

---

## What This Is

A standalone, self-contained interactive prototype of the ShiftBuilder / GRAVE deployment canvas:

- 1056×816 Golden artboard philosophy
- Liquid glass / Velvet aesthetic explorations
- Atkinson Hyperlegible typography
- Zone / RR / Aux / Overlap cards
- Roster rail, MarkerPad / PlacementPad concepts
- Command palette (sb-cmdk), composer, stage, reducer-driven state
- Drag / selection / task editing surface
- Early "builder mode" vs sacred print split thinking

Built as a set of plain React + JSX modules (no build step required for the `index.html` version) using `useReducer` for mutations, stable callbacks, `useTransition`, and `React.memo` patterns. It served as a living design spec and interaction sandbox while the real production implementation was being built in `src/app/shiftbuilder/`.

---

## Current Relationship to the Real System

- **Do not edit** these files expecting changes in the live ShiftBuilder.
- The production surface is `src/app/shiftbuilder/ShiftBuilderClient.tsx` + `components/` + `hooks/` + `store/` + `lib/shiftbuilder/`.
- Many ideas from this prototype (stable refs, reducer discipline, glass treatments, card density, no-print contract, dual builder/print mode) influenced the shipped code.
- The prototype is preserved because it captures early, high-fidelity thinking about the "one cohesive piece of art" on the physical GRAVE sheet while the digital authoring veil is active.

---

## How to View (Historical)

Open `index.html` directly in a browser. It is a complete local demo with its own inline styles, fonts (Atkinson, Bricolage, Inter Tight, JetBrains Mono), and reducer (`sb-reducer.jsx`).

Key files of interest for archaeology:
- `sb-app.jsx` — main orchestrator
- `sb-reducer.jsx` — state machine
- `sb-cards.jsx`, `sb-stage.jsx`, `sb-roster.jsx`, `sb-markerpad.jsx`
- `design-canvas.jsx` and `sb-velvet.jsx` — visual language experiments

---

## Why It Lives Here

Placing it under `Agentic/` (instead of scattering in root or `dev/`) keeps the Command Post as the single place any future agent can discover "what we explored visually and interactively before the real engine was running."

If a future agent is asked to do deep UI archaeology or revive a specific interaction pattern, this is the canonical early artifact.

---

**Add notes below only if new historical insight is gained from re-examining these files.**
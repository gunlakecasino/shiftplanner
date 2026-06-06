# xAI Reasoning Deep Dive — Placement Analyst, Evidence, Training Flywheel & Explainability
**Date**: 2026-06-09  
**Status**: Active — First vertical implemented + iterated (richer specific signals: per-TM spread counts, real gapsLine, precise few-shot training notes + "Clear this session’s Gold" control; chip tooltip enhanced). tsc clean on every pass. Logs updated. Ready for live browser test + next deeper push (deep view evidence, xAI provenance surface, training persistence, or engine summaries).  
**Owner**: Grok 4.3 (with coding-engineer process)  
**User Direction**: "let's go deep into the xAI reasoning" (chosen after review of current builder + AI surfaces)

---

## Context & Problem

The project has invested heavily (especially June 2026) in a powerful two-tier xAI analyst for the builder:

- **Light / Fast** (grok-build-0.1 + `MagicOneLinerSchema`): Automatic headline + 4-6 actionable bullets on pad open. Powers card corner "✧" chips via `xaiFitsByHost` lift. Designed for immediate presence with low cost.
- **Deep / Deliberate** (grok-4.3 high + `PlacementPadInsightSchema`): Rich `whyTonight`, swaps, ranked assignees, verdict overrides when operator explicitly asks.

Strong foundations exist:
- Authoritative grounding via `xaiFillOrderContract.ts` (hard fill-order + swap rules) + placement order/eligibility + graves_default_schedule hard filter (enforced per THIS_IS Key Caveats).
- Very rich context (rotationBrief, 30-night spread + gaps, `boardAndWeekContext`, exposure details, prerender baseline for intelligent overrides, `priorGoodExamples` for training).
- Visual discipline (liquid glass, Atkinson, ✧ ink, strict `no-print` + `showDigitalAssists` gating for all digital assists).
- Usage tracking, caching (`engineInsightCache`), and two-model strategy aligned with the "deliberate powerful Grok usage" Memory.

**The gap**: The *reasoning itself* is still mostly opaque. 
- Operators see excellent synthesized outputs (headlines, bullets, chips) but cannot easily inspect *why* the model chose those specific signals (which rotation gap, which spread freshness number, which prior Gold example, which boardAndWeekContext fact mattered most).
- Training flywheel (`👍 Gold` thumbs → `priorGoodExamples` few-shots) works in the background but has almost zero visibility or perceived impact.
- Provenance is stronger for the deterministic engine (`ProvenanceGlass`, fairness signals) than for xAI judgments.
- This limits trust, learning, and the "explainable" part of the mission ("trusted, fair, fast, explainable").

This directly addresses evolved **W3-3** from ATTACK_PLAN + the "AI power + quality" and "Surface Grok reasoning / CoT ... full powerful explainability" items in `THIS_IS_WHAT_WE_ARE_DOING.md`.

---

## Success Criteria (Measurable)

- In the light/fast pad view, an operator can open a card and, with one additional tap or hover, see the key evidence signals that drove the headline + bullets (without needing a full expensive deep call).
- Training thumbs produce visible, immediate feedback ("Influenced by 2 of your previous Gold ratings on this slot type / similar rotation situations").
- Card corner chips can optionally surface a short "evidence hint" (still tiny, still no-print gated).
- All changes remain strictly digital-builder only (zero leakage to print/PDF sacred sheet).
- tsc clean at every gate. Live browser validation (Playwright + Chrome DevTools or direct inspection) for any visual/interaction change.
- Usage and cost behavior remains predictable (prefer enhancing existing light context rather than new heavy calls).
- Graves schedule remains the sole hard root for all context (no regression).
- Draft Mode + history untouched.

---

## Recommended Approach

**Start narrow and high-signal** (one vertical slice first):
1. **Reasoning Evidence Panel** (primary): In `PlacementPad` light view, add a clean, collapsible "Key signals" / "Why this determination" section that surfaces the highest-leverage context pieces already computed for the call (rotation gaps relevant to this TM/slot, spread freshness for the TM, top boardAndWeekContext highlights, count of prior Gold examples that matched, prerender vs xAI difference if any). Use existing data — no new model calls for the first slice.
2. **Training Visibility** (tightly coupled): When `priorGoodExamples.length > 0`, show a small, elegant indicator ("✧ shaped by your feedback (2 Gold examples)") with optional expand to list the short titles of the influencing examples. Make the thumbs feel like they have immediate effect.
3. **Light lift to chips** (optional, tiny): If the evidence is short and high-value, allow a micro-hint on the corner chip on hover/tap (still digital-only).

**Why this first?**
- Directly attacks the "opaque reasoning" and "invisible training" gaps.
- Builds on the exact recent work (light headline path, Expand Matrix pattern, glass cohesion, priorGoodExamples wiring).
- Low risk, high perceived value, surgical changes mostly in `PlacementPad.tsx` + small helpers + existing types.
- Creates the pattern for deeper provenance later (can evolve into a richer `XaiProvenanceGlass` or unified inspector).
- Preserves the delightful instant light surface while adding optional depth.

**Later slices** (after first ships and user feedback):
- Richer structured CoT / intermediate signal exposure from deep 4.3 calls.
- Unified provenance surface for both deterministic engine and xAI judgments.
- Steerable re-analysis ("re-run light with more weight on health gaps").
- Stronger summaries flowing into engine run draft pills and Sudo surfaces.
- Session + cross-session training memory improvements.

**Style & Constraints** (non-negotiable):
- Follow full coding-engineer 7-phase (this plan is the Phase 1 artifact).
- Surgical edits. Prefer enhancing existing components over new files when possible.
- All digital assists behind `showDigitalAssists` + `no-print` classes + outside `.print-artboard`.
- Atkinson + liquid glass language for any new UI.
- Always filter context to graves-scheduled TMs only.
- Use high/medium effort only when it delivers clear quality/explainability gain (per Memory).

---

## Files Likely to Touch (First Slice)

**Primary**:
- `src/app/shiftbuilder/components/PlacementPad.tsx` — light view rendering, thumbs handling, evidence section, training indicator.
- `src/app/shiftbuilder/components/placementPadHelpers.ts` — small helpers to format "top evidence lines" from existing rotation/spread/board context (if not already clean).
- `src/app/shiftbuilder/components/PlacementFitChip.tsx` — optional micro-hint on hover for evidence (keep tiny).

**Supporting / Types** (mostly read-only for first slice):
- `src/lib/shiftbuilder/placementPadInsightSchema.ts` (types already good).
- `src/lib/shiftbuilder/engineInsightForPlacement.ts` (context already rich; may add one small "evidenceSummary" field later if needed).
- `src/app/shiftbuilder/components/ShiftBuilderBoard.tsx` — minor if lifting new evidence state.
- `src/app/shiftbuilder/ShiftBuilderClient.tsx` — context passing (already wires priorGoodExamples well).
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts` — if any training state needs light extension (prefer session-local in pad first).

**No changes** (for first slice):
- Engine full-board paths (`grokEngine.ts`).
- Print / sacred sheet paths.
- Sudo tabs or XAISphere (future).
- New heavy model calls.

---

## Risks & Unknowns

- **Turbopack / giant Client sensitivity**: Any state or prop changes in the pad/board area must follow the established "effect + dynamic import + Loader" patterns used in recent lazy work. Risk: medium — mitigate by keeping changes inside existing PlacementPad component first.
- **Over-cluttering the delightful light view**: The quick headline + bullets must stay the hero. Evidence must be optional/collapsed by default. Mitigate with excellent UX (glass pill, small "Evidence" or "✧ signals" affordance).
- **Training data quality**: If priorGoodExamples are noisy, surfacing them could reduce trust. Mitigate by showing count + very short titles only; make "clear this session's feedback" easy.
- **Perf**: Rendering extra evidence lines on every pad open. Mitigate by computing only when the evidence section is opened (lazy) or using already-available data.
- **Scope creep**: Easy to want full CoT or matrix viz immediately. Stick to "evidence from context already sent to the model" for slice 1.

---

## Verification Strategy

1. **Phase gates**: tsc --noEmit --skipLibCheck clean after every meaningful edit batch.
2. **Live browser validation** (mandatory for any UI): Run the dev server, open ShiftBuilder on a real night with data, exercise light pad open, thumbs, evidence expand, card corners. Use Chrome DevTools for layout, hit targets, glass rendering, dark mode. Screenshot before/after where helpful. Prefer Playwright + Chrome DevTools MCP when available for regression.
3. **Invariants checks** (in every log entry):
   - Graves schedule still sole root for context.
   - No digital assists leak to print (inspect `.print-artboard` + `no-print` classes).
   - Draft Mode + history paths untouched.
   - Usage tracking still fires correctly for any new insight paths (even if just re-renders).
4. **Agentic logging**: Prepend structured entry at plan creation, start of implementation, each gate, and completion.
5. **User signal**: Quick visual/functional feedback after first slice (screenshot or live run).

---

## Phased Execution (First Slice Focus)

**Phase 0 (this plan)**: Audit + plan (done). Create this file + log entry.

**Phase 1 — Design & Minimal Implementation (Slice 1 core)**:
- Add optional collapsed "Evidence" section in PlacementPad light view.
- Compute/format 3–5 highest-signal evidence lines from existing context (rotation, spread for this TM, board highlights, prior example count).
- Add training indicator when priorGoodExamples > 0.
- Keep all changes behind existing digital-assists guards.
- Small helper extraction only if it keeps PlacementPad clean.
- tsc + browser smoke on a loaded board.

**Phase 2 — Polish & Chip Lift (if valuable)**:
- Tiny evidence hint on corner chip (hover title or micro line).
- Refined copy, glass treatment, Atkinson fidelity.
- Live validation against recent veil polish aesthetic.

**Phase 3 — Review + Log + Decide Next**:
- Self-review against this plan's success criteria.
- Full log entry.
- Decide (with user) whether to ship as-is, iterate, or move to next slice (richer deep CoT, unified provenance, etc.).
- Archive or mark progress in this plan.

Subsequent phases only after user confirmation on first slice.

---

**This plan supersedes scattered W3-3 notes for the xAI reasoning focus.** All future agents working on explainability must read the top of the current log + this file + relevant recent PlacementPad entries.

Status will be updated here as slices ship. The heartbeat remains `THIS_IS_WHAT_WE_ARE_DOING.md` + `AGENT_ACTIVITY_LOG.md`.
# The Placement Algorithm — Canonical Specification

Third document in the set: `PLACEMENT_ARCHITECTURE.md` explains the system as
built; `PLACEMENT_REVIEW_2026-07-18.md` catalogs where the build diverges.
This one answers: **if you wrote the whole thing as one algorithm, what is
it?**

The answer: nightly placement is a **lexicographic assignment problem** —
maximize coverage first (a bipartite matching problem, not a greedy walk),
then optimize rotation, preferences, and skill *in that order*, under hard
constraints that are never costs. Writing it this way is not just cleaner;
it makes several classes of shipped bugs impossible by construction:

- greedy-strands-a-restroom → impossible (matching finds augmenting paths,
  i.e., relocations, automatically);
- preferences-outvote-rotation → impossible (lexicographic vector
  comparison, no weight sums across tiers);
- inconsistent relaxation semantics → impossible (one ladder, one place);
- matrix staleness → impossible (the matrix becomes a pure function of
  history, not stored state).

Scale note that shapes everything: `|T| ≈ 25` TMs, `|S| ≈ 34` slots. At this
size every exact method is effectively free (< 10 ms). Nothing below needs
heuristics for performance — heuristics exist in the shipped code for
explainability and incrementality, not speed.

---

## 0. Notation and inputs

```
T                 roster of TMs scheduled tonight (post call-off, post availability)
S                 slot list in fill order (from coverage tiers)
REQ ⊆ S           required slots  = tiers 1–2 (restrooms, zones)
OPT = S \ REQ     fill-if-possible = tiers 3–5 (ADM, Z9SR, TR, SP/float, AUXn)
tier(s) ∈ {1..5}  rank(s) = index in fill order
locked ⊆ S        operator-locked slots (with incumbent TM)
pinned ⊆ S        preserved-but-unlocked existing placements (preserve policy)
H(t)              placement history of TM t: sequence of (night, area) events,
                  NEWEST FIRST, from ONE store, with canonical area keys
area(k)           canonical area identity of slot key k
                  (RR number collapses sides: MRR8, WRR8, RR8M → RR8;
                   overlap seats collapse to band: OL-PM-* → OL-PM;
                   zones/aux exact: Z4 → Z4, STEP → STEP)
W(t)              in-week planned placements (this engine session), merged into H
draft             partial assignment slot → tm, built up during the run
seed              PRNG seed; all iteration orders and tie-breaks derive from
                  (inputs, seed) — the algorithm is a pure function
```

**Boundary rule B0 (vocabulary):** every input key is normalized to canonical
form at the boundary — the algorithm never sees `zone_4`, `rr_8+side`,
`RR8M`, or a flex shell key `AUXn` (shells resolve to role codes via the
night's layout before entry). One `canon(key)` function, one place, property-
tested against every vocabulary. *(This single rule eliminates review
findings A1, A2, A3, F1, F2 as a class.)*

---

## 1. The hard gate

One predicate, four layers, one relaxation ladder. Nothing else in the
algorithm may test eligibility.

```
CANPLACE(t, s, R) -> {ok} | {blocked, gate, reason}     # R = relaxation level

  LEVEL-0 gates — NEVER relaxed, at any R:
    G1  slot-family physics:
          s ∈ Z*         ⇒ fullGrave(t)
          s ∈ MRR*       ⇒ gender(t) = M          # unknown gender ⇒ BLOCKED, flagged for data fix
          s ∈ WRR*       ⇒ gender(t) = F          # fail CLOSED, not open
          s ∈ OL-AM/PM-* ⇒ overlapBand(t) matches
          s ∈ full-night aux/RR/ADM ⇒ ¬overlapBand(t)
          unknown slot family ⇒ BLOCKED            # fail closed; surface, don't guess
    G2  locked: s ∈ locked ⇒ t = incumbent(s)
    G3  accommodations: dossier AND tm_accommodations rows — both sources, hard
    G4  schedule: t ∈ scheduledTonight
    G5  operator rules, SCOPED:
          a rule r = (predicate, scope) blocks (t,s) iff t,s ∈ scope(r) ∧ predicate
          # a rule scoped to slot_types=[rr] says NOTHING about non-rr slots
    G6  hard-avoid preference / hard pair-avoid (with current draft neighbors)
          # per the ratified contract these are CONSTRAINTS ("never placed").
          # If ops ever wants them tradeable, demote to a cost — never relax silently.

  LEVEL-1 gate — relaxable ONLY to save required-slot coverage:
    G7  prior-3 rotation: area(s) ∈ areas of last 3 events of merge(H(t), W(t))
          exempt slots: continuity roles (ADM + any aux role flagged
          `continuity` — JC, STEP by default); overlap seats

  return ok  iff  all gates with level > R pass
```

The ladder is exactly two rungs: `R=0` (everything) and `R=1` (rotation
gate waived). Every placement made at `R=1` carries a `relaxation` record in
its provenance. There is no rung that waives a Level-0 gate. Period.

---

## 2. The objective — a vector, never a sum

Each candidate placement gets a **score vector**, compared
lexicographically. Tiers cannot leak into each other because they are never
added together.

```
SCORE(t, s, draft) = ( rot, pref, skill )   # maximize, compare left to right

rot   = rotation quality ∈ [0, 100], integer-quantized:
          start 100
          − 55 · sideFamilyHit(t, s)              # WRR6 after WRR8 in prior-3: near-hard
          − 25 · min(spread30(t, area(s)), 3)     # 30-night frequency: 1×=-25, 2×=-50, 3+=-75
          − 10 · last5Hit(t, s)                   # same area in last 5 events
          + min(7, gapDays(t, area(s)) / 8)       # recency bonus, capped
          (prior-3 same-area is a GATE (G7), not a term — it never appears here)

pref  = clamp(hardPrefer, 0, 1) + 0.4·clamp(softPrefer, -1, 1)
        + 0.5·pairAffinity(t, s, draft)           # every term clamped; sums bounded by design
skill = −|skill(t) − difficulty(s)|, floored at −1, with overqualified floor −0.4

TIEBREAK: (tie_break_rank(t), tmId(t))            # total order ⇒ full determinism
```

Design pins:
- **Quantize `rot` to integers** so float noise can't fake a rotation
  difference that then suppresses a real preference difference.
- Weights inside a component are tunable (engine_config); the *component
  order* is not tunable. Config can retune rotation's internals; it cannot
  put preferences above rotation. This is the enforcement the weight bag
  never had.
- Coverage does not appear in SCORE at all — it is handled structurally in
  Phase B, which is what "coverage dominates everything" actually means.

---

## 3. NIGHT-SOLVE — the core algorithm

```
NIGHT-SOLVE(T, S, locked, pinned, H, W, seed):

  # ---- Phase A: feasibility census (before placing anyone) --------------
  A1  E0 := { (t,s) : s ∈ REQ, CANPLACE(t,s,0).ok }        # eligibility graph
  A2  M* := MAX-BIPARTITE-MATCHING(E0)                      # Hopcroft–Karp
  A3  for each unmatched s ∈ REQ:
         cert(s) := Hall deficient set — the slot-set whose combined
                    candidate pool is too small (e.g. "5 WRRs share only
                    3 eligible women")
      # cert() IS the REALITY CHECK text: exact, provable, per-slot.
      # Gender split falls out automatically — no special-cased F10 math.

  # ---- Phase B: coverage (matching, not greedy) --------------------------
  B1  M := locked ∪ pinned matches                          # respect preserve
  B2  AUGMENT(M, E0 restricted to free TMs)                 # fill REQ without
                                                            # touching pinned
  B3  if some s ∈ REQ still open AND an augmenting path exists that moves
      pinned (unlocked) TMs:
         apply the SHORTEST such path (min disruption), log each displaced
         pinned TM as {moved-for-coverage, path}
      # coverage > preservation, but disruption is minimized and visible.
  B4  if still open:
         E1 := E0 ∪ { (t,s) : CANPLACE(t,s,1).ok }          # waive G7 only
         AUGMENT(M, E1) for the open REQ slots only;
         tag every edge used at R=1 with relaxation={rotation-prior3}
  B5  anything still open stays open, with cert(s) attached.
      # There is no rung 2. Hard-avoids and physics never bend.

  INVARIANT I-cov: |filled REQ| is MAXIMUM over all boards satisfying the
  gates at the relaxation levels actually used. (Matching guarantees this;
  no greedy order can strand a fillable slot.)

  # ---- Phase C: choice — WHO gets each covered slot ----------------------
  # Matching fixed WHETHER slots fill; now pick WHO, honoring fill order,
  # without ever giving back coverage.
  C1  for s in fill-order over slots M says are fillable, skipping locked:
        C := { t free : CANPLACE(t,s,R_used(s)).ok
                        ∧ FEASIBLE-REMAINDER(M, s←t) }
             # oracle: after fixing s←t, a max matching of equal size still
             # exists on the remaining slots (one alternating-path check)
        pick t* := argmax_lex SCORE(t, s, draft) over C
        draft[s] := t*;  W-append(t*, s)                    # later slots see it
  C2  then OPT slots in fill order, same loop, R=0 only, no coverage debt:
        optional slots never trigger relaxations or pinned displacement.

  # ---- Phase D: refinement — polish quality at constant coverage --------
  D1  for k in 1..MOVE_BUDGET (seeded order):
        propose swap(s1,s2) or move(t, s1→open s2) with:
          – both endpoints CANPLACE at R=0   # optimization NEVER uses relaxations
          – locked untouched; pinned untouched unless policy=none
          – coverage(draft') = coverage(draft)
        accept iff  Σ-lex SCORE(draft') > Σ-lex SCORE(draft)
                    where Σ-lex compares (Σrot, Σpref, Σskill) left-to-right
  D2  deterministic: same inputs + seed ⇒ same board, byte for byte.

  # ---- Phase E: AI overlay (optional, grok-hybrid) ------------------------
  E1  the model receives: rules text, per-slot Top-K (from Phase C SCORE
      vectors), cert() explanations, and TOOLS that call the REAL
      CANPLACE/SCORE (never a simplified copy).
  E2  each proposed override is accepted iff CANPLACE(R=0) ∧ the full-board
      Σ-lex does not regress ∧ coverage unchanged. Rejections carry reasons.

  # ---- Phase F: guard — verify, repair, RE-verify -------------------------
  F1  assert: one-TM-one-slot; locked intact; every placement passes
      CANPLACE at its recorded R; coverage = Phase-B count; every R=1
      placement has a relaxation record.
  F2  on violation: repair (revert offending slots to Phase-C values) and
      GO TO F1. Loop until fixpoint (bounded: each repair only reverts).
  F3  the scorecard carries hardViolations from the FINAL verification —
      a result that says "clean" has been proven clean, not assumed.

  return { draft, provenance per slot (phase, SCORE vector, relaxations,
           displaced-pinned log), scorecard (coverage, Σrot, Σpref, Σskill,
           hardViolations), cert() for every open slot, seed }
```

Complexity: A2/B O(E·√V) ≈ microseconds at 25×34; the Phase-C feasibility
oracle is one alternating-path search per candidate, O(E); Phase D is
budget-bounded. Whole solve well under 10 ms — determinism and provable
coverage cost nothing at this scale.

---

## 4. WEEK-SOLVE — fold, then polish

```
WEEK-SOLVE(nights[Fri..Thu], T, seed):
  W := ∅                                          # rolling in-week history
  for n in nights (chronological):
      ctx_n := context(n) with H merged with W    # planned nights are visible
      R_n   := NIGHT-SOLVE(ctx_n, seed ⊕ n)
      W     := W ∪ R_n.draft
  # ---- polish: cross-night repeats the greedy fold can't see -------------
  for k in 1..WEEK_BUDGET (seeded):
      propose swap of two placements in different nights n1 < n2:
        – both sides CANPLACE(R=0) in their nights   # accommodations included
        – coverage of both nights unchanged
      accept iff WEEK-SCORE improves lexicographically:
        ( Σ coverage, −Σ weekRepeatViolations, Σ rot, Σ pref, Σ skill )
      on accept: REBUILD ctx for every night AFTER min(n1,n2)   # no stale
                 contexts — downstream prior-3/recency see the new board
  return per-night results + week scorecard + relaxation ledger
```

The week engine is the *same* night solver folded left with a shared ledger
— not a second algorithm. Anything the night gate blocks, the week gate
blocks, because it is the same gate. *(Fixes the H1/M3/M4-class divergences
by having no second code path to diverge.)*

---

## 5. The TM Placement Matrix — a view, not a table

The matrix is a **pure function of history and the clock**; storing it is a
caching decision, not a design one. Canonically:

```sql
-- the matrix, always current, no refresh choreography, no staleness:
create view v_tm_zone_matrix_live as
select tm_id,
       area                             as zone_key,
       count(*) filter (where night_date >  current_date - 28) as count_4w,
       count(*) filter (where night_date >  current_date - 56) as count_8w,
       count(*)                                                as count_lifetime,
       max(night_date)                                         as last_placed,
       current_date - max(night_date)                          as days_since
from   committed_placements                    -- canonical-key history, one store
where  area ~ '^Z[0-9]+$' or area = 'Z9SR'
group  by tm_id, area;
```

At ~1.5k history rows this evaluates in well under a millisecond — there is
no scale justification for the denormalized table. If one ever appears
(100× the data), the cache rule is: *the table is rebuilt by an idempotent
per-TM job triggered by any history mutation, plus a nightly full sweep, and
readers treat `count_4w` as "as of `refreshed_at`."* Either way the
invariant is:

```
I-matrix:  matrix ≡ f(history, now)   — recomputable from scratch at any time,
           byte-identical; no write path can leave it wrong, only stale,
           and the sweep bounds staleness at 24h.
```

And the history feeding it obeys:

```
I-hist:    exactly one store; one canonical key per event (written through
           canon() at insert); ownership singular per (night, slot); every
           mutation that touches a (night, slot) — including CALL-OFF VACATES
           — flows through one CLEAR+INSERT primitive that returns the
           affected TM set.
```

The prior-3 / last-5 / spread-30 helpers read the same store with a
`before_night` cursor (tonight excluded), so gate and matrix can never
disagree about what happened — only about window shape, which is intended
(events vs calendar).

---

## 6. The same thing as a constraint model (the industrial alternative)

At this scale the entire night is also expressible as a tiny CP-SAT/ILP —
worth having as a **shadow validator** (the repo's `shadow.ts` pattern) even
if the staged solver stays primary for provenance reasons:

```
vars      x[t,s] ∈ {0,1}                 ∀ eligible (t,s) at R=0
          y[s]   ∈ {0,1}                 slot-open slack, REQ only
          r[t,s] ∈ {0,1}                 rotation-relaxed indicator (R=1 edges only)

subject   Σ_s x[t,s] ≤ 1                              ∀t        (one slot per TM)
          Σ_t x[t,s] + y[s] = 1                       ∀s ∈ REQ  (filled or open)
          Σ_t x[t,s] ≤ 1                              ∀s ∈ OPT
          x[t,s] = 0                                  ∀ (t,s) failing Level-0
          x[t,s] ≤ r[t,s]                             ∀ (t,s) failing only G7
          x[incumbent(s), s] = 1                      ∀ s ∈ locked

solve lexicographically (staged solves, each stage fixing the previous
optimum as a constraint):
  1. minimize  Σ tier1_open y[s], then Σ tier2_open y[s]     # coverage
  2. minimize  Σ r[t,s]                                      # fewest relaxations
  3. maximize  Σ rot(t,s)·x[t,s]                             # rotation
  4. maximize  Σ pref(t,s)·x[t,s]
  5. maximize  Σ skill(t,s)·x[t,s]
```

Staged solves make the hierarchy *provable* — no big-M weight arithmetic to
get wrong, which is precisely the bug class the collapsed scalar objective
introduced (review P1-12). Runtime at 25×34: milliseconds. Disagreement
between shadow and primary = a bug certificate with a concrete board.

---

## 7. Invariants (the contract, testable as written)

```
I1  ∀ nights: a TM holds at most one slot.
I2  Locked slots are byte-identical across any engine run.
I3  No output placement violates a Level-0 gate. Ever. (Property test:
    fuzz rosters × configs × seeds; assert.)
I4  Filled required-slot count equals the max-matching bound at the
    relaxation levels used — i.e., coverage is OPTIMAL, not best-effort.
I5  Every G7 waiver appears in the relaxation ledger; count(waivers) is
    itself minimized (CP stage 2 / matching B4 scope).
I6  NIGHT-SOLVE and WEEK-SOLVE are pure functions of (inputs, seed).
I7  matrix ≡ f(history, now); history has one store, one vocabulary,
    singular (night, slot) ownership, closed under every mutation path.
I8  canon() is total over every production key form; unknown ⇒ loud
    sentinel, fail-closed eligibility, never silent pass-through.
I9  Explanations are byproducts of solving (SCORE vectors, Hall
    certificates, ledgers) — never reconstructed after the fact.
```

---

## 8. What this changes vs the shipped code, in one table

| Shipped | Canonical | Why |
|---|---|---|
| Greedy walk + rescue + backfill | Max matching + feasibility-oracle choice | Coverage provably optimal; stranding impossible (P0-3, P1-9) |
| Scalar weighted sum + hard gates | Lexicographic vector (rot, pref, skill) | Hierarchy enforced by type, not by weight discipline (P0-7, P1-12) |
| 3 relaxation behaviors (rescue / optimizer / week polish) | One 2-rung ladder in CANPLACE | One semantics, always ledgered (P0-6, M4) |
| Hard-avoid sometimes placed | Hard-avoid is Level-0 | Matches the written constitution; tradeability is a policy edit, not an accident |
| 2 history stores, 4 vocabularies | 1 store, canon() at boundary | A1/A2/F1/F2/G2/G3 vanish as a class |
| Denormalized matrix + refresh choreography | SQL view (cache optional) | Staleness and ghost counts unrepresentable (P0-5, P1-11) |
| Guard repairs without re-check, scorecard can't carry violations | Verify→repair→re-verify fixpoint | "Clean" means proven (M2) |
| Feasibility = arithmetic on counts | Hall certificates from the matching | Explanations exact per slot, gender split for free (M11) |

The staged shape of the shipped engine (planner → optimizer → AI → guard) is
worth keeping — it is where provenance and operator trust come from. The
canonical algorithm slots inside it: Phase B/C replace the planner's walk,
the vector comparator replaces the collapsed objective, CANPLACE's ladder
replaces the three ad-hoc relaxation sites, and the CP model runs in shadow.

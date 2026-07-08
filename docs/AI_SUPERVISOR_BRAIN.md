# The Ops Supervisor Brain — training the ShiftBuilder AI to think like you

**Status:** Design / discussion — 2026-07-03
**Context:** The unified engine + AI layer now optimize *measurable* fairness (coverage, rotation). This doc is about the next leap: making the AI reason with the *human, contextual judgment* a real Ops Supervisor uses — and building the `/ai` page to capture, train, and tune that judgment.

---

## 1. The gap: what a supervisor knows that the engine doesn't

The deterministic engine is excellent at what's countable: is the slot covered, how fresh is this rotation, does it break a rule. That's maybe 40% of what you actually weigh when you place people. The other 60% lives in your head as **tribal knowledge + priorities + judgment**:

| Dimension | What you know | Does the AI know it today? |
|---|---|---|
| **Rotation / fairness** | Spread people, don't repeat areas | ✅ Yes (health model) |
| **Capability by zone** | Who's *reliable* in high-limit, who can handle Z9, who's still learning | ⚠️ Shallow (one skill number) |
| **Physical / medical** | No-sweeper, bad back, can't do stairs, Daryl's accommodation | ❌ In `tm_accommodations` but never told to the AI |
| **Preferences / morale** | Who hates trash, who's been stuck somewhere too long, who to keep happy | ⚠️ In `tm_preferences`, underused |
| **Chemistry / relationships** | Who trains whom, who to pair, who to keep apart | ⚠️ `tm_pair_affinities` exists, barely used |
| **Reliability / attendance** | Who's flaky, who needs eyes on them, who to trust in a critical spot | ❌ Not modeled |
| **Development goals** | Deliberately rotating someone *into* a zone to grow them (the opposite of "keep it fresh") | ❌ Not modeled |
| **Zone demands** | Which zones are brutal tonight, guest-facing intensity, sub-tasks | ⚠️ One difficulty number |
| **Night context** | Busy night, VIP event, holiday, short-staffed, someone called off | ❌ Not modeled |
| **Judgment / rules-of-thumb** | "Never put a trainee alone in high-limit." "Z9 needs someone solid." "Don't burn my reliable people every night." | ❌ Not captured |

**The core principle:** *the AI is only as good as the knowledge and judgment we feed it.* Today we feed it rotation math, so it reasons about rotation. To make it a supervisor, we feed it the human layer — and give you a place to build, maintain, and *train* that layer. That place is the `/ai` page.

---

## 2. The architecture: three things a supervisor brain needs

### 2.1 Knowledge (structured, granular, editable)
Externalize your mental model into data the AI can reason with. New tables (or a JSONB "profile" per TM), all editable from `/ai`:

- **TM dossier** (per person): capability rating *per zone/area* (not one number), physical accommodations, preferences (love/hate zones), reliability/trust level, tenure/training status, personality notes, development goals ("cross-train on high-limit").
- **Chemistry graph**: keep-together (trainer→trainee, good pairs), keep-apart (conflicts), with a reason.
- **Zone/slot profiles**: physical demand, guest-facing intensity, "thrives here / struggles here" tags, sub-task list, "needs a reliable person" flag.
- **Policies / rules-of-thumb**: operator-authored heuristics in plain English, each toggleable and weighted ("Trainees are never alone in high-limit — HARD", "Spread Admin across 3–4 people — SOFT").
- **Night context** (per night): event type, expected volume, VIP presence, staffing notes — a quick pre-shift form.

### 2.2 Priorities (how to weigh competing factors)
A supervisor constantly trades off rotation vs. capability vs. morale vs. development. Give yourself tunable priorities — sliders/weights that become explicit instructions in the AI brief:
`coverage (fixed #1) → then your weighting of: rotation, capability-fit, preferences/morale, development, chemistry`. Presets: "Fair rotation night", "Big event — put your best people forward", "Training night — develop the bench".

### 2.3 Judgment / learning (the feedback loop — this is the real "training")
Every time you accept, reject, or edit an AI proposal, that's a labeled example of *your* judgment. Capture it:
`{ situation snapshot, AI proposal + rationale, your decision, your reason }`.
Then use it three ways:
1. **Few-shot exemplars** — inject "here's how Brian handled similar calls" into the brief, so the AI mimics your patterns.
2. **Surfaced patterns** — "You've rejected 8 of *Jared-on-Z9*; want a rule?" → one click turns a pattern into a policy.
3. **Future fine-tuning** — the accumulated corpus becomes training data if we ever fine-tune a model on your judgment.

This is what makes it *converge on how you think* over time, instead of being static.

---

## 3. The `/ai` page — the Supervisor Knowledge & Judgment Console

A dedicated page (`/shiftbuilder/ai`) with these sections:

1. **Supervisor Brain** — edit the knowledge base: TM dossiers, chemistry graph, zone profiles, policies. This is where tribal knowledge becomes data. (Highest leverage — most of the "60%" lives here.)
2. **Priorities** — the weighting sliders + presets that shape every run.
3. **Playground / Simulator** — pick a night, run the AI, read its full reasoning, tweak a dossier or policy, **re-run and diff**. This is the training loop: watch it think, correct it, watch it improve. Read-only against live data (never Apply).
4. **Feedback & Learning** — review past decisions, thumbs up/down with a reason, browse the exemplar library, and accept "turn this pattern into a policy" suggestions.
5. **Prompt / Policy editor** — the system prompt + rules-of-thumb, versioned and editable, so you can literally rewrite how it's told to think.
6. **Model & cost** — provider/model (Opus 4.8 for testing, Fable 5 for prod), thinking effort, token budget, live usage.
7. **Audit** — every AI decision logged with the knowledge and reasoning it used. Explainability + a safety trail.

---

## 4. How it plugs in (the mechanics we already have)

The plumbing exists; this is mostly *feeding it richer context and adding the console*:

- **The brief** (`engine/ai/briefs.ts`) becomes a layered pack assembled from the knowledge base — today it carries rotation facts; we add per-TM dossiers, accommodations, chemistry, policies, and night context.
- **The guard** (`engine/ai/guard.ts`) already rejects anything illegal or coverage-reducing — so richer AI ambition stays safe. Hard policies (accommodations, keep-apart) become guard constraints; soft ones become brief guidance.
- **The provider** is already model-agnostic and env-configurable.
- **The feedback capture** hooks the existing accept/reject in Draft Mode (the ✓/✗ you already click) → writes labeled examples.

Nothing here throws away what's built; it layers the human dimension on top.

---

## 5. Beyond placement — the ops system as a whole

Design the knowledge base as a **shared "Ops Brain" service**, not a placement feature. The same TM dossiers, chemistry, policies, and the same provider-agnostic AI + feedback loop generalize to:
- Break-wave scheduling, task assignment within zones, call-off backfill, week-level planning.
- Shift recaps & TM appraisals (already skills) — pulling from the same dossiers.
- **Proactive supervision**: the AI flags things unprompted — "Darlene's been on restrooms 5 nights straight," "you're 2 women short for restrooms Thursday," "Steve's ready to try high-limit."

The `/ai` page becomes the front door to that shared brain.

---

## 6. Phased build plan

- **Phase A — Knowledge foundation (highest leverage):** the TM dossier + policy data model, the brief assembly that uses it, and a minimal `/ai` Supervisor Brain editor. Immediately makes the AI reason with accommodations, capability-by-zone, and your rules-of-thumb.
- **Phase B — Playground + priorities:** the simulator (run/tweak/re-run/diff) and the priority sliders. This is where *you* train it interactively.
- **Phase C — Feedback loop:** capture accept/reject as labeled examples, few-shot injection, pattern→policy suggestions.
- **Phase D — Prompt/policy editor + audit + model controls.**
- **Phase E — Generalize to the wider ops system.**

---

## 7. The first, highest-leverage step

Start with **Phase A**, and within it, the single most impactful piece: **capability-by-zone + accommodations + rules-of-thumb in the brief.** Right now the AI is blind to who's *good* where and who *can't* do what — that's the biggest gap between it and a real supervisor. Wiring those three into the brief (and a simple editor to maintain them) turns "optimizes rotation" into "places the right person, respecting limits, per your rules." Everything else builds on that.

**Open questions for Brian (these shape what we build):**
1. Which knowledge matters most to you first — capability-by-zone, accommodations, chemistry, or your rules-of-thumb?
2. Do you want to author knowledge as structured fields (ratings, tags) or mostly as free-text notes the AI reads (faster to capture, looser)?
3. Should hard accommodations (no-sweeper, etc.) be *guard constraints* (never violated) from day one?

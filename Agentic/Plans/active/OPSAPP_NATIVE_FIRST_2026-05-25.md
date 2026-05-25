# opsApp — Native-First iPadOS GRAVE Operations App (SwiftUI + PencilKit)

**Created**: 2026-05-25  
**Status**: Active — Phase 0 Execution (Backend Foundation)  
**Owner**: Grok (high-agency execution per user direction)  
**User Involvement**: Very low (drive autonomously, escalate only on true blockers or major trade-offs)

---

## Context & Explicit Decision

On 2026-05-25 the user gave clear direction:

1. "I want to execute the native first path."
2. "As soon as we can diligently and systematically."
3. "Very little involvement."

This locks **Option B** from the earlier options analysis: Build a native SwiftUI + PencilKit iPad app (`opsApp`) as the **leading, world-class Apple Pencil Pro 2 experience** for GRAVE operators.

The existing webapp (in `src/`) is now the secondary surface. It will continue to exist and be maintained, but new investment and the "Apple-grade in calm and beauty" flagship experience moves to native.

`/opsApp` was created as an empty directory to house this new effort.

---

## Vision

**opsApp** will become the reference iPad application for serious professional Pencil-driven work in operations/scheduling.

Operators should feel:
- The Pencil Pro 2 is a **precision instrument**, not a workaround.
- The experience is calmer, faster, and more powerful than any web or hybrid alternative.
- The Golden 1056×816 artboard philosophy lives on, but now feels truly native and alive under the Pencil.

This is not "the webapp, but in Swift." It is a purpose-built native experience that can eventually justify being the primary (and for many operators, the only) way they interact with the GRAVE system.

---

## Relationship to the Existing Webapp

**Principles**:
- The webapp is **not abandoned**.
- Both apps share the same Supabase backend and core data model.
- The webapp becomes the "universal access / browser / Mac / experimental / lighter ops" surface.
- New major features and the highest-fidelity Pencil experiences live first (and sometimes only) in `opsApp`.
- We will look for opportunities to share design tokens, icons, domain types, and (where practical) business logic.

**Long-term Possibilities** (to be decided later, not now):
- Webapp becomes read-mostly + light editing.
- Some surfaces (Sudo power tools, reporting) may stay primarily in web for years.
- Eventually a Mac Catalyst or native Mac version of key parts of opsApp.

---

## Guiding Principles (Non-Negotiable)

1. **Pencil Pro 2 is the Killer Feature** — Every major design decision must ask: "Does this make the Pencil experience meaningfully better than what was possible on the web?"
2. **Golden Artboard Fidelity** — The 1056×816 canvas, zone colors, icons, typography, and calm high-density aesthetic must feel like a direct, premium evolution of the printed GRAVE sheets.
3. **Operator in Control** — Draft Mode, perfect history, and explainability remain sacred (port the spirit, improve the feel).
4. **Diligently & Systematically** — No hero commits. Proper planning, small vertical slices, real device validation early.
5. **Leverage Our Advantages** — Heavy use of XcodeBuildMCP, the existing Agentic system, and the mature webapp domain knowledge.
6. **Share Ruthlessly Where It Makes Sense** — Especially data models, placement rules, and backend.

---

## Recommended Tech Stack (Initial Proposal)

- **Language/Framework**: Swift + SwiftUI (targeting iPadOS 18+ or 19+ for best PencilKit + hover support)
- **Pencil**: PencilKit (primary for drawing/ink) + low-level `UIPencilInteraction` + `UIHoverGestureRecognizer` + pressure/tilt handling for the planning canvas
- **Architecture**: Strongly recommend **The Composable Architecture (TCA)** or a clean MVVM + dependency injection approach. Avoid massive view models.
- **Networking**: Supabase Swift SDK (direct, same backend as webapp)
- **State & Sync**: Combine + async/await. Consider offline-first patterns early (especially for Nightwatch-style freeform work).
- **Canvas / Drawing**: Mix of PencilKit + custom SwiftUI Canvas / Metal where needed for the precise 1056×816 planning surface.
- **Navigation**: Modern SwiftUI navigation (NavigationStack + sheet presentations, etc.)
- **Testing**: Heavy use of XcodeBuildMCP for simulator + real device automation during development.

We should decide on TCA vs lighter patterns in Phase 0.

---

## Phased Delivery Approach (Proposed)

### Phase 0 — Foundation & First Pencil Slice (Goal: Validate the bet quickly)
- Xcode project scaffolding + basic SwiftUI app structure
- Supabase integration + core data models ported
- Basic navigation shell + theme matching Golden spec
- **First vertical slice**: A simplified but high-fidelity version of one card type (e.g., ZoneCard) with excellent Pencil hover + selection + basic drag/reorder feel using native gestures
- Real device + Pencil Pro 2 validation loop established using XcodeBuildMCP
- Decision point: "Does the native Pencil experience feel meaningfully better?" (If no, reassess)

### Phase 1 — Core Planning Surface (ShiftBuilder Heart)
- Faithful port (and improvement) of the 1056×816 Golden artboard
- Full roster rail, zone/RR/AUX/overlap cards
- Drag & drop, task assignment, coverage, breaks, locks using native interactions + Pencil
- Draft Mode + history (native implementation)
- Command Palette equivalent (or better native contextual UI)

### Phase 2 — Nightwatch Evolution
- Native freeform canvas powered by PencilKit (pressure, tilt, layers, stamps, timeline integration)
- Real shift event logging with Pencil annotations
- This is where we can go dramatically beyond what the web version can do

### Phase 3 — Power Tools & Polish
- Sudo surfaces (or the highest-value ones)
- Engine runs + Grok integration
- Printing, ADP import, etc.
- Full production readiness

---

## Data & Backend Strategy

- Use the existing Supabase project (same tables: `nights`, `zone_assignments`, `night_slot_tasks`, `shift_events`, `engine_config`, etc.).
- Port the TypeScript models/logic thoughtfully into Swift (avoid blind 1:1 port of every helper).
- Strong consideration for extracting shared domain logic later (if effort justifies it).
- RLS and security posture must remain identical to the webapp.

---

## Development Workflow

- Primary machine remains this macOS environment.
- **XcodeBuildMCP** becomes a core tool for agentic development of `opsApp` (build, run on simulator/real iPad, LLDB, UI automation, log capture).
- Continue using the existing Agentic Command Post for planning and logging.
- We will likely need a lightweight "Swift coding agent" process (may evolve the coding-engineer skill or create a companion).
- Early and frequent real-device Pencil testing (not just simulator).

---

## Risks & Mitigations

- **Two codebases maintenance burden** → Mitigated by clear ownership split and ruthless scoping of what lives in web vs native.
- **Domain logic duplication** → Accept some duplication early; look for extraction opportunities after Phase 1.
- **Slower initial velocity** → Offset by the fact that native Pencil work is the actual goal. Use XcodeBuildMCP aggressively.
- **Losing webapp momentum** → Keep a small, defined maintenance + parity budget for the webapp.
- **Golden spec drift** → Appoint the Golden spec as the shared source of truth across both apps.

---

## Immediate Next Steps (What I Will Drive)

1. **Create this plan** (done)
2. Update `THIS_IS_WHAT_WE_ARE_DOING.md` (done)
3. **Phase 0 Backend Foundation** (Current focus — in progress):
   - Full directory structure created
   - Thorough Supabase client + secret management implemented (Secrets.plist pattern)
   - Core models ported (TeamMember, Assignment, Night, etc.)
   - ShiftPlannerRepository skeleton with real queries started
   - .gitignore + example secrets file
   - README with setup instructions

**Next after backend completion**: First high-fidelity Pencil slice of the ShiftPlanner canvas + real device validation loop using XcodeBuildMCP.

---

**Status**: Plan created. Ready for execution.

User: Review only if you want. Otherwise, tell me to proceed with scaffolding and Phase 0 planning. I will move systematically but with urgency.
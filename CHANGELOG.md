# Changelog

All notable changes to ShiftBuilder / ShiftPlanner leading to **v1.0.0** — floor production release (June 24, 2026).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Commit hashes reference `gunlakecasino/shiftplanner`.

---

## [1.0.0] — 2026-06-24

**UI freeze:** All visual design, component JSX, active CSS rules, layout structure, hooks, and stores are frozen as of this tag. Subsequent work in this release pass was additive hardening only.

### Added — Production hardening & observability

- `6f6faaa` **feat(shiftbuilder): v1.0 floor release — UX states, day veil, ops hardening**
  - Structured logging via `src/lib/opsLogger.ts` (dev JSON payloads; production allowlisted info + always-on errors/warns)
  - `GET /api/admin/ops-logs` — sudo_admin-only audit trail across all operators
  - Canonical API route map (`/api/shiftbuilder/night`, `/roster`, `/config`, `/actions`) with legacy URL aliases preserved
  - `ShiftBuilderAuthenticatedShell` — auth-gated client mount; fixes empty cards on first PIN login
  - Shared state primitives: `CardSkeleton`, `EmptySlot`, `useHydrationGuard`, `cardPopulationTransition`
  - Day-switch inner-content veil (~250ms) via `dayCardContentVeil.ts`, `DaySwitchTransitionBridge`, `liveCache` subscription
  - Floating **?** help button + `/shiftbuilder/help` floor guide route
  - Production security headers + CSP in `middleware.ts`
  - `// v1.0.0` production markers on all hardened source files

- `761a6e0` **docs: add ShiftBuilder floor operator guide**
- `9137a05` **docs(shiftbuilder): rework floor guide for reshuffle-first call-offs**
- `b1e3bc0` **feat(shiftbuilder): interactive grave cover guide tutorial**

### Added — Auth & session security

- `9ace89c` **feat(auth): session-bound APIs, admin PIN confirm, and ops hardening**
- `06673ab` **feat(security): P0 red-team fixes — gated mutations and APIs**
- `2e29b45` **feat(auth): sliding session with 5-minute idle timeout**
- `993490f` **feat(auth): progressive PIN lockout and rotation reports page**
- `e559f72` **feat(auth): fix user creation, add Viewer role, permission-gated navbar**
- `fc20ac8` **feat(auth): Admin role (viewer + reports), published-night gates, unpublished overlay**
- `359d6ed` **fix(auth): server-native PIN verify + relaxed same-origin for login**
- `3b13c73` **fix(auth): allow production PIN login without server-side user reload**

### Added — Floor operations & print

- `0de250b` **feat(shiftbuilder): call-off restore, coverage A/B labels, and print**
- `36d38ee` **feat(shiftbuilder): Refresh Day deep reload + RR prior-3 repeat parity**
- `bdc1c5f` **feat(shiftbuilder): print layout, pad fixes, idle resume, coverage-safe defaults**
- `d5d19ae` **feat(shiftbuilder): print typography polish and builder Helvetica fonts**
- `4a45599` **feat(shiftbuilder): task pad flyout parity, title case, trail baseline**
- `4b90b6f` **feat(shiftbuilder): placement trail on cards, Z9 tracker prior nights only**
- `0d4f844` **feat(shiftbuilder): iPad flyout pads, critical prior-3 repeat at 50%**

### Added — Settings & card defaults

- `0075e82` **feat(settings): wire Card Defaults as task source and harden push flow**
- `42e5a8f` **refactor(settings): retire ADP uploads; Graves schedule + Users PIN cleanup**
- `ce25d45` **release(shiftbuilder): v1.0.0 rotation reports dashboard**

### Fixed — Placement engine & rotation gates (v1.0.23–v1.0.28)

- `6d58cf6` **fix(shiftbuilder): harden placement engine rotation gates (v1.0.23)**
- `974c9c8` **fix(shiftbuilder): prior-3 placement events for RR rotation gate (v1.0.24)**
- `2330cc3` **fix(shiftbuilder): RR UI red only on same RR number in prior 3 (v1.0.25)**
- `6ef4ffb` **fix(shiftbuilder): engine fills RR slots — family repeat is soft not hard (v1.0.26)**
- `bd3bb74` **fix(shiftbuilder): engine fills zones after restrooms (v1.0.27)**
- `d075e28` **fix(shiftbuilder): draft placements hide TMs from Placement Pad picker (v1.0.28)**
- `79e18f7` **fix(shiftbuilder): rank engine suggestions by score, not roster order**
- `a22e4e0` **fix(shiftbuilder): enforce prior-3 placement rule in engine filler**
- `2aa3a71` **fix(shiftbuilder): RR covered-by typography + dual coverage A/B labels**

### Fixed — UX states & board load

- Auth-gated mount prevents stale pre-login hydration (`hydratedAssignmentsDayRef` guard)
- Dynamic import `loading` shows `BuilderArtboardSkeletonPreview` instead of `null`
- Additive `authGate.css` states: `.sb-card-populate--d*`, `.sb-empty-slot-hint`, `.sb-day-content-veil`
- `prefers-reduced-motion` disables population animation and day-switch veil

### Fixed — Auth session stability

- `c14d72a` **fix(auth): restore PIN gate login**
- `67057a8` **fix(auth): stop premature session logout**
- `6f0046d` **fix(auth): remove reports access from regular Admin role**
- `23b6366` **fix(auth): restore sudo admin unrestricted access to all nights**

### Fixed — iPad / Safari / canvas

- `f73e1d8` **fix(shiftbuilder): placement pad picker refresh, Safari scroll, trail live update**
- `d411e77` **fix(shiftbuilder): sync fullscreen shell to visualViewport to stop card clipping**
- `6eb88ae` **fix(shiftbuilder): restore fit-scale and fix restroom row clipping in live canvas**
- `ec921d4` **fix(shiftbuilder): fill live canvas via flex layout instead of transform scale**

### Changed — API surface (backward compatible)

| Canonical route | Legacy aliases (still valid) |
|---|---|
| `GET /api/shiftbuilder/night` | `night-core`, `night-secondary` |
| `GET /api/shiftbuilder/roster` | `scheduled-roster` |
| `GET /api/shiftbuilder/config` | slot-defaults, graves-schedule reads |
| `POST /api/shiftbuilder/actions` | mutations, log-change, refresh, histories |
| `GET /api/admin/ops-logs` | sudo_admin only; `GET /api/logs/changes` for Settings tab |

### Removed — Dev artifacts (pre-release cleanup)

- Deleted `archive/`, `__MACOSX`, and `.DS_Store` artifacts from repo tree
- Removed debug `console.log` / `alert()` remnants from production paths

### Security

- CSP, HSTS, X-Frame-Options, Permissions-Policy on `/shiftbuilder` (production)
- Session cookie signing via dedicated `OPS_SESSION_SECRET`
- Mutation endpoints require valid ops session; sudo routes require `requireSudoAdmin`
- PWA service worker registers on HTTPS production only

---

## Pre-1.0.0 history (selected)

Earlier commits through June 2026 built the core ShiftBuilder surface: Tasks Pad, Planning Worksheet print, draft mode, graves-schedule roster rail, break imprints, rotation health, and OMS Settings velvet shell. See `git log` for the full graph.

---

[1.0.0]: https://github.com/gunlakecasino/shiftplanner/releases/tag/v1.0.0
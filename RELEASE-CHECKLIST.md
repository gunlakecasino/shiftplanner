# ShiftBuilder v1.0 — Release Checklist

**Target:** Initial live release to Gun Lake Casino floor team  
**Freeze date:** June 24, 2026  
**Repository:** `gunlakecasino/shiftplanner` (OMS / ShiftBuilder)

---

## UI freeze confirmation

**UI and visual design were left 100% untouched per client instruction.**

This release pass was limited to:

- Deleting `archive/`, `__MACOSX`, and `.DS_Store` artifacts
- Hardening `layout.tsx`, `middleware.ts`, and `globals.css` (non-visual cleanup only)
- Removing debug `console.log` / `alert()` remnants
- Adding production security headers + CSP
- Adding a non-intrusive floating **?** help button and `/shiftbuilder/help` route
- **Final debug pass:** structured logging (`opsLogger`), sudo_admin audit API, API route consolidation
- **UX states polish:** auth-gated client mount, shared skeleton/empty/transition primitives, empty-cards-on-login fix, ~250ms day-switch board transition
- Adding `// v1.0 Release-Ready` markers on touched files

No existing UI components, CSS active rules, layout structure, hooks, stores, or visual design were modified.

---

## Final debug pass — completed items

### Structured logging (`src/lib/opsLogger.ts`)

- [x] Dev: `console.info` / `warn` / `error` with full JSON object payloads
- [x] Production: errors/warns always logged; info only for allowlisted operational events (no spam)
- [x] Applied to: `ops-logs`, `logs/changes`, `log-change`, night/roster handlers, `actions` dispatcher

### Full sudo_admin audit trail

- [x] `GET /api/admin/ops-logs` — **sudo_admin role only** (`requireSudoAdmin`)
- [x] Shows changes from **all operators** (floor viewers, graves ops, sudo) — not filtered to current user
- [x] Filters: `nightDate`, `startDate`/`endDate`, `operator`, `action`, `slotKey`, `limit` (max 1000)
- [x] Response includes `entries`, `operators`, `actions`, `opsUserIds`, `nightDates`, `total`, `queriedBy`
- [x] Legacy `GET /api/logs/changes` retained for `canAccessSudo` (Settings audit tab) — shares query engine

**Wire admin audit tab to sudo-only endpoint** (optional UI change post-freeze):

In `src/app/shiftbuilder/sudo/AuditLogTab.tsx`, change the fetch URL:

```tsx
const res = await fetch(`/api/admin/ops-logs?${params.toString()}`, {
  credentials: "same-origin",
});
```

Query params: `nightDate`, `operator`, `action`, `slotKey`, `limit`.  
For date ranges: `startDate` + `endDate` instead of `nightDate`.

### API route consolidation

Canonical routes (new):

| Route | Purpose |
|---|---|
| `GET /api/shiftbuilder/night?date=&layer=core\|secondary` | Night core + secondary bundles |
| `GET /api/shiftbuilder/roster?date=` | Scheduled roster |
| `GET /api/shiftbuilder/config?resource=` | slot-defaults, graves-schedule, on-call reads |
| `POST /api/shiftbuilder/actions?op=` | mutations, audit, refresh, histories, reports, AI |
| `GET /api/admin/ops-logs` | sudo_admin audit trail |

All legacy `/api/shiftbuilder/*` URLs remain **working aliases** — no client migration required for floor release.  
See `src/app/api/shiftbuilder/_lib/routeMap.ts` for the full map.

---

## UX states polish — completed items

### Empty cards on first login (bug fix)

- [x] **Root cause:** `ShiftBuilderClient` mounted behind `OpsAuthGate` before PIN auth; `useShiftData` hydrated against pre-auth empty night-core, then `hydratedAssignmentsDayRef` blocked re-hydration after login
- [x] **Fix:** `ShiftBuilderAuthenticatedShell` — defers client mount until `!isLoading && user && !must_change_pin`, with `key={user.id}` for clean remount on operator switch
- [x] Wired in `page.tsx` only (additive — no hook/store/client JSX changes)

### Shared state primitives (additive drop-ins)

| File | Purpose |
|---|---|
| `components/state/CardSkeleton.tsx` | Single shared card skeleton (+ `CardSkeletonRow`) |
| `components/state/EmptySlot.tsx` | Soft empty-slot hint overlay (non-blocking) |
| `hooks/useHydrationGuard.ts` | Cold-load guard + population transition helper |
| `components/state/cardPopulationTransition.ts` | Staggered `.sb-card-populate` class helper |
| `components/ShiftBuilderAuthenticatedShell.tsx` | Auth-gated client mount |

- [x] Additive CSS in `authGate.css`: `.sb-card-populate--d*`, `.sb-empty-slot-hint`
- [x] Dynamic import `loading` shows `BuilderArtboardSkeletonPreview` (replaces `null`)

### Pre-deploy verification (UX states)

- [ ] Fresh browser / cleared `oms_ops_session` cookie → PIN login → cards populate **without refresh**
- [ ] Day switch shows skeleton guard then populated cards (no flash of empty chrome)
- [ ] Operator switch remounts client cleanly (`key={user.id}`)
- [ ] `prefers-reduced-motion`: card population animation disabled

### Day-switch inner-content veil (~250ms) — completed items

- [x] `components/state/dayCardContentVeil.ts` — card shells frozen; inner content blurs until **max(250ms, assignments hydrated)**
- [x] `liveCache.ts` — additive `subscribeBoardAssignmentsDayKey` for load-ready signal
- [x] `components/DaySwitchTransitionBridge.tsx` — listens for `day-switch-start` performance marks
- [x] Additive CSS: `.sb-day-content-veil` pins `.sb-day-card-host`; blurs `.assignment-card` interior only
- [x] `prefers-reduced-motion` → no veil

**Pre-deploy verification (day switch):**

- [ ] Card chrome stays fixed (no shell fade/jump); only names/tasks blur then sharpen
- [ ] Slow night fetch → veil holds until data lands (≥250ms minimum)
- [ ] Fast fetch → veil still holds full 250ms before unblur
- [ ] Calendar / unmarked paths: add `dispatchDaySwitchIntent({ dayKey })` one-liner for parity
- [ ] **Reduce Motion** on → instant content, no blur

---

## Prerequisites

- Node.js **≥ 20.9.0**
- pnpm **9.15.9**
- Railway env vars at **build time** for all `NEXT_PUBLIC_*` values

### Required environment variables

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Build + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime only (server) |
| `OPS_SESSION_SECRET` | Runtime only (session cookie signing) |
| `XAI_API_KEY` | Runtime only (optional, AI engine) |

---

## Build commands

```bash
cd /path/to/oms_root
pnpm install
pnpm lint
pnpm build
pnpm start   # http://localhost:3000/shiftbuilder
```

---

## Pre-deploy verification

### 1. Build & type safety

- [ ] `pnpm build` completes with zero TypeScript errors

### 2. Auth & board load

- [ ] `/shiftbuilder` PIN gate works
- [ ] Floor viewer PIN loads board
- [ ] Day selector switches nights

### 3. Floor operations (smoke)

- [ ] Mark unavailable / Clear / Restore / Swap / drag
- [ ] Changes persist after refresh
- [ ] Print preview opens

### 4. Help & onboarding

- [ ] Floating **?** opens interactive tutorial
- [ ] `/shiftbuilder/help` shows Floor Guide + tutorial launcher

### 5. Audit trail (sudo_admin)

- [ ] Sign in as **sudo_admin**
- [ ] `GET /api/admin/ops-logs?nightDate=YYYY-MM-DD` returns 200 with entries
- [ ] Floor user change (assign/unassign) appears with correct `operatorName`
- [ ] Filters work: `operator`, `action`, `slotKey`
- [ ] Non-sudo roles receive **403** from `/api/admin/ops-logs`

### 6. API aliases (backward compatibility)

- [ ] `GET /api/shiftbuilder/night-core?date=` still works
- [ ] `GET /api/shiftbuilder/scheduled-roster?date=` still works
- [ ] `POST /api/shiftbuilder/log-change` still persists audit rows
- [ ] `POST /api/shiftbuilder/mutations` still applies board writes

### 7. Security headers (production)

- [ ] CSP, HSTS, X-Frame-Options, Permissions-Policy on `/shiftbuilder`

### 8. Logging hygiene

- [ ] No raw `console.log` spam during normal floor use
- [ ] Production logs show structured JSON for errors and allowlisted info events

### 9. PWA / iPad

- [ ] SW registers on HTTPS production only
- [ ] Board usable on iPad Safari

---

## Deploy (Railway)

```bash
railway up   # or GitHub auto-deploy
```

Ensure `OPS_SESSION_SECRET` is set (dedicated — not service-role fallback).

---

## Post-deploy sign-off

- [ ] Production URL loads `/shiftbuilder`
- [ ] Floor supervisor iPad test
- [ ] sudo_admin audit trail verified on live data
- [ ] Tag: `v1.0.0-floor-release`

---

## Rollback

1. Railway instant rollback to prior deployment
2. Or redeploy prior git tag/commit

---

*ShiftBuilder v1.0 floor release — June 24, 2026*
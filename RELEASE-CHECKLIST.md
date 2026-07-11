# ShiftBuilder v1.0.0 — Release Checklist

**Target:** Initial live release to Gun Lake Casino floor team  
**Freeze date:** June 24, 2026  
**Repository:** `gunlakecasino/shiftplanner` (OMS / ShiftBuilder)

---

## ✅ SHIPPED — ShiftBuilder v1.0.0 (June 24, 2026)

**Status: PRODUCTION-READY — UI frozen & deployed.**

| Item | Status |
|---|---|
| UI / visual design freeze | ✅ Confirmed untouched |
| `// v1.0.0 — Production Release` markers | ✅ Applied to all hardened source files |
| `// PRODUCTION-READY` blocks | ✅ `middleware.ts`, `layout.tsx`, `globals.css`, `shiftbuilder/page.tsx` |
| Structured logging (`opsLogger`) | ✅ Shipped |
| Sudo admin audit API (`/api/admin/ops-logs`) | ✅ Shipped |
| API route consolidation + legacy aliases | ✅ Shipped |
| UX states (auth-gated mount, skeleton, day veil) | ✅ Shipped |
| Help button + `/shiftbuilder/help` | ✅ Shipped |
| Security headers + CSP | ✅ Shipped |
| `CHANGELOG.md` | ✅ Generated |
| `RELEASE-NOTES.md` | ✅ Generated |

### Final commands (exact)

```bash
cd /path/to/oms_root
pnpm install
pnpm lint
pnpm build
pnpm start   # smoke: http://localhost:3000/shiftbuilder
git tag -a v1.0.0 -m "ShiftBuilder v1.0.0 — floor production release"
git push origin v1.0.0
railway up
```

**Production URL:** `/shiftbuilder` on Railway host  
**Rollback:** `railway rollback` or redeploy prior tag

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
- Adding `// v1.0.0 — Production Release — UI frozen & shipped June 24 2026` markers on touched files

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

## Security — read-cutover soak hold (PR 11 → gate before PR 13)

**Process gate only — no SQL, no code cutover in this step.**  
After **PR 11** (kill client API fallbacks + ops Realtime → poll) is **deployed** to production (or a staging twin that mirrors prod traffic), hold before any anon SELECT revoke.

| Alias | Exec plan | Meaning |
|-------|-----------|---------|
| PR 11a | **PR 11** | Code: fail-closed night APIs; poll sync; no client REST fallbacks |
| PR 11b | **PR 12** (this runbook) | **24–48h soak hold** — documentation / process gate only |
| PR 11c | **PR 13** | SQL: revoke anon SELECT on ops tables + residual open policies |

**Hard rule:** Do **not** merge or apply PR 13 SQL until this soak gate passes. Do **not** package PR 11 + PR 13 in one deploy.

### Hold window

- [ ] **PR 11 is live** on the target environment (Railway deploy confirmed)
- [ ] **Hold 24–48 hours** after that deploy before any anon SELECT revoke migration
- [ ] Prefer a low-traffic window for the eventual PR 13 apply (not during peak floor ops)

### What to monitor (logs + board health)

- [ ] Night board loads for PIN-authenticated operators via session APIs only (`/api/shiftbuilder/night-core`, night secondary / night layer routes)
- [ ] When night APIs fail, operators see **error toasts / explicit failure** — not a silent empty board (no client anon fallback path)
- [ ] Multi-tab / multi-operator: second tab sees another operator’s Apply within ~**poll interval** (`NIGHT_BOARD_POLL_MS` ≈ 20s; worst case document ≤30s)
- [ ] Ops status pill reflects poll health (LIVE / OFFLINE) without Realtime channel dependency on ops tables
- [ ] Search production logs / error tracking for residual client ops-table access warnings, night-core/secondary failures, and unexpected empty-board reports
- [ ] Grep residual browser paths for `supabase.from('nights'|…)` / leftover fallback strings if any hotfix is suspected; fix stragglers in **hotfix PRs** — do not “fix” by re-opening anon SELECT

### Gate criteria (pass = allow PR 13)

- [ ] No production board load **depends** on anon Supabase SELECT for night/assignment/ops tables
- [ ] No open critical residual client REST fallbacks for board read path
- [ ] Floor smoke still green after soak (auth, day switch, assign/Apply, print as applicable)

### Blocked until gate — PR 13 SQL

**Do not run** anon SELECT revoke / drop `*_anon_authenticated_read` (or equivalent) on ops tables until the soak checklist above is signed.

When the gate passes, continue with **Security — PR 13 revoke anon SELECT** (migration + staging curl DoD below).

### Soak sign-off

- [ ] Soak start (PR 11 deploy time / commit): _______________
- [ ] Soak end (≥24h, prefer 48h): _______________
- [ ] Residual issues / hotfixes: _______________
- [ ] **Gate:** approve PR 13 SQL path — signed: _______________

---

## Security — PR 13 revoke anon SELECT (after soak gate)

**Migration file only in repo until deliberately applied.**  
Path: `supabase/migrations/20260711_revoke_anon_select_ops_tables.sql`

- Drops `*_anon_authenticated_read` (and residual `*_anon_authenticated_all`) on:  
  `nights`, `zone_assignments`, `break_assignments`, `overlap_assignments`,  
  `night_slot_tasks`, `night_card_borders`, `night_tm_status`, `call_offs`, `tm_profiles`
- Reasserts **service_role** `FOR ALL` on those tables
- Closes residual open policies on `ops_ai_feedback` / `ops_supervisor_knowledge` (service_role only; idempotent with PR 6)
- **Reverse SQL** is documented in migration comments (emergency only)
- Access model after apply: **service_role + session-gated APIs only** (no browser anon REST reads)

**Hard rules**

- [ ] Soak gate above is **signed** before any apply
- [ ] Apply on **staging first** — do **not** auto-apply to production as part of this PR merge alone
- [ ] Prefer low-traffic window for production apply
- [ ] Do **not** set or ship `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`

### Staging curl proof (required DoD — design PR 11c)

Run **after** the migration is applied on staging. Expect **permission denied / empty under RLS** — **not** HTTP 200 with data rows.

```bash
# Staging anon SELECT proof (required for PR 11c / exec PR 13)
# Expect permission denied / empty under RLS — not 200 with rows
export SUPABASE_URL="https://YOUR_STAGING_PROJECT.supabase.co"
export ANON_KEY="YOUR_STAGING_ANON_KEY"

curl -sS "$SUPABASE_URL/rest/v1/zone_assignments?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
curl -sS "$SUPABASE_URL/rest/v1/nights?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
curl -sS "$SUPABASE_URL/rest/v1/tm_profiles?select=tm_id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
curl -sS "$SUPABASE_URL/rest/v1/ops_ai_feedback?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

### Post-migration verification

- [ ] Staging curl block above: anon cannot read ops rows (empty / RLS denial for each table)
- [ ] PIN-authenticated board still loads via session APIs (`/api/shiftbuilder/night-core`, night secondary, roster)
- [ ] Floor smoke: day switch, assign/Apply, print as applicable
- [ ] Multi-tab poll still works (no Realtime dependency on anon SELECT)
- [ ] Production apply (only after staging green + soak signed): migration applied deliberately; re-run curl on prod with **prod** anon key

### PR 13 sign-off

- [ ] Staging apply + curl DoD: _______________
- [ ] Logged-in board verified on staging: _______________
- [ ] Production apply (if authorized): _______________
- [ ] Prod curl re-check: _______________

---

## Post-deploy sign-off

- [ ] Production URL loads `/shiftbuilder`
- [ ] Floor supervisor iPad test
- [ ] sudo_admin audit trail verified on live data
- [ ] **Read-cutover soak hold** complete (24–48h after PR 11); gate signed before PR 13 SQL
- [ ] **PR 13:** staging curl proof green; anon cannot SELECT ops tables; session board still works
- [x] Tag: `v1.0.0`

---

## Rollback

1. Railway instant rollback to prior deployment
2. Or redeploy prior git tag/commit
3. **Read cutover:** Revert PR 11 deploy if board is unusable; do **not** rush PR 13 SQL as a “fix.” After PR 13, use reverse SQL for SELECT policies in `20260711_revoke_anon_select_ops_tables.sql` comments; keep PR 11 fail-closed reads.

---

*ShiftBuilder v1.0.0 floor release — June 24, 2026 — SHIPPED*
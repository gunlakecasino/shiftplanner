# ShiftBuilder v1.0.0 — Floor Release Notes

**Date:** June 24, 2026  
**Audience:** Gun Lake Casino floor supervisors & graves operations  
**URL:** `/shiftbuilder` on production Railway host

---

## Highlights (one sentence each)

- **PIN login is stable** — sign in once per shift; session stays alive with a 5-minute idle timeout and no more empty boards on first load.
- **Day switching is smoother** — card shells stay fixed while names and tasks blur briefly (~250ms) until the new night’s assignments are ready.
- **Every board change is logged** — sudo admins can pull a full audit trail of who moved whom, when, and on which night.
- **Help is one tap away** — tap the floating **?** for the interactive grave-cover tutorial and the written floor operator guide.
- **Print just works** — official floor sheet, break sheet, and planning worksheet export with coverage A/B labels and call-off restore.
- **Placement engine is rotation-safe** — prior-3 restroom repeat gates, zone fill after RR, and score-ranked suggestions (not roster order).
- **iPad-ready** — PWA install, Safari scroll fixes, and viewport-aware fullscreen so cards don’t clip on the floor tablet.
- **APIs won’t break your bookmarks** — all old `/api/shiftbuilder/*` URLs still work; new canonical routes are faster to maintain.

---

## What did NOT change

Visual design, card layout, colors, fonts, drag-and-drop behavior, and store logic are **frozen** for v1.0.0. This release is hardening and documentation only.

---

## Deploy command

From the project root on Railway (or via GitHub auto-deploy after tag push):

```bash
cd /path/to/oms_root
pnpm install
pnpm lint
pnpm build
railway up
```

**Tag the release:**

```bash
git tag -a v1.0.0 -m "ShiftBuilder v1.0.0 — floor production release"
git push origin v1.0.0
```

**Verify locally before deploy:**

```bash
pnpm start   # http://localhost:3000/shiftbuilder
```

---

## Required environment variables

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Build + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Build + runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only |
| `OPS_SESSION_SECRET` | Session cookie signing (required in prod) |
| `XAI_API_KEY` | Optional — AI placement engine |
| `AUTH_RELAXED_ORIGIN` | Emergency only (`1`) — temporary Host-only auth origin break-glass for headerless WebViews; remove after soak |

---

## Support

- Floor guide: `/shiftbuilder/help`
- Full checklist: `RELEASE-CHECKLIST.md`
- Change history: `CHANGELOG.md`

---

*ShiftBuilder v1.0.0 — shipped June 24, 2026. UI frozen.*
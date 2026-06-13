# UI/UX Development for ShiftPlanner (Velvet / OMS)

This project has an extremely custom, high-fidelity UI/UX (sacred 1056×816 Golden artboard, PlacementPad with live xAI + matrix, custom cards, drag, iPad sheets, print fidelity, etc.).

## Frontman — Visual AI UI/UX Tool (Next.js 16+ setup)

**Frontman** (https://frontman.sh) is integrated using the **official Next.js 16 "proxy" convention** (`proxy.ts` at project root).

### Why `proxy.ts` (not middleware.ts)?

- Next.js 16 deprecates the old `middleware.ts` convention for tools that need full Node.js capabilities (see the warning: "The 'middleware' file convention is deprecated. Please use 'proxy' instead.").
- Frontman requires Node APIs (file system access for source edits, `process.cwd()`, etc.).
- Putting it in the traditional `middleware.ts` caused it to be evaluated under the **Edge runtime**, producing:
  - `Cannot read properties of undefined (reading 'write')`
  - "Ecmascript file had an error"
  - Broken `/frontman` 404s
  - Cascading HMR "module factory is not available" failures (for _app, _error, etc.)

The dedicated `proxy.ts` with `runtime: 'nodejs'` solves this.

Regular middleware concerns (dev no-cache for HMR health, icon rewrites, security headers, prod cache hints) remain in `src/middleware.ts`.

### How to use

1. `pnpm dev`
2. Open your app (e.g. `/shiftbuilder`)
3. In another tab: `http://localhost:3000/frontman`
4. Click any live element on the Golden artboard / PlacementPad / cards and describe the change in plain English.

### Configuration

```ts
// proxy.ts
const frontman = createMiddleware({
  projectRoot: process.env.PROJECT_ROOT || process.cwd(),
});
```

- `PROJECT_ROOT` env var is supported for monorepos.
- In normal single-app dev, the fallback to `process.cwd()` is sufficient (and safe because this file forces Node runtime).

See `proxy.ts` and the cleaned `src/middleware.ts` for details.

---

## Other UI/UX Development Practices

(keep the rest of the original content about Golden contract, narrow subscriptions, print fidelity, iPad, effects, etc.)

## Frontman — Visual AI UI/UX Tool

Frontman is integrated using the **recommended Next.js 16+ "proxy" convention** (see `proxy.ts` at project root).

- This uses `runtime: 'nodejs'` explicitly so that Frontman can use Node APIs (`process.cwd()`, file editing, etc.).
- Regular middleware logic lives in `src/middleware.ts` (dev no-cache headers for HMR stability, icon fallbacks, security headers, etc.).
- Access at `/frontman` while `pnpm dev` is running.

The old approach of putting Frontman inside `middleware.ts` triggered the deprecation warning and Edge runtime crashes ("Cannot read properties of undefined (reading 'write')", "Ecmascript file had an error", broken `/frontman` 404s, and cascading HMR module factory failures).

### Environment variable (optional)

```bash
PROJECT_ROOT=$(pwd) pnpm dev
```

Useful in monorepos. The proxy falls back to `process.cwd()`.

See also the comments in `proxy.ts` and `src/middleware.ts`.
import type { ShiftBuilderPermissions } from "./opsAuth";

/** Operator surface after PIN authentication. */
export type OpsSurface = "admin" | "team";

const ADMIN_PREFIXES = ["/shiftbuilder/settings", "/shiftbuilder/reports"] as const;
const TEAM_HOME = "/shiftbuilder";
const ADMIN_HOME = "/shiftbuilder";

export function resolveOpsSurface(permissions: ShiftBuilderPermissions): OpsSurface {
  return permissions.canAccessSudo ? "admin" : "team";
}

/** Default landing route immediately after a successful PIN entry. */
export function homeRouteForSurface(surface: OpsSurface): string {
  return surface === "admin" ? ADMIN_HOME : TEAM_HOME;
}

/** Returns a redirect target when the operator cannot access `pathname`, else null. */
export function guardAuthenticatedRoute(
  pathname: string,
  surface: OpsSurface,
): string | null {
  if (surface === "team" && ADMIN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return TEAM_HOME;
  }
  return null;
}

/** Post-login destination: honor admin deep links; team always lands on canvas. */
export function postPinDestination(
  pathname: string,
  permissions: ShiftBuilderPermissions,
): string {
  const surface = resolveOpsSurface(permissions);
  const guarded = guardAuthenticatedRoute(pathname, surface);
  if (guarded) return guarded;
  if (!pathname || pathname === "/") return homeRouteForSurface(surface);
  return pathname;
}

export function isAdminRoute(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
}
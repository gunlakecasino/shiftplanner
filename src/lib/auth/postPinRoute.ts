import type { ShiftBuilderPermissions } from "./opsAuth";

/** Operator surface after PIN authentication. */
export type OpsSurface = "sudo" | "admin" | "reports" | "team";

const BUILDER_HOME = "/shiftbuilder";
const REPORTS_HOME = "/shiftbuilder/reports";
const SETTINGS_PREFIX = "/shiftbuilder/settings";
const GRAVES_SCHEDULE_PREFIX = "/shiftbuilder/graves-schedule";
const PROJECTS_PREFIX = "/shiftbuilder/projects";
const TEAM_PREFIX = "/shiftbuilder/team";

export function resolveOpsSurface(permissions: ShiftBuilderPermissions): OpsSurface {
  if (permissions.canAccessSudo) return "sudo";
  if (permissions.canAccessReports && permissions.canEditPublishedOnly) return "admin";
  if (permissions.canAccessReports) return "reports";
  return "team";
}

/** Default landing route immediately after a successful PIN entry. */
export function homeRouteForSurface(surface: OpsSurface): string {
  if (surface === "reports") return REPORTS_HOME;
  return BUILDER_HOME;
}

function isReportsPath(pathname: string): boolean {
  return pathname.startsWith(REPORTS_HOME);
}

function isSettingsPath(pathname: string): boolean {
  return pathname.startsWith(SETTINGS_PREFIX);
}

function isGravesSchedulePath(pathname: string): boolean {
  return pathname.startsWith(GRAVES_SCHEDULE_PREFIX);
}

/**
 * /shiftbuilder/projects has its own independent canAccessTasks gate (see
 * ProjectsClient.tsx), the same way Reports gates itself on top of whatever
 * this surface router allows. Every surface below exempts it so a per-user
 * permission override (canAccessTasks without canAccessSudo/canAccessReports)
 * still reaches the page instead of being bounced by surface routing.
 */
function isProjectsPath(pathname: string): boolean {
  return pathname.startsWith(PROJECTS_PREFIX);
}

/**
 * /shiftbuilder/team self-gates on canManageTeam / canApplySchedules (see
 * TeamClient.tsx), so — like Projects — every surface exempts it and lets the
 * page decide. This is what lets a canManageTeam-only operator reach the roster.
 */
function isTeamPath(pathname: string): boolean {
  return pathname.startsWith(TEAM_PREFIX);
}

/** Returns a redirect target when the operator cannot access `pathname`, else null. */
export function guardAuthenticatedRoute(
  pathname: string,
  surface: OpsSurface,
): string | null {
  if (isProjectsPath(pathname)) return null;
  if (isTeamPath(pathname)) return null;

  if (surface === "team") {
    if (isSettingsPath(pathname) || isReportsPath(pathname) || isGravesSchedulePath(pathname)) {
      return BUILDER_HOME;
    }
    return null;
  }

  if (surface === "admin") {
    if (isSettingsPath(pathname) || isGravesSchedulePath(pathname)) return BUILDER_HOME;
    return null;
  }

  if (surface === "reports") {
    if (isSettingsPath(pathname)) return REPORTS_HOME;
    if (pathname.startsWith("/shiftbuilder") && !isReportsPath(pathname)) {
      return REPORTS_HOME;
    }
    return null;
  }

  return null;
}

/** Post-login destination: honor deep links the operator is allowed to use. */
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
  return isSettingsPath(pathname);
}

export function isReportsRoute(pathname: string): boolean {
  return isReportsPath(pathname);
}
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  guardAuthenticatedRoute,
  homeRouteForSurface,
  postPinDestination,
  resolveOpsSurface,
} from "./postPinRoute";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";

const reportsOnly: ShiftBuilderPermissions = {
  canEditAssignments: false,
  canLockUnlock: false,
  canApplySchedules: false,
  canPublish: false,
  canSeeDraftData: false,
  canAccessSudo: false,
  canAccessReports: true,
  canRunEngine: false,
  canManageTeam: false,
  canEditPublishedOnly: false,
};

const adminRole: ShiftBuilderPermissions = {
  canEditAssignments: true,
  canLockUnlock: false,
  canApplySchedules: false,
  canPublish: false,
  canSeeDraftData: false,
  canAccessSudo: false,
  canAccessReports: true,
  canRunEngine: false,
  canManageTeam: false,
  canEditPublishedOnly: true,
};

const sudoAdmin: ShiftBuilderPermissions = {
  canEditAssignments: true,
  canLockUnlock: true,
  canApplySchedules: true,
  canPublish: true,
  canSeeDraftData: true,
  canAccessSudo: true,
  canAccessReports: true,
  canRunEngine: true,
  canManageTeam: true,
  canEditPublishedOnly: false,
};

const teamViewer: ShiftBuilderPermissions = {
  canEditAssignments: true,
  canLockUnlock: false,
  canApplySchedules: false,
  canPublish: false,
  canSeeDraftData: false,
  canAccessSudo: false,
  canAccessReports: false,
  canRunEngine: false,
  canManageTeam: false,
  canEditPublishedOnly: true,
};

describe("resolveOpsSurface", () => {
  it("maps sudo, admin, reports, and team surfaces", () => {
    expect(resolveOpsSurface(sudoAdmin)).toBe("sudo");
    expect(resolveOpsSurface(adminRole)).toBe("admin");
    expect(resolveOpsSurface(reportsOnly)).toBe("reports");
    expect(resolveOpsSurface(teamViewer)).toBe("team");
  });
});

describe("homeRouteForSurface", () => {
  it("sends reports-only operators to /shiftbuilder/reports", () => {
    expect(homeRouteForSurface("reports")).toBe("/shiftbuilder/reports");
    expect(homeRouteForSurface("admin")).toBe("/shiftbuilder");
    expect(homeRouteForSurface("sudo")).toBe("/shiftbuilder");
    expect(homeRouteForSurface("team")).toBe("/shiftbuilder");
  });
});

describe("guardAuthenticatedRoute", () => {
  it("allows admin on canvas and reports but blocks settings", () => {
    expect(guardAuthenticatedRoute("/shiftbuilder", "admin")).toBeNull();
    expect(guardAuthenticatedRoute("/shiftbuilder/reports", "admin")).toBeNull();
    expect(guardAuthenticatedRoute("/shiftbuilder/settings", "admin")).toBe(
      "/shiftbuilder",
    );
  });

  it("redirects reports-only operators away from canvas and settings", () => {
    expect(guardAuthenticatedRoute("/shiftbuilder", "reports")).toBe(
      "/shiftbuilder/reports",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder/settings", "reports")).toBe(
      "/shiftbuilder/reports",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder/reports", "reports")).toBeNull();
  });

  it("redirects team operators away from reports, settings, and graves schedule", () => {
    expect(guardAuthenticatedRoute("/shiftbuilder/reports", "team")).toBe(
      "/shiftbuilder",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder/settings", "team")).toBe(
      "/shiftbuilder",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder/graves-schedule", "team")).toBe(
      "/shiftbuilder",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder", "team")).toBeNull();
  });

  it("redirects admin away from settings and graves schedule", () => {
    expect(guardAuthenticatedRoute("/shiftbuilder/graves-schedule", "admin")).toBe(
      "/shiftbuilder",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder/settings", "admin")).toBe(
      "/shiftbuilder",
    );
    expect(guardAuthenticatedRoute("/shiftbuilder", "admin")).toBeNull();
  });

  it("allows sudo operators everywhere under shiftbuilder", () => {
    expect(guardAuthenticatedRoute("/shiftbuilder", "sudo")).toBeNull();
    expect(guardAuthenticatedRoute("/shiftbuilder/reports", "sudo")).toBeNull();
    expect(guardAuthenticatedRoute("/shiftbuilder/settings", "sudo")).toBeNull();
  });
});

describe("postPinDestination", () => {
  it("lands admin on canvas by default but honors reports deep links", () => {
    expect(postPinDestination("/", adminRole)).toBe("/shiftbuilder");
    expect(postPinDestination("/shiftbuilder/reports", adminRole)).toBe(
      "/shiftbuilder/reports",
    );
    expect(postPinDestination("/shiftbuilder/settings", adminRole)).toBe(
      "/shiftbuilder",
    );
  });

  it("lands reports-only operators on reports after PIN", () => {
    expect(postPinDestination("/shiftbuilder", reportsOnly)).toBe(
      "/shiftbuilder/reports",
    );
    expect(postPinDestination("/", reportsOnly)).toBe("/shiftbuilder/reports");
  });
});
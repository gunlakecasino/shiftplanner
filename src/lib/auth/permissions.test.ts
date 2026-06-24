// @ts-nocheck
import { describe, it, expect } from "vitest";
import { getEffectivePermissions } from "./permissions";

describe("getEffectivePermissions", () => {
  it("canonicalizes admin role — legacy sudo overrides cannot widen access", () => {
    const effective = getEffectivePermissions({
      id: "u1",
      email: "",
      full_name: "Ops Admin",
      username: "opsadmin",
      role: "admin",
      permissions: {
        canAccessSudo: true,
        canSeeDraftData: true,
        canPublish: true,
        canEditPublishedOnly: false,
        canAccessReports: false,
      },
    });

    expect(effective.canAccessSudo).toBe(false);
    expect(effective.canAccessReports).toBe(true);
    expect(effective.canSeeDraftData).toBe(false);
    expect(effective.canEditPublishedOnly).toBe(true);
    expect(effective.canEditAssignments).toBe(true);
  });

  it("canonicalizes viewer role", () => {
    const effective = getEffectivePermissions({
      id: "u2",
      email: "",
      full_name: "Floor",
      username: "floor1",
      role: "viewer",
      permissions: {
        canSeeDraftData: true,
        canAccessReports: true,
      },
    });

    expect(effective.canSeeDraftData).toBe(false);
    expect(effective.canAccessReports).toBe(false);
    expect(effective.canEditPublishedOnly).toBe(true);
  });
});
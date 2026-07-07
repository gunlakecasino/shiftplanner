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
    expect(effective.canAccessReports).toBe(false);
    expect(effective.canSeeDraftData).toBe(false);
    expect(effective.canEditPublishedOnly).toBe(true);
    expect(effective.canEditAssignments).toBe(true);
  });

  it("does not grant admin reports even when overrides request it", () => {
    const effective = getEffectivePermissions({
      id: "u1b",
      email: "",
      full_name: "Ops Admin",
      username: "opsadmin2",
      role: "admin",
      permissions: { canAccessReports: true },
    });
    expect(effective.canAccessReports).toBe(false);
  });

  it("walls admin off from the Projects/tasks system, even with overrides that request access", () => {
    const effective = getEffectivePermissions({
      id: "u1c",
      email: "",
      full_name: "Ops Admin",
      username: "opsadmin3",
      role: "admin",
      permissions: {
        canAccessTasks: true,
        canManageTasks: true,
        canCompleteOwnTasks: true,
      },
    });

    expect(effective.canAccessTasks).toBe(false);
    expect(effective.canManageTasks).toBe(false);
    expect(effective.canCompleteOwnTasks).toBe(false);
    expect(effective.canEditAssignments).toBe(true);
    // Admin is not a requester either (request module is aimed at non-managers).
    expect(effective.canRequestTasks).toBe(false);
  });

  it("canonicalizes sudo_admin — legacy overrides cannot restrict draft access", () => {
    const effective = getEffectivePermissions({
      id: "u0",
      email: "",
      full_name: "Brian",
      username: "brian",
      role: "sudo_admin",
      permissions: {
        canAccessSudo: false,
        canSeeDraftData: false,
        canEditPublishedOnly: true,
        canAccessReports: false,
        canPublish: false,
      },
    });

    expect(effective.canAccessSudo).toBe(true);
    expect(effective.canSeeDraftData).toBe(true);
    expect(effective.canEditPublishedOnly).toBe(false);
    expect(effective.canAccessReports).toBe(true);
    expect(effective.canPublish).toBe(true);
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

  it("walls viewer off from the Projects/tasks system, even with overrides that request access", () => {
    const effective = getEffectivePermissions({
      id: "u3",
      email: "",
      full_name: "Floor",
      username: "floor2",
      role: "viewer",
      permissions: {
        canAccessTasks: true,
        canManageTasks: true,
        canCompleteOwnTasks: true,
      },
    });

    expect(effective.canAccessTasks).toBe(false);
    expect(effective.canManageTasks).toBe(false);
    expect(effective.canCompleteOwnTasks).toBe(false);
    // Board deployment work is unaffected — viewers still place TMs.
    expect(effective.canEditAssignments).toBe(true);
    // Narrow intake door stays open for viewers.
    expect(effective.canRequestTasks).toBe(true);
  });

  it("grants viewers the request-task intake door but nothing else task-related", () => {
    const effective = getEffectivePermissions({
      id: "u4",
      email: "",
      full_name: "Floor",
      username: "floor3",
      role: "viewer",
      permissions: null,
    });

    expect(effective.canRequestTasks).toBe(true);
    expect(effective.canAccessTasks).toBe(false);
    expect(effective.canManageTasks).toBe(false);
  });
});
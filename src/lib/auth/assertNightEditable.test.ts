// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShiftBuilderPermissions } from "./opsAuthTypes";
import {
  assertActorCanReadNight,
  assertActorCanEditNight,
} from "./assertNightEditable.server";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";

vi.mock("@/app/api/admin/_lib/createAdminClient", () => ({
  createAdminClientSafe: vi.fn(),
}));

const viewer: ShiftBuilderPermissions = {
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

const admin: ShiftBuilderPermissions = {
  ...viewer,
  canAccessReports: true,
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

const planner: ShiftBuilderPermissions = {
  ...viewer,
  canEditPublishedOnly: false,
  canPublish: true,
};

function mockNightStatus(status: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: status ? { status } : null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  vi.mocked(createAdminClientSafe).mockReturnValue({ from } as never);
}

describe("assertActorCanReadNight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows sudo admin to read draft nights without status lookup", async () => {
    const result = await assertActorCanReadNight(sudoAdmin, { date: "2026-06-20" });
    expect(result).toEqual({ ok: true });
    expect(createAdminClientSafe).not.toHaveBeenCalled();
  });

  it("allows planners to read draft nights", async () => {
    mockNightStatus("draft");
    const result = await assertActorCanReadNight(planner, { date: "2026-06-20" });
    expect(result).toEqual({ ok: true });
    expect(createAdminClientSafe).not.toHaveBeenCalled();
  });

  it("blocks viewers from unpublished nights", async () => {
    mockNightStatus("draft");
    const result = await assertActorCanReadNight(viewer, { date: "2026-06-20" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unpublished");
    }
  });

  it("blocks admin from unpublished nights", async () => {
    mockNightStatus("draft");
    const result = await assertActorCanReadNight(admin, { date: "2026-06-20" });
    expect(result.ok).toBe(false);
  });

  it("allows viewers on published nights", async () => {
    mockNightStatus("published");
    const result = await assertActorCanReadNight(viewer, { date: "2026-06-20" });
    expect(result).toEqual({ ok: true });
  });

  it("blocks viewers when no night row exists", async () => {
    mockNightStatus(null);
    const result = await assertActorCanReadNight(viewer, { nightId: "night-1" });
    expect(result.ok).toBe(false);
  });
});

describe("assertActorCanEditNight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows planners to edit draft nights", async () => {
    mockNightStatus("draft");
    const result = await assertActorCanEditNight(planner, { date: "2026-06-20" });
    expect(result).toEqual({ ok: true });
  });

  it("blocks viewers from editing unpublished nights", async () => {
    mockNightStatus("draft");
    const result = await assertActorCanEditNight(viewer, { date: "2026-06-20" });
    expect(result.ok).toBe(false);
  });

  it("allows viewers to edit published nights", async () => {
    mockNightStatus("published");
    const result = await assertActorCanEditNight(viewer, { date: "2026-06-20" });
    expect(result).toEqual({ ok: true });
  });
});
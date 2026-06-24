// @ts-nocheck
import { describe, it, expect } from "vitest";
import { isPublishedOnlyViewer, nightFetchOptionsForPermissions } from "./viewerNightPolicy";

describe("viewerNightPolicy", () => {
  it("detects published-only viewers", () => {
    expect(
      isPublishedOnlyViewer({ canEditPublishedOnly: true, canSeeDraftData: false }),
    ).toBe(true);
  });

  it("excludes planners and draft-capable roles", () => {
    expect(
      isPublishedOnlyViewer({ canEditPublishedOnly: false, canSeeDraftData: false }),
    ).toBe(false);
    expect(
      isPublishedOnlyViewer({ canEditPublishedOnly: true, canSeeDraftData: true }),
    ).toBe(false);
  });

  it("maps permissions to fetch options", () => {
    expect(
      nightFetchOptionsForPermissions({
        canEditPublishedOnly: true,
        canSeeDraftData: false,
      }),
    ).toEqual({ publishedOnlyPolicy: true });
  });
});
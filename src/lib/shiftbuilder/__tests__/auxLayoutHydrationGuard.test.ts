import { describe, expect, it } from "vitest";
import { shouldPersistAuxLayout } from "../auxLayoutHydrationGuard";

describe("shouldPersistAuxLayout", () => {
  it("blocks persist before night-core hydration (default shell race)", () => {
    expect(
      shouldPersistAuxLayout({
        hydrated: false,
        hydratedDayKey: null,
        currentDayKey: "2026-07-11",
        layoutLength: 6,
      }),
    ).toBe(false);
  });

  it("allows persist after hydrate for the same day", () => {
    expect(
      shouldPersistAuxLayout({
        hydrated: true,
        hydratedDayKey: "2026-07-11",
        currentDayKey: "2026-07-11",
        layoutLength: 6,
      }),
    ).toBe(true);
  });

  it("blocks persist when day switched under an in-flight save", () => {
    expect(
      shouldPersistAuxLayout({
        hydrated: true,
        hydratedDayKey: "2026-07-10",
        currentDayKey: "2026-07-11",
        layoutLength: 6,
      }),
    ).toBe(false);
  });

  it("blocks empty layouts", () => {
    expect(
      shouldPersistAuxLayout({
        hydrated: true,
        hydratedDayKey: "2026-07-11",
        currentDayKey: "2026-07-11",
        layoutLength: 0,
      }),
    ).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pinGate = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/PinGate.tsx"),
  "utf8",
);
const pinChange = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/PinChangeGate.tsx"),
  "utf8",
);
const authCss = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/authGate.css"),
  "utf8",
);

describe("PinGate desk — corporate ops console", () => {
  it("is a quiet paper card with SheetBuilder / Ops PIN and no theater", () => {
    expect(pinGate).toContain("sb-auth-card--desk");
    expect(pinGate).toContain("SheetBuilder");
    expect(pinGate).toContain("Ops PIN");
    expect(pinGate).toContain('"Enter"');
    expect(pinGate).not.toContain("sb-auth-accent");
    expect(pinGate).not.toContain("sb-auth-icon");
    expect(pinGate).not.toContain("sb-auth-slots");
    expect(pinGate).not.toContain("SheetBuilder Access");
    expect(pinGate).not.toContain("SIGNED IN");
    expect(pinGate).not.toContain("VERIFYING");
    expect(pinGate).not.toContain("animate-shake");
    expect(pinGate).not.toContain("errorFlash");
    expect(pinGate).toContain("cleaned.length === 6");
  });

  it("scrubs matching PIN-change theater and hides leftover auth chrome", () => {
    expect(pinChange).toContain("sb-auth-card--desk");
    expect(pinChange).not.toContain("sb-auth-accent");
    expect(pinChange).not.toContain("sb-auth-slots");
    expect(authCss).toContain("quiet desk paper");
    expect(authCss).toMatch(/\.sb-auth-slots \{[\s\S]*display: none !important/);
  });
});

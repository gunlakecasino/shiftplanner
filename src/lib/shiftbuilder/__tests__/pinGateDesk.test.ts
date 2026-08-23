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
const opsAuthGate = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/components/OpsAuthGate.tsx"),
  "utf8",
);
const authCss = readFileSync(
  resolve(process.cwd(), "src/app/shiftbuilder/authGate.css"),
  "utf8",
);
const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("PinGate desk — corporate ops console", () => {
  it("is a quiet paper card with SheetBuilder / Ops PIN and no theater", () => {
    expect(pinGate).toContain("sb-auth-card--desk");
    expect(pinGate).toContain("SheetBuilder");
    expect(pinGate).toContain("Ops PIN");
    expect(pinGate).toContain('"Enter"');
    expect(pinGate).toContain("sr-only");
    expect(pinGate).not.toContain("sb-auth-accent");
    expect(pinGate).not.toContain("sb-auth-icon");
    expect(pinGate).not.toContain("sb-auth-slots");
    expect(pinGate).not.toContain("SheetBuilder Access");
    expect(pinGate).not.toContain("6-digit PIN");
    expect(pinGate).not.toContain("6-DIGIT PIN");
    expect(pinGate).not.toContain("SIGNED IN");
    expect(pinGate).not.toContain("VERIFYING");
    expect(pinGate).not.toContain("animate-shake");
    expect(pinGate).not.toContain("errorFlash");
    expect(pinGate).not.toContain("••••••");
    expect(pinGate).not.toContain("check_circle");
    expect(pinGate).not.toMatch(/\block\b/);
    expect(pinGate).toContain("cleaned.length === 6");
  });

  it("does not paint skeleton, blur, or accent theater behind the PIN card", () => {
    expect(opsAuthGate).toContain("sb-auth-desk");
    expect(opsAuthGate).not.toContain("BuilderLoadingShell");
    expect(opsAuthGate).not.toContain("backdropFilter");
    expect(opsAuthGate).not.toContain("WebkitBackdropFilter");
    expect(opsAuthGate).not.toContain("sb-auth-pin-scrim");
    expect(opsAuthGate).not.toContain("sb-auth-accent");
    expect(opsAuthGate).not.toContain("sb-auth-icon");
    expect(opsAuthGate).not.toContain("warning");
    expect(authCss).toContain("background: #E8E0D2");
    expect(authCss).toContain("background: #FBF7F0");
    expect(authCss).not.toContain("backdrop-filter");
    expect(authCss).not.toContain("sb-accent-drift");
    expect(authCss).not.toContain("sb-icon-breathe");
    expect(authCss).not.toContain("sb-slot-error-flash");
    expect(authCss).not.toContain("linear-gradient(180deg, #3f3f46");
  });

  it("scrubs matching PIN-change theater", () => {
    expect(pinChange).toContain("sb-auth-card--desk");
    expect(pinChange).toContain("Set PIN");
    expect(pinChange).toContain('"Save"');
    expect(pinChange).not.toContain("sb-auth-accent");
    expect(pinChange).not.toContain("sb-auth-slots");
    expect(pinChange).not.toContain("SAVING PIN");
    expect(authCss).toContain("quiet desk paper");
  });

  it("does not keep PIN theater classes in globals.css", () => {
    expect(globalsCss).not.toContain("sb-auth-card--access");
    expect(globalsCss).not.toContain("sb-auth-accent");
    expect(globalsCss).not.toContain("sb-auth-slot");
    expect(globalsCss).not.toContain("sb-auth-icon");
    expect(globalsCss).not.toContain("sb-auth-input--compact");
    expect(globalsCss).not.toContain("errorFlash");
    expect(globalsCss).not.toContain("SheetBuilder Access");
    expect(authCss).not.toContain("sb-auth-card--access");
    expect(authCss).not.toContain("sb-auth-accent");
    expect(authCss).not.toContain("sb-auth-slot");
    expect(authCss).not.toContain("VERIFYING");
    expect(authCss).not.toContain("SIGNED IN");
  });
});

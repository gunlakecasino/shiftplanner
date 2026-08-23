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

describe("PinGate — modern lightweight ops console", () => {
  it("is SheetBuilder + short ops line + PIN + Enter, with no theater", () => {
    expect(pinGate).toContain("sb-auth-form");
    expect(pinGate).toContain("SheetBuilder");
    expect(pinGate).toContain("Gun Lake graves ops.");
    expect(pinGate).toContain("sb-auth-field-label");
    expect(pinGate).toMatch(/sb-auth-field-label">\s*PIN\s*</);
    expect(pinGate).toContain('"Enter"');
    expect(pinGate).not.toContain("sb-auth-card--desk");
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

  it("does not paint skeleton, blur, or dusty beige behind the PIN form", () => {
    expect(opsAuthGate).toContain("sb-auth-split");
    expect(opsAuthGate).toContain("sb-auth-visual");
    expect(opsAuthGate).toContain("Graves night board");
    expect(opsAuthGate).not.toContain("BuilderLoadingShell");
    expect(opsAuthGate).not.toContain("backdropFilter");
    expect(opsAuthGate).not.toContain("WebkitBackdropFilter");
    expect(opsAuthGate).not.toContain("sb-auth-pin-scrim");
    expect(opsAuthGate).not.toContain("sb-auth-desk");
    expect(opsAuthGate).not.toContain("sb-auth-accent");
    expect(opsAuthGate).not.toContain("sb-auth-icon");
    expect(opsAuthGate).not.toContain("warning");
    expect(opsAuthGate).not.toContain("vault");
    expect(opsAuthGate).not.toContain("Sign In");
    expect(opsAuthGate).not.toContain("Signup");
    expect(authCss).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)");
    expect(authCss).toContain("background: #007AFF");
    expect(authCss).not.toContain("#E8E0D2");
    expect(authCss).not.toContain("#FBF7F0");
    expect(authCss).not.toContain("#F4EFE6");
    expect(authCss).not.toContain("backdrop-filter");
    expect(authCss).not.toContain("sb-accent-drift");
    expect(authCss).not.toContain("sb-icon-breathe");
    expect(authCss).not.toContain("sb-slot-error-flash");
    expect(authCss).not.toContain("linear-gradient(180deg, #3f3f46");
  });

  it("scrubs matching PIN-change theater", () => {
    expect(pinChange).toContain("sb-auth-form");
    expect(pinChange).toContain("Set PIN");
    expect(pinChange).toContain('"Save"');
    expect(pinChange).not.toContain("sb-auth-accent");
    expect(pinChange).not.toContain("sb-auth-slots");
    expect(pinChange).not.toContain("SAVING PIN");
    expect(authCss).toContain("modern lightweight ops console");
  });

  it("closes the live-sit PIN kill-list on a corporate split console", () => {
    expect(opsAuthGate).not.toContain("backdropFilter");
    expect(opsAuthGate).not.toContain("BuilderLoadingShell");
    expect(authCss).not.toContain("backdrop-filter");
    expect(authCss).toContain("visibility: hidden");
    expect(authCss).toMatch(/\.sb-auth-form::before,[\s\S]*content: none !important/);
    expect(authCss).not.toContain("rounded-[26px]");
    expect(pinGate).not.toContain("sb-auth-icon");
    expect(pinGate).not.toMatch(/\block\b/);
    expect(pinGate).not.toContain("SheetBuilder Access");
    expect(pinGate).not.toContain("6-digit PIN");
    expect(pinGate).not.toContain("••••••");
    expect(pinGate).not.toContain("sb-auth-slots");
    expect(pinGate).toContain('"Enter"');
    expect(pinGate).not.toContain("ENTER");
    expect(pinGate).not.toContain("arrow_forward");
    expect(authCss).toContain("text-transform: none");
    expect(authCss).toContain("color: #6B7280");
    expect(authCss).toContain("color: #111827");
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

  it("keeps the right panel as a quiet graves floor, not product marketing", () => {
    expect(opsAuthGate).toContain("#ffcc00");
    expect(opsAuthGate).toContain("#ff3b30");
    expect(opsAuthGate).toContain("#007aff");
    expect(opsAuthGate).toContain("#34c759");
    expect(opsAuthGate).not.toContain("SmartSave");
    expect(opsAuthGate).not.toContain("Continue With");
    expect(authCss).toContain("sb-auth-floor");
    expect(authCss).toContain("display: none");
  });
});

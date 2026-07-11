import { afterEach, describe, expect, it } from "vitest";
import {
  checkOpsApiRateLimit,
  completeRateLimitPerMin,
  DEFAULT_COMPLETE_PER_MIN,
  DEFAULT_VERIFY_PIN_PER_MIN,
  rateLimitFromEnv,
  verifyPinRateLimitPerMin,
} from "./rateLimit";

const ENV_KEYS = ["OPS_RATE_VERIFY_PIN_PER_MIN", "OPS_RATE_COMPLETE_PER_MIN"] as const;

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("rateLimitFromEnv", () => {
  it("returns fallback when unset", () => {
    expect(rateLimitFromEnv("OPS_RATE_VERIFY_PIN_PER_MIN", 8)).toBe(8);
  });

  it("parses positive integers", () => {
    process.env.OPS_RATE_VERIFY_PIN_PER_MIN = "20";
    expect(rateLimitFromEnv("OPS_RATE_VERIFY_PIN_PER_MIN", 8)).toBe(20);
  });

  it("rejects zero, negative, and non-numeric", () => {
    process.env.OPS_RATE_COMPLETE_PER_MIN = "0";
    expect(rateLimitFromEnv("OPS_RATE_COMPLETE_PER_MIN", 30)).toBe(30);
    process.env.OPS_RATE_COMPLETE_PER_MIN = "-5";
    expect(rateLimitFromEnv("OPS_RATE_COMPLETE_PER_MIN", 30)).toBe(30);
    process.env.OPS_RATE_COMPLETE_PER_MIN = "nope";
    expect(rateLimitFromEnv("OPS_RATE_COMPLETE_PER_MIN", 30)).toBe(30);
  });
});

describe("named limit helpers", () => {
  it("defaults match design (verify-pin 8, complete 30)", () => {
    expect(DEFAULT_VERIFY_PIN_PER_MIN).toBe(8);
    expect(DEFAULT_COMPLETE_PER_MIN).toBe(30);
    expect(verifyPinRateLimitPerMin()).toBe(8);
    expect(completeRateLimitPerMin()).toBe(30);
  });

  it("honors env overrides", () => {
    process.env.OPS_RATE_VERIFY_PIN_PER_MIN = "12";
    process.env.OPS_RATE_COMPLETE_PER_MIN = "60";
    expect(verifyPinRateLimitPerMin()).toBe(12);
    expect(completeRateLimitPerMin()).toBe(60);
  });
});

describe("checkOpsApiRateLimit", () => {
  it("allows up to max then 429s with retryAfterSec", () => {
    const key = `test-bucket-${Date.now()}-${Math.random()}`;
    expect(checkOpsApiRateLimit(key, 2).ok).toBe(true);
    expect(checkOpsApiRateLimit(key, 2).ok).toBe(true);
    const blocked = checkOpsApiRateLimit(key, 2);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    }
  });
});

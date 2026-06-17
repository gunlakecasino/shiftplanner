"use client";

import { useEffect, useRef, useState } from "react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { cn } from "@/lib/utils";

/**
 * PIN entry for the /today deployment board.
 * Uses the same OpsAuth backend as the scheduling system — no links to other routes.
 */
export function TodayPinGate() {
  const { login, isLoading: authLoading } = useOpsAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isComplete = pin.length === 6;
  const submitting = isSubmitting || authLoading;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || submitting) return;

    setError(null);
    setIsSubmitting(true);
    const result = await login(pin);
    if (!result.success) {
      setError(result.error || "Invalid PIN");
      setPin("");
      inputRef.current?.focus();
    }
    setIsSubmitting(false);
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setPin(cleaned);
    setError(null);
    if (cleaned.length === 6) {
      setTimeout(() => void handleSubmit(), 60);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "linear-gradient(165deg, #F8F8F6 0%, #EDECE8 100%)",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.35px] text-[#C13A14]">
          Graves Deployment
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1C1C1E]">
          Zone Deployment Board
        </h1>
        <p className="mt-2 text-sm text-[#6C6C72]">Enter your 6-digit operator PIN</p>

        <label htmlFor="today-pin" className="mt-6 block text-xs font-semibold uppercase tracking-[0.3px] text-[#6C6C72]">
          Operator PIN
        </label>
        <input
          id="today-pin"
          name="pin"
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => handlePinChange(e.target.value)}
          placeholder="••••••"
          disabled={submitting}
          className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-center font-mono text-2xl tracking-[0.45em] text-[#1C1C1E] outline-none ring-[#C13A14]/30 focus:ring-2"
        />

        <div className="mt-3 flex justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                i < pin.length ? "bg-[#C13A14]" : "bg-[#E5E5E7]",
              )}
            />
          ))}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!isComplete || submitting}
          className={cn(
            "mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition",
            isComplete && !submitting
              ? "bg-[#C13A14] hover:brightness-105 active:scale-[0.99]"
              : "cursor-not-allowed bg-[#C13A14]/40",
          )}
        >
          {submitting ? "Verifying…" : "Open deployment board"}
        </button>
      </form>
    </div>
  );
}
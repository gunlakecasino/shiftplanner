"use client";

import React, { useState, useRef, useEffect } from "react";
import { useOpsAuth, type OpsUser } from "@/lib/auth/opsAuth";
import { cn } from "@/lib/utils";
import { BuilderBusyLabel } from "./builderPrimitives";

/**
 * PinGate — minimal 6-digit PIN entry for GRAVE Ops.
 * Matches the existing Velvet / Material Symbols aesthetic (dark zinc, Atkinson, ms icons).
 * Shown on first load until a valid operator authenticates.
 *
 * After successful PIN entry the parent (ShiftBuilderClient) will re-render
 * with the authenticated user available via useOpsAuth().
 */

interface PinGateProps {
  onAuthenticated?: (user: OpsUser) => void;
}

export function PinGate({ onAuthenticated }: PinGateProps) {
  const { login, isLoading: authLoading } = useOpsAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isComplete = pin.length === 6;
  const submitting = isSubmitting || authLoading;

  // Auto-focus the PIN field on mount
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || submitting) return;

    setError(null);
    setIsSubmitting(true);
    console.groupCollapsed("[PinGate] Login attempt");
    console.log("Submitting PIN (length):", pin.length);

    const result = await login(pin);

    console.log("Login result:", result);
    console.groupEnd();

    if (result.success) {
      // Parent will pick up the new user from context
      // We still call the callback for any immediate side effects
      // (the context already updated synchronously inside login)
      onAuthenticated?.(null as any); // parent reads from useOpsAuth()
    } else {
      setError(result.error || "Invalid PIN");
      // Shake the input on error for tactile feedback
      const el = inputRef.current;
      if (el) {
        el.classList.add("animate-shake");
        setTimeout(() => el.classList.remove("animate-shake"), 420);
      }
      // Clear the PIN field for re-entry (security + UX)
      setPin("");
    }
    setIsSubmitting(false);
  };

  const handlePinChange = (value: string) => {
    // Only digits, max 6
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setPin(cleaned);
    setError(null);

    // Auto-submit when the 6th digit is entered
    if (cleaned.length === 6) {
      // Small delay so the last digit renders before the network call
      setTimeout(() => {
        handleSubmit();
      }, 60);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="sb-overlay-backdrop sb-overlay-backdrop--fixed bg-[#111113]/90" />
      {/* Subtle grid like SudoWindow for visual continuity */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div
        className={cn(
          "sb-modal-enter relative w-full max-w-[380px] mx-4 rounded-2xl border border-zinc-800",
          "bg-zinc-950/90 shadow-2xl shadow-black/60",
          "overflow-hidden"
        )}
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
      >
        {/* Top red accent strip (same language as Sudo) */}
        <div className="h-[3px] w-full bg-gradient-to-r from-red-500/70 via-red-400/50 to-red-500/70" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <span className="ms text-red-400 mt-0.5" style={{ fontSize: 22 }}>
            lock
          </span>
          <div>
            <div className="font-mono text-[11px] tracking-[2px] text-zinc-500">GRAVE OPS</div>
            <div className="text-xl font-semibold text-zinc-100 tracking-[-0.2px] mt-0.5">
              ShiftBuilder Access
            </div>
            <div className="text-[12px] text-zinc-400 mt-1">
              Enter your 6-digit operator PIN
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* PIN input — large, monospace, clean (PIN alone identifies the operator) */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
              6-DIGIT PIN
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isComplete) {
                  handleSubmit(e);
                }
              }}
              className={cn(
                "w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-4 text-center",
                "font-mono text-4xl tracking-[12px] text-zinc-100 placeholder:text-zinc-700",
                "focus:outline-none focus:border-red-500/60 transition-colors",
                error && "border-red-500/70"
              )}
              placeholder="••••••"
              disabled={submitting}
              autoFocus
            />
            {/* Visual 6-dot progress indicator */}
            <div className="flex justify-center gap-2 mt-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-[background-color,transform] duration-200",
                    i < pin.length ? "bg-red-400" : "bg-zinc-800"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Error message - more verbose for debugging */}
          {error && (
            <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-900/60 rounded-lg px-3 py-2.5 font-mono leading-snug break-words">
              <div className="font-semibold text-red-400 mb-0.5 tracking-wider">LOGIN FAILED</div>
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!isComplete || submitting}
              className={cn(
                "sb-interactive flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium tracking-wide",
                isComplete && !submitting
                  ? "bg-white text-black hover:bg-zinc-200"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              {submitting ? (
                <BuilderBusyLabel>VERIFYING</BuilderBusyLabel>
              ) : (
                <>
                  <span className="ms" style={{ fontSize: 16 }}>login</span>
                  ENTER
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setPin("");
                setError(null);
                inputRef.current?.focus();
              }}
              className="sb-interactive px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 rounded-xl border border-zinc-800 hover:border-zinc-700 active:bg-zinc-900"
            >
              Clear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

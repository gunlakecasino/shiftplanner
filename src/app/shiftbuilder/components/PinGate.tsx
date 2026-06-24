"use client";

import React, { useState, useRef, useEffect, useId, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getEffectivePermissions, useOpsAuth, type OpsUser } from "@/lib/auth/opsAuth";
import { postPinDestination } from "@/lib/auth/postPinRoute";
import { cn } from "@/lib/utils";
import { BuilderBusyLabel } from "./builderPrimitives";

interface PinGateProps {
  onAuthenticated?: (user: OpsUser) => void;
}

function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const root = containerRef.current;
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, containerRef]);
}

export function PinGate({ onAuthenticated }: PinGateProps) {
  const { login, isLoggingIn } = useOpsAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const inputId = useId();

  const isComplete = pin.length === 6;
  const submitting = isSubmitting || isLoggingIn;

  useFocusTrap(dialogRef, true);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isComplete || submitting) return;

    setError(null);
    setIsSubmitting(true);

    const result = await login(pin);

    if (result.success && result.user) {
      if (!result.requiresPinChange) {
        const permissions = getEffectivePermissions(result.user);
        const destination = postPinDestination(pathname, permissions);
        if (destination !== pathname) {
          router.replace(destination);
        }
        onAuthenticated?.(result.user);
      }
    } else {
      setError(result.error || "Incorrect PIN. Try again.");
      const el = inputRef.current;
      if (el) {
        el.classList.add("animate-shake");
        setTimeout(() => el.classList.remove("animate-shake"), 420);
      }
      setPin("");
      inputRef.current?.focus();
    }
    setIsSubmitting(false);
  }, [isComplete, submitting, login, pin, onAuthenticated, pathname, router]);

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setPin(cleaned);
    setError(null);

    if (cleaned.length === 6) {
      setTimeout(() => {
        void handleSubmit();
      }, 60);
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="sb-modal-enter sb-auth-card sb-auth-card--access"
      style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
    >
      <div className="sb-auth-accent" aria-hidden="true" />

      <div className="relative px-7 pt-7 pb-5">
        <div className="flex items-start gap-4">
          <div className="sb-auth-icon" aria-hidden="true">
            <span className="ms" style={{ fontSize: 22 }}>
              lock
            </span>
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="sb-auth-title">
              SheetBuilder Access
            </h2>
            <p id={descId} className="sb-auth-subtitle mt-1.5">
              Enter your 6-digit ops PIN
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative px-7 pb-7 space-y-4">
        <div>
          <label htmlFor={inputId} className="sb-auth-label">
            6-Digit PIN
          </label>
          <div className="sb-auth-input-wrap">
            <input
              ref={inputRef}
              id={inputId}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isComplete) {
                  void handleSubmit(e);
                }
              }}
              className={cn("sb-auth-input", error && "sb-auth-input--error")}
              placeholder="••••••"
              disabled={submitting}
              autoComplete="off"
              aria-invalid={!!error}
              aria-describedby={error ? "pin-gate-error" : undefined}
            />
          </div>
          <div className="sb-auth-slots" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={cn("sb-auth-slot", i < pin.length && "sb-auth-slot--filled")}
              />
            ))}
          </div>
        </div>

        {error ? (
          <div id="pin-gate-error" role="alert" className="sb-auth-error">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!isComplete || submitting}
            className={cn(
              "sb-interactive sb-auth-primary sb-auth-primary--grow",
              isComplete && !submitting
                ? "sb-auth-primary--active"
                : "sb-auth-primary--disabled",
            )}
          >
            {submitting ? (
              <BuilderBusyLabel>VERIFYING</BuilderBusyLabel>
            ) : (
              <>
                <span className="ms" style={{ fontSize: 16 }} aria-hidden="true">
                  login
                </span>
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
            disabled={submitting}
            className="sb-interactive sb-auth-secondary disabled:opacity-45"
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}
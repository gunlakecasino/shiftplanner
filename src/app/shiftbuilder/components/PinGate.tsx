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
      setPin("");
      inputRef.current?.focus();
    }
    setIsSubmitting(false);
  }, [isComplete, submitting, login, pin, onAuthenticated, pathname, router]);

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 6);
    setPin(cleaned);
    setError(null);

    if (cleaned.length === 6) {
      setTimeout(() => {
        void handleSubmitRef.current();
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
      className="sb-auth-form"
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    >
      <form onSubmit={handleSubmit} className="sb-auth-form__body">
        <div className="sb-auth-brand">
          <span className="sb-auth-mark" aria-hidden="true" />
          <h2 id={titleId} className="sb-auth-title">
            SheetBuilder
          </h2>
        </div>
        <p id={descId} className="sb-auth-lead">
          Gun Lake graves ops.
        </p>

        <label htmlFor={inputId} className="sb-auth-field-label">
          PIN
        </label>
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
          disabled={submitting}
          autoComplete="one-time-code"
          aria-invalid={!!error}
          aria-describedby={error ? "pin-gate-error" : undefined}
        />

        {error ? (
          <div id="pin-gate-error" role="alert" className="sb-auth-error">
            {error}
          </div>
        ) : null}

        <div className="sb-auth-actions">
          <button
            type="submit"
            disabled={!isComplete || submitting}
            className={cn(
              "sb-interactive sb-auth-primary sb-auth-primary--block",
              isComplete && !submitting
                ? "sb-auth-primary--active"
                : "sb-auth-primary--disabled",
            )}
          >
            {submitting ? <BuilderBusyLabel>Checking</BuilderBusyLabel> : "Enter"}
          </button>

          <button
            type="button"
            onClick={() => {
              setPin("");
              setError(null);
              inputRef.current?.focus();
            }}
            disabled={submitting}
            className="sb-interactive sb-auth-secondary sb-auth-secondary--ghost disabled:opacity-45"
          >
            Clear
          </button>
        </div>
      </form>
    </div>
  );
}

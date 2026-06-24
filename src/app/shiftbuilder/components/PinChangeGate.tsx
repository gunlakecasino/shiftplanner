"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { cn } from "@/lib/utils";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { pinPolicyError } from "@/lib/auth/pinPolicy";
import { logOpsAudit, operatorDisplayName } from "@/lib/shiftbuilder/opsAuditLog";
import { BuilderBusyLabel } from "./builderPrimitives";

type Props = {
  operatorName: string;
  onComplete?: () => void;
};

export function PinChangeGate({ operatorName, onComplete }: Props) {
  const { user, pinChangeToken, completePinChange, logout } = useOpsAuth();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();
  const tempId = useId();
  const newId = useId();
  const confirmId = useId();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  if (!user || !pinChangeToken) {
    return null;
  }

  const canSubmit =
    tempPin.length === 6 &&
    newPin.length === 6 &&
    confirmPin.length === 6 &&
    !submitting;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;

    if (newPin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    const policyErr = pinPolicyError(newPin);
    if (policyErr) {
      setError(policyErr);
      return;
    }

    if (newPin === tempPin) {
      setError("Choose a different PIN than your temporary one.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          userId: user.id,
          currentPin: tempPin,
          newPin,
          pinChangeToken,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success || !json.user) {
        setError(json.error || "Couldn't save your PIN. Try again.");
        return;
      }

      completePinChange({
        id: json.user.id,
        email: json.user.email,
        full_name: json.user.full_name,
        username: json.user.username,
        role: json.user.role,
        permissions: json.user.permissions ?? null,
        must_change_pin: false,
      });

      logOpsAudit({
        action: "user_update",
        operatorName: operatorDisplayName(json.user),
        opsUserId: json.user.id,
        payload: { source: "pin_change", event: "personal_pin_set" },
      });

      onComplete?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const pinField = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    fieldId: string,
    ref?: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div>
      <label htmlFor={fieldId} className="sb-auth-label">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="sb-auth-input sb-auth-input--compact"
        disabled={submitting}
        autoComplete="off"
      />
      <div className="sb-auth-slots" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn("sb-auth-slot", i < value.length && "sb-auth-slot--filled")}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="sb-modal-enter sb-auth-card sb-auth-card--wide sb-auth-card--setup"
      style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
    >
      <div className="sb-auth-accent" aria-hidden="true" />

      <div className="relative px-7 pt-7 pb-5">
        <div className="flex items-start gap-4">
          <div className="sb-auth-icon" aria-hidden="true">
            <span className="ms" style={{ fontSize: 22 }}>
              pin
            </span>
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="sb-auth-title">
              Set your personal PIN
            </h2>
            <p id={descId} className="sb-auth-subtitle mt-1.5">
              Welcome, {operatorName}. Re-enter your temporary PIN, then choose a private
              6-digit ops PIN. Avoid sequences like 123456.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative px-7 pb-7 space-y-4">
        {pinField(tempPin, setTempPin, "Temporary PIN", tempId)}
        {pinField(newPin, setNewPin, "New 6-Digit PIN", newId, inputRef)}
        {pinField(confirmPin, setConfirmPin, "Confirm PIN", confirmId)}

        {error ? (
          <div role="alert" className="sb-auth-error">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "sb-interactive sb-auth-primary sb-auth-primary--block",
            canSubmit ? "sb-auth-primary--active" : "sb-auth-primary--disabled",
          )}
        >
          {submitting ? <BuilderBusyLabel>SAVING PIN</BuilderBusyLabel> : "Save & continue"}
        </button>

        <button
          type="button"
          onClick={() => void logout()}
          className="sb-interactive sb-auth-secondary sb-auth-secondary--ghost"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
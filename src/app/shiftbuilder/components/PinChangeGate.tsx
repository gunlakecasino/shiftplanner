"use client";

import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { pinPolicyError } from "@/lib/auth/pinPolicy";
import { logOpsAudit, operatorDisplayName } from "@/lib/shiftbuilder/opsAuditLog";
import { BuilderBusyLabel } from "./builderPrimitives";

type Props = {
  operatorName: string;
};

export function PinChangeGate({ operatorName }: Props) {
  const { user, pinChangeToken, completePinChange, logout } = useOpsAuth();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [tempPin, setTempPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setError("PINs do not match");
      return;
    }

    const policyErr = pinPolicyError(newPin);
    if (policyErr) {
      setError(policyErr);
      return;
    }

    if (newPin === tempPin) {
      setError("Choose a different PIN than your temporary one");
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
        setError(json.error || `PIN change failed (HTTP ${res.status})`);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const pinField = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    ref?: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
        {label}
      </label>
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className={cn(
          "w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-center",
          "font-mono text-2xl tracking-[10px] text-zinc-100",
          "focus:outline-none focus:border-emerald-500/60",
        )}
        disabled={submitting}
        autoComplete="off"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      <div className="sb-overlay-backdrop sb-overlay-backdrop--fixed bg-[#111113]/90" />
      <div
        className={cn(
          "sb-modal-enter relative w-full max-w-[420px] mx-4 rounded-2xl border border-zinc-800",
          "bg-zinc-950/90 shadow-2xl shadow-black/60 overflow-hidden",
        )}
        style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
      >
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500/70 via-emerald-400/50 to-emerald-500/70" />

        <div className="px-6 pt-6 pb-4">
          <div className="font-mono text-[11px] tracking-[2px] text-zinc-500">GRAVE OPS</div>
          <div className="text-xl font-semibold text-zinc-100 mt-0.5">Set your personal PIN</div>
          <p className="text-[12px] text-zinc-400 mt-2 leading-relaxed">
            Welcome, {operatorName}. Re-enter your temporary PIN, then choose a private 6-digit PIN.
            Avoid sequences like 123456.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {pinField(tempPin, setTempPin, "TEMPORARY PIN (RE-ENTER)")}
          {pinField(newPin, setNewPin, "NEW 6-DIGIT PIN", inputRef)}
          {pinField(confirmPin, setConfirmPin, "CONFIRM PIN")}

          {error && (
            <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-900/60 rounded-lg px-3 py-2 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "w-full rounded-xl py-3 text-sm font-medium",
              canSubmit ? "bg-white text-black hover:bg-zinc-200" : "bg-zinc-800 text-zinc-500 cursor-not-allowed",
            )}
          >
            {submitting ? <BuilderBusyLabel>SAVING PIN</BuilderBusyLabel> : "Save & continue"}
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300 py-1"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
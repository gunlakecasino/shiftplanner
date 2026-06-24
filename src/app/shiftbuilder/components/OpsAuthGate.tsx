"use client";

import React, { useEffect, useRef, useState } from "react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PinGate } from "./PinGate";
import { PinChangeGate } from "./PinChangeGate";
import { BuilderLoadingShell } from "./builderPrimitives";
import { cn } from "@/lib/utils";

const AUTH_EXIT_MS = 200;

type Props = {
  children: React.ReactNode;
  loadingLabel?: string;
  loadingSublabel?: string;
};

function PinSessionError({
  title,
  message,
  onLogout,
}: {
  title: string;
  message: string;
  onLogout: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pin-session-error-title"
      aria-describedby="pin-session-error-desc"
      className="sb-modal-enter sb-auth-card sb-auth-card--warn"
      style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
    >
      <div className="sb-auth-accent" aria-hidden="true" />
      <div className="relative px-7 py-7 space-y-5">
        <div className="flex items-start gap-4">
          <div className="sb-auth-icon" aria-hidden="true">
            <span className="ms" style={{ fontSize: 22 }}>
              warning
            </span>
          </div>
          <div className="min-w-0">
            <h2 id="pin-session-error-title" className="sb-auth-title text-[1.15rem]">
              {title}
            </h2>
            <p id="pin-session-error-desc" className="sb-auth-subtitle mt-2">
              {message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="sb-interactive sb-auth-primary sb-auth-primary--block sb-auth-primary--active"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * Auth gate — artboard skeleton stays mounted; PIN / PIN-change modals overlay it.
 * Children load behind the gate so route chunks hydrate without extra loading flashes.
 */
export function OpsAuthGate({
  children,
  loadingLabel = "LOADING OPS SESSION",
  loadingSublabel = "Preparing computer context",
}: Props) {
  const { isAuthenticated, isLoading, user, pinChangeToken, logout } = useOpsAuth();
  const [exiting, setExiting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const exitStartedRef = useRef(false);

  const ready = !isLoading;
  const needsPin = ready && (!isAuthenticated || !user);
  const needsPinChange = ready && !!user?.must_change_pin && !!pinChangeToken;
  const pinChangeBlocked = ready && !!user?.must_change_pin && !pinChangeToken;
  const authedReady = ready && !!user && !user.must_change_pin;

  const showOverlay =
    !revealed &&
    (isLoading || needsPin || needsPinChange || pinChangeBlocked || exiting);

  useEffect(() => {
    if (!authedReady) {
      exitStartedRef.current = false;
      setRevealed(false);
      setExiting(false);
      return;
    }
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    setExiting(true);
    const t = setTimeout(() => {
      setRevealed(true);
      setExiting(false);
    }, AUTH_EXIT_MS);
    return () => clearTimeout(t);
  }, [authedReady]);

  return (
    <div className="sb-auth-gate-root min-h-screen">
      <div
        className={cn(
          "sb-auth-gate-behind",
          revealed && "sb-auth-gate-behind--visible sb-content-enter",
        )}
        aria-hidden={!revealed}
      >
        {children}
      </div>

      {showOverlay ? (
        <div
          className={cn(
            "sb-auth-gate-overlay",
            exiting && "sb-auth-gate-overlay--exiting",
          )}
          aria-hidden={exiting}
        >
          <BuilderLoadingShell
            label={loadingLabel}
            sublabel={loadingSublabel ?? (needsPin ? "Awaiting ops PIN" : undefined)}
          />

          {ready && (needsPin || needsPinChange || pinChangeBlocked) ? (
            <>
              <div className="sb-auth-pin-scrim" aria-hidden="true" />
              <div className="sb-auth-gate-modal-layer">
                {needsPin ? <PinGate /> : null}
                {needsPinChange && user ? (
                  <PinChangeGate operatorName={user.full_name || user.username} />
                ) : null}
                {pinChangeBlocked ? (
                  <PinSessionError
                    title="PIN setup unavailable"
                    message="Your session couldn't be prepared for a PIN change. Sign out and try again, or contact your supervisor."
                    onLogout={logout}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PinGate } from "./PinGate";
import { PinChangeGate } from "./PinChangeGate";
import { cn } from "@/lib/utils";

const AUTH_EXIT_MS = 160;

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
      className="sb-auth-form"
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    >
      <div className="sb-auth-form__body">
        <div className="sb-auth-brand">
          <span className="sb-auth-mark" aria-hidden="true" />
          <h2 id="pin-session-error-title" className="sb-auth-title">
            {title}
          </h2>
        </div>
        <p id="pin-session-error-desc" className="sb-auth-lead">
          {message}
        </p>
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

function AuthFloorVisual() {
  return (
    <aside className="sb-auth-visual" aria-hidden="true">
      <div className="sb-auth-visual__wash" />
      <div className="sb-auth-visual__desk">
        <img
          className="sb-auth-visual__art"
          src="/sheetbuilder/auth-gate-side.png"
          alt=""
          draggable={false}
        />
      </div>
    </aside>
  );
}

/**
 * Auth gate — split ops console. No skeleton board, no blur theater.
 * Children stay mounted behind so route chunks hydrate without extra flashes.
 */
export function OpsAuthGate({
  children,
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

  const lastModalKindRef = useRef<"pin" | "pinChange" | "blocked" | null>(null);
  if (needsPin) lastModalKindRef.current = "pin";
  else if (needsPinChange) lastModalKindRef.current = "pinChange";
  else if (pinChangeBlocked) lastModalKindRef.current = "blocked";
  const modalKind = needsPin
    ? "pin"
    : needsPinChange
      ? "pinChange"
      : pinChangeBlocked
        ? "blocked"
        : exiting
          ? lastModalKindRef.current
          : null;

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
          revealed && "sb-auth-gate-behind--visible",
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
          <div className="sb-auth-split">
            <div className="sb-auth-split__form">
              <div className="sb-auth-gate-modal-layer">
                {ready && modalKind === "pin" ? <PinGate /> : null}
                {ready && modalKind === "pinChange" && user ? (
                  <PinChangeGate operatorName={user.full_name || user.username} />
                ) : null}
                {ready && modalKind === "blocked" ? (
                  <PinSessionError
                    title="PIN setup unavailable"
                    message="Your session couldn't be prepared for a PIN change. Sign out and try again, or contact your supervisor."
                    onLogout={logout}
                  />
                ) : null}
                {!ready ? (
                  <p className="sb-auth-waiting">SheetBuilder</p>
                ) : null}
              </div>
            </div>
            <AuthFloorVisual />
          </div>
        </div>
      ) : null}
    </div>
  );
}

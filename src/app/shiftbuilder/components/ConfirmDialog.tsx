"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import {
  DESK_CONTROL_DANGER,
  DESK_CONTROL_GHOST,
  DESK_CONTROL_PRIMARY,
  DESK_DIALOG,
  DESK_OVERLAY,
} from "./deskChrome";

export type ConfirmToneOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  /** Optional rich summary for optimizer / draft applies (e.g. "8 changes · +4 rotation health"). */
  summary?: string;
  /** Optional short list of key points (for confirm body). */
  summaryPoints?: string[];
};

type ConfirmState = ConfirmToneOptions & {
  message: string;
  resolve: (value: boolean) => void;
};

type ConfirmFn = (message: string, options?: ConfirmToneOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Async replacement for window.confirm() — resolves true/false, never blocks the main thread. */
export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

const EXIT_MS = 180;

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const [closing, setClosing] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = React.useRef<HTMLElement | null>(null);

  const confirm = React.useCallback<ConfirmFn>((message, options) => {
    return new Promise((resolve) => {
      previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setClosing(false);
      setState({ message, ...options, resolve });
    });
  }, []);

  const settle = React.useCallback((result: boolean) => {
    setState((current) => {
      if (!current) return current;
      current.resolve(result);
      return current;
    });
    setClosing(true);
    setTimeout(() => {
      setState(null);
      setClosing(false);
    }, EXIT_MS);
  }, []);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, settle]);

  React.useEffect(() => {
    if (state) cancelRef.current?.focus();
  }, [state]);

  React.useEffect(() => {
    if (!state && !closing) {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    }
  }, [state, closing]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && typeof document !== "undefined" && createPortal(
        <div
          className={`fixed inset-0 z-[10060] flex items-center justify-center p-4 ${DESK_OVERLAY}`}
          style={{
            opacity: closing ? 0 : 1,
            transition: "opacity 150ms var(--sb-spring-snappy, ease)",
          }}
          onMouseDown={() => settle(false)}
          role="presentation"
        >
          <div
            ref={cardRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sb-confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              `${DESK_DIALOG} max-w-[380px] p-6 outline-none`,
              closing ? "sb-modal-exit" : "sb-modal-enter",
            )}
          >
            {state.title ? (
              <>
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#007AFF]" />
                  <div className="min-w-0 flex-1">
                    <h2 id="sb-confirm-title" className="text-[15px] font-semibold text-[#1C1C1E] tracking-[-0.01em]">
                      {state.title}
                    </h2>
                    {state.summary && (
                      <div className="mt-1 text-[12px] font-medium text-[#007AFF] tabular-nums">
                        {state.summary}
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
                  {state.message}
                </p>
                {state.summaryPoints && state.summaryPoints.length > 0 && (
                  <ul className="mt-2.5 text-[12px] text-neutral-600 list-disc pl-4 space-y-0.5">
                    {state.summaryPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p id="sb-confirm-title" className="text-[14px] font-medium leading-relaxed text-[#1C1C1E]">
                {state.message}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settle(false)}
                className={`sb-interactive sb-desk-control--block ${DESK_CONTROL_GHOST}`}
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={cn(
                  "sb-interactive sb-desk-control--block",
                  state.tone === "danger" ? DESK_CONTROL_DANGER : DESK_CONTROL_PRIMARY,
                )}
              >
                {state.confirmLabel ?? "Apply to Live"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

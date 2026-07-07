"use client";

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

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

  const confirm = React.useCallback<ConfirmFn>((message, options) => {
    return new Promise((resolve) => {
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
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, settle]);

  React.useEffect(() => {
    if (state) cardRef.current?.focus();
  }, [state]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[10060] flex items-center justify-center p-4 transition-opacity duration-150"
          style={{
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            opacity: closing ? 0 : 1,
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
              "w-full max-w-[380px] rounded-2xl border border-black/10 bg-white p-6 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.3),0_1px_3px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] outline-none",
              closing ? "sb-modal-exit" : "sb-modal-enter",
            )}
            style={{
              // Velvet / board-card cohesion for critical optimizer commit actions
              background: "#fff",
            }}
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
                type="button"
                onClick={() => settle(false)}
                className="sb-interactive flex-1 rounded-2xl border border-neutral-200 py-2.5 text-[13px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-[0.985]"
              >
                {state.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={cn(
                  "sb-interactive flex-1 rounded-2xl py-2.5 text-[13px] font-extrabold text-white transition-all active:scale-[0.985]",
                  state.tone === "danger"
                    ? "bg-[#FF3B30] hover:bg-[#E0342A]"
                    : "bg-[#007AFF] hover:bg-[#0063CC] shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_4px_14px_-6px_rgba(0,122,255,0.6)]",
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

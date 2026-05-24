"use client";

import { useState, useRef, useCallback } from "react";

export type ToastKind = "error" | "info" | "success";
export interface ToastItem { id: number; message: string; kind: ToastKind; }

/**
 * Bottom-right toast queue for persist failures and operator feedback.
 * Auto-dismisses after 5s; supports manual dismiss via id.
 * Also tracks `lastSavedAt` — the timestamp of the most recent successful
 * Supabase write, which drives the live status pill.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, kind: ToastKind = "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, lastSavedAt, setLastSavedAt, showToast, dismissToast };
}

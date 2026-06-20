"use client";

import React from "react";
import { cn } from "@/lib/utils";

type AdminPinConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (pin: string) => void | Promise<void>;
  onCancel: () => void;
  isDark?: boolean;
};

export function AdminPinConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  busy = false,
  error = null,
  onConfirm,
  onCancel,
  isDark = false,
}: AdminPinConfirmModalProps) {
  const [pin, setPin] = React.useState("");

  React.useEffect(() => {
    if (open) setPin("");
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (pin.length !== 6 || busy) return;
    void onConfirm(pin);
  };

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-sm rounded-2xl border p-6 shadow-2xl",
          isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10",
        )}
      >
        <div className="text-lg font-semibold mb-1">{title}</div>
        <p className={cn("text-[13px] mb-4", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
          {description}
        </p>

        <label className="text-[11px] uppercase tracking-wider text-[#6C6C72] mb-1 block">
          Your sudo_admin PIN
        </label>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className={cn(
            "w-full rounded-xl border px-3 py-3 text-center font-mono text-2xl tracking-[10px]",
            isDark ? "bg-black/20 border-white/10" : "bg-white border-black/10",
          )}
          placeholder="••••••"
          autoFocus
        />

        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || pin.length !== 6}
            className="flex-1 py-2.5 rounded-xl bg-[#B89708] text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Verifying…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
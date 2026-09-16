"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildDeskCaptureSnapshot,
  downloadDeskCaptureJson,
  type DeskCaptureSnapshot,
} from "@/lib/shiftbuilder/deskCapture";

export type CaptureDeskDialogProps = {
  open: boolean;
  onClose: () => void;
  nightId?: string | null;
  nightDate?: string | null;
  isDraftMode?: boolean;
  assignments?: Record<string, any>;
  auxDefs?: Array<{ key: string; role?: string; label?: string }>;
};

export function CaptureDeskDialog({
  open,
  onClose,
  nightId,
  nightDate,
  isDraftMode,
  assignments,
  auxDefs,
}: CaptureDeskDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setStatus(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const snapshot = (): DeskCaptureSnapshot =>
    buildDeskCaptureSnapshot({
      note,
      nightId,
      nightDate,
      isDraftMode,
      assignments,
      auxDefs,
    });

  const handleDownload = () => {
    const snap = snapshot();
    if (!snap.note) {
      setStatus("Write one sentence first.");
      return;
    }
    downloadDeskCaptureJson(snap);
    setStatus("JSON downloaded.");
  };

  const handleSubmit = async () => {
    const snap = snapshot();
    if (!snap.note) {
      setStatus("Write one sentence first.");
      return;
    }
    downloadDeskCaptureJson(snap);
    try {
      const res = await fetch("/api/shiftbuilder/desk-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snap),
      });
      if (res.status === 501) {
        setStatus("Saved JSON locally. Server table is a follow-up.");
        return;
      }
      if (!res.ok) throw new Error(`capture ${res.status}`);
      setStatus("Captured.");
    } catch {
      setStatus("Saved JSON locally. Server insert unavailable.");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(15, 23, 42, 0.28)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-lg bg-white shadow-lg border border-black/8 p-4"
        style={{ fontFamily: "var(--font-ui, system-ui)" }}
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-[#1C1C1E] mb-1">
          Capture desk
        </h2>
        <p className="text-[12px] text-[#6B7280] mb-3">
          One sentence: what went wrong. Downloads a night snapshot. No replay.
        </p>
        <label htmlFor={inputId} className="sr-only">
          What went wrong
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          rows={3}
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What went wrong?"
          className="w-full resize-none rounded-md border border-black/10 px-2.5 py-2 text-[13px] text-[#1C1C1E] outline-none focus:border-[#007AFF]"
        />
        {status ? (
          <p className="mt-2 text-[12px] text-[#6B7280]" role="status">
            {status}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="h-8 px-3 rounded-md text-[12px] font-semibold text-[#334155]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-md text-[12px] font-semibold text-[#334155] border border-black/8"
            onClick={handleDownload}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-md text-[12px] font-semibold text-white bg-[#007AFF]"
            onClick={() => void handleSubmit()}
          >
            Capture
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ShiftBuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[shiftbuilder] route error", error);
  }, [error]);

  return (
    <main className="grid min-h-[70vh] place-items-center px-5">
      <div className="w-full max-w-md rounded-3xl border border-black/10 bg-white p-7 text-center shadow-[0_20px_70px_-35px_rgba(20,24,32,0.35)]">
        <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[#FFF1F0] text-[#FF3B30]">
          <AlertTriangle size={21} />
        </div>
        <h1 className="font-[var(--font-bricolage)] text-xl font-semibold tracking-[-0.02em] text-[#1C1C1E]">
          This view hit a snag
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#6C6C72]">
          Your saved schedule is safe. Try the view again, or return to the deployment board.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="sb-interactive inline-flex items-center gap-2 rounded-xl bg-[#007AFF] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            <RefreshCw size={14} /> Try again
          </button>
          <Link
            href="/shiftbuilder"
            className="sb-interactive inline-flex items-center rounded-xl border border-black/10 px-4 py-2.5 text-[13px] font-semibold text-[#3A3A3C]"
          >
            Deployment board
          </Link>
        </div>
      </div>
    </main>
  );
}

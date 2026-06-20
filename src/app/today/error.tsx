"use client";

import { useEffect } from "react";

export default function TodayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[today] route error", error);
  }, [error]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{
        background: "linear-gradient(165deg, #F8F8F6 0%, #EDECE8 100%)",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.35px] text-[#C13A14]">
        Graves Deployment
      </p>
      <h1 className="text-xl font-bold tracking-tight text-[#1C1C1E]">
        Something went wrong
      </h1>
      <p className="max-w-sm text-sm text-[#6C6C72]">
        The deployment board hit an unexpected error. Reload the board to try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-[#C13A14] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.99]"
      >
        Reload board
      </button>
    </div>
  );
}
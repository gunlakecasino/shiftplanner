"use client";

import { useState } from "react";
import { writeTodayOperatorName } from "../lib/todayChangeLog";

type TodayOperatorGateProps = {
  onReady: (name: string) => void;
};

export function TodayOperatorGate({ onReady }: TodayOperatorGateProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter your full name (at least 2 characters).");
      return;
    }
    writeTodayOperatorName(trimmed);
    onReady(trimmed);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: "linear-gradient(165deg, #F8F8F6 0%, #EDECE8 100%)",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.35px] text-[#C13A14]">
          Graves Deployment
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1C1C1E]">
          Zone Deployment Board
        </h1>

        <label className="mt-6 block text-xs font-semibold uppercase tracking-[0.3px] text-[#6C6C72]">
          Your name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Name Here"
          className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base text-[#1C1C1E] outline-none ring-[#C13A14]/30 focus:ring-2"
        />
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-[#C13A14] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.99]"
        >
          Open tonight&apos;s board
        </button>
      </form>
    </div>
  );
}
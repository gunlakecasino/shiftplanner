"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 64;

/**
 * Operator name entry for /today — attribution for deployment change logs only.
 * No PIN or role gate; the board is open once a name is provided for this session.
 */
export function TodayNameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const isValid = trimmed.length >= MIN_NAME_LENGTH;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const value = name.trim();
    if (value.length < MIN_NAME_LENGTH) {
      setError(`Enter at least ${MIN_NAME_LENGTH} characters`);
      return;
    }
    if (value.length > MAX_NAME_LENGTH) {
      setError(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
      return;
    }
    setError(null);
    onSubmit(value);
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
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl border border-black/10 bg-white/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.08)] backdrop-blur-xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.35px] text-[#C13A14]">
          Graves Deployment
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1C1C1E]">
          Zone Deployment Board
        </h1>
        <p className="mt-2 text-sm text-[#6C6C72]">
          Enter your name so assignment changes are logged correctly.
        </p>

        <label
          htmlFor="today-operator-name"
          className="mt-6 block text-xs font-semibold uppercase tracking-[0.3px] text-[#6C6C72]"
        >
          Your name
        </label>
        <input
          id="today-operator-name"
          name="operatorName"
          ref={inputRef}
          type="text"
          autoComplete="name"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Brian Killian"
          className="mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-base text-[#1C1C1E] outline-none ring-[#C13A14]/30 focus:ring-2"
        />

        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!isValid}
          className={cn(
            "mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition",
            isValid
              ? "bg-[#C13A14] hover:brightness-105 active:scale-[0.99]"
              : "cursor-not-allowed bg-[#C13A14]/40",
          )}
        >
          Open deployment board
        </button>
      </form>
    </div>
  );
}
import type { ToggleProps } from "../types";

export function Toggle({ on, color, onChange }: ToggleProps) {
  return (
    <button
      onClick={onChange}
      className="w-7 h-4 rounded-full relative transition-all duration-200 shrink-0 focus:outline-none"
      style={{ backgroundColor: on ? color : "#e5e7eb" }}
    >
      <div
        className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200"
        style={{ left: on ? "calc(100% - 14px)" : 2 }}
      />
    </button>
  );
}

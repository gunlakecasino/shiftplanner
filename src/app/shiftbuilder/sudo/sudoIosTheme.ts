import { cn } from "@/lib/utils";

/**
 * iOS 26 token class bundles for sudo tabs rendered inside the settings shell.
 * Light mode is the default canvas — dark retains legacy zinc surfaces.
 */
export function sudoIosClasses(isDark: boolean) {
  return {
    page: isDark ? "text-[var(--ios-label)]" : "text-[var(--ios-label)]",

    actionBar: cn(
      "shrink-0 border-b px-5 py-3 backdrop-blur-md",
      isDark
        ? "border-white/10 bg-zinc-950/80"
        : "border-[var(--ios-gray-5)] bg-[var(--ios-background-tertiary)]",
    ),

    actionTitle: isDark ? "text-zinc-200" : "text-[var(--ios-label)]",
    sectionLabel: isDark
      ? "text-[10px] font-semibold uppercase tracking-widest text-zinc-500"
      : "text-[10px] font-semibold uppercase tracking-widest text-[var(--ios-label-tertiary)]",

    divider: isDark ? "bg-zinc-800" : "bg-[var(--ios-gray-5)]",

    row: cn(
      "flex items-start gap-3 rounded-xl border px-3 py-2 transition-colors",
      isDark
        ? "border-zinc-800/60 bg-zinc-900/50 hover:border-zinc-700/60"
        : "border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] hover:border-[var(--ios-gray-4)]",
    ),

    rowLabel: isDark ? "text-[12px] font-semibold tracking-wide text-zinc-200" : "text-[12px] font-semibold tracking-wide text-[var(--ios-label)]",

    chip: isDark
      ? "flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
      : "flex items-center gap-1 rounded-full border border-[var(--ios-gray-5)] bg-[var(--ios-background-tertiary)] px-2 py-0.5 text-[10px] text-[var(--ios-label-secondary)]",

    dashedAdd: isDark
      ? "flex items-center gap-0.5 rounded border border-dashed border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-600 transition-colors hover:border-zinc-500 hover:text-zinc-400"
      : "flex items-center gap-0.5 rounded border border-dashed border-[var(--ios-gray-4)] px-1.5 py-0.5 text-[10px] text-[var(--ios-label-tertiary)] transition-colors hover:border-[var(--ios-gray-3)] hover:text-[var(--ios-label-secondary)]",

    input: cn(
      "rounded text-[10px] focus:outline-none",
      isDark
        ? "border border-zinc-600 bg-zinc-800 text-zinc-200 placeholder-zinc-600 focus:border-red-500/60"
        : "border border-[var(--ios-gray-4)] bg-[var(--ios-background-secondary)] text-[var(--ios-label)] placeholder:text-[var(--ios-label-quaternary)] focus:border-[var(--ios-blue)] focus:ring-1 focus:ring-[var(--ios-blue)]/25",
    ),

    ghostBtn: cn(
      "sb-interactive flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[11px] transition-colors",
      isDark
        ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)] hover:text-[var(--ios-label)]",
    ),

    legend: isDark ? "text-[10px] text-zinc-500" : "text-[10px] text-[var(--ios-label-tertiary)]",

    card: isDark
      ? "rounded-xl border border-zinc-800 bg-zinc-950"
      : "rounded-xl border border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)]",

    searchInput: cn(
      "w-full rounded-lg py-2 text-sm focus:outline-none",
      isDark
        ? "border border-zinc-800 bg-zinc-900 pl-9 pr-3 placeholder:text-zinc-500 focus:border-red-500/50"
        : "border border-[var(--ios-gray-4)] bg-[var(--ios-background-secondary)] pl-9 pr-3 text-[var(--ios-label)] placeholder:text-[var(--ios-label-quaternary)] focus:border-[var(--ios-blue)] focus:ring-1 focus:ring-[var(--ios-blue)]/25",
    ),

    selectCard: (active: boolean) =>
      cn(
        "sb-select-card sb-interactive rounded-xl border px-4 py-3 text-left",
        active
          ? isDark
            ? "border-red-500/50 bg-red-500/10 text-red-100"
            : "border-[var(--ios-blue)]/45 bg-[color-mix(in_srgb,var(--ios-blue)_10%,var(--ios-background-secondary))] text-[var(--ios-label)]"
          : isDark
            ? "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
            : "border-[var(--ios-gray-5)] bg-[var(--ios-background-secondary)] text-[var(--ios-label)] hover:border-[var(--ios-gray-4)] hover:bg-[var(--ios-gray-6)]",
      ),
  };
}

export function sudoPushButtonClasses(
  variant: "breaks" | "tasks",
  isDark: boolean,
): string {
  const base =
    "sb-interactive flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40";

  if (variant === "tasks") {
    return cn(
      base,
      isDark
        ? "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
        : "border-[color-mix(in_srgb,var(--ios-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--ios-blue)_10%,var(--ios-background-secondary))] text-[var(--ios-blue)] hover:bg-[color-mix(in_srgb,var(--ios-blue)_16%,var(--ios-background-secondary))]",
    );
  }

  return cn(
    base,
    isDark
      ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
      : "border-[color-mix(in_srgb,var(--ios-red)_30%,transparent)] bg-[color-mix(in_srgb,var(--ios-red)_8%,var(--ios-background-secondary))] text-[var(--ios-red)] hover:bg-[color-mix(in_srgb,var(--ios-red)_14%,var(--ios-background-secondary))]",
  );
}
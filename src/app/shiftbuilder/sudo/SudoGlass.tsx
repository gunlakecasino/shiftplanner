"use client";

/**
 * SudoGlass — shared light/dark glass velvet primitives for the privileged admin surface.
 *
 * Follows the exact Velvet token language from globals.css + the proven glassStyle
 * patterns from FloatingNav. Supports both light and dark via the isDark prop
 * (Sudo now follows the app theme per operator preference).
 *
 * Philosophy:
 * - Gold (#B89708) for privilege cues (hairline, active states) — never red "danger".
 * - Subtle brushed-gold top hairline only for the cleanest privileged signal.
 * - Inner content uses elevated paper or soft glass cards for contrast.
 * - All interactions (outside click, Esc) remain the responsibility of the caller.
 * - No new runtime dependencies.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface GlassSurfaceProps {
  isDark?: boolean;
  className?: string;
  children?: React.ReactNode;
  /** Optional stronger elevation for cards inside the admin surface */
  elevated?: boolean;
  style?: React.CSSProperties;
}

/**
 * Core frosted glass surface. Use for the main Sudo panel, the nested centered modals,
 * inner cards, etc. Matches FloatingNav glassStyle + --sb-* tokens.
 */
export function GlassSurface({
  isDark = false,
  className,
  children,
  elevated = false,
}: GlassSurfaceProps) {
  const style = isDark
    ? {
        background: "rgba(28, 28, 30, 0.78)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        boxShadow: elevated
          ? "0 12px 40px -12px rgb(0 0 0 / 0.55), 0 4px 12px -4px rgb(0 0 0 / 0.35), inset 0 1px 0 rgba(255,255,255,0.12)"
          : "0 25px 50px -12px rgb(0 0 0 / 0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
      }
    : {
        background: "rgba(248, 248, 246, 0.90)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: "1px solid rgba(0, 0, 0, 0.08)",
        boxShadow: elevated
          ? "0 12px 32px -12px rgb(0 0 0 / 0.12), 0 4px 12px -4px rgb(0 0 0 / 0.08), inset 0 1px 0 rgba(255,255,255,0.95)"
          : "0 25px 50px -12px rgb(0 0 0 / 0.18), inset 0 1px 0 rgba(255,255,255,0.95)",
      };

  return (
    <div
      className={cn("rounded-2xl overflow-hidden", className)}
      style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)", ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Subtle brushed-gold hairline used as the single privilege cue at the very top
 * of the Sudo shell (and any privileged nested surfaces). Cleanest possible signal.
 */
export function GoldHairline({ isDark = false }: { isDark?: boolean }) {
  return (
    <div
      className="h-[2px] w-full"
      style={{
        background: isDark
          ? "linear-gradient(to right, transparent, rgba(184,151,8,0.55) 18%, rgba(184,151,8,0.55) 82%, transparent)"
          : "linear-gradient(to right, transparent, rgba(184,151,8,0.65) 18%, rgba(184,151,8,0.65) 82%, transparent)",
      }}
    />
  );
}

/**
 * Tab button used in the left rail (or top segmented control for centered modals).
 * Active state uses soft gold tint + gold text. Matches the rest of Velvet.
 */
export interface SudoTabButtonProps {
  active: boolean;
  isDark?: boolean;
  icon?: string; // Material Symbol name
  label: string;
  comingSoon?: boolean;
  onClick: () => void;
  className?: string;
}

export function SudoTabButton({
  active,
  isDark = false,
  icon,
  label,
  comingSoon,
  onClick,
  className,
}: SudoTabButtonProps) {
  const gold = "#ffcc00"; // iOS yellow (was gold)
  const goldTint = isDark ? "rgba(184,151,8,0.14)" : "rgba(184,151,8,0.12)";

  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className={cn(
        "sb-interactive w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium tracking-[0.2px]",
        active
          ? isDark
            ? "bg-[#B89708]/15 text-[#E9B948] border border-[#B89708]/30"
            : "bg-[#B89708]/10 text-[#8B6910] border border-[#B89708]/25"
          : comingSoon
          ? isDark
            ? "text-zinc-600 cursor-not-allowed"
            : "text-[#9CA3AF] cursor-not-allowed"
          : isDark
          ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
          : "text-[#3C3C43] hover:bg-black/5 hover:text-[#111] border border-transparent",
        className
      )}
    >
      {icon && (
        <span
          className="ms"
          style={{
            fontSize: 16,
            color: active ? gold : undefined,
          }}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 text-left">{label}</span>
      {comingSoon && (
        <span className="text-[9px] uppercase tracking-wider opacity-60">soon</span>
      )}
    </button>
  );
}

/**
 * Lightweight inline banner used for the local flash toasts inside Sudo tabs
 * and the nested centered modals. Light and dark glass-aware variants.
 */
export interface SudoBannerProps {
  kind: "ok" | "err" | "warn" | "info";
  isDark?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function SudoBanner({ kind, isDark = false, children, className }: SudoBannerProps) {
  const styles = (() => {
    if (isDark) {
      switch (kind) {
        case "ok":
          return "bg-emerald-500/10 border-emerald-500/30 text-emerald-200";
        case "err":
          return "bg-red-500/10 border-red-500/30 text-red-200";
        case "warn":
          return "bg-amber-500/10 border-amber-500/30 text-amber-200";
        default:
          return "bg-white/5 border-white/10 text-zinc-200";
      }
    } else {
      switch (kind) {
        case "ok":
          return "bg-emerald-500/8 border-emerald-600/20 text-emerald-900";
        case "err":
          return "bg-red-500/8 border-red-600/20 text-red-950";
        case "warn":
          return "bg-amber-500/8 border-amber-600/25 text-amber-950";
        default:
          return "bg-black/5 border-black/10 text-[#1C1C1E]";
      }
    }
  })();

  return (
    <div
      className={cn(
        "sb-toast-enter rounded-xl px-3.5 py-2.5 text-[12px] border font-medium",
        styles,
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Small gold privilege badge used in headers when we want a tiny explicit marker.
 * Currently the design favors the hairline only, so this is available for future use.
 */
export function SudoBadge({ isDark = false, children }: { isDark?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-px rounded text-[10px] font-mono tracking-[1px] border",
        isDark
          ? "bg-[#B89708]/10 text-[#E9B948] border-[#B89708]/30"
          : "bg-[#B89708]/10 text-[#8B6910] border-[#B89708]/25"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Centered premium glass modal shell (intended for the TMEditDrawer and any
 * future focused admin sub-surfaces). Uses the same GlassSurface + gold hairline.
 * Much more focused than a second right slide-in.
 */
export interface CenteredGlassModalProps {
  open: boolean;
  onClose: () => void;
  isDark?: boolean;
  width?: number | string; // e.g. 720 or "min(720px, 92vw)"
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional extra actions in the header (sign out, etc.) */
  headerActions?: React.ReactNode;
}

export function CenteredGlassModal({
  open,
  onClose,
  isDark = false,
  width = 720,
  title,
  subtitle,
  children,
  footer,
  headerActions,
}: CenteredGlassModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center p-4" aria-modal="true" role="dialog">
      {/* Softer backdrop for centered premium feel */}
      <div
        className="sb-overlay-backdrop sb-overlay-backdrop--fixed"
        onClick={onClose}
      />

      <GlassSurface
        isDark={isDark}
        elevated
        className="sb-modal-enter relative flex flex-col overflow-hidden"
        style={{ width: typeof width === "number" ? `${width}px` : width, maxWidth: "96vw" }}
      >
        <GoldHairline isDark={isDark} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 dark:border-white/10">
          <div>
            {title && <div className="text-[14px] font-semibold tracking-[-0.1px]">{title}</div>}
            {subtitle && <div className="text-[11px] text-[#6C6C72] dark:text-[#9CA3AF] font-mono mt-0.5">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              className="sb-interactive text-[#6C6C72] dark:text-zinc-400 hover:text-[#111] dark:hover:text-zinc-100 rounded p-1.5"
              aria-label="Close"
            >
              <span className="ms" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto p-5">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-black/10 dark:border-white/10 px-5 py-3 bg-black/3 dark:bg-white/3">
            {footer}
          </div>
        )}
      </GlassSurface>
    </div>
  );
}

// Convenience re-export of the gold constant for any tab that needs it
export const SUDO_GOLD = "#ffcc00"; // iOS yellow

export { SudoTabLoading, BuilderBusyLabel } from "../components/builderPrimitives";

"use client";

/**
 * TeamShell — the /team people console.
 *
 * One home for everything about the humans on the board: the roster
 * (identity, grave pool, prefs, accommodations, skills), the Fri–Thu graves
 * default schedule, and the weekly special-assignment groups. Consolidated out
 * of Settings so the roster and "who works tonight" live side by side — the
 * grave-pool you set on a TM is exactly what makes them eligible in the grid.
 */

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, CalendarDays, Layers } from "lucide-react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { MONTH_LONG } from "@/lib/shiftbuilder/dateUtils";
import { TeamTab } from "../sudo/TeamTab";
import { GravesDefaultSchedulePage } from "../components/GravesDefaultSchedulePage";
import { SpecialGroupsPanel } from "./SpecialGroupsPanel";

type TeamView = "roster" | "schedule" | "groups";

type TeamTabDef = {
  id: TeamView;
  label: string;
  icon: typeof Users;
  description: string;
  /** Permission gate — false hides the tab entirely for this operator. */
  allowed: boolean;
};

function resolveView(param: string | null): TeamView {
  if (param === "schedule" || param === "groups" || param === "roster") return param;
  // Friendly aliases from old links / redirects.
  if (param === "gravesSchedule") return "schedule";
  if (param === "special") return "groups";
  return "roster";
}

export function TeamShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { permissions } = useOpsAuth();

  const canManageTeam = permissions?.canManageTeam ?? false;
  const canApplySchedules = permissions?.canApplySchedules ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;

  const tabs = React.useMemo<TeamTabDef[]>(
    () => [
      {
        id: "roster",
        label: "Roster",
        icon: Users,
        description: "Profiles, grave pool, preferences, accommodations, and per-slot skills",
        allowed: canManageTeam || canAccessSudo,
      },
      {
        id: "schedule",
        label: "Graves Schedule",
        icon: CalendarDays,
        description: "Master Fri–Thu grid — who is scheduled each grave night",
        allowed: canApplySchedules || canAccessSudo,
      },
      {
        id: "groups",
        label: "On-Call",
        icon: Layers,
        description: "On-call backup pool — overlaps live on the Graves Schedule",
        allowed: canManageTeam || canAccessSudo,
      },
    ],
    [canManageTeam, canApplySchedules, canAccessSudo],
  );

  const visibleTabs = React.useMemo(() => tabs.filter((t) => t.allowed), [tabs]);

  const requested = resolveView(searchParams.get("tab"));
  // Fall back to the first tab this operator can actually see.
  const activeView: TeamView =
    visibleTabs.find((t) => t.id === requested)?.id ?? visibleTabs[0]?.id ?? "roster";

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const selectView = React.useCallback(
    (view: TeamView) => {
      router.replace(`/shiftbuilder/team?tab=${view}`, { scroll: false });
    },
    [router],
  );

  const formattedDate = `${MONTH_LONG[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const activeMeta = visibleTabs.find((t) => t.id === activeView) ?? tabs[0];

  return (
    <div
      className="min-h-screen bg-[#F8F8F9] text-[#1C1C1E]"
      style={{ fontFamily: "var(--font-atkinson, system-ui, sans-serif)" }}
    >
      <header className="flex items-center justify-between border-b border-neutral-200/80 bg-white/70 px-6 py-2.5 text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-500 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="font-bold text-neutral-700">GLCR</span>
          <span className="h-3 w-px bg-neutral-300" aria-hidden />
          <span>People &amp; Schedule</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>{formattedDate}</span>
          <span>{timeString}</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1180px] px-6 pb-16 pt-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#B89708]">
              OMS · Team
            </p>
            <h1 className="mt-1 text-[26px] font-bold tracking-[-0.4px]">Team</h1>
            <p className="mt-1 text-[13px] text-neutral-500">
              The roster, the grave schedule, and the on-call pool — everyone the board deploys.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/sheetbuilder")}
            className="sb-interactive inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <ArrowLeft size={14} strokeWidth={2.2} />
            SheetBuilder
          </button>
        </div>

        {/* Tab pills */}
        <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Team sections">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectView(tab.id)}
                title={tab.description}
                className={`sb-interactive inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? "border-[#B89708]/40 bg-[#B89708]/10 text-[#8B6910]"
                    : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                <Icon
                  size={15}
                  strokeWidth={2.1}
                  style={{ color: isActive ? "#B89708" : "#9CA3AF" }}
                />
                {tab.label}
              </button>
            );
          })}
        </div>

        {visibleTabs.length === 0 ? (
          <div className="rounded-3xl border border-neutral-200 bg-white p-10 text-center text-[13px] text-neutral-500">
            Your role doesn&apos;t include team management tools.
          </div>
        ) : (
          <div
            className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
            role="tabpanel"
            aria-label={activeMeta?.label}
          >
            {activeView === "roster" && <TeamTab isDark={false} />}
            {activeView === "schedule" && <GravesDefaultSchedulePage embedded />}
            {activeView === "groups" && <SpecialGroupsPanel />}
          </div>
        )}

        <div className="mt-6 text-center text-[11px] text-neutral-400">
          Engine, card defaults, and operator PINs live in{" "}
          <Link href="/sheetbuilder/settings" className="font-semibold text-neutral-500 underline-offset-2 hover:underline">
            Settings
          </Link>
          .
        </div>
      </div>
    </div>
  );
}

export default TeamShell;

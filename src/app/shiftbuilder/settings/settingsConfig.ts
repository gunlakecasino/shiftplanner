import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bolt,
  Layers,
  LayoutDashboard,
  ScrollText,
  SlidersHorizontal,
  Table2,
  UserCog,
  Users,
} from "lucide-react";

export type SettingsTab =
  | "dashboard"
  | "defaults"
  | "team"
  | "weeklyRoster"
  | "users"
  | "engine"
  | "planner"
  | "reports"
  | "auditLog";

export type SettingsSection = "operations" | "people" | "engine" | "insights";

export type SettingsTabDef = {
  id: SettingsTab;
  label: string;
  shortLabel: string;
  section: SettingsSection;
  icon: LucideIcon;
  description: string;
};

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  accent: string;
}> = [
  { id: "operations", label: "Operations", accent: "#B89708" },
  { id: "people", label: "People", accent: "#007AFF" },
  { id: "engine", label: "Engine", accent: "#34C759" },
  { id: "insights", label: "Insights", accent: "#4D1A8A" },
];

export const SETTINGS_TABS: SettingsTabDef[] = [
  {
    id: "defaults",
    label: "Card Defaults",
    shortLabel: "Cards",
    section: "operations",
    icon: Layers,
    description: "Default tasks and markers pushed to nights",
  },
  {
    id: "team",
    label: "Team",
    shortLabel: "Team",
    section: "people",
    icon: Users,
    description: "Roster profiles, eligibility, and grave pools",
  },
  {
    id: "weeklyRoster",
    label: "Weekly Roster",
    shortLabel: "Roster",
    section: "people",
    icon: Table2,
    description: "Apply and manage the weekly deployment roster",
  },
  {
    id: "users",
    label: "Users",
    shortLabel: "Users",
    section: "people",
    icon: UserCog,
    description: "Operator PINs and privilege overrides",
  },
  {
    id: "engine",
    label: "Engine Config",
    shortLabel: "Engine",
    section: "engine",
    icon: SlidersHorizontal,
    description: "Placement engine weights and behavior",
  },
  {
    id: "planner",
    label: "Batch Planner",
    shortLabel: "Planner",
    section: "engine",
    icon: Bolt,
    description: "Run weighted planner across nights",
  },
  {
    id: "dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    section: "insights",
    icon: LayoutDashboard,
    description: "Ops overview and quick actions",
  },
  {
    id: "reports",
    label: "Reports",
    shortLabel: "Reports",
    section: "insights",
    icon: BarChart3,
    description: "Zone frequency and placement analytics",
  },
  {
    id: "auditLog",
    label: "Audit Log",
    shortLabel: "Audit",
    section: "insights",
    icon: ScrollText,
    description: "Filtered timeline of every operator action",
  },
];

/** Tabs that need a tall scroll region inside the paper artboard */
export const TALL_SETTINGS_TABS = new Set<SettingsTab>([
  "defaults",
  "team",
  "weeklyRoster",
  "users",
  "reports",
  "auditLog",
  "engine",
  "planner",
]);

export const VALID_SETTINGS_TABS = new Set<string>(SETTINGS_TABS.map((t) => t.id));

export function isSettingsTab(tab: string): tab is SettingsTab {
  return VALID_SETTINGS_TABS.has(tab);
}

/** Legacy ?tab= values removed from the settings shell. */
const DEPRECATED_SETTINGS_TAB_REDIRECTS: Record<string, SettingsTab> = {
  tasks: "defaults",
  tmDefaults: "weeklyRoster",
};

export function resolveSettingsTab(param: string | null): SettingsTab {
  if (param && isSettingsTab(param)) return param;
  if (param && param in DEPRECATED_SETTINGS_TAB_REDIRECTS) {
    return DEPRECATED_SETTINGS_TAB_REDIRECTS[param];
  }
  return "dashboard";
}

export function sectionForTab(tab: SettingsTab): SettingsSection {
  return SETTINGS_TABS.find((t) => t.id === tab)?.section ?? "insights";
}

export function tabMeta(tab: SettingsTab): SettingsTabDef {
  return SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[SETTINGS_TABS.length - 1];
}
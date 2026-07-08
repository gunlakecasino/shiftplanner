import type { LucideIcon } from "lucide-react";
import {
  Bolt,
  Layers,
  ScrollText,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";

export type SettingsTab =
  | "defaults"
  | "users"
  | "engine"
  | "planner"
  | "auditLog";

export type SettingsSection = "operations" | "engine" | "access";

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
  { id: "engine", label: "Engine", accent: "#34C759" },
  { id: "access", label: "Access", accent: "#007AFF" },
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
    id: "users",
    label: "Users",
    shortLabel: "Users",
    section: "access",
    icon: UserCog,
    description: "Operator PINs and privilege overrides",
  },
  {
    id: "auditLog",
    label: "Audit Log",
    shortLabel: "Audit",
    section: "access",
    icon: ScrollText,
    description: "Filtered timeline of every operator action",
  },
];

/** Tabs that need a tall scroll region inside the paper artboard */
export const TALL_SETTINGS_TABS = new Set<SettingsTab>([
  "defaults",
  "users",
  "auditLog",
  "engine",
  "planner",
]);

export const VALID_SETTINGS_TABS = new Set<string>(SETTINGS_TABS.map((t) => t.id));

export function isSettingsTab(tab: string): tab is SettingsTab {
  return VALID_SETTINGS_TABS.has(tab);
}

/**
 * Legacy ?tab= values that now live on the /team page. SettingsShell detects
 * these and redirects out to /team with the matching section.
 */
export const TEAM_REDIRECT_TABS: Record<string, "roster" | "schedule" | "groups"> = {
  team: "roster",
  gravesSchedule: "schedule",
  tmDefaults: "schedule",
  weeklyRoster: "schedule",
};

/** Legacy ?tab= values folded into a surviving settings tab. */
const DEPRECATED_SETTINGS_TAB_REDIRECTS: Record<string, SettingsTab> = {
  tasks: "defaults",
  dashboard: "defaults",
  reports: "auditLog",
};

export const DEFAULT_SETTINGS_TAB: SettingsTab = "defaults";

export function resolveSettingsTab(param: string | null): SettingsTab {
  if (param && isSettingsTab(param)) return param;
  if (param && param in DEPRECATED_SETTINGS_TAB_REDIRECTS) {
    return DEPRECATED_SETTINGS_TAB_REDIRECTS[param];
  }
  return DEFAULT_SETTINGS_TAB;
}

export function sectionForTab(tab: SettingsTab): SettingsSection {
  return SETTINGS_TABS.find((t) => t.id === tab)?.section ?? "operations";
}

export function tabMeta(tab: SettingsTab): SettingsTabDef {
  return SETTINGS_TABS.find((t) => t.id === tab) ?? SETTINGS_TABS[0];
}

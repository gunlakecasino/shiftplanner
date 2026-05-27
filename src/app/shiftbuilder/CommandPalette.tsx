"use client";

import React from "react";
import Cmdk, {
  getItemIndex,
} from "react-cmdk";
import "react-cmdk/dist/cmdk.css";
import { toCmdkJsonStructure } from "@/lib/shiftbuilder/useCommandActions";
import { RosterItemRow } from "./CommandPalette.legacy";  // Reuse rich row renderer during the rebuild transition

// Icons for the new quick menu root
import { Users, ArrowLeft, Settings, Printer, Undo2 } from "lucide-react";

/**
 * CommandPalette (react-cmdk + Velvet rearchitecture)
 *
 * This is the primary implementation after the full-scale rebuild.
 * Built on react-cmdk for better structure, accessibility, keyboard navigation,
 * and multi-page flows, while applying the project's Liquid Glass / Golden /
 * Atkinson / Velvet visual language.
 *
 * Many advanced features (full NL command mode with chips, complete Grok integration,
 * multi-step coverage/tasks/borders as Pages, Why panel, etc.) are being actively
 * ported into the new architecture.
 *
 * See the approved rebuild plan for details.
 */

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Accepts the existing CommandItem[] from useCommandActions for the spike
  actions?: any[];
  placeholder?: string;
  // Pass-through for future (initialContext, Grok props, etc.)
  [key: string]: any;
}

export function CommandPalette({
  open,
  onOpenChange,
  actions = [],
  placeholder = "Search roster, actions, days…",
  ...rest
}: CommandPaletteProps) {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState<"root" | "roster" | "actions" | "context">("root");

  // Use the new adapter for the spike (transforms current registry output)
  const filteredItems = React.useMemo(() => {
    return toCmdkJsonStructure(actions as any, search);
  }, [actions, search]);

  // Extract the roster group so we can render it on its own dedicated page
  const rosterGroup = React.useMemo(() => {
    return filteredItems.find(
      (g) => g.id === "roster" || g.heading?.toLowerCase() === "roster"
    );
  }, [filteredItems]);

  if (!open) return null;

  // Dynamic placeholder based on current page
  const effectivePlaceholder =
    page === "roster"
      ? "Search team members by name, section, status…"
      : placeholder;

  // Reusable renderer for a group's items (rich RosterItemRow for TMs, normal for others)
  const renderGroupItems = (list: any) => {
    if (!list?.items?.length) return null;

    return list.items.map(({ id, ...itemRest }: any) => {
      const meta = itemRest.metadata;
      const isRosterItem = list.heading === "Roster" || !!meta?.tm;

      const itemChildren = isRosterItem && meta?.tm ? (
        <RosterItemRow item={{
          id,
          label: itemRest.label || (typeof itemRest.children === "string" ? itemRest.children : ""),
          metadata: meta,
          group: list.heading as any,
          handler: itemRest.onClick,
        } as any} />
      ) : (
        itemRest.children
      );

      return (
        <Cmdk.ListItem
          key={id}
          index={getItemIndex(filteredItems as any, id) ?? 0}
          onClick={itemRest.onClick}
          closeOnSelect={itemRest.closeOnSelect}
        >
          {itemChildren}
        </Cmdk.ListItem>
      );
    });
  };

  return (
    <Cmdk
      onChangeSearch={setSearch}
      onChangeOpen={onOpenChange}
      search={search}
      isOpen={open}
      page={page}
      placeholder={effectivePlaceholder}
    >
      {/* ==================== ROOT: Quick Menu (new default open experience) ==================== */}
      <Cmdk.Page id="root">
        {/* Primary entry point the user asked for */}
        <Cmdk.List>
          <Cmdk.ListItem
            index={0}
            onClick={() => {
              setPage("roster");
              setSearch(""); // fresh searchable roster list
            }}
          >
            <div className="flex items-center gap-3 py-0.5">
              <Users className="h-5 w-5 shrink-0 opacity-75" />
              <div className="flex flex-col leading-tight">
                <span className="font-medium tracking-[-0.1px]">Roster</span>
                <span className="text-[11px] opacity-60">Search &amp; assign team members</span>
              </div>
            </div>
          </Cmdk.ListItem>
        </Cmdk.List>

        {/* Quick one-shot actions (high-frequency ops, no drill-down) */}
        <Cmdk.List heading="Quick actions">
          <Cmdk.ListItem
            index={1}
            onClick={() => {
              const openSudo = (rest as any).onOpenSudo;
              if (openSudo) openSudo();
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 opacity-70" />
              <span>Open Sudo / Command Center</span>
            </div>
          </Cmdk.ListItem>

          <Cmdk.ListItem
            index={2}
            onClick={() => {
              // Placeholder — will be wired to real print flow in next slice
              const onPrint = (rest as any).onPrint;
              if (onPrint) onPrint();
              else console.log("[Command] Print requested from quick menu");
              onOpenChange(false);
            }}
          >
            <div className="flex items-center gap-3">
              <Printer className="h-4 w-4 opacity-70" />
              <span>Print Break Sheet / Reports</span>
            </div>
          </Cmdk.ListItem>

          <Cmdk.ListItem
            index={3}
            onClick={() => {
              const onUndo = (rest as any).onUndo;
              if (onUndo) onUndo();
              else console.log("[Command] Undo requested");
              // stay open for undo chaining if desired
            }}
          >
            <div className="flex items-center gap-3">
              <Undo2 className="h-4 w-4 opacity-70" />
              <span>Undo last change</span>
            </div>
          </Cmdk.ListItem>
        </Cmdk.List>

        {/* Room for future categories: Navigation, Grok Assist, Advanced, etc. */}
      </Cmdk.Page>

      {/* ==================== ROSTER PAGE: The expanded TM list the user wants behind the entry ==================== */}
      <Cmdk.Page id="roster">
        <Cmdk.List heading="Team Members">
          {rosterGroup ? (
            renderGroupItems(rosterGroup)
          ) : (
            <div className="px-3 py-2 text-sm opacity-60">No team members loaded.</div>
          )}
        </Cmdk.List>

        {/* Explicit back to quick menu */}
        <Cmdk.List heading="Navigation">
          <Cmdk.ListItem
            index={99}
            onClick={() => {
              setPage("root");
              setSearch("");
            }}
          >
            <div className="flex items-center gap-2 text-[13px]">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to quick menu</span>
            </div>
          </Cmdk.ListItem>
        </Cmdk.List>
      </Cmdk.Page>

      {/* Future pages for multi-step (coverage, tasks, grok "why", NL command mode, etc.) */}
      <Cmdk.Page id="context">
        <div style={{ padding: 16, color: "#666", fontSize: 13 }}>
          Contextual sub-page (person/slot flows) — ported in Phase 2 of the rebuild.
          <br />
          This demonstrates the clean page model replacing the old custom contextStep state machine.
        </div>
      </Cmdk.Page>

      <Cmdk.Page id="actions">
        <div style={{ padding: 16, color: "#666", fontSize: 13 }}>
          Actions page coming in next slice (coverage, borders, tasks, etc.).
        </div>
      </Cmdk.Page>
    </Cmdk>
  );
}

// Maintain compatibility during transition
export { CommandPalette as VelvetCommandPalette };

export default CommandPalette;

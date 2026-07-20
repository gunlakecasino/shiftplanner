"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ZoneCard from "../components/ZoneCard";
import AuxCard from "../components/AuxCard";
import RRCard from "../components/RRCard";
import OverlapSlot from "../components/OverlapSlot";
import TaskRow from "../components/TaskRow";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { premiumSpring } from "@/lib/premiumSpring";

// Style tokens are declared inside the component (see below) to guarantee
// they are always in lexical scope for JSX expressions and .map callbacks.

interface DemoControls {
  hasTM: boolean;
  showDigitalAssists: boolean;
  isLocked: boolean;
  taskCount: number;
  hasCoverage: boolean;
  coverageCount: number;
  breakGroup: 0 | 1 | 2 | 3;
  showFit: boolean;
  customTasks: string[];
  zoom: number;
}

const defaultControls: DemoControls = {
  hasTM: true,
  showDigitalAssists: true,
  isLocked: false,
  taskCount: 2,
  hasCoverage: true,
  coverageCount: 1,
  breakGroup: 2,
  showFit: true,
  customTasks: ["Check high limit", "Escort to cage if the guest requests assistance with their winnings and needs secure transport to the main cage area"],
  zoom: 1,
};

const mockZoneDef = { key: "Z1", label: "ZONE 1", locations: ["Main Entry North"] };
const mockAuxDef: AuxDef = { key: "AUX1", role: "support", label: "SUPPORT 1", locations: ["Float Support"] };
const mockRRDef = { num: 1, label: "RR 1+2" };

function buildTasks(controls: DemoControls): NightSlotTask[] {
  const labels = controls.customTasks.length > 0 ? controls.customTasks : ["Check high limit", "Escort to cage"];
  return Array.from({ length: Math.min(controls.taskCount, labels.length) }, (_, i) => ({
    id: `t-${i}`,
    nightId: "demo",
    slotKey: "demo",
    slotType: "zone" as const,
    rrSide: null,
    taskLabel: labels[i],
    catalogTaskId: null,
    sortOrder: 10 + i,
    color: i === 0 ? "#B89708" : null,
    isCoverage: false,
  }));
}

function buildCoverage(controls: DemoControls): NightSlotTask[] {
  if (!controls.hasCoverage) return [];
  return Array.from({ length: controls.coverageCount }, (_, i) => ({
    id: `c-${i}`,
    nightId: "demo",
    slotKey: "demo",
    slotType: "zone" as const,
    rrSide: null,
    taskLabel: i === 0 ? "AND LOBBY" : "AND ZONE 3",
    catalogTaskId: null,
    sortOrder: 99,
    color: "#E53935",
    isCoverage: true,
  }));
}

function buildAssignment(controls: DemoControls) {
  if (!controls.hasTM) return {};
  return {
    tmId: "tm_demo",
    tmName: "Jamie Rivera",
    breakGroup: controls.breakGroup,
    isLocked: controls.isLocked,
  };
}

const componentList = [
  { id: "navbar", label: "Navbar", icon: "☰" },
  { id: "zone", label: "Zone Card", icon: "★" },
  { id: "aux", label: "Aux Card", icon: "⬡" },
  { id: "rr", label: "Restroom Card", icon: "◐" },
  { id: "overlap", label: "Overlap Slot", icon: "◉" },
] as const;

type ComponentId = typeof componentList[number]["id"];

export default function XDStyleComponentLibrary() {
  const [selectedComponent, setSelectedComponent] = useState<ComponentId>("zone");
  const [controls, setControls] = useState<DemoControls>(defaultControls);
  const [activeVariant, setActiveVariant] = useState<string>("Custom");
  const [mode, setMode] = useState<"design" | "prototype" | "specs">("design");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [showPrototypeModal, setShowPrototypeModal] = useState(false);

  // Library Navbar state
  const [navSearch, setNavSearch] = useState("");
  const [navActiveTab, setNavActiveTab] = useState<"components" | "tokens" | "guidelines">("components");

  // XD-style tokens (Adobe XD inspired) - declared *immediately* after hooks
  // and before any render logic / JSX / .map callbacks.
  // This guarantees no TDZ or "Can't find variable" at runtime in Turbopack/strict mode.
  const xdCanvas = {
    backgroundColor: "#ffffff",
    backgroundImage: `
      linear-gradient(#a8c5ff 1px, transparent 1px),
      linear-gradient(90deg, #a8c5ff 1px, transparent 1px)
    `,
    backgroundSize: "18px 18px",
    backgroundPosition: "-1px -1px",
  };
  const xdSurface = "bg-white border border-[#d1d5db] shadow-[0_1px_2px_rgb(0,0,0,0.04),0_10px_30px_-10px_rgb(0,0,0,0.08)] rounded-[4px] overflow-hidden";
  const xdPanel = "bg-white/95 backdrop-blur-xl border border-[#e5e7eb] shadow-[0_4px_12px_rgb(0,0,0,0.05)] rounded-xl";
  const xdToolbar = "bg-white border-b border-[#e5e7eb] shadow-sm";
  const xdInput = "w-full px-3 py-1.5 text-sm bg-white border border-[#d1d5db] rounded-md focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30 transition-all text-[#1f2937]";
  const xdButton = "px-3.5 py-1.5 text-sm font-medium rounded-lg border border-[#d1d5db] bg-white hover:bg-[#f8fafc] active:bg-[#f1f5f9] transition-all";
  const xdActive = "px-3.5 py-1.5 text-sm font-medium rounded-lg bg-[#1e40af] text-white border-[#1e40af] hover:bg-[#1e3a8a]";

  const updateControl = <K extends keyof DemoControls>(key: K, value: DemoControls[K]) => {
    setControls((prev) => ({ ...prev, [key]: value }));
    if (activeVariant !== "Custom") setActiveVariant("Custom");
  };

  // Real editing handlers wired to the live demo state
  // These are passed to the actual card components so that interactions
  // (remove ×, click to edit, etc.) directly mutate the preview data.
  const handleRemoveTask = (slotKey: string, taskLabel: string) => {
    if (taskLabel.includes('AND') || taskLabel.includes('LOBBY') || taskLabel.includes('ZONE')) {
      // Coverage bar
      if (controls.coverageCount > 1) {
        updateControl('coverageCount', (controls.coverageCount - 1) as any);
      } else {
        updateControl('hasCoverage', false);
      }
    } else {
      // Regular task
      const idx = controls.customTasks.indexOf(taskLabel);
      if (idx > -1) {
        const newCustom = controls.customTasks.filter((_, i) => i !== idx);
        updateControl('customTasks', newCustom.length > 0 ? newCustom : ['Check high limit']);
        updateControl('taskCount', Math.max(0, newCustom.length));
      }
    }
  };

  const handleEditTask = (slotKey: string, oldLabel: string, newLabel: string) => {
    if (!newLabel || newLabel === oldLabel) return;
    if (oldLabel.includes('AND') || oldLabel.includes('LOBBY') || oldLabel.includes('ZONE')) return; // don't edit coverage labels here
    const idx = controls.customTasks.indexOf(oldLabel);
    if (idx > -1) {
      const newCustom = [...controls.customTasks];
      newCustom[idx] = newLabel.trim();
      updateControl('customTasks', newCustom);
    }
  };

  const handleOpenTaskTextEdit = (slotKey: string, task?: NightSlotTask) => {
    // Simple but effective inline editing via prompt (feels like a design tool)
    // In a fuller XD tool this could open the real TaskTextEditPad in a portal.
    if (!task) return;
    const newLabel = window.prompt('Edit task label (demo):', task.taskLabel);
    if (newLabel != null) {
      handleEditTask(slotKey, task.taskLabel, newLabel);
    }
  };

  const applyPreset = (preset: Partial<DemoControls> & { label: string }) => {
    const newC = { ...controls, ...preset } as DemoControls;
    setControls(newC);
    setActiveVariant(preset.label);
  };

  const tasks = buildTasks(controls);
  const coverage = buildCoverage(controls);
  const allTasks = [...tasks, ...coverage];
  const assignment = buildAssignment(controls);

  const selectedTasks = { Z1: allTasks, AUX1: tasks.slice(0, 2), MRR1: allTasks, WRR1: [], OL1: allTasks };
  const assignments = {
    Z1: assignment,
    AUX1: assignment,
    MRR1: assignment,
    WRR1: { ...assignment, tmName: undefined },
    OL1: assignment,
  };

  const commonProps = {
    assignments,
    selectedTasks,
    onCardClick: () => {},
    loading: false,
    showDigitalAssists: controls.showDigitalAssists,
    isLocked: controls.isLocked,
    onRemoveTask: handleRemoveTask,
    onSetTaskColor: () => {},
    onEditTask: handleEditTask,
    onOpenTaskTextEdit: handleOpenTaskTextEdit,
  };

  // Note: handleRemoveTask and handleEditTask above are the card/slot versions for real component interactions.
  // The *Label versions below are for the inspector list (different signatures).

  const variants = [
    { label: "Default", patch: { hasTM: true, taskCount: 2, hasCoverage: true } },
    { label: "Empty", patch: { hasTM: false, taskCount: 0, hasCoverage: false } },
    { label: "Busy + Coverage", patch: { hasTM: true, taskCount: 4, hasCoverage: true, coverageCount: 2 } },
    { label: "Locked", patch: { isLocked: true } },
    { label: "No Digital Assists", patch: { showDigitalAssists: false } },
  ];

  const handleAddTaskLabel = () => {
    const newT = `Task ${controls.customTasks.length + 1}`;
    updateControl("customTasks", [...controls.customTasks, newT]);
    updateControl("taskCount", Math.min(6, controls.taskCount + 1));
  };

  const handleRemoveTaskLabel = (idx: number) => {
    const nt = controls.customTasks.filter((_, i) => i !== idx);
    updateControl("customTasks", nt.length ? nt : ["Check high limit"]);
    updateControl("taskCount", Math.max(0, controls.taskCount - 1));
  };

  const handleEditTaskLabel = (idx: number, val: string) => {
    const nt = [...controls.customTasks];
    nt[idx] = val;
    updateControl("customTasks", nt);
  };

  const handleZoom = (d: number) => setCanvasZoom(Math.max(0.6, Math.min(1.8, canvasZoom + d)));
  const resetZoom = () => setCanvasZoom(1);

  // Prototype interaction: clicking ASSIGN TM opens a mock placement pad overlay
  // (only relevant in prototype mode for empty states)
  const triggerPrototype = () => {
    if (mode === "prototype" && !controls.hasTM) {
      setShowPrototypeModal(true);
    }
  };

  const renderCard = (c: DemoControls = controls, scale = 0.95) => {
    const t = buildTasks(c);
    const cov = buildCoverage(c);
    const all = [...t, ...cov];
    const ass = buildAssignment(c);
    const st = { Z1: all, AUX1: t.slice(0, 2), MRR1: all, WRR1: [], OL1: all };
    const as = { Z1: ass, AUX1: ass, MRR1: ass, WRR1: { ...ass, tmName: undefined }, OL1: ass };

    const props = { ...commonProps, assignments: as, selectedTasks: st, showDigitalAssists: c.showDigitalAssists, isLocked: c.isLocked };

    if (selectedComponent === "zone") {
      return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} className="w-[440px] cursor-pointer" onClick={triggerPrototype}>
          <ZoneCard
            def={mockZoneDef}
            {...props}
            borderColor={c.showFit ? "#B89708" : undefined}
            fitChip={c.showFit ? { fitVerdict: "strong_fit" as const, fitSummary: "Strong match", fitFactLine: "Excellent rotation" } : null}
          />
        </div>
      );
    }

    if (selectedComponent === "aux") {
      return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} className="w-[440px]">
          <AuxCard
            def={mockAuxDef}
            {...props}
            onSetAuxRole={() => {}}
            onSetAuxLabel={() => {}}
          />
        </div>
      );
    }

    if (selectedComponent === "rr") {
      return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} className="w-[440px]">
          <RRCard
            def={mockRRDef}
            assignments={{ MRR1: ass, WRR1: { ...ass, tmName: undefined } }}
            selectedTasks={{ MRR1: all, WRR1: [] }}
            onGenderClick={() => {}}
            loading={false}
            showDigitalAssists={c.showDigitalAssists}
            isLocked={c.isLocked}
            onRemoveTask={handleRemoveTask}
            onEditTask={handleEditTask}
            onOpenTaskTextEdit={handleOpenTaskTextEdit}
          />
        </div>
      );
    }

    return (
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} className="w-[440px]">
        <OverlapSlot
          slotKey="OL-PM-0"
          assignments={{ "OL-PM-0": c.hasTM ? ass : {} }}
          selectedTasks={{ "OL-PM-0": all }}
          onRemoveTask={handleRemoveTask}
          onEditTask={handleEditTask}
          onOpenTaskTextEdit={handleOpenTaskTextEdit}
          showDigitalAssists={c.showDigitalAssists}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1f2937]">
      {/* Proper Library Dashboard Navbar (starting point for the component library) */}
      <nav className="sticky top-0 z-50 bg-white border-b border-[#e5e7eb] shadow-sm">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#1e40af] text-white flex items-center justify-center text-sm font-bold tracking-tighter">SB</div>
              <div>
                <div className="font-semibold text-[17px] tracking-[-0.4px] text-[#111827]">ShiftBuilder</div>
                <div className="text-[10px] text-[#64748b] -mt-1">UI Library</div>
              </div>
            </div>
            <div className="ml-1 px-2 py-0.5 text-[10px] font-mono tracking-[1px] bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe] rounded">v1 • XD</div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search components, tokens, guidelines..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-[#f8fafc] border border-[#e5e7eb] rounded-full focus:outline-none focus:border-[#1e40af] focus:ring-1 focus:ring-[#1e40af]/20 placeholder:text-[#94a3b8]"
                value={navSearch}
                onChange={(e) => setNavSearch(e.target.value)}
              />
              <div className="absolute left-3.5 top-2.5 text-[#94a3b8]">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Nav Links + Actions */}
          <div className="flex items-center gap-2 text-sm">
            {[
              { label: "Components", key: "components" as const },
              { label: "Tokens", key: "tokens" as const },
              { label: "Guidelines", key: "guidelines" as const },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setNavActiveTab(item.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${navActiveTab === item.key ? "bg-[#1e40af] text-white" : "text-[#475569] hover:bg-[#f1f5f9] hover:text-[#1e40af]"}`}
              >
                {item.label}
              </button>
            ))}

            <div className="w-px h-5 bg-[#e5e7eb] mx-2" />

            <button 
              onClick={() => setMode(mode === "design" ? "prototype" : "design")}
              className="px-3 py-1.5 text-xs font-medium border border-[#d1d5db] rounded-full hover:bg-[#f8fafc] flex items-center gap-1.5"
            >
              {mode === "design" ? "Switch to Prototype" : "Switch to Design"}
            </button>

            <button 
              onClick={() => { setControls(defaultControls); setActiveVariant("Custom"); }}
              className="px-3 py-1.5 text-xs font-medium border border-[#d1d5db] rounded-full hover:bg-[#f8fafc]"
            >
              Reset All
            </button>

            <div className="ml-2 flex items-center gap-1.5 text-xs text-[#64748b]">
              <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              <span>12 components • 87 states</span>
            </div>
          </div>
        </div>

        {/* Sub nav / Breadcrumbs for dashboard feel */}
        <div className="border-t border-[#f1f5f9] bg-[#fafbfc]">
          <div className="max-w-[1920px] mx-auto px-6 h-9 flex items-center text-xs text-[#64748b]">
            <span>Dashboard</span>
            <span className="mx-2">/</span>
            <span className="text-[#1e40af] font-medium">{selectedComponent.charAt(0).toUpperCase() + selectedComponent.slice(1)} Component</span>
            {activeVariant !== "Custom" && (
              <>
                <span className="mx-2">/</span>
                <span>{activeVariant} State</span>
              </>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-[1920px] mx-auto px-6 py-6">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-3xl font-semibold tracking-[-1.2px]">Component Library</div>
            <div className="text-[#64748b] mt-1">These are the real, production cards. The single source of truth.</div>
          </div>
          <div className="text-xs text-[#64748b] font-mono">Tasks pinned bottom • 13pt → 10pt responsive with hanging indent</div>
        </div>

        <div className="flex gap-4">
          {/* Left: Layers / Components + States */}
          <div className={`${xdPanel} w-60 p-3 rounded-xl h-fit sticky top-20`}>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#64748b] px-2 mb-2 font-medium">COMPONENTS</div>
            {componentList.map((c) => (
              <button key={c.id} onClick={() => setSelectedComponent(c.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 text-sm transition ${selectedComponent === c.id ? "bg-[#1e40af] text-white" : "hover:bg-[#f1f5f9]"}`}>
                <span>{c.icon}</span> {c.label}
              </button>
            ))}

            <div className="my-3 border-t border-[#e5e7eb]" />
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#64748b] px-2 mb-1.5 font-medium">CATEGORIES</div>
            <div className="text-xs text-[#64748b] px-3 space-y-1">
              <div>Navigation</div>
              <div className="pl-2 text-[#1e40af]">• Navbar (this page)</div>
              <div>Cards</div>
              <div>Overlays &amp; Slots</div>
            </div>

            <div className="my-3 border-t border-[#e5e7eb]" />
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#64748b] px-2 mb-1.5 font-medium">STATES</div>
            {variants.map((v) => (
              <button key={v.label} onClick={() => applyPreset({ ...v.patch, label: v.label } as any)} className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition ${activeVariant === v.label ? "bg-[#dbeafe] text-[#1e40af]" : "hover:bg-[#f8fafc]"}`}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Center Canvas */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="uppercase text-[10px] tracking-[1.5px] text-[#64748b] font-medium">ARTBOARDS — {selectedComponent.toUpperCase()} • {activeVariant}</div>
              <div className="text-xs text-[#64748b]">White + Light Blue Grid • Adobe XD Blueprint</div>
            </div>

            <div className={`${xdPanel} rounded-2xl p-6 border border-[#bfdbfe]`} style={xdCanvas}>
              <div style={{ transform: `scale(${canvasZoom})`, transformOrigin: "top left" }} className="inline-block">
                <div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-1 pl-1">MAIN ARTBOARD</div>
                <div 
                  className={xdSurface} 
                  onClick={() => {
                    if (selectedComponent === "navbar") return;
                    if (mode === "prototype" && !controls.hasTM) {
                      setShowPrototypeModal(true);
                    } else if (mode === "design" && !controls.hasTM) {
                      // Quick editing in design mode: clicking the empty ASSIGN TM "assigns" a demo TM
                      updateControl('hasTM', true as any);
                    } else if (mode === "design" && controls.hasTM) {
                      // Bonus: clicking an assigned card in design mode can "unassign" for quick toggling
                      updateControl('hasTM', false as any);
                    }
                  }}
                >
                  {selectedComponent === "navbar" && (
                    <div className="p-4 bg-white">
                      {/* Preview of a generic premium Navbar component (point of truth style) */}
                      <div className="h-12 flex items-center justify-between px-4 border-b border-[#e5e7eb] rounded-t bg-white text-sm">
                        <div className="flex items-center gap-3 font-semibold tracking-tight text-[#111827]">
                          <div className="w-6 h-6 rounded bg-[#1e40af] text-white flex items-center justify-center text-[10px] font-bold">SB</div>
                          ShiftBuilder
                        </div>
                        <div className="flex items-center gap-6 text-xs text-[#475569]">
                          <span className="hover:text-[#1e40af] cursor-pointer">Components</span>
                          <span className="hover:text-[#1e40af] cursor-pointer">Tokens</span>
                          <span className="hover:text-[#1e40af] cursor-pointer">Guidelines</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-40 h-7 bg-[#f1f5f9] border border-[#e5e7eb] rounded-full text-[10px] flex items-center px-3 text-[#94a3b8]">Search components...</div>
                          <div className="w-7 h-7 rounded-full bg-[#e5e7eb] flex items-center justify-center text-[10px]">👤</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-[#64748b] mt-2 text-center">This is the live Navbar component used for the library dashboard</div>
                    </div>
                  )}
                  {selectedComponent === "zone" && renderCard(controls, 0.96)}
                  {selectedComponent === "aux" && renderCard(controls, 0.96)}
                  {selectedComponent === "rr" && renderCard(controls, 0.96)}
                  {selectedComponent === "overlap" && renderCard(controls, 0.96)}
                </div>

                {/* Design-mode quick actions on the main artboard (Adobe XD "edit in place" feel) */}
                {mode === "design" && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleAddTaskLabel}
                      className="text-xs px-3 py-1 rounded-full bg-[#1e40af] text-white hover:bg-[#1e3a8a] flex items-center gap-1"
                    >
                      + Add task to preview
                    </button>
                  </div>
                )}
              </div>

              {/* Side-by-side artboards for comparison */}
              <div className="mt-8 pt-6 border-t border-[#e5e7eb]">
                <div className="text-[10px] uppercase tracking-widest text-[#64748b] mb-3 pl-1">ALL STATES — ARTBOARDS</div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {variants.map((v, i) => (
                    <div key={i} className="flex-shrink-0">
                      <div className="text-[9px] text-[#64748b] mb-1 pl-1">{v.label}</div>
                      <div className={`${xdSurface} scale-[0.72] origin-top-left ring-1 ring-[#bfdbfe]`}>
                        {renderCard({ ...controls, ...v.patch } as any, 1)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Prototype hint */}
            {mode === "prototype" && (
              <div className="mt-2 text-xs text-[#64748b] pl-1">Prototype active — click an Empty artboard to simulate opening the Placement Pad</div>
            )}
          </div>

          {/* Right: Full XD Properties - Dashboard style with Navbar support */}
          <div className={`${xdPanel} w-80 p-5 rounded-2xl h-fit sticky top-20`}>
            <div className="text-[10px] uppercase tracking-[1.5px] text-[#64748b] font-semibold mb-4">PROPERTIES</div>

            {selectedComponent === "navbar" ? (
              <div className="space-y-5 text-sm">
                <div>
                  <div className="text-xs text-[#475569] mb-2 font-medium">NAVBAR</div>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-sm">
                      <span>Show Search</span>
                      <input type="checkbox" defaultChecked className="accent-[#1e40af]" />
                    </label>
                    <label className="flex items-center justify-between text-sm">
                      <span>Show User Menu</span>
                      <input type="checkbox" defaultChecked className="accent-[#1e40af]" />
                    </label>
                    <div>
                      <div className="text-xs mb-1">Nav Links</div>
                      <input type="range" min="2" max="6" defaultValue="4" className="w-full accent-[#1e40af]" />
                    </div>
                    <div>
                      <div className="text-xs mb-1">Variant</div>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        {["Default", "Compact", "Prominent"].map((v, idx) => (
                          <button key={idx} className="py-1 border border-[#d1d5db] rounded hover:bg-[#f8fafc]">{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#e5e7eb] text-[11px] text-[#64748b]">
                  This is the dashboard navbar. It serves as the entry point for the component library and follows the same premium patterns used in the builder (search, subtle hierarchy, status).
                </div>
              </div>
            ) : (
              <div className="space-y-5 text-sm">
                <div>
                  <div className="text-xs text-[#475569] mb-2 font-medium">GENERAL</div>
                  <div className="space-y-2">
                    {["hasTM","showDigitalAssists","isLocked","showFit"].map(k => (
                      <label key={k} className="flex justify-between items-center">
                        <span>{k.replace(/([A-Z])/g," $1")}</span>
                        <input type="checkbox" checked={controls[k as keyof DemoControls] as boolean} onChange={e => updateControl(k as any, e.target.checked)} className="accent-[#1e40af]" />
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#475569] mb-2 font-medium">CONTENT</div>
                  <div className="mb-3">
                    <div className="flex justify-between text-xs mb-1"><span>Tasks</span><span className="font-mono">{controls.taskCount}</span></div>
                    <input type="range" min={0} max={6} value={controls.taskCount} onChange={e => updateControl("taskCount", parseInt(e.target.value))} className="w-full accent-[#1e40af]" />
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span>Task Labels</span>
                      <button onClick={handleAddTaskLabel} className="text-[#1e40af] text-[10px] hover:underline">+ Add</button>
                    </div>
                    <div className="space-y-1 max-h-[120px] overflow-auto">
                      {controls.customTasks.map((t, i) => (
                        <div key={i} className="flex gap-1.5">
                          <input value={t} onChange={e => handleEditTaskLabel(i, e.target.value)} className={xdInput + " text-xs py-1"} />
                          <button onClick={() => handleRemoveTaskLabel(i)} className="text-red-400 text-xs">×</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1"><span>Coverage</span><span>{controls.hasCoverage ? controls.coverageCount : 0}</span></div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={controls.hasCoverage} onChange={e => updateControl("hasCoverage", e.target.checked)} className="accent-[#1e40af]" />
                      <input type="range" min={1} max={3} value={controls.coverageCount} onChange={e => updateControl("coverageCount", parseInt(e.target.value))} className="flex-1 accent-[#1e40af]" disabled={!controls.hasCoverage} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-[#475569] mb-2 font-medium">BEHAVIOR</div>
                  <div className="flex gap-1">
                    {[0,1,2,3].map(g => <button key={g} onClick={() => updateControl("breakGroup", g as any)} className={`flex-1 py-1 text-xs rounded border ${controls.breakGroup === g ? "bg-[#1e40af] text-white border-[#1e40af]" : xdButton}`}>{g}</button>)}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#e5e7eb]">
                  <div className="text-xs text-[#64748b] mb-1.5 font-medium">LIVE STATE</div>
                  <pre className="text-[10px] bg-[#f8fafc] p-3 rounded border border-[#e5e7eb] overflow-auto max-h-48 font-mono text-[#475569]">
                    {JSON.stringify(controls, null, 2)}
                  </pre>
                  <button onClick={() => navigator.clipboard.writeText(JSON.stringify(controls))} className="mt-2 w-full text-xs py-1.5 rounded border border-[#d1d5db] hover:bg-white">Copy Props JSON</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Prototype Modal */}
        <AnimatePresence>
          {showPrototypeModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowPrototypeModal(false)}>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-white rounded-2xl p-6 w-[380px] shadow-2xl border border-[#e5e7eb]" onClick={e => e.stopPropagation()}>
                <div className="font-semibold mb-1">Placement Pad (Prototype)</div>
                <div className="text-sm text-[#64748b] mb-4">This is a simulated interaction from clicking the empty ASSIGN TM state.</div>
                <div className="text-xs bg-[#f8fafc] p-3 rounded border">In the real app this would open the full unilateral placement pad with TM picker, coverage options, and xAI insights.</div>
                <button onClick={() => setShowPrototypeModal(false)} className="mt-4 w-full py-2 rounded-xl bg-[#1e40af] text-white text-sm">Close Prototype</button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="mt-8 text-center text-xs text-[#64748b]">
          Real components. Real interactions. This page is the living Adobe XD-style blueprint for the builder.
        </div>
      </div>
    </div>
  );
}

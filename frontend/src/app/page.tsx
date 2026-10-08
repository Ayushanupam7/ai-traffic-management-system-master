"use client";

import { useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useTrafficStore } from "@/store/trafficStore";
import StreetMap         from "@/components/Map/StreetMap";
import IntersectionPanel from "@/components/Panel/IntersectionPanel";
import CameraCarousel    from "@/components/Panel/CameraCarousel";
import MetricsPanel      from "@/components/Metrics/MetricsPanel";
import MetricsTimeline   from "@/components/Metrics/MetricsTimeline";
import SimControls       from "@/components/Simulation/SimControls";
import SystemSummary     from "@/components/Simulation/SystemSummary";
import ChatWidget        from "@/components/Chat/ChatWidget";
import EmergencyPanel    from "@/components/Emergency/EmergencyPanel";
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Sliders,
  Siren,
  Activity,
  Layers,
} from "lucide-react";

type SidebarTab = "all" | "controls" | "emergency" | "metrics";

export default function Dashboard() {
  useWebSocket();
  const selected = useTrafficStore((s) => s.selectedIntersection);
  const status = useTrafficStore((s) => s.status);
  const trackedEvId = useTrafficStore((s) => s.trackedEvId);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>("all");
  const [timelineOpen, setTimelineOpen] = useState(false);

  const isRunning = status === "running" || status === "paused";

  return (
    <div className="flex-1 flex overflow-hidden relative">

      {/* Well-Organized Left Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } flex-shrink-0 bg-slate-50 dark:bg-[#0c1017] border-r border-slate-200 dark:border-gray-800 flex flex-col overflow-hidden transition-all duration-300 relative z-30 select-none shadow-sm dark:shadow-2xl`}
      >
        {/* Sidebar Header & Category Filter Tabs */}
        <div className="p-3.5 border-b border-slate-200/90 dark:border-gray-800/80 bg-white dark:bg-[#090d16] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse shadow-[0_0_8px_#3b82f6]" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-extrabold text-slate-900 dark:text-gray-100 uppercase tracking-wider">
                  Marg Console
                </span>
                <span className="text-[10px] font-semibold text-slate-400 dark:text-gray-500">
                  नियंत्रण कक्ष
                </span>
              </div>
            </div>
            <span
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold ${
                isRunning
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50"
                  : "bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-400 border border-slate-200 dark:border-gray-700"
              }`}
            >
              {isRunning ? "● SIM RUNNING" : "○ ENGINE IDLE"}
            </span>
          </div>

          {/* Segmented Filter Tab Pills */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#131b2a] border border-slate-200/90 dark:border-gray-800/90 text-[11px]">
            <button
              onClick={() => setActiveTab("all")}
              title="Show All Panels (समग्र)"
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-all ${
                activeTab === "all"
                  ? "bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm font-bold border border-slate-200/80 dark:border-blue-500"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 font-semibold"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>All</span>
            </button>
            <button
              onClick={() => setActiveTab("controls")}
              title="Simulation Controls (नियंत्रण)"
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-all ${
                activeTab === "controls"
                  ? "bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm font-bold border border-slate-200/80 dark:border-blue-500"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 font-semibold"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Controls</span>
            </button>
            <button
              onClick={() => setActiveTab("emergency")}
              title="Emergency Dispatch & Preemption (आपातकाल)"
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-all relative ${
                activeTab === "emergency"
                  ? "bg-white dark:bg-red-600 text-red-600 dark:text-white shadow-sm font-bold border border-red-200 dark:border-red-500"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 font-semibold"
              }`}
            >
              <Siren className="w-3.5 h-3.5" />
              <span>EV</span>
              {trackedEvId && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-1" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              title="Live Telemetry KPIs (आंकड़े)"
              className={`flex items-center justify-center gap-1 py-1.5 rounded-lg transition-all ${
                activeTab === "metrics"
                  ? "bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-sm font-bold border border-slate-200/80 dark:border-blue-500"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 font-semibold"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>KPIs</span>
            </button>
          </div>
        </div>

        {/* Scrollable Organized Panels */}
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3.5 w-80">
          {/* Section: Config & State Summary (Shown in all & controls) */}
          {(activeTab === "all" || activeTab === "controls") && (
            <div className="bg-white dark:bg-[#101726]/90 border border-slate-200/90 dark:border-gray-800/90 rounded-2xl p-3.5 shadow-sm dark:shadow-lg flex flex-col gap-3 transition-colors">
              <SystemSummary />
              <div className="flex items-center gap-2 pt-1 text-[10px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider border-t border-slate-200/80 dark:border-gray-800/80">
                <Sliders className="w-3 h-3 text-blue-500" />
                <span>Simulation Parameters</span>
              </div>
              <SimControls />
            </div>
          )}

          {/* Section: Emergency Priority Corridor (Shown in all & emergency) */}
          {(activeTab === "all" || activeTab === "emergency") && (
            <div className="bg-white dark:bg-[#101726]/90 border border-slate-200/90 dark:border-gray-800/90 rounded-2xl p-3.5 shadow-sm dark:shadow-lg transition-colors">
              <EmergencyPanel />
            </div>
          )}

          {/* Section: Live KPI Telemetry (Shown in all & metrics) */}
          {(activeTab === "all" || activeTab === "metrics") && (
            <div className="bg-white dark:bg-[#101726]/90 border border-slate-200/90 dark:border-gray-800/90 rounded-2xl p-3.5 shadow-sm dark:shadow-lg transition-colors">
              <MetricsPanel />
            </div>
          )}
        </div>
      </aside>

      {/* Ergonomic Sidebar Toggle Handle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title={sidebarOpen ? "Collapse Sidebar Console" : "Expand Sidebar Console"}
        className={`absolute top-4 ${
          sidebarOpen ? "left-80" : "left-0"
        } z-40 p-1.5 rounded-r-xl bg-white dark:bg-[#0c1017] border-y border-r border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-white shadow-xl transition-all duration-300 hover:scale-105`}
      >
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Main Screen: 3D Visualization & Map Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-[#060a0f]">
          <StreetMap />
          {!selected && <CameraCarousel />}
          <IntersectionPanel />
          <ChatWidget />
        </div>

        {/* Collapsible Metrics Timeline Drawer */}
        <div className="border-t border-slate-200 dark:border-gray-800 bg-white dark:bg-[#0c1017] flex flex-col transition-all duration-300 z-20 shadow-md">
          <div
            onClick={() => setTimelineOpen(!timelineOpen)}
            className="h-8 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-100/80 dark:hover:bg-gray-800/40 text-[11px] text-slate-600 dark:text-gray-400 transition-colors select-none"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="font-bold uppercase tracking-wider text-slate-800 dark:text-gray-200 text-[10px]">
                Live Real-Time Timeline & Flow Dynamics
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-gray-400 text-[10px] font-medium">
              <span>{timelineOpen ? "Minimize Analytics" : "Expand Analytics Drawer"}</span>
              {timelineOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </div>
          </div>

          {timelineOpen && (
            <div className="h-48 overflow-hidden bg-slate-50/50 dark:bg-[#090d16] animate-in slide-in-from-bottom-2 duration-200 border-t border-slate-200/60 dark:border-gray-800/60">
              <MetricsTimeline />
            </div>
          )}
        </div>
      </main>

    </div>
  );
}


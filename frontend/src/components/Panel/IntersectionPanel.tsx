"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrafficStore } from "@/store/trafficStore";
import { Activity, Video, Sliders, X, ChevronDown, Radio, Compass, Crosshair, ExternalLink } from "lucide-react";
import PanelLive    from "./PanelLive";
import PanelCameras from "./PanelCameras";
import PanelPolicy  from "./PanelPolicy";

type Tab = "live" | "cameras" | "policy";

const POSITION_LABEL: Record<string, string> = {
  A1: "Top arterial · west",
  B1: "Top arterial · center",
  C1: "Top arterial · east",
  A0: "Bottom arterial · west",
  B0: "Bottom arterial · center",
  C0: "Bottom arterial · east",
};

function phaseToDir(phaseIndex: number): { dir: string; sub: "G" | "y" | "r" } {
  const group = Math.floor(phaseIndex / 3) % 4;
  const sub   = phaseIndex % 3;
  const dir   = ["N", "E", "S", "W"][group];
  return { dir, sub: sub === 0 ? "G" : sub === 1 ? "y" : "r" };
}

const PHASE_COLORS = { G: "#22c55e", y: "#eab308", r: "#ef4444" };
const PHASE_NAMES  = { G: "Green Phase", y: "Yellow Transition", r: "All-Red Clearance" };
const DIR_FULL     = { N: "Northbound", E: "Eastbound", S: "Southbound", W: "Westbound" } as Record<string, string>;

export default function IntersectionPanel() {
  const router             = useRouter();
  const selectedId         = useTrafficStore((s) => s.selectedIntersection);
  const intersections      = useTrafficStore((s) => s.intersections);
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const triggerLocate      = useTrafficStore((s) => s.triggerLocate);
  const [activeTab, setActiveTab] = useState<Tab>("live");

  const themeMode          = useTrafficStore((s) => s.themeMode);
  const isDay              = themeMode === "day";

  const intersection = selectedId
    ? intersections.find((i) => i.id === selectedId)
    : null;

  const isOpen = selectedId !== null;

  if (!isOpen) return null;

  return (
    <div
      className="absolute top-3 right-3 bottom-3 w-[400px] max-w-[calc(100vw-24px)] flex flex-col z-40 animate-in fade-in slide-in-from-right-4 duration-200 pointer-events-auto"
    >
      <div
        className={`flex flex-col h-full rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-200 overflow-hidden pointer-events-auto ${
          isDay
            ? "bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-900/15"
            : "bg-[#0c1017]/95 border-gray-800 text-gray-100 shadow-black/80"
        }`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Top Header */}
        <div className={`flex-shrink-0 px-4 py-3 flex items-center justify-between border-b ${
          isDay ? "border-slate-100 bg-slate-50/50" : "border-gray-800/80 bg-gray-900/30"
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-sm shadow-xs ${
              isDay ? "bg-blue-600 text-white shadow-blue-500/20" : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            }`}>
              {selectedId ?? "—"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-bold truncate ${isDay ? "text-slate-800" : "text-gray-100"}`}>
                  Junction {selectedId}
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className={`text-[10px] truncate ${isDay ? "text-slate-500" : "text-gray-400"}`}>
                {selectedId ? (POSITION_LABEL[selectedId] ?? "Intersection Node") : ""}
              </div>
            </div>
          </div>

          {/* Header Controls: Switcher & Close */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Quick Switcher dropdown */}
            <div className="relative">
              <select
                value={selectedId ?? ""}
                onChange={(e) => selectIntersection(e.target.value)}
                className={`text-[11px] font-mono font-bold pl-2 pr-6 py-1 rounded-lg border appearance-none cursor-pointer outline-none transition-all ${
                  isDay
                    ? "bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700"
                    : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200"
                }`}
                title="Switch intersection"
              >
                {intersections.map((it) => (
                  <option key={it.id} value={it.id} className={isDay ? "bg-white text-slate-800" : "bg-gray-900 text-gray-100"}>
                    {it.id}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute right-1.5 top-2 pointer-events-none opacity-50" />
            </div>

            <button
              onClick={() => selectIntersection(null)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all border font-medium ${
                isDay
                  ? "text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 border-slate-200"
                  : "text-gray-400 hover:text-gray-200 bg-gray-800/80 hover:bg-gray-700 border-gray-700"
              }`}
              title="Close panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Action Bar: Locate on Map & Redirect to Policy Studio */}
        <div className={`flex-shrink-0 px-3.5 py-2 flex items-center justify-between border-b gap-2 ${
          isDay ? "bg-slate-50/80 border-slate-100" : "bg-gray-900/50 border-gray-800/80"
        }`}>
          <button
            onClick={() => {
              if (selectedId) triggerLocate(selectedId);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all ${
              isDay
                ? "bg-white hover:bg-blue-50 text-blue-700 border-slate-200 hover:border-blue-300 shadow-xs active:scale-95"
                : "bg-gray-800/80 hover:bg-blue-950/50 text-blue-300 border-gray-700 hover:border-blue-700/60 active:scale-95"
            }`}
            title="Locate & center camera directly on this junction in 3D/2D map"
          >
            <Crosshair className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
            <span>Locate on Map</span>
          </button>

          <button
            onClick={() => router.push("/policy")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl border text-xs font-semibold transition-all ${
              isDay
                ? "bg-white hover:bg-purple-50 text-purple-700 border-slate-200 hover:border-purple-300 shadow-xs active:scale-95"
                : "bg-gray-800/80 hover:bg-purple-950/50 text-purple-300 border-gray-700 hover:border-purple-700/60 active:scale-95"
            }`}
            title="Redirect to Policy Studio to configure signal control algorithms"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-500" />
            <span>Policy Studio</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </button>
        </div>

        {/* Phase Hero Status Banner */}
        {intersection && (() => {
          const { dir, sub } = phaseToDir(intersection.phase_index);
          const color        = PHASE_COLORS[sub];
          const remaining    = Math.max(0, Math.round(intersection.phase_remaining_s));
          const totalEstimated = 30; // standard phase window
          const progressPct  = Math.min(100, Math.max(0, (remaining / totalEstimated) * 100));

          return (
            <div className={`flex-shrink-0 mx-3.5 mt-3 p-3 rounded-xl border transition-all ${
              isDay
                ? "bg-gradient-to-br from-slate-50 to-blue-50/30 border-slate-200/90 shadow-xs"
                : "bg-gradient-to-br from-[#131b29] to-[#0c121e] border-gray-800"
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 transition-transform duration-300"
                    style={{ background: color, boxShadow: `0 0 10px ${color}` }}
                  />
                  <div>
                    <div className={`text-xs font-bold leading-none ${isDay ? "text-slate-800" : "text-gray-100"}`}>
                      {DIR_FULL[dir] ?? dir}
                    </div>
                    <div className={`text-[9.5px] font-semibold mt-0.5 ${
                      sub === "G" ? "text-emerald-600 dark:text-emerald-400" :
                      sub === "y" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                    }`}>
                      {PHASE_NAMES[sub]}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-mono font-black leading-none" style={{ color }}>
                    {remaining}s
                  </div>
                  <div className={`text-[8.5px] font-medium uppercase tracking-wider mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
                    Remaining
                  </div>
                </div>
              </div>

              {/* Phase progress line */}
              <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDay ? "bg-slate-200" : "bg-gray-800"}`}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%`, background: color }}
                />
              </div>
            </div>
          );
        })()}

        {/* Segmented Tab Navigation */}
        <div className="flex-shrink-0 px-3.5 pt-2.5 pb-1">
          <div className={`p-1 rounded-xl flex gap-1 border ${
            isDay ? "bg-slate-100/90 border-slate-200/80" : "bg-gray-900/80 border-gray-800"
          }`}>
            {[
              { id: "live", label: "Live Telemetry", icon: Activity },
              { id: "cameras", label: "Cameras", icon: Video },
              { id: "policy", label: "Policy", icon: Sliders },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as Tab)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === id
                    ? isDay
                      ? "bg-white text-blue-600 shadow-sm border border-slate-200/60 font-bold"
                      : "bg-gray-800 text-blue-400 shadow-sm border border-gray-700 font-bold"
                    : isDay
                      ? "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                      : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto px-3.5 py-2.5">
          {isOpen && selectedId && (
            <>
              {activeTab === "live"    && (
                <PanelLive
                  intersectionId={selectedId}
                  onSwitchToCamera={() => setActiveTab("cameras")}
                />
              )}
              {activeTab === "cameras" && <PanelCameras intersectionId={selectedId} />}
              {activeTab === "policy"  && <PanelPolicy  intersectionId={selectedId} />}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

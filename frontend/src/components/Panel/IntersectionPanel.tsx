"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
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
const PHASE_NAMES  = { G: "green", y: "yellow", r: "red" };
const DIR_FULL     = { N: "North", E: "East", S: "South", W: "West" } as Record<string, string>;

export default function IntersectionPanel() {
  const selectedId         = useTrafficStore((s) => s.selectedIntersection);
  const intersections      = useTrafficStore((s) => s.intersections);
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const [activeTab, setActiveTab] = useState<Tab>("live");

  const intersection = selectedId
    ? intersections.find((i) => i.id === selectedId)
    : null;

  const isOpen = selectedId !== null;

  return (
    <div
      className="absolute top-0 right-0 bottom-0 w-[44vw] min-w-[480px] max-w-[720px] flex flex-col z-10 transition-transform duration-300"
      style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col h-full border-l border-gray-800 backdrop-blur-md"
           style={{ background: "rgba(10,14,22,0.97)" }}>

        {/* Header */}
        <div className="flex-shrink-0 p-3.5 flex items-start justify-between">
          <div>
            <div className="text-[15px] font-bold text-blue-400 font-mono leading-none">
              {selectedId ?? "—"}
            </div>
            <div className="text-[10px] text-gray-600 mt-0.5">
              {selectedId ? (POSITION_LABEL[selectedId] ?? "Intersection") : ""}
            </div>
          </div>
          <button
            onClick={() => selectIntersection(null)}
            className="text-gray-600 hover:text-gray-300 text-sm bg-[#111827] border border-gray-800
                       rounded px-2 py-0.5 transition-colors leading-none"
          >
            ✕
          </button>
        </div>

        {/* Phase indicator */}
        {intersection && (() => {
          const { dir, sub } = phaseToDir(intersection.phase_index);
          const color        = PHASE_COLORS[sub];
          const remaining    = Math.max(0, Math.round(intersection.phase_remaining_s));
          return (
            <div className="flex-shrink-0 mx-3.5 mb-0 bg-[#1f2937] rounded-lg px-3 py-2
                            flex items-center gap-2.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              <span className="text-xs text-gray-300 flex-1">
                {DIR_FULL[dir] ?? dir} {PHASE_NAMES[sub]}
              </span>
              <span className="text-sm font-bold font-mono" style={{ color }}>
                {remaining}s
              </span>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-gray-800 mt-2.5">
          {(["live", "cameras", "policy"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? "text-blue-400 border-blue-500"
                  : "text-gray-600 border-transparent hover:text-gray-400"
              }`}
            >
              {tab === "live" ? "Live" : tab === "cameras" ? "Cameras" : "Policy"}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-3.5">
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

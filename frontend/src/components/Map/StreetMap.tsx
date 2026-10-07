"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import SumoGrid from "./SumoGrid";
import HighwayMeterMap from "./HighwayMeterMap";
import CombinedMap from "./CombinedMap";

const LEGEND = [
  { color: "#22c55e", label: "Low" },
  { color: "#eab308", label: "Moderate" },
  { color: "#f97316", label: "High" },
  { color: "#ef4444", label: "Critical" },
];

export default function StreetMap() {
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const network = useTrafficStore((s) => s.network);
  const [showHeat, setShowHeat] = useState(true);

  // Each map is hand-tuned to a specific viewBox aspect:
  //   arterial → 1500x600 (5:2), stretched to fill the screen
  //   highway  →  900x600 (3:2), preserveAspectRatio="meet" handles fit
  //   combined → 2500x600 (~25:6), highway and grid side-by-side
  const viewBox =
    network === "arterial"        ? "0 0 1500 600" :
    network === "highway_metered" ? "0 0 900 600"  :
                                    "0 0 2500 700";  // combined (wider corridor)
  const aspectMode = network === "arterial" ? "none" : "xMidYMid meet";

  return (
    <div className="w-full h-full relative">
      <svg
        viewBox={viewBox}
        preserveAspectRatio={aspectMode}
        className="w-full h-full"
        style={{ background: "#0a0e16" }}
        onClick={() => selectIntersection(null)}
      >
        {network === "highway_metered" ? (
          <HighwayMeterMap showHeat={showHeat} />
        ) : network === "combined" ? (
          <CombinedMap showHeat={showHeat} />
        ) : (
          <SumoGrid showHeat={showHeat} />
        )}
      </svg>

      {/* Heatmap toggle — top-right overlay */}
      <button
        onClick={() => setShowHeat((v) => !v)}
        className={`absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-md
                    border text-[10px] font-medium transition-colors ${
          showHeat
            ? "bg-[#1a1332] border-[#4c3080] text-purple-300 hover:bg-[#241748]"
            : "bg-[#111827] border-gray-700 text-gray-500 hover:text-gray-300"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${showHeat ? "bg-purple-400" : "bg-gray-600"}`} />
        Heatmap
      </button>

      {/* Legend — bottom-left overlay (when heatmap is on) */}
      {showHeat && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3
                        bg-[#0a0e16]/80 border border-gray-800 rounded-md px-2.5 py-1.5">
          {LEGEND.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: color, opacity: 0.85 }}
              />
              <span className="text-[9px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

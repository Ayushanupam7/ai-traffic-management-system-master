"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import SumoGrid from "./SumoGrid";
import HighwayMeterMap from "./HighwayMeterMap";
import CombinedMap from "./CombinedMap";
import UrbanFlow3D from "./UrbanFlow3D";

const LEGEND = [
  { color: "#22c55e", label: "Low" },
  { color: "#eab308", label: "Moderate" },
  { color: "#f97316", label: "High" },
  { color: "#ef4444", label: "Critical" },
];

export default function StreetMap() {
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const network = useTrafficStore((s) => s.network);
  const viewMode = useTrafficStore((s) => s.viewMode);
  const themeMode = useTrafficStore((s) => s.themeMode);
  const [showHeat, setShowHeat] = useState(true);

  // Each map is hand-tuned to a specific viewBox aspect:
  const viewBox =
    network === "arterial"        ? "0 0 1500 600" :
    network === "highway_metered" ? "0 0 900 600"  :
                                    "0 0 2500 700";
  const aspectMode = network === "arterial" ? "none" : "xMidYMid meet";

  const isDay = themeMode === "day";

  return (
    <div className="w-full h-full relative">
      {/* Primary 3D UrbanFlow Engine vs 2D Tactical Grid */}
      {viewMode === "3d" && network === "arterial" ? (
        <UrbanFlow3D />
      ) : (
        <svg
          viewBox={viewBox}
          preserveAspectRatio={aspectMode}
          className="w-full h-full transition-colors duration-500"
          style={{ background: isDay ? "#f8fafc" : "#070b12" }}
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
      )}

      {/* Heatmap toggle in 2D mode */}
      {viewMode === "2d" && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          <button
            onClick={() => setShowHeat((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all shadow-sm ${
              showHeat
                ? isDay
                  ? "bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
                  : "bg-[#1a1332] border-[#4c3080] text-purple-300 hover:bg-[#241748]"
                : isDay
                  ? "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
                  : "bg-[#111827] border-gray-700 text-gray-500 hover:text-gray-300"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${showHeat ? (isDay ? "bg-purple-600 animate-pulse" : "bg-purple-400 animate-pulse") : "bg-gray-400"}`} />
            Heatmap Layer
          </button>
        </div>
      )}

      {/* Legend in 2D mode */}
      {viewMode === "2d" && showHeat && (
        <div className={`absolute bottom-3 left-3 z-10 flex items-center gap-3.5 rounded-lg px-3 py-1.5 border shadow-sm ${
          isDay ? "bg-white/95 border-slate-200 text-slate-700 backdrop-blur-sm" : "bg-[#0a0e16]/85 border-gray-800 text-slate-300 backdrop-blur-sm"
        }`}>
          {LEGEND.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
              />
              <span className={`text-[10px] font-medium ${isDay ? "text-slate-600" : "text-gray-400"}`}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

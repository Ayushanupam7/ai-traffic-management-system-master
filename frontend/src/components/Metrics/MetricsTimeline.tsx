"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useTrafficStore } from "@/store/trafficStore";

// Sits directly below the map. Three lines on one chart, sharing the X axis
// (simulation ticks) so the user can see how throughput, mean trip time, and
// total halting are trending together.
const SERIES: { key: keyof Datum; label: string; color: string; axis: "left" | "right" }[] = [
  { key: "throughput_veh_per_min", label: "Throughput (v/m)",   color: "#3b82f6", axis: "left" },
  { key: "avg_trip_time_s",        label: "Avg trip time (s)",  color: "#fbbf24", axis: "left" },
  { key: "total_halting",          label: "Halting (cars)",     color: "#f87171", axis: "right" },
];

type Datum = {
  tick: number;
  throughput_veh_per_min: number;
  avg_trip_time_s: number;
  total_halting: number;
};

export default function MetricsTimeline() {
  const history = useTrafficStore((s) => s.metricsHistory);
  const status  = useTrafficStore((s) => s.status);
  const [mode, setMode] = useState<"live" | "full">("live");

  const data: Datum[] = history.map((r) => ({
    tick: r.tick,
    throughput_veh_per_min: r.throughput_veh_per_min,
    avg_trip_time_s: r.avg_trip_time_s,
    total_halting: r.total_halting,
  }));
  // Live view keeps the last 300 ticks (matches the store's MAX_HISTORY).
  // Full view shows everything — only meaningful once we exceed 300 ticks.
  const view = mode === "live" ? data.slice(-300) : data;

  return (
    <div className="flex-shrink-0 h-[180px] bg-[#0a0e16] border-t border-gray-800 px-4 py-2">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[10px] uppercase tracking-widest text-gray-500">
          Live metrics timeline
        </h2>
        <div className="flex gap-1">
          {(["live", "full"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 border ${
                mode === m
                  ? "border-blue-600 bg-blue-950/30 text-blue-200"
                  : "border-gray-800 text-gray-500 hover:text-gray-300"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {view.length < 2 ? (
        <div className="h-[140px] flex items-center justify-center text-[11px] text-gray-600">
          {status === "running"
            ? "Collecting samples…"
            : "Start a simulation to see live metrics over time."}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={view} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
            <XAxis
              dataKey="tick"
              tick={{ fill: "#9ca3af", fontSize: 9 }}
              stroke="#374151"
              tickFormatter={(t) => String(t)}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#9ca3af", fontSize: 9 }}
              stroke="#374151"
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#9ca3af", fontSize: 9 }}
              stroke="#374151"
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: "#0d1117",
                border: "1px solid #374151",
                fontSize: 10,
                padding: "4px 6px",
              }}
              labelStyle={{ color: "#d1d5db" }}
              formatter={(v: number) => (typeof v === "number" ? v.toFixed(1) : v)}
            />
            <Legend
              wrapperStyle={{ fontSize: 9, paddingTop: 2 }}
              iconSize={8}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                yAxisId={s.axis}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

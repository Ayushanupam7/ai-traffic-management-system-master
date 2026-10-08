"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
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

export interface RunRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  policy_type: string;
  status: string;
  total_ticks: number | null;
  config: {
    policy_type?: string;
    demand_profile?: string;
    total_vehicles?: number;
    dominant_direction?: string;
    race_mode?: boolean;
    seed?: number;
    tick_rate?: number;
  };
}

export interface GlobalMetricRow {
  tick: number;
  sim_time: number;
  total_vehicles: number;
  total_completed: number;
  completed_trips: number;
  avg_delay_s: number;
  avg_trip_time_s: number;
  avg_control_delay_s: number;
  control_delay_samples: number;
  throughput_veh_per_min: number;
  total_halting: number;
}

export interface IntersectionMetricRow {
  intersection_id: string;
  tick: number;
  sim_time: number;
  queue_length_n: number;
  queue_length_s: number;
  queue_length_e: number;
  queue_length_w: number;
  total_vehicles: number;
  avg_wait_s: number;
}

const INTERSECTIONS = ["A0", "A1", "B0", "B1", "C0", "C1"] as const;
const INTER_COLORS: Record<string, string> = {
  A0: "#3b82f6",
  A1: "#10b981",
  B0: "#f43f5e",
  B1: "#f59e0b",
  C0: "#8b5cf6",
  C1: "#06b6d4",
};

const DIR_COLORS = {
  N: "#3b82f6",
  E: "#10b981",
  S: "#f59e0b",
  W: "#ef4444",
};

function fmtDuration(started: string, ended: string | null): string {
  if (!ended) return "—";
  const s = Math.max(0, Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ConfigCard({ run, isDay }: { run: RunRow; isDay: boolean }) {
  const cfg = run.config ?? {};
  const items: Array<[string, string]> = [
    ["Policy", run.policy_type],
    ["Profile", cfg.demand_profile ?? "—"],
    ["Vehicles", String(cfg.total_vehicles ?? "—")],
    ["Dominant", cfg.dominant_direction ?? "—"],
    ["Race", cfg.race_mode ? "yes" : "no"],
    ["Seed", String(cfg.seed ?? "—")],
    ["Tick rate", String(cfg.tick_rate ?? "—")],
    ["Total ticks", String(run.total_ticks ?? "—")],
    ["Duration", fmtDuration(run.started_at, run.ended_at)],
    ["Status", run.status],
  ];

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-xl p-4 border transition-colors ${
      isDay ? "bg-slate-50 border-slate-200" : "bg-gray-900/60 border-gray-800"
    }`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${
            isDay ? "text-slate-400" : "text-gray-500"
          }`}>{label}</div>
          <div className={`text-sm font-mono font-medium mt-0.5 ${
            isDay ? "text-slate-800" : "text-gray-200"
          }`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  run: RunRow;
  globalMetrics: GlobalMetricRow[];
  interMetrics: IntersectionMetricRow[];
}

export default function RunDetail({ run, globalMetrics, interMetrics }: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  const chartStyle = useMemo(() => ({
    axis: isDay ? "#64748b" : "#9ca3af",
    grid: isDay ? "#f1f5f9" : "#1f2937",
    axisStroke: isDay ? "#cbd5e1" : "#374151",
    tooltipBg: isDay ? "#ffffff" : "#0a0e16",
    tooltipBorder: isDay ? "#e2e8f0" : "#374151",
    tooltipText: isDay ? "#0f172a" : "#e5e7eb",
  }), [isDay]);

  /* ---------------------------------------------------------------- */
  /* Per-intersection queue chart: pivot rows into one record per cycle */
  /* with one column per intersection.                                  */
  /* ---------------------------------------------------------------- */
  const queueChartData = useMemo(() => {
    const byTick: Record<number, Record<string, number | string>> = {};
    for (const r of interMetrics) {
      const total =
        (r.queue_length_n ?? 0) +
        (r.queue_length_s ?? 0) +
        (r.queue_length_e ?? 0) +
        (r.queue_length_w ?? 0);
      const key = r.sim_time;
      if (!byTick[key]) byTick[key] = { sim_time: key };
      byTick[key][r.intersection_id] = total;
    }
    return Object.values(byTick).sort(
      (a, b) => Number(a.sim_time) - Number(b.sim_time),
    );
  }, [interMetrics]);

  /* ---------------------------------------------------------------- */
  /* N/E/S/W breakdown for a selected intersection.                    */
  /* ---------------------------------------------------------------- */
  const [selectedIntersection, setSelectedIntersection] = useState<string>("B0");
  const dirChartData = useMemo(
    () =>
      interMetrics
        .filter((r) => r.intersection_id === selectedIntersection)
        .map((r) => ({
          sim_time: r.sim_time,
          N: r.queue_length_n,
          E: r.queue_length_e,
          S: r.queue_length_s,
          W: r.queue_length_w,
        })),
    [interMetrics, selectedIntersection],
  );

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */
  return (
    <div className="space-y-6">
      <ConfigCard run={run} isDay={isDay} />

      {globalMetrics.length === 0 && interMetrics.length === 0 && (
        <p className={`text-xs ${isDay ? "text-slate-400" : "text-gray-500"}`}>
          No cycle metrics were captured for this run (run may have ended before any cycle wrap).
        </p>
      )}

      {globalMetrics.length > 0 && (
        <ChartPanel title="Global Network Dynamics" subtitle="One sample per ~116s cycle, anchored on B0" isDay={isDay}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={globalMetrics} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chartStyle.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="sim_time"
                stroke={chartStyle.axisStroke}
                tick={{ fill: chartStyle.axis, fontSize: 10 }}
                label={{ value: "sim_time (s)", position: "insideBottom", offset: -5, fill: chartStyle.axis, fontSize: 10 }}
              />
              <YAxis
                yAxisId="left"
                stroke={chartStyle.axisStroke}
                tick={{ fill: chartStyle.axis, fontSize: 10 }}
                label={{ value: "seconds", angle: -90, position: "insideLeft", fill: chartStyle.axis, fontSize: 10 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={chartStyle.axisStroke}
                tick={{ fill: chartStyle.axis, fontSize: 10 }}
                label={{ value: "vehicles", angle: 90, position: "insideRight", fill: chartStyle.axis, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: chartStyle.tooltipBg,
                  border: `1px solid ${chartStyle.tooltipBorder}`,
                  borderRadius: "8px",
                  boxShadow: isDay ? "0 4px 12px rgba(0,0,0,0.06)" : "0 4px 12px rgba(0,0,0,0.4)",
                  fontSize: 11,
                  color: chartStyle.tooltipText,
                }}
                labelStyle={{ color: chartStyle.tooltipText, fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: chartStyle.axis }} />
              <Line yAxisId="left"  type="monotone" dataKey="avg_trip_time_s"     name="Avg trip time (s)"    stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line yAxisId="left"  type="monotone" dataKey="avg_control_delay_s" name="Avg control delay (s)" stroke="#f43f5e" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="total_halting"       name="Halting (count)"      stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="total_vehicles"      name="Active (count)"       stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {queueChartData.length > 0 && (
        <ChartPanel
          title="Per-intersection Queue Trends"
          subtitle="Total halting across N+E+S+W per intersection, per cycle"
          isDay={isDay}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={queueChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chartStyle.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="sim_time" stroke={chartStyle.axisStroke} tick={{ fill: chartStyle.axis, fontSize: 10 }} />
              <YAxis stroke={chartStyle.axisStroke} tick={{ fill: chartStyle.axis, fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: chartStyle.tooltipBg,
                  border: `1px solid ${chartStyle.tooltipBorder}`,
                  borderRadius: "8px",
                  boxShadow: isDay ? "0 4px 12px rgba(0,0,0,0.06)" : "0 4px 12px rgba(0,0,0,0.4)",
                  fontSize: 11,
                  color: chartStyle.tooltipText,
                }}
                labelStyle={{ color: chartStyle.tooltipText, fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: chartStyle.axis }} />
              {INTERSECTIONS.map((id) => (
                <Line key={id} type="monotone" dataKey={id} stroke={INTER_COLORS[id]} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {interMetrics.length > 0 && (
        <ChartPanel
          title="Direction Breakdown"
          subtitle={`Queue length by approach for ${selectedIntersection}`}
          isDay={isDay}
          right={
            <div className="flex gap-1">
              {INTERSECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedIntersection(id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border transition-colors ${
                    selectedIntersection === id
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                      : isDay
                      ? "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dirChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chartStyle.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="sim_time" stroke={chartStyle.axisStroke} tick={{ fill: chartStyle.axis, fontSize: 10 }} />
              <YAxis stroke={chartStyle.axisStroke} tick={{ fill: chartStyle.axis, fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: chartStyle.tooltipBg,
                  border: `1px solid ${chartStyle.tooltipBorder}`,
                  borderRadius: "8px",
                  boxShadow: isDay ? "0 4px 12px rgba(0,0,0,0.06)" : "0 4px 12px rgba(0,0,0,0.4)",
                  fontSize: 11,
                  color: chartStyle.tooltipText,
                }}
                labelStyle={{ color: chartStyle.tooltipText, fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: chartStyle.axis }} />
              <Bar dataKey="N" stackId="q" fill={DIR_COLORS.N} radius={[0, 0, 0, 0]} />
              <Bar dataKey="E" stackId="q" fill={DIR_COLORS.E} radius={[0, 0, 0, 0]} />
              <Bar dataKey="S" stackId="q" fill={DIR_COLORS.S} radius={[0, 0, 0, 0]} />
              <Bar dataKey="W" stackId="q" fill={DIR_COLORS.W} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}
    </div>
  );
}

function ChartPanel({
  title,
  subtitle,
  right,
  children,
  isDay,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  isDay: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border space-y-4 transition-colors ${
      isDay ? "bg-white border-slate-200 shadow-sm" : "bg-gray-900/60 border-gray-800"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-semibold ${isDay ? "text-slate-800" : "text-gray-200"}`}>{title}</h3>
          {subtitle && <p className={`text-xs mt-0.5 ${isDay ? "text-slate-400" : "text-gray-500"}`}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

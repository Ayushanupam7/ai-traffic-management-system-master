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
  A0: "#60a5fa",
  A1: "#34d399",
  B0: "#f87171",
  B1: "#fbbf24",
  C0: "#a78bfa",
  C1: "#22d3ee",
};

const DIR_COLORS = {
  N: "#60a5fa",
  E: "#22c55e",
  S: "#eab308",
  W: "#ef4444",
};

const CHART_STYLE = {
  bg: "#0a0e16",
  axis: "#9ca3af",
  grid: "#1f2937",
  tooltipBg: "#0a0e16",
  tooltipBorder: "#374151",
};

function fmtDuration(started: string, ended: string | null): string {
  if (!ended) return "—";
  const s = Math.max(0, Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ConfigCard({ run }: { run: RunRow }) {
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
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-gray-900/40 border border-gray-800 rounded-lg p-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
          <div className="text-sm font-mono text-gray-200 mt-0.5">{value}</div>
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
      <ConfigCard run={run} />

      {globalMetrics.length === 0 && interMetrics.length === 0 && (
        <p className="text-xs text-gray-500">
          No cycle metrics were captured for this run (run may have ended before any cycle wrap).
        </p>
      )}

      {globalMetrics.length > 0 && (
        <ChartPanel title="Global Metrics" subtitle="One sample per ~116s cycle, anchored on B0">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={globalMetrics} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_STYLE.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="sim_time"
                stroke={CHART_STYLE.axis}
                tick={{ fontSize: 10 }}
                label={{ value: "sim_time (s)", position: "insideBottom", offset: -5, fill: CHART_STYLE.axis, fontSize: 10 }}
              />
              <YAxis
                yAxisId="left"
                stroke={CHART_STYLE.axis}
                tick={{ fontSize: 10 }}
                label={{ value: "seconds", angle: -90, position: "insideLeft", fill: CHART_STYLE.axis, fontSize: 10 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={CHART_STYLE.axis}
                tick={{ fontSize: 10 }}
                label={{ value: "vehicles", angle: 90, position: "insideRight", fill: CHART_STYLE.axis, fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{ background: CHART_STYLE.tooltipBg, border: `1px solid ${CHART_STYLE.tooltipBorder}` }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="left"  type="monotone" dataKey="avg_trip_time_s"     name="Avg trip time (s)"    stroke="#60a5fa" dot={false} />
              <Line yAxisId="left"  type="monotone" dataKey="avg_control_delay_s" name="Avg control delay (s)" stroke="#f87171" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="total_halting"       name="Halting (count)"      stroke="#fbbf24" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="total_vehicles"      name="Active (count)"       stroke="#34d399" dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {queueChartData.length > 0 && (
        <ChartPanel
          title="Per-intersection Queue Trends"
          subtitle="Total halting across N+E+S+W per intersection, per cycle"
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={queueChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_STYLE.grid} strokeDasharray="3 3" />
              <XAxis dataKey="sim_time" stroke={CHART_STYLE.axis} tick={{ fontSize: 10 }} />
              <YAxis stroke={CHART_STYLE.axis} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: CHART_STYLE.tooltipBg, border: `1px solid ${CHART_STYLE.tooltipBorder}` }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {INTERSECTIONS.map((id) => (
                <Line key={id} type="monotone" dataKey={id} stroke={INTER_COLORS[id]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {interMetrics.length > 0 && (
        <ChartPanel
          title="Direction Breakdown"
          subtitle={`Queue length by approach for ${selectedIntersection}`}
          right={
            <div className="flex gap-1">
              {INTERSECTIONS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedIntersection(id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                    selectedIntersection === id
                      ? "bg-blue-700 border-blue-500 text-white"
                      : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
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
              <CartesianGrid stroke={CHART_STYLE.grid} strokeDasharray="3 3" />
              <XAxis dataKey="sim_time" stroke={CHART_STYLE.axis} tick={{ fontSize: 10 }} />
              <YAxis stroke={CHART_STYLE.axis} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: CHART_STYLE.tooltipBg, border: `1px solid ${CHART_STYLE.tooltipBorder}` }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="N" stackId="q" fill={DIR_COLORS.N} />
              <Bar dataKey="E" stackId="q" fill={DIR_COLORS.E} />
              <Bar dataKey="S" stackId="q" fill={DIR_COLORS.S} />
              <Bar dataKey="W" stackId="q" fill={DIR_COLORS.W} />
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
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
          {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

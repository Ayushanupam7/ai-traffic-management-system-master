"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ComparisonExperiment, ComparisonRun } from "@/lib/types";

import { useTrafficStore } from "@/store/trafficStore";

// Per-policy color palette — same hues used elsewhere in the dashboard
// so the bar colors carry consistent meaning across pages.
const POLICY_COLOR: Record<string, string> = {
  fixed_time:  "#94a3b8",
  actuated:    "#3b82f6",
  ramp_binary: "#f59e0b",
  ramp_alinea: "#10b981",
};
const POLICY_COLOR_FALLBACK = "#8b5cf6";

type MetricKey =
  | "clearance_s"
  | "avg_trip_time_s"
  | "avg_control_delay_s"
  | "throughput_veh_per_min";

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  digits: number;
}

const METRICS: MetricDef[] = [
  { key: "clearance_s",            label: "Clearance time",      unit: "s",       lowerIsBetter: true,  digits: 0 },
  { key: "avg_trip_time_s",        label: "Mean trip time",      unit: "s",       lowerIsBetter: true,  digits: 1 },
  { key: "avg_control_delay_s",    label: "Mean control delay",  unit: "s",       lowerIsBetter: true,  digits: 2 },
  { key: "throughput_veh_per_min", label: "Throughput",          unit: "veh/min", lowerIsBetter: false, digits: 2 },
];

interface ChartDatum {
  index: number;
  label: string;
  policy: string;
  value: number | null;
  isBest: boolean;
}

function buildData(
  runs: ComparisonRun[],
  metric: MetricDef,
): ChartDatum[] {
  const values = runs
    .map((r) => (r.result ? (r.result[metric.key] as number | null) : null))
    .map((v) => (v == null ? null : v));
  const valid = values.filter((v): v is number => v != null);
  const best =
    valid.length === 0
      ? null
      : metric.lowerIsBetter
      ? Math.min(...valid)
      : Math.max(...valid);

  return runs.map((r, i) => {
    const v = values[i];
    return {
      index: i + 1,
      label: `${i + 1} · ${r.config.policy_type}`,
      policy: r.config.policy_type,
      value: v,
      isBest: v != null && best != null && v === best,
    };
  });
}

function fmt(v: number | null | undefined, digits: number): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

export default function ComparisonCharts({
  experiment,
}: {
  experiment: ComparisonExperiment;
}) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  // Don't render at all if no runs have a result yet (e.g. cancelled
  // before the first run completed).
  const haveAnyResults = experiment.runs.some((r) => r.result != null);
  if (!haveAnyResults) return null;

  return (
    <div className="space-y-3">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDay ? "text-slate-500" : "text-gray-400"}`}>
        Comparison charts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {METRICS.map((m) => (
          <MetricChart key={m.key} metric={m} runs={experiment.runs} isDay={isDay} />
        ))}
      </div>
      <p className={`text-[11px] ${isDay ? "text-slate-500" : "text-gray-500"}`}>
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500 mr-1.5 align-middle"></span>
        Green bar = optimal value for that metric (lower is better except throughput).
      </p>
    </div>
  );
}

function MetricChart({
  metric,
  runs,
  isDay,
}: {
  metric: MetricDef;
  runs: ComparisonRun[];
  isDay: boolean;
}) {
  const data = buildData(runs, metric);
  // If every bar is null (e.g. clearance for time-limited runs), don't draw.
  const anyValue = data.some((d) => d.value != null);

  return (
    <div className={`rounded-xl p-4 border transition-colors ${
      isDay ? "bg-white border-slate-200 shadow-sm" : "bg-gray-900/60 border-gray-800"
    }`}>
      <div className={`text-xs font-medium mb-2 ${isDay ? "text-slate-800" : "text-gray-200"}`}>
        {metric.label}
        <span className={`ml-1 text-[11px] font-normal ${isDay ? "text-slate-400" : "text-gray-500"}`}>({metric.unit})</span>
        <span className={`ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
          isDay ? "bg-slate-100 text-slate-600" : "bg-gray-800 text-gray-400"
        }`}>
          {metric.lowerIsBetter ? "lower is better" : "higher is better"}
        </span>
      </div>
      {!anyValue ? (
        <div className={`h-56 flex items-center justify-center text-xs ${isDay ? "text-slate-400" : "text-gray-500"}`}>
          No data recorded
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: -10, bottom: 4 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke={isDay ? "#f1f5f9" : "#1f2937"} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: isDay ? "#64748b" : "#9ca3af", fontSize: 10 }}
              stroke={isDay ? "#cbd5e1" : "#374151"}
            />
            <YAxis
              tick={{ fill: isDay ? "#64748b" : "#9ca3af", fontSize: 10 }}
              stroke={isDay ? "#cbd5e1" : "#374151"}
              tickFormatter={(v) => v.toString()}
            />
            <Tooltip
              contentStyle={{
                background: isDay ? "#ffffff" : "#0d1117",
                border: isDay ? "1px solid #e2e8f0" : "1px solid #374151",
                borderRadius: "8px",
                boxShadow: isDay ? "0 4px 12px rgba(0,0,0,0.06)" : "0 4px 12px rgba(0,0,0,0.4)",
                fontSize: 12,
                color: isDay ? "#0f172a" : "#f3f4f6",
              }}
              labelStyle={{ color: isDay ? "#334155" : "#9ca3af", fontWeight: 600 }}
              formatter={(v: number) => [fmt(v, metric.digits), metric.label]}
            />
            <Bar dataKey="value" maxBarSize={64} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.index}
                  fill={
                    d.isBest
                      ? "#10b981"  // emerald-500
                      : POLICY_COLOR[d.policy] ?? POLICY_COLOR_FALLBACK
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

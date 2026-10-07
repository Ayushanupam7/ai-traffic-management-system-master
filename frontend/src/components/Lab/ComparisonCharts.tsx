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

// Per-policy color palette — same hues used elsewhere in the dashboard
// so the bar colors carry consistent meaning across pages.
const POLICY_COLOR: Record<string, string> = {
  fixed_time:  "#9ca3af",
  actuated:    "#60a5fa",
  ramp_binary: "#f59e0b",
  ramp_alinea: "#34d399",
};
const POLICY_COLOR_FALLBACK = "#a78bfa";

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
  // Don't render at all if no runs have a result yet (e.g. cancelled
  // before the first run completed).
  const haveAnyResults = experiment.runs.some((r) => r.result != null);
  if (!haveAnyResults) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Comparison charts
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {METRICS.map((m) => (
          <MetricChart key={m.key} metric={m} runs={experiment.runs} />
        ))}
      </div>
      <p className="text-[10px] text-gray-500">
        Green bar = best value for that metric (lower is better except throughput).
      </p>
    </div>
  );
}

function MetricChart({
  metric,
  runs,
}: {
  metric: MetricDef;
  runs: ComparisonRun[];
}) {
  const data = buildData(runs, metric);
  // If every bar is null (e.g. clearance for time-limited runs), don't draw.
  const anyValue = data.some((d) => d.value != null);

  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-300 mb-1">
        {metric.label}
        <span className="ml-1 text-gray-600">({metric.unit})</span>
        <span className="ml-2 text-[10px] text-gray-600 uppercase tracking-widest">
          {metric.lowerIsBetter ? "lower is better" : "higher is better"}
        </span>
      </div>
      {!anyValue ? (
        <div className="h-56 flex items-center justify-center text-[11px] text-gray-600">
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              stroke="#374151"
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              stroke="#374151"
              tickFormatter={(v) => v.toString()}
            />
            <Tooltip
              contentStyle={{
                background: "#0d1117",
                border: "1px solid #374151",
                fontSize: 11,
              }}
              labelStyle={{ color: "#d1d5db" }}
              formatter={(v: number) => [fmt(v, metric.digits), metric.label]}
            />
            <Bar dataKey="value" maxBarSize={80} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.index}
                  fill={
                    d.isBest
                      ? "#22c55e"  // green-500
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

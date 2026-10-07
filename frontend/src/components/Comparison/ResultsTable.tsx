"use client";

import { useState } from "react";
import RunDetailDrawer from "@/components/Lab/RunDetailDrawer";
import type { ComparisonExperiment, ComparisonRun } from "@/lib/types";

type NumericKey =
  | "clearance_s"
  | "avg_trip_time_s"
  | "avg_control_delay_s"
  | "throughput_veh_per_min"
  | "completed_trips";

const LOWER_IS_BETTER = new Set<NumericKey>([
  "clearance_s",
  "avg_trip_time_s",
  "avg_control_delay_s",
]);

function bestValue(
  runs: ComparisonRun[],
  key: NumericKey
): number | null {
  const vals = runs
    .map((r) => (r.result ? (r.result[key] as number | null) : null))
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return LOWER_IS_BETTER.has(key) ? Math.min(...vals) : Math.max(...vals);
}

function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

function toCsv(exp: ComparisonExperiment): string {
  const header = [
    "#",
    "policy",
    "profile",
    "cars",
    "dir",
    "mode",
    "clearance_s",
    "avg_trip_time_s",
    "completed_trips",
    "avg_control_delay_s",
    "throughput_veh_per_min",
  ];
  const rows = exp.runs.map((r, i) => {
    const c = r.config;
    const res = r.result;
    return [
      i + 1,
      c.policy_type,
      c.demand_profile,
      c.total_vehicles,
      c.demand_profile === "asym" ? c.dominant_direction : "",
      c.race_mode ? "race" : `time=${c.duration_ticks ?? ""}`,
      res?.clearance_s ?? "",
      res?.avg_trip_time_s ?? "",
      res?.completed_trips ?? "",
      res?.avg_control_delay_s ?? "",
      res?.throughput_veh_per_min ?? "",
    ]
      .map((v) => String(v))
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

export default function ResultsTable({
  experiment,
}: {
  experiment: ComparisonExperiment;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const best: Record<NumericKey, number | null> = {
    clearance_s: bestValue(experiment.runs, "clearance_s"),
    avg_trip_time_s: bestValue(experiment.runs, "avg_trip_time_s"),
    avg_control_delay_s: bestValue(experiment.runs, "avg_control_delay_s"),
    throughput_veh_per_min: bestValue(
      experiment.runs,
      "throughput_veh_per_min"
    ),
    completed_trips: bestValue(experiment.runs, "completed_trips"),
  };

  const downloadCsv = () => {
    const blob = new Blob([toCsv(experiment)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${experiment.name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellClass = (key: NumericKey, value: number | null) => {
    if (value == null || best[key] == null) return "text-gray-300";
    return value === best[key]
      ? "text-green-300 font-semibold"
      : "text-gray-300";
  };

  // Baseline = the first run with usable results. Subsequent rows show
  // their delta against it. We render the delta as a small line under
  // each numeric value, colored by whether it actually improved on that
  // metric (lower is better for most; higher is better for throughput).
  const baselineRun =
    experiment.runs.find((r) => r.result != null) ?? null;
  const baseline: Record<NumericKey, number | null> = {
    clearance_s:            baselineRun?.result?.clearance_s ?? null,
    avg_trip_time_s:        baselineRun?.result?.avg_trip_time_s ?? null,
    avg_control_delay_s:    baselineRun?.result?.avg_control_delay_s ?? null,
    throughput_veh_per_min: baselineRun?.result?.throughput_veh_per_min ?? null,
    completed_trips:        baselineRun?.result?.completed_trips ?? null,
  };

  const Delta = ({
    metric, value, isBaseline,
  }: { metric: NumericKey; value: number | null; isBaseline: boolean }) => {
    if (isBaseline) {
      return <div className="text-[10px] text-gray-600">baseline</div>;
    }
    const b = baseline[metric];
    if (value == null || b == null || b === 0) {
      return <div className="text-[10px] text-gray-700">—</div>;
    }
    const pct = ((value - b) / b) * 100;
    const lowerBetter = LOWER_IS_BETTER.has(metric);
    const improved = lowerBetter ? pct < 0 : pct > 0;
    const arrow = pct < 0 ? "▼" : pct > 0 ? "▲" : "▶";
    const color =
      Math.abs(pct) < 0.05
        ? "text-gray-500"
        : improved
        ? "text-green-400"
        : "text-red-400";
    return (
      <div className={`text-[10px] font-mono ${color}`}>
        {arrow} {Math.abs(pct).toFixed(1)}%
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Results
        </h2>
        <button
          type="button"
          onClick={downloadCsv}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-3 py-1"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-800 rounded">
        <table className="w-full text-xs">
          <thead className="bg-gray-900 text-gray-400 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Policy</th>
              <th className="px-3 py-2 text-left">Profile</th>
              <th className="px-3 py-2 text-right">Cars</th>
              <th className="px-3 py-2 text-left">Dir</th>
              <th className="px-3 py-2 text-left">Mode</th>
              <th className="px-3 py-2 text-right">Clearance (s)</th>
              <th className="px-3 py-2 text-right">Avg Trip (s)</th>
              <th className="px-3 py-2 text-right">Trips</th>
              <th className="px-3 py-2 text-right">Avg Ctrl Delay (s)</th>
              <th className="px-3 py-2 text-right">Throughput</th>
            </tr>
          </thead>
          <tbody>
            {experiment.runs.map((run, idx) => {
              const c = run.config;
              const r = run.result;
              const isBaseline = baselineRun != null && run.run_id === baselineRun.run_id;
              return (
                <tr
                  key={run.run_id}
                  className="border-t border-gray-800 hover:bg-gray-900/60 cursor-pointer transition-colors"
                  onClick={() => setSelectedRunId(run.run_id)}
                  title="Click for per-tick charts"
                >
                  <td className="px-3 py-2 font-mono text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2">{c.policy_type}</td>
                  <td className="px-3 py-2">{c.demand_profile}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {c.total_vehicles}
                  </td>
                  <td className="px-3 py-2">
                    {c.demand_profile === "asym" ? c.dominant_direction : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {c.race_mode ? "race" : `time ${c.duration_ticks}s`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${cellClass(
                      "clearance_s",
                      r?.clearance_s ?? null
                    )}`}
                  >
                    {fmt(r?.clearance_s, 0)}
                    <Delta metric="clearance_s" value={r?.clearance_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${cellClass(
                      "avg_trip_time_s",
                      r?.avg_trip_time_s ?? null
                    )}`}
                  >
                    {fmt(r?.avg_trip_time_s, 1)}
                    <Delta metric="avg_trip_time_s" value={r?.avg_trip_time_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${cellClass(
                      "completed_trips",
                      r?.completed_trips ?? null
                    )}`}
                  >
                    {r?.completed_trips ?? "—"}
                    <Delta metric="completed_trips" value={r?.completed_trips ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${cellClass(
                      "avg_control_delay_s",
                      r?.avg_control_delay_s ?? null
                    )}`}
                  >
                    {fmt(r?.avg_control_delay_s, 2)}
                    <Delta metric="avg_control_delay_s" value={r?.avg_control_delay_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${cellClass(
                      "throughput_veh_per_min",
                      r?.throughput_veh_per_min ?? null
                    )}`}
                  >
                    {fmt(r?.throughput_veh_per_min, 2)}
                    <Delta metric="throughput_veh_per_min" value={r?.throughput_veh_per_min ?? null} isBaseline={isBaseline} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-gray-500">
        Green = best value in column. Small ▼/▲ shows % change vs the baseline (first row) — green if it&apos;s an improvement, red if worse. Click any row for per-tick charts.
      </p>

      {selectedRunId && (
        <RunDetailDrawer
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}

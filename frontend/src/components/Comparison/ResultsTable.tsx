"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import RunDetailDrawer from "@/components/Lab/RunDetailDrawer";
import { Download, Table as TableIcon, Award } from "lucide-react";
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
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

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
    if (value == null || best[key] == null) return isDay ? "text-slate-800" : "text-gray-300";
    return value === best[key]
      ? "text-emerald-600 dark:text-emerald-400 font-black"
      : isDay ? "text-slate-800" : "text-gray-300";
  };

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
      return <div className={`text-[9.5px] font-semibold ${isDay ? "text-slate-400" : "text-gray-500"}`}>baseline</div>;
    }
    const b = baseline[metric];
    if (value == null || b == null || b === 0) {
      return <div className="text-[9.5px] text-gray-500">—</div>;
    }
    const pct = ((value - b) / b) * 100;
    const lowerBetter = LOWER_IS_BETTER.has(metric);
    const improved = lowerBetter ? pct < 0 : pct > 0;
    const arrow = pct < 0 ? "▼" : pct > 0 ? "▲" : "▶";
    const color =
      Math.abs(pct) < 0.05
        ? isDay ? "text-slate-400" : "text-gray-500"
        : improved
        ? "text-emerald-600 dark:text-emerald-400 font-bold"
        : "text-rose-600 dark:text-rose-400 font-bold";

    return (
      <div className={`text-[9.5px] font-mono leading-none mt-0.5 ${color}`}>
        {arrow} {Math.abs(pct).toFixed(1)}%
      </div>
    );
  };

  return (
    <div className={`p-5 rounded-2xl border space-y-4 ${
      isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
    }`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-blue-500" />
          <h2 className={`text-xs uppercase font-bold tracking-wider ${
            isDay ? "text-slate-700" : "text-gray-300"
          }`}>
            Benchmark Run Results & Variance Table
          </h2>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className={`text-xs font-bold rounded-xl px-3.5 py-1.5 border flex items-center gap-1.5 transition-all shadow-xs ${
            isDay
              ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800"
              : "bg-gray-800 hover:bg-gray-750 border-gray-700 text-gray-200"
          }`}
        >
          <Download className="w-3.5 h-3.5 text-blue-500" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className={`overflow-x-auto rounded-xl border ${
        isDay ? "border-slate-200 bg-white" : "border-gray-800 bg-gray-950/40"
      }`}>
        <table className="w-full text-xs">
          <thead className={isDay ? "bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider" : "bg-gray-900 text-gray-400 uppercase text-[10px] tracking-wider"}>
            <tr>
              <th className="px-3 py-2 text-left font-bold">#</th>
              <th className="px-3 py-2 text-left font-bold">Policy</th>
              <th className="px-3 py-2 text-left font-bold">Demand</th>
              <th className="px-3 py-2 text-right font-bold">Vehicles</th>
              <th className="px-3 py-2 text-left font-bold">Flow Dir</th>
              <th className="px-3 py-2 text-left font-bold">Mode</th>
              <th className="px-3 py-2 text-right font-bold">Clearance</th>
              <th className="px-3 py-2 text-right font-bold">Avg Trip</th>
              <th className="px-3 py-2 text-right font-bold">Trips</th>
              <th className="px-3 py-2 text-right font-bold">Ctrl Delay</th>
              <th className="px-3 py-2 text-right font-bold">Throughput</th>
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
                  className={`border-t transition-colors cursor-pointer ${
                    isDay
                      ? "border-slate-100 hover:bg-blue-50/40"
                      : "border-gray-800/80 hover:bg-gray-900/60"
                  }`}
                  onClick={() => setSelectedRunId(run.run_id)}
                  title="Click to inspect per-tick charts"
                >
                  <td className="px-3 py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{c.policy_type}</td>
                  <td className="px-3 py-2.5">{c.demand_profile}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold">
                    {c.total_vehicles}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.demand_profile === "asym" ? c.dominant_direction : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.race_mode ? "race" : `${c.duration_ticks}s`}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${cellClass(
                      "clearance_s",
                      r?.clearance_s ?? null
                    )}`}
                  >
                    <div>{fmt(r?.clearance_s, 0)}s</div>
                    <Delta metric="clearance_s" value={r?.clearance_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${cellClass(
                      "avg_trip_time_s",
                      r?.avg_trip_time_s ?? null
                    )}`}
                  >
                    <div>{fmt(r?.avg_trip_time_s, 1)}s</div>
                    <Delta metric="avg_trip_time_s" value={r?.avg_trip_time_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${cellClass(
                      "completed_trips",
                      r?.completed_trips ?? null
                    )}`}
                  >
                    <div>{r?.completed_trips ?? "—"}</div>
                    <Delta metric="completed_trips" value={r?.completed_trips ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${cellClass(
                      "avg_control_delay_s",
                      r?.avg_control_delay_s ?? null
                    )}`}
                  >
                    <div>{fmt(r?.avg_control_delay_s, 2)}s</div>
                    <Delta metric="avg_control_delay_s" value={r?.avg_control_delay_s ?? null} isBaseline={isBaseline} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono ${cellClass(
                      "throughput_veh_per_min",
                      r?.throughput_veh_per_min ?? null
                    )}`}
                  >
                    <div>{fmt(r?.throughput_veh_per_min, 2)}</div>
                    <Delta metric="throughput_veh_per_min" value={r?.throughput_veh_per_min ?? null} isBaseline={isBaseline} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={`flex items-center gap-1.5 text-[11px] ${isDay ? "text-slate-500" : "text-gray-400"}`}>
        <Award className="w-3.5 h-3.5 text-emerald-500" />
        <span>Green highlights indicate optimal metric across runs. Delta markers (▼/▲) reflect percentage variance versus Run #1 baseline.</span>
      </div>

      {selectedRunId && (
        <RunDetailDrawer
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}

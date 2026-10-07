"use client";

import type { ComparisonExperiment, ComparisonRun } from "@/lib/types";

const STATUS_STYLES: Record<ComparisonRun["status"], string> = {
  pending: "bg-gray-800 text-gray-400 border-gray-700",
  running: "bg-blue-900/40 text-blue-300 border-blue-700 animate-pulse",
  completed: "bg-green-900/30 text-green-300 border-green-700",
  failed: "bg-red-900/30 text-red-300 border-red-700",
  cancelled: "bg-yellow-900/30 text-yellow-300 border-yellow-700",
};

export default function ComparisonProgress({
  experiment,
  onCancel,
}: {
  experiment: ComparisonExperiment;
  onCancel: () => void;
}) {
  const isActive =
    experiment.status === "running" || experiment.status === "pending";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            {experiment.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Status: <span className="capitalize">{experiment.status}</span> ·
            seed {experiment.seed}
          </p>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-red-700 hover:bg-red-600 text-white rounded px-3 py-1 text-xs"
          >
            Cancel
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {experiment.runs.map((run, idx) => {
          const c = run.config;
          const mode = c.race_mode ? "race" : `time ${c.duration_ticks ?? "?"}s`;
          return (
            <li
              key={run.run_id}
              className={`border rounded px-3 py-2 text-xs flex items-center justify-between ${
                STATUS_STYLES[run.status]
              }`}
            >
              <div>
                <span className="font-mono text-gray-500 mr-2">
                  #{idx + 1}
                </span>
                <span>
                  {c.policy_type} · {c.demand_profile}
                  {c.demand_profile === "asym" ? ` (${c.dominant_direction})` : ""}
                  {" · "}
                  {c.total_vehicles} cars · {mode}
                </span>
              </div>
              <div className="capitalize">
                {run.status}
                {run.status === "completed" && run.result && (
                  <span className="ml-2 font-mono text-gray-300">
                    {run.result.clearance_s != null
                      ? `${run.result.clearance_s.toFixed(0)}s clearance`
                      : `${run.result.avg_trip_time_s.toFixed(1)}s avg trip`}
                  </span>
                )}
                {run.status === "failed" && run.error && (
                  <span className="ml-2 text-[10px] text-gray-400">
                    {run.error}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

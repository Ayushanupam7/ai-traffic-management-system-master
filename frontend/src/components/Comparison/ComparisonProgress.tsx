"use client";

import { useTrafficStore } from "@/store/trafficStore";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import type { ComparisonExperiment, ComparisonRun } from "@/lib/types";

export default function ComparisonProgress({
  experiment,
  onCancel,
}: {
  experiment: ComparisonExperiment;
  onCancel: () => void;
}) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  const isActive =
    experiment.status === "running" || experiment.status === "pending";

  const getStatusBadge = (status: ComparisonRun["status"]) => {
    switch (status) {
      case "running":
        return {
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />,
          label: "Executing",
          style: isDay
            ? "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-blue-950/50 border-blue-800 text-blue-300 animate-pulse",
        };
      case "completed":
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
          label: "Completed",
          style: isDay
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-emerald-950/40 border-emerald-800 text-emerald-300",
        };
      case "failed":
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-500" />,
          label: "Failed",
          style: isDay
            ? "bg-rose-50 border-rose-200 text-rose-800"
            : "bg-rose-950/40 border-rose-800 text-rose-300",
        };
      case "cancelled":
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
          label: "Cancelled",
          style: isDay
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-amber-950/40 border-amber-800 text-amber-300",
        };
      default:
        return {
          icon: <Clock className="w-3.5 h-3.5 text-slate-400" />,
          label: "Queued",
          style: isDay
            ? "bg-slate-50 border-slate-200 text-slate-600"
            : "bg-gray-900 border-gray-800 text-gray-400",
        };
    }
  };

  return (
    <div className={`p-5 rounded-2xl border space-y-4 ${
      isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
    }`}>
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-gray-800">
        <div>
          <h2 className={`text-base font-bold ${isDay ? "text-slate-900" : "text-white"}`}>
            Experiment: {experiment.name}
          </h2>
          <p className={`text-xs mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
            Status: <span className="capitalize font-bold text-blue-500">{experiment.status}</span> · Random Seed #{experiment.seed}
          </p>
        </div>
        {isActive && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-rose-600 hover:bg-rose-500 text-white rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm"
          >
            Halt Experiment
          </button>
        )}
      </div>

      <ul className="space-y-2.5">
        {experiment.runs.map((run, idx) => {
          const c = run.config;
          const mode = c.race_mode ? "Race until empty" : `Time limit (${c.duration_ticks ?? "?"}s)`;
          const badge = getStatusBadge(run.status);

          return (
            <li
              key={run.run_id}
              className={`border rounded-xl p-3 text-xs flex items-center justify-between transition-all ${badge.style}`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-xs">
                  Run #{idx + 1}
                </span>
                <span className="font-semibold">
                  {c.policy_type}
                </span>
                <span className={`text-[11px] font-normal opacity-80`}>
                  · {c.demand_profile} · {c.total_vehicles} vehicles · {mode}
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                {badge.icon}
                <span>{badge.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

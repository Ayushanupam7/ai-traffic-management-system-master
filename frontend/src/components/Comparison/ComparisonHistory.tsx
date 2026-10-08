"use client";

import { useTrafficStore } from "@/store/trafficStore";
import { CheckCircle2, PlayCircle, XCircle, AlertCircle } from "lucide-react";
import type { ComparisonExperiment } from "@/lib/types";

export default function ComparisonHistory({
  items,
  activeId,
  onSelect,
}: {
  items: ComparisonExperiment[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  if (!items.length) {
    return (
      <div className={`p-4 rounded-xl border text-xs text-center ${
        isDay ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-gray-900/40 border-gray-800 text-gray-500"
      }`}>
        No previous comparison records logged. Configure runs on the right and start an experiment.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((exp) => {
        const done = exp.runs.filter((r) => r.status === "completed").length;
        const isSelected = exp.experiment_id === activeId;

        const statusIcon =
          exp.status === "completed" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : exp.status === "running" ? (
            <PlayCircle className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
          ) : exp.status === "cancelled" ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
          );

        return (
          <li key={exp.experiment_id}>
            <button
              type="button"
              onClick={() => onSelect(exp.experiment_id)}
              className={`w-full text-left p-3 rounded-xl text-xs border transition-all ${
                isSelected
                  ? isDay
                    ? "bg-blue-50/80 border-blue-600 text-blue-900 shadow-sm shadow-blue-500/10 font-bold"
                    : "bg-blue-950/40 border-blue-500 text-blue-200 shadow-sm font-bold"
                  : isDay
                    ? "bg-white border-slate-200/90 hover:bg-slate-50 text-slate-800 shadow-xs"
                    : "bg-gray-900/40 border-gray-800 hover:border-gray-700 text-gray-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold truncate">{exp.name}</span>
                <div className="flex items-center gap-1">
                  {statusIcon}
                  <span className={`text-[10px] font-semibold capitalize ${
                    exp.status === "completed" ? "text-emerald-600 dark:text-emerald-400" :
                    exp.status === "running" ? "text-blue-600 dark:text-blue-400 font-bold" :
                    isDay ? "text-slate-500" : "text-gray-400"
                  }`}>
                    {exp.status}
                  </span>
                </div>
              </div>
              <div className={`text-[10px] font-medium flex items-center justify-between ${
                isDay ? "text-slate-500" : "text-gray-400"
              }`}>
                <span>{done} of {exp.runs.length} runs complete</span>
                <span className="font-mono">Seed #{exp.seed}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

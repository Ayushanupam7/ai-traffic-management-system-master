"use client";

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
  if (!items.length) {
    return (
      <p className="text-xs text-gray-500">No past comparisons yet.</p>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map((exp) => {
        const done = exp.runs.filter((r) => r.status === "completed").length;
        return (
          <li key={exp.experiment_id}>
            <button
              type="button"
              onClick={() => onSelect(exp.experiment_id)}
              className={`w-full text-left px-3 py-2 rounded text-xs border transition ${
                exp.experiment_id === activeId
                  ? "bg-gray-800 border-gray-600"
                  : "bg-gray-900/40 border-gray-800 hover:bg-gray-900"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-200 truncate">{exp.name}</span>
                <span className="text-[10px] text-gray-500 capitalize">
                  {exp.status}
                </span>
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {done}/{exp.runs.length} runs · seed {exp.seed}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

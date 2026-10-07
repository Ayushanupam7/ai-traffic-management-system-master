"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type {
  PolicyFamily,
  PolicySuggestResponse,
} from "@/lib/types";

interface Props {
  draft: Record<string, number>;
  family: PolicyFamily;
  onApply: (field: string, value: number) => void;
}

type Goal = "balanced" | "minimize_trip_time" | "minimize_halting";

const GOAL_LABELS: Record<Goal, string> = {
  balanced: "Balanced",
  minimize_trip_time: "Minimize trip time",
  minimize_halting: "Minimize halting",
};

export default function PolicySuggester({ draft, family, onApply }: Props) {
  const [goal, setGoal] = useState<Goal>("balanced");
  const [resp, setResp] = useState<PolicySuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = (await api.suggestPolicy(
        draft as unknown as Record<string, unknown>,
        goal,
        family,
      )) as PolicySuggestResponse;
      setResp(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold text-gray-200 mb-1">AI suggestions</h2>
        <p className="text-[11px] text-gray-500">
          Uses past comparison-run outcomes to suggest 2-3 tweaks to the current
          draft. Powered by Groq · llama-3.3-70b. Each suggestion comes with the
          field, the proposed value, and a one-sentence reason.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Goal
          </div>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as Goal)}
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs"
          >
            {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => (
              <option key={g} value={g}>{GOAL_LABELS[g]}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={fetchSuggestions}
          disabled={loading}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs rounded px-3 py-1.5 self-end"
        >
          {loading ? "Thinking…" : "Get suggestions"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {resp && resp.note && (
        <p className="text-[11px] text-yellow-400">{resp.note}</p>
      )}

      {resp && resp.suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">
            Based on {resp.sample_size} past runs
          </div>
          {resp.suggestions.map((s, i) => {
            const current = (draft[s.field] ?? 0) as number;
            const diff = s.value - current;
            return (
              <div
                key={i}
                className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-blue-400">{s.field}</span>
                    <span className="text-xs text-gray-500">
                      {current} →{" "}
                      <span className="text-yellow-300 font-mono">{s.value}</span>
                      {diff !== 0 && (
                        <span className={`ml-1 ${diff > 0 ? "text-green-400" : "text-red-400"}`}>
                          ({diff > 0 ? "+" : ""}{diff.toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">{s.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(s.field, s.value)}
                  className="bg-blue-700 hover:bg-blue-600 text-white text-[11px] rounded px-2 py-1 flex-shrink-0"
                >
                  Apply
                </button>
              </div>
            );
          })}
          <p className="text-[10px] text-gray-600 pt-2">
            Tip: apply one at a time, then save the result as a new variant so you
            can compare it against the original.
          </p>
        </div>
      )}

      {resp && resp.suggestions.length === 0 && !resp.note && (
        <p className="text-xs text-gray-500">
          The model returned no actionable suggestions. Try a different goal or
          run more experiments to give it more signal.
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import { Sparkles, ArrowRight, Check } from "lucide-react";
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
  balanced: "Balanced Flow Optimization",
  minimize_trip_time: "Minimize Average Trip Time",
  minimize_halting: "Minimize Queue Halting & Stops",
};

export default function PolicySuggester({ draft, family, onApply }: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

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
    <div className="space-y-6 max-w-4xl">
      <div className={`p-5 rounded-2xl border ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h2 className={`text-base font-bold ${isDay ? "text-slate-900" : "text-white"}`}>
            AI-Driven Parameter Synthesis
          </h2>
        </div>
        <p className={`text-xs ${isDay ? "text-slate-500" : "text-gray-400"}`}>
          Leverages historical simulation telemetry to suggest fine-tuned coefficient adjustments for this draft. Powered by Groq Llama-3.3-70b.
        </p>

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div className="flex-1 min-w-[260px]">
            <label className={`text-[10px] uppercase font-bold tracking-wider mb-1 block ${
              isDay ? "text-slate-600" : "text-gray-400"
            }`}>
              Optimization Target Objective
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value as Goal)}
              className={`w-full rounded-xl px-3 py-2 text-xs font-medium border outline-none transition-all ${
                isDay
                  ? "bg-slate-50 border-slate-300 text-slate-800 focus:bg-white focus:border-blue-600 shadow-xs"
                  : "bg-gray-900 border-gray-700 text-gray-200 focus:bg-gray-950 focus:border-blue-500"
              }`}
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
            className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl px-4 py-2 flex items-center gap-1.5 shadow-sm shadow-purple-600/20 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{loading ? "Synthesizing…" : "Generate AI Suggestions"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className={`p-3 rounded-xl border text-xs font-medium ${
          isDay ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-rose-950/40 border-rose-800 text-rose-300"
        }`}>
          {error}
        </div>
      )}

      {resp && resp.note && (
        <div className={`p-3 rounded-xl border text-xs font-medium ${
          isDay ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-amber-950/40 border-amber-800 text-amber-300"
        }`}>
          {resp.note}
        </div>
      )}

      {resp && resp.suggestions.length > 0 && (
        <div className="space-y-3">
          <div className={`text-xs font-bold uppercase tracking-wider ${
            isDay ? "text-slate-600" : "text-gray-400"
          }`}>
            Proposed Refinements (Sample Size: {resp.sample_size} runs)
          </div>
          {resp.suggestions.map((s, i) => {
            const current = (draft[s.field] ?? 0) as number;
            const diff = s.value - current;
            return (
              <div
                key={i}
                className={`p-4 rounded-2xl border flex items-start gap-3 transition-all ${
                  isDay ? "bg-white border-slate-200/90 shadow-xs" : "bg-[#0c1017]/90 border-gray-800 shadow-sm"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">{s.field}</span>
                    <span className={`text-xs flex items-center gap-1 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
                      <span className="font-mono">{current}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">{s.value}</span>
                      {diff !== 0 && (
                        <span className={`font-mono text-[11px] font-bold ml-1 ${
                          diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                        }`}>
                          ({diff > 0 ? "+" : ""}{diff.toFixed(2)})
                        </span>
                      )}
                    </span>
                  </div>
                  <p className={`text-xs mt-1.5 leading-relaxed ${isDay ? "text-slate-600" : "text-gray-300"}`}>
                    {s.reason}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onApply(s.field, s.value)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl px-3 py-1.5 flex items-center gap-1 shadow-sm transition-all"
                >
                  <Check className="w-3 h-3" />
                  <span>Apply</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {resp && resp.suggestions.length === 0 && !resp.note && (
        <div className={`p-6 text-center rounded-2xl border text-xs ${
          isDay ? "bg-white border-slate-200 text-slate-500" : "bg-gray-900/40 border-gray-800 text-gray-500"
        }`}>
          No actionable adjustments recommended. Try selecting another optimization goal or execute more simulation runs for stronger empirical signals.
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTrafficStore, type PolicyLogEntry } from "@/store/trafficStore";
import { api } from "@/lib/api";

interface DirTargets {
  base: number;
  target: number;
  delta: number;
}

interface TargetsResponse {
  intersection_id: string;
  policy: string;
  directions: Record<"N" | "E" | "S" | "W", DirTargets>;
}

const DIR_ORDER = ["N", "E", "S", "W"] as const;
const DIR_FULL  = { N: "North", E: "East", S: "South", W: "West" };

interface Props {
  intersectionId: string;
}

export default function PanelPolicy({ intersectionId }: Props) {
  const policyLog = useTrafficStore((s) => s.policyLog[intersectionId] ?? []);
  const [targets, setTargets] = useState<TargetsResponse | null>(null);
  // Adaptive log can grow long. Show the 3 newest by default; the toggle
  // expands to scrollable history.
  const [logExpanded, setLogExpanded] = useState(false);

  useEffect(() => {
    if (!intersectionId) return;
    let cancelled = false;
    const fetchTargets = async () => {
      try {
        const res = (await api.getSignalTargets(intersectionId)) as TargetsResponse;
        if (!cancelled) setTargets(res);
      } catch { /* ignore */ }
    };
    fetchTargets();
    const interval = setInterval(fetchTargets, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [intersectionId]);

  const isAdaptive = targets?.policy === "ActuatedController";

  return (
    <div className="flex flex-col gap-5">
      {/* Policy mode */}
      <div className="bg-[#1f2937] rounded-lg px-3 py-2">
        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-0.5">Policy</div>
        <div className={`text-sm font-semibold ${isAdaptive ? "text-purple-300" : "text-gray-300"}`}>
          {isAdaptive ? "Adaptive (Leftover-Queue)" : "Fixed Time"}
        </div>
      </div>

      {/* Current targets per direction */}
      {targets && (
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">
            Current Signal Targets
          </div>
          <div className="flex flex-col gap-2">
            {DIR_ORDER.map((d) => {
              const row = targets.directions[d];
              const pct = (row.target / 50) * 100;
              return (
                <div key={d}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">{DIR_FULL[d]}</span>
                    <span className="font-mono text-gray-200">{row.target.toFixed(1)}s</span>
                    <span className={`font-mono ${
                      row.delta > 0.05 ? "text-green-400" :
                      row.delta < -0.05 ? "text-red-400" : "text-gray-600"
                    }`}>
                      {row.delta > 0.05 ? "+" : ""}{row.delta.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <div className="flex-1 h-2 bg-[#1f2937] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: row.delta > 0.05 ? "#22c55e" :
                                      row.delta < -0.05 ? "#ef4444" : "#3b82f6",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-gray-600 font-mono w-12 text-right">
                      base {row.base.toFixed(0)}s
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Policy change log */}
      <div>
        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">
          Policy Update Log{policyLog.length > 0 ? ` (${policyLog.length})` : ""}
        </div>
        {policyLog.length === 0 ? (
          <p className="text-[11px] text-gray-600 italic">
            {isAdaptive
              ? "No adjustments recorded yet — waiting for cycle to complete."
              : "Fixed-time policy: no adaptive adjustments."}
          </p>
        ) : (
          <>
            <div
              className={`flex flex-col gap-2 ${
                logExpanded ? "max-h-64 overflow-y-auto" : ""
              }`}
            >
              {[...policyLog].reverse()
                .slice(0, logExpanded ? policyLog.length : 3)
                .map((entry: PolicyLogEntry, i: number) => (
                <div
                  key={i}
                  className="bg-[#1a1332] border border-[#2e1e6b] rounded-md p-2.5 text-[10px]"
                >
                  <div className="text-gray-500 mb-1 font-mono">
                    t={entry.simTime.toFixed(0)}s
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {DIR_ORDER.map((d) => {
                      const { delta } = entry.directions[d];
                      if (Math.abs(delta) < 0.05) return null;
                      return (
                        <span
                          key={d}
                          className={delta > 0 ? "text-green-400" : "text-red-400"}
                        >
                          {d} {delta > 0 ? "+" : ""}{delta.toFixed(1)}s
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {policyLog.length > 3 && (
              <button
                type="button"
                onClick={() => setLogExpanded((v) => !v)}
                className="mt-2 text-[10px] text-blue-400 hover:text-blue-300"
              >
                {logExpanded
                  ? "Show less"
                  : `Show all (${policyLog.length}) →`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

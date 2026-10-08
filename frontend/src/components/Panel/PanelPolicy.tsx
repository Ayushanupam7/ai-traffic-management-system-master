import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTrafficStore, type PolicyLogEntry } from "@/store/trafficStore";
import { api } from "@/lib/api";
import { ExternalLink } from "lucide-react";

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
  const router = useRouter();
  const policyLog = useTrafficStore((s) => s.policyLog[intersectionId] ?? []);
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";
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
      <div className={`rounded-xl px-3.5 py-2.5 border transition-all ${
        isDay ? "bg-slate-50 border-slate-200/80 shadow-xs" : "bg-[#1f2937] border-gray-800"
      }`}>
        <div className={`text-[9px] uppercase tracking-widest mb-0.5 font-bold ${
          isDay ? "text-slate-500" : "text-gray-400"
        }`}>Policy Control</div>
        <div className="flex items-center justify-between">
          <div className={`text-sm font-semibold ${
            isAdaptive ? (isDay ? "text-purple-700" : "text-purple-300") : (isDay ? "text-slate-800" : "text-gray-300")
          }`}>
            {isAdaptive ? "Adaptive (Leftover-Queue)" : "Fixed Time"}
          </div>
          <button
            onClick={() => router.push("/policy")}
            className="flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:text-purple-700 transition-colors"
            title="Redirect to Policy Studio to configure weights & minimums"
          >
            <span>Edit in Studio</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Current targets per direction */}
      {targets && (
        <div>
          <div className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${
            isDay ? "text-slate-500" : "text-gray-400"
          }`}>
            Current Signal Targets
          </div>
          <div className="flex flex-col gap-2">
            {DIR_ORDER.map((d) => {
              const row = targets.directions[d];
              const pct = (row.target / 50) * 100;
              return (
                <div key={d}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className={isDay ? "text-slate-600 font-medium" : "text-gray-400"}>{DIR_FULL[d]}</span>
                    <span className={`font-mono font-bold ${isDay ? "text-slate-800" : "text-gray-200"}`}>{row.target.toFixed(1)}s</span>
                    <span className={`font-mono font-bold ${
                      row.delta > 0.05 ? (isDay ? "text-emerald-600" : "text-green-400") :
                      row.delta < -0.05 ? (isDay ? "text-red-600" : "text-red-400") : (isDay ? "text-slate-400" : "text-gray-500")
                    }`}>
                      {row.delta > 0.05 ? "+" : ""}{row.delta.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                      isDay ? "bg-slate-200" : "bg-[#1f2937]"
                    }`}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          background: row.delta > 0.05 ? "#22c55e" :
                                      row.delta < -0.05 ? "#ef4444" : "#3b82f6",
                        }}
                      />
                    </div>
                    <span className={`text-[9px] font-mono w-12 text-right ${
                      isDay ? "text-slate-500 font-medium" : "text-gray-500"
                    }`}>
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
        <div className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${
          isDay ? "text-slate-500" : "text-gray-400"
        }`}>
          Policy Update Log{policyLog.length > 0 ? ` (${policyLog.length})` : ""}
        </div>
        {policyLog.length === 0 ? (
          <p className={`text-[11px] italic ${isDay ? "text-slate-400" : "text-gray-500"}`}>
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
                  className={`rounded-xl p-2.5 text-[10px] border transition-all ${
                    isDay
                      ? "bg-purple-50/60 border-purple-200 text-purple-900 shadow-xs"
                      : "bg-[#1a1332] border-[#2e1e6b]"
                  }`}
                >
                  <div className={`mb-1 font-mono text-[9px] ${
                    isDay ? "text-slate-500 font-medium" : "text-gray-500"
                  }`}>
                    t={entry.simTime.toFixed(0)}s
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {DIR_ORDER.map((d) => {
                      const { delta } = entry.directions[d];
                      if (Math.abs(delta) < 0.05) return null;
                      return (
                        <span
                          key={d}
                          className={`font-mono font-bold ${
                            delta > 0
                              ? (isDay ? "text-emerald-700" : "text-green-400")
                              : (isDay ? "text-red-700" : "text-red-400")
                          }`}
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
                className={`mt-2 text-[10px] font-semibold ${
                  isDay ? "text-blue-600 hover:text-blue-700" : "text-blue-400 hover:text-blue-300"
                }`}
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

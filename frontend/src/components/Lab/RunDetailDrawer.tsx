"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTrafficStore } from "@/store/trafficStore";
import { X } from "lucide-react";
import RunDetail, {
  type GlobalMetricRow,
  type IntersectionMetricRow,
  type RunRow,
} from "@/components/Lab/RunDetail";

interface Props {
  runId: string;
  onClose: () => void;
}

// Right-side slide-in drawer that loads a single run's metrics and renders
// the existing RunDetail recharts views inside. Used by the Lab's results
// table — clicking a row opens this drawer for the corresponding run.
export default function RunDetailDrawer({ runId, onClose }: Props) {
  const [run, setRun] = useState<RunRow | null>(null);
  const [globalMetrics, setGlobalMetrics] = useState<GlobalMetricRow[]>([]);
  const [interMetrics, setInterMetrics] = useState<IntersectionMetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch metrics whenever the runId changes.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [r, g, i] = await Promise.all([
          api.getRun(runId),
          api.getRunMetrics(runId),
          api.getRunIntersectionMetrics(runId),
        ]);
        if (cancelled) return;
        setRun(r as RunRow);
        setGlobalMetrics(g as GlobalMetricRow[]);
        setInterMetrics(i as IntersectionMetricRow[]);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <>
      {/* Backdrop — click anywhere to dismiss */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        className={`fixed inset-y-0 right-0 w-[720px] max-w-[95vw] z-50
                   shadow-2xl flex flex-col transition-colors border-l ${
                     isDay
                       ? "bg-white border-slate-200 text-slate-800"
                       : "bg-[#0d1117] border-gray-800 text-gray-100"
                   }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`flex-shrink-0 flex items-center justify-between px-6 py-4 border-b ${
          isDay ? "border-slate-200 bg-slate-50/80" : "border-gray-800 bg-gray-900/50"
        }`}>
          <div>
            <div className={`text-[10px] font-semibold uppercase tracking-wider ${
              isDay ? "text-slate-400" : "text-gray-500"
            }`}>
              Run Analytics & Trace
            </div>
            <div className={`text-base font-mono font-medium mt-0.5 ${
              isDay ? "text-blue-600" : "text-blue-400"
            }`}>
              {runId.slice(0, 8)}…
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDay
                ? "text-slate-400 hover:text-slate-700 hover:bg-slate-200"
                : "text-gray-500 hover:text-gray-200 hover:bg-gray-800"
            }`}
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className={`text-xs ${isDay ? "text-slate-500" : "text-gray-400"}`}>
                Loading telemetry and cycle metrics…
              </span>
            </div>
          )}
          {error && (
            <div className={`p-4 rounded-xl border text-xs ${
              isDay
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-rose-950/30 border-rose-900/50 text-rose-400"
            }`}>
              {error.includes("404") || error.includes("not found")
                ? `No metrics found for run ${runId.slice(0, 8)}.`
                : `Couldn't load run: ${error}`}
            </div>
          )}
          {!loading && !error && run && (
            <RunDetail
              run={run}
              globalMetrics={globalMetrics}
              interMetrics={interMetrics}
            />
          )}
        </div>
      </aside>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside
        className="fixed inset-y-0 right-0 w-[720px] max-w-[95vw] z-50
                   bg-[#0d1117] border-l border-gray-800 shadow-2xl
                   flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-shrink-0 flex items-center justify-between
                           px-5 py-3 border-b border-gray-800">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500">
              Run detail
            </div>
            <div className="text-sm font-mono text-blue-400 mt-0.5">
              {runId.slice(0, 8)}…
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xl leading-none px-2"
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <p className="text-xs text-gray-500">Loading run metrics…</p>
          )}
          {error && (
            <p className="text-xs text-red-400">
              {error.includes("404") || error.includes("not found")
                ? `No metrics found for run ${runId.slice(0, 8)}.`
                : `Couldn't load run: ${error}`}
            </p>
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

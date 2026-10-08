"use client";

import { useEffect, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import { Activity, Clock, Timer, Gauge, Calendar } from "lucide-react";
import type { PolicyVariant, VariantRun } from "@/lib/types";

interface Props {
  variant: PolicyVariant | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export default function VariantPerformance({ variant }: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  const [runs, setRuns] = useState<VariantRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!variant) {
      setRuns([]);
      return;
    }
    setLoading(true);
    let cancelled = false;
    api
      .getVariantRuns(variant.name)
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows as VariantRun[]);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load runs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [variant]);

  if (!variant) {
    return (
      <div className={`p-8 text-center rounded-2xl border text-xs ${
        isDay ? "bg-white border-slate-200 text-slate-500 shadow-xs" : "bg-gray-900/40 border-gray-800 text-gray-500"
      }`}>
        Select a saved variant from the left rail to view historical empirical performance metrics.
      </div>
    );
  }

  const clearance     = runs.map((r) => r.clearance_s).filter((x): x is number => x != null);
  const tripTime      = runs.map((r) => r.avg_trip_time_s).filter((x): x is number => x != null);
  const controlDelay  = runs.map((r) => r.avg_control_delay_s).filter((x): x is number => x != null);
  const throughput    = runs.map((r) => r.throughput_veh_per_min).filter((x): x is number => x != null);

  return (
    <div className="space-y-6">
      <div className={`p-5 rounded-2xl border ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className={`text-xs font-bold uppercase tracking-wider ${isDay ? "text-slate-500" : "text-gray-400"}`}>
          Empirical Benchmark Record
        </div>
        <div className={`text-xl font-mono font-bold mt-1 ${isDay ? "text-slate-900" : "text-white"}`}>
          {variant.name}
        </div>
      </div>

      {loading && <p className={`text-xs ${isDay ? "text-slate-500" : "text-gray-500"}`}>Loading run metrics…</p>}
      {error && <p className="text-xs text-rose-500">{error}</p>}

      {!loading && runs.length === 0 && (
        <div className={`p-8 text-center rounded-2xl border text-xs ${
          isDay ? "bg-white border-slate-200 text-slate-500 shadow-xs" : "bg-gray-900/40 border-gray-800 text-gray-500"
        }`}>
          No completed simulation runs recorded for this variant yet. Run a simulation or comparison experiment using this variant to populate benchmarks.
        </div>
      )}

      {runs.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <Kpi label="Total Runs" value={String(runs.length)} unit="" icon={Activity} isDay={isDay} />
            <Kpi label="Median Clearance" value={fmt(median(clearance))} unit="s" icon={Timer} isDay={isDay} />
            <Kpi label="Median Trip Time" value={fmt(median(tripTime))} unit="s" icon={Clock} isDay={isDay} />
            <Kpi label="Median Delay" value={fmt(median(controlDelay))} unit="s" icon={Gauge} isDay={isDay} />
          </div>

          <div className={`p-5 rounded-2xl border overflow-hidden ${
            isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
          }`}>
            <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              Recent Execution Runs
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider ${
                    isDay ? "border-slate-200 text-slate-500" : "border-gray-800 text-gray-400"
                  }`}>
                    <th className="text-left pb-2 font-bold">Executed</th>
                    <th className="text-left pb-2 font-bold">Profile</th>
                    <th className="text-right pb-2 font-bold">Vehicles</th>
                    <th className="text-right pb-2 font-bold">Clearance</th>
                    <th className="text-right pb-2 font-bold">Trip Time</th>
                    <th className="text-right pb-2 font-bold">Ctrl Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 10).map((r) => (
                    <tr key={r.run_id} className={`border-t transition-colors ${
                      isDay ? "border-slate-100 hover:bg-slate-50/80" : "border-gray-800/80 hover:bg-gray-850"
                    }`}>
                      <td className={`py-2 font-mono text-[11px] ${isDay ? "text-slate-600" : "text-gray-400"}`}>
                        {r.started_at?.slice(0, 16).replace("T", " ") ?? "—"}
                      </td>
                      <td className={`py-2 font-medium ${isDay ? "text-slate-700" : "text-gray-300"}`}>
                        {r.demand_profile ?? "—"}
                      </td>
                      <td className={`py-2 text-right font-mono font-bold ${isDay ? "text-slate-900" : "text-gray-100"}`}>
                        {r.total_vehicles ?? "—"}
                      </td>
                      <td className={`py-2 text-right font-mono ${isDay ? "text-slate-700" : "text-gray-300"}`}>
                        {fmt(r.clearance_s)}s
                      </td>
                      <td className={`py-2 text-right font-mono ${isDay ? "text-slate-700" : "text-gray-300"}`}>
                        {fmt(r.avg_trip_time_s)}s
                      </td>
                      <td className={`py-2 text-right font-mono ${isDay ? "text-slate-700" : "text-gray-300"}`}>
                        {fmt(r.avg_control_delay_s)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`text-[10.5px] mt-3 pt-2 border-t ${
              isDay ? "border-slate-100 text-slate-500" : "border-gray-800 text-gray-400"
            }`}>
              Overall Throughput Median: <strong>{fmt(median(throughput))} veh/min</strong> · Displaying 10 of {runs.length} runs
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, unit, icon: Icon, isDay,
}: { label: string; value: string; unit: string; icon: typeof Activity; isDay: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      isDay ? "bg-white border-slate-200/90 shadow-xs" : "bg-[#0c1017]/90 border-gray-800 shadow-md"
    }`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] uppercase font-bold tracking-wider ${
          isDay ? "text-slate-500" : "text-gray-400"
        }`}>{label}</span>
        <Icon className={`w-3.5 h-3.5 ${isDay ? "text-blue-600" : "text-blue-400"}`} />
      </div>
      <div className={`text-xl font-mono font-black mt-1.5 ${isDay ? "text-slate-900" : "text-white"}`}>
        {value}
        {unit && <span className={`text-xs ml-1 font-normal ${isDay ? "text-slate-500" : "text-gray-400"}`}>{unit}</span>}
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

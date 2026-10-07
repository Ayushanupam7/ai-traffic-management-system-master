"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
      <div className="text-xs text-gray-500">
        Select a saved variant from the left to see its historical performance.
      </div>
    );
  }

  const clearance     = runs.map((r) => r.clearance_s).filter((x): x is number => x != null);
  const tripTime      = runs.map((r) => r.avg_trip_time_s).filter((x): x is number => x != null);
  const controlDelay  = runs.map((r) => r.avg_control_delay_s).filter((x): x is number => x != null);
  const throughput    = runs.map((r) => r.throughput_veh_per_min).filter((x): x is number => x != null);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-gray-500">Performance · </div>
        <div className="text-xl font-mono text-gray-200">{variant.name}</div>
      </div>

      {loading && <p className="text-xs text-gray-500">Loading…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && runs.length === 0 && (
        <p className="text-xs text-gray-500">
          No completed runs used these parameters yet. Run a sim or comparison with
          this variant active and check back.
        </p>
      )}

      {runs.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Runs" value={String(runs.length)} unit="" />
            <Kpi label="Med. clearance" value={fmt(median(clearance))} unit="s" />
            <Kpi label="Med. trip time" value={fmt(median(tripTime))} unit="s" />
            <Kpi label="Med. control delay" value={fmt(median(controlDelay))} unit="s" />
          </div>

          <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">
              Recent runs
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="text-left pb-1 font-normal">When</th>
                  <th className="text-left pb-1 font-normal">Profile</th>
                  <th className="text-right pb-1 font-normal">Cars</th>
                  <th className="text-right pb-1 font-normal">Clearance</th>
                  <th className="text-right pb-1 font-normal">Trip time</th>
                  <th className="text-right pb-1 font-normal">Ctrl delay</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 10).map((r) => (
                  <tr key={r.run_id} className="border-t border-gray-800">
                    <td className="py-1 text-gray-400">
                      {r.started_at?.slice(0, 16).replace("T", " ") ?? "—"}
                    </td>
                    <td className="py-1 text-gray-400">{r.demand_profile ?? "—"}</td>
                    <td className="py-1 text-right font-mono text-gray-300">
                      {r.total_vehicles ?? "—"}
                    </td>
                    <td className="py-1 text-right font-mono text-gray-300">
                      {fmt(r.clearance_s)}s
                    </td>
                    <td className="py-1 text-right font-mono text-gray-300">
                      {fmt(r.avg_trip_time_s)}s
                    </td>
                    <td className="py-1 text-right font-mono text-gray-300">
                      {fmt(r.avg_control_delay_s)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-600 mt-2">
              Throughput median: {fmt(median(throughput))} veh/min ·
              Showing 10 of {runs.length}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-xl font-mono text-gray-200 mt-1">
        {value}
        {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

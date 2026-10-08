"use client";

import { useEffect, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import {
  ARTERIAL_PARAM_FIELDS,
  DEFAULT_ALINEA_PARAMS,
  DEFAULT_POLICY_PARAMS,
  HIGHWAY_PARAM_FIELDS,
  type PolicyFamily,
  type PolicyVariant,
  type VariantRun,
} from "@/lib/types";

interface Props {
  variants: PolicyVariant[];
  family: PolicyFamily;
}

function schemaFor(family: PolicyFamily) {
  return family === "highway"
    ? { fields: HIGHWAY_PARAM_FIELDS, defaults: DEFAULT_ALINEA_PARAMS as unknown as Record<string, number> }
    : { fields: ARTERIAL_PARAM_FIELDS, defaults: DEFAULT_POLICY_PARAMS as unknown as Record<string, number> };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

interface ColData {
  variant: PolicyVariant;
  runs: VariantRun[];
}

export default function VariantCompare({ variants, family }: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  const [picked, setPicked] = useState<string[]>([]);
  const [cols, setCols] = useState<ColData[]>([]);
  const [loading, setLoading] = useState(false);
  const { fields, defaults } = schemaFor(family);

  useEffect(() => {
    setPicked([]);
  }, [family]);

  const togglePick = (name: string) => {
    setPicked((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : prev.length >= 3
        ? prev
        : [...prev, name],
    );
  };

  useEffect(() => {
    if (picked.length === 0) {
      setCols([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      picked.map(async (name) => {
        const v = variants.find((x) => x.name === name);
        if (!v) return null;
        try {
          const runs = (await api.getVariantRuns(name)) as VariantRun[];
          return { variant: v, runs };
        } catch {
          return { variant: v, runs: [] };
        }
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        setCols(rows.filter((r): r is ColData => r !== null));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [picked, variants]);

  return (
    <div className="space-y-6">
      <div className={`p-5 rounded-2xl border ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <h2 className={`text-base font-bold mb-1 ${isDay ? "text-slate-900" : "text-white"}`}>
          Comparative Parameter & KPI Evaluation
        </h2>
        <p className={`text-xs ${isDay ? "text-slate-500" : "text-gray-400"}`}>
          Select up to 3 variants to analyze algorithmic coefficients side-by-side alongside historical simulation performance.
        </p>

        {/* Picker Chips */}
        <div className="flex flex-wrap gap-2 mt-4">
          {variants.length === 0 && (
            <p className={`text-xs ${isDay ? "text-slate-500" : "text-gray-500"}`}>Save at least 2 custom variants to enable comparisons.</p>
          )}
          {variants.map((v) => {
            const active = picked.includes(v.name);
            const disabled = !active && picked.length >= 3;
            return (
              <button
                key={v.name}
                type="button"
                onClick={() => togglePick(v.name)}
                disabled={disabled}
                className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl border transition-all ${
                  active
                    ? isDay
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "bg-blue-600 border-blue-500 text-white shadow-sm"
                    : disabled
                    ? isDay
                      ? "bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed"
                      : "bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed"
                    : isDay
                    ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                    : "bg-gray-900 hover:bg-gray-800 border-gray-750 text-gray-300"
                }`}
              >
                {active ? "✓ " : "+ "}{v.name}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p className={`text-xs ${isDay ? "text-slate-500" : "text-gray-500"}`}>Loading comparisons…</p>}

      {cols.length > 0 && (
        <>
          {/* Parameter diff table */}
          <div className={`p-5 rounded-2xl border overflow-hidden ${
            isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
          }`}>
            <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              Parameter Values & Divergence
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider ${
                    isDay ? "border-slate-200 text-slate-500" : "border-gray-800 text-gray-400"
                  }`}>
                    <th className="text-left pb-2 font-bold">Coefficient Field</th>
                    <th className="text-right pb-2 font-bold">Base Default</th>
                    {cols.map((c) => (
                      <th key={c.variant.name} className="text-right pb-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {c.variant.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const def = defaults[f.key];
                    const values = cols.map(
                      (c) => (c.variant.params as Record<string, number>)[f.key],
                    );
                    const allSame = values.every((v) => v === values[0]);
                    return (
                      <tr key={f.key} className={`border-t transition-colors ${
                        isDay ? "border-slate-100 hover:bg-slate-50/80" : "border-gray-800/80 hover:bg-gray-850"
                      }`}>
                        <td className={`py-2 font-mono font-semibold ${isDay ? "text-slate-800" : "text-gray-200"}`}>{f.label}</td>
                        <td className={`py-2 text-right font-mono ${isDay ? "text-slate-400" : "text-gray-500"}`}>{def}</td>
                        {values.map((v, i) => (
                          <td
                            key={i}
                            className={`py-2 text-right font-mono font-bold ${
                              allSame
                                ? isDay ? "text-slate-600" : "text-gray-400"
                                : v === def
                                ? isDay ? "text-slate-600" : "text-gray-400"
                                : "text-amber-600 dark:text-amber-400 font-black"
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* KPI rows */}
          <div className={`p-5 rounded-2xl border overflow-hidden ${
            isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
          }`}>
            <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              Median Performance Benchmarks
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider ${
                    isDay ? "border-slate-200 text-slate-500" : "border-gray-800 text-gray-400"
                  }`}>
                    <th className="text-left pb-2 font-bold">Metric Dimension</th>
                    {cols.map((c) => (
                      <th key={c.variant.name} className="text-right pb-2 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {c.variant.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <KpiRow label="Runs Completed"      cols={cols} pick={(r) => r.length} fmt={(x) => (x == null ? "—" : x.toFixed(0))} isDay={isDay} />
                  <KpiRow label="Clearance Time (s)"  cols={cols} pick={(r) => median(numList(r, "clearance_s"))} fmt={fmt} isDay={isDay} />
                  <KpiRow label="Mean Trip Time (s)"  cols={cols} pick={(r) => median(numList(r, "avg_trip_time_s"))} fmt={fmt} isDay={isDay} />
                  <KpiRow label="Control Delay (s)"   cols={cols} pick={(r) => median(numList(r, "avg_control_delay_s"))} fmt={fmt} isDay={isDay} />
                  <KpiRow label="Throughput (veh/min)" cols={cols} pick={(r) => median(numList(r, "throughput_veh_per_min"))} fmt={fmt} isDay={isDay} />
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function numList(runs: VariantRun[], key: keyof VariantRun): number[] {
  return runs
    .map((r) => r[key])
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
}

function KpiRow({
  label, cols, pick, fmt, isDay,
}: {
  label: string;
  cols: ColData[];
  pick: (runs: VariantRun[]) => number | null;
  fmt: (n: number | null) => string;
  isDay: boolean;
}) {
  return (
    <tr className={`border-t transition-colors ${
      isDay ? "border-slate-100 hover:bg-slate-50/80" : "border-gray-800/80 hover:bg-gray-850"
    }`}>
      <td className={`py-2 font-medium ${isDay ? "text-slate-800" : "text-gray-200"}`}>{label}</td>
      {cols.map((c) => (
        <td key={c.variant.name} className={`py-2 text-right font-mono font-bold ${isDay ? "text-slate-900" : "text-white"}`}>
          {fmt(pick(c.runs))}
        </td>
      ))}
    </tr>
  );
}

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(1);
}

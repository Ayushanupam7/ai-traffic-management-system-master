"use client";

import { useEffect, useState } from "react";
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

// Schema picker: choose the right defaults and field list for the active
// family so we render the right header + diff highlights.
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
  const [picked, setPicked] = useState<string[]>([]);
  const [cols, setCols] = useState<ColData[]>([]);
  const [loading, setLoading] = useState(false);
  const { fields, defaults } = schemaFor(family);

  // When the family changes, drop any previously-picked variants from
  // the other family so the table doesn't show foreign params.
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

  // When the picked list changes, fetch each variant's runs.
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
        const runs = (await api.getVariantRuns(name).catch(() => [])) as VariantRun[];
        return { variant: v, runs } as ColData;
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
      <div>
        <h2 className="text-sm font-semibold text-gray-200 mb-1">Compare variants</h2>
        <p className="text-[11px] text-gray-500">Pick up to 3 variants to see their params side by side and aggregated metrics from past runs.</p>
      </div>

      {/* Picker */}
      <div className="flex flex-wrap gap-1.5">
        {variants.length === 0 && (
          <p className="text-xs text-gray-500">Save at least 2 variants to compare them.</p>
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
              className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                active
                  ? "bg-blue-700 border-blue-500 text-white"
                  : disabled
                  ? "bg-gray-900 border-gray-800 text-gray-700 cursor-not-allowed"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {v.name}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-xs text-gray-500">Loading…</p>}

      {cols.length > 0 && (
        <>
          {/* Parameter diff table */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">Parameters</div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="text-left pb-1 font-normal">Field</th>
                  <th className="text-right pb-1 font-normal text-gray-600">Default</th>
                  {cols.map((c) => (
                    <th key={c.variant.name} className="text-right pb-1 font-normal text-blue-400 font-mono">
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
                    <tr key={f.key} className="border-t border-gray-800">
                      <td className="py-1 text-gray-300 font-mono">{f.key}</td>
                      <td className="py-1 text-right text-gray-600 font-mono">{def}</td>
                      {values.map((v, i) => (
                        <td
                          key={i}
                          className={`py-1 text-right font-mono ${
                            allSame
                              ? "text-gray-400"
                              : v === def
                              ? "text-gray-400"
                              : "text-yellow-300"
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

          {/* KPI rows */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-3">
            <div className="text-xs font-semibold text-gray-300 mb-2">
              Median metrics across past runs
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="text-left pb-1 font-normal">Metric</th>
                  {cols.map((c) => (
                    <th key={c.variant.name} className="text-right pb-1 font-normal text-blue-400 font-mono">
                      {c.variant.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <KpiRow label="Runs"             cols={cols} pick={(r) => r.length} fmt={(x) => (x == null ? "—" : x.toFixed(0))} />
                <KpiRow label="Clearance (s)"    cols={cols} pick={(r) => median(numList(r, "clearance_s"))} fmt={fmt} />
                <KpiRow label="Trip time (s)"    cols={cols} pick={(r) => median(numList(r, "avg_trip_time_s"))} fmt={fmt} />
                <KpiRow label="Ctrl delay (s)"   cols={cols} pick={(r) => median(numList(r, "avg_control_delay_s"))} fmt={fmt} />
                <KpiRow label="Throughput (v/m)" cols={cols} pick={(r) => median(numList(r, "throughput_veh_per_min"))} fmt={fmt} />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function numList(runs: VariantRun[], key: keyof VariantRun): number[] {
  return runs
    .map((r) => r[key])
    .filter((x): x is number => typeof x === "number");
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toFixed(1);
}

function KpiRow({
  label,
  cols,
  pick,
  fmt,
}: {
  label: string;
  cols: ColData[];
  pick: (runs: VariantRun[]) => number | null;
  fmt: (n: number | null) => string;
}) {
  return (
    <tr className="border-t border-gray-800">
      <td className="py-1 text-gray-300">{label}</td>
      {cols.map((c) => (
        <td key={c.variant.name} className="py-1 text-right font-mono text-gray-300">
          {fmt(pick(c.runs))}
        </td>
      ))}
    </tr>
  );
}

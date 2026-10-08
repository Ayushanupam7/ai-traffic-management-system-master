"use client";

import type { ParamFieldDef } from "@/lib/types";
import { useTrafficStore } from "@/store/trafficStore";

interface Props {
  fields: ParamFieldDef[];
  params: Record<string, number>;
  onChange: (key: string, value: number) => void;
}

export default function SchemaParamPanel({ fields, params, onChange }: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col" title={f.hint}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10.5px] uppercase font-bold tracking-wider ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              {f.label}
            </span>
            {f.unit && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                isDay ? "bg-slate-100 border-slate-200 text-slate-500" : "bg-gray-800 border-gray-700 text-gray-400"
              }`}>
                {f.unit}
              </span>
            )}
          </div>
          <input
            type="number"
            min={f.min}
            max={f.max}
            step={f.step}
            value={params[f.key] ?? 0}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!Number.isNaN(n)) onChange(f.key, n);
            }}
            className={`w-full rounded-xl px-3 py-2 text-xs font-mono border transition-all outline-none ${
              isDay
                ? "bg-slate-50 hover:bg-white focus:bg-white border-slate-300 focus:border-blue-600 text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-500/20"
                : "bg-gray-900 hover:bg-gray-850 focus:bg-gray-950 border-gray-700 focus:border-blue-500 text-gray-100 focus:ring-2 focus:ring-blue-500/20"
            }`}
          />
          {f.hint && (
            <span className={`text-[10px] mt-1 font-medium ${
              isDay ? "text-slate-500" : "text-gray-400"
            }`}>
              {f.hint}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

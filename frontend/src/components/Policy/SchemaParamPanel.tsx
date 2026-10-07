"use client";

import type { ParamFieldDef } from "@/lib/types";

interface Props {
  fields: ParamFieldDef[];
  // params is a loose record so this panel can render either the
  // arterial Actuated schema or the highway ALINEA schema.
  params: Record<string, number>;
  onChange: (key: string, value: number) => void;
}

// Generic numeric-form editor driven by a ParamFieldDef[] schema. The same
// component renders both the arterial and highway param families — the only
// thing that changes is the schema passed in.
export default function SchemaParamPanel({ fields, params, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => (
        <label key={f.key} className="flex flex-col" title={f.hint}>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">
            {f.label}
            {f.unit ? <span className="ml-1 text-gray-600">({f.unit})</span> : null}
          </span>
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
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono mt-1"
          />
          {f.hint && (
            <span className="text-[10px] text-gray-600 mt-0.5">{f.hint}</span>
          )}
        </label>
      ))}
    </div>
  );
}

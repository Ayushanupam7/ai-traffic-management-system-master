"use client";

import {
  DEFAULT_POLICY_PARAMS,
  type ActuatedPolicyParams,
} from "@/lib/types";

interface Props {
  value: ActuatedPolicyParams | null;
  onChange: (params: ActuatedPolicyParams) => void;
}

interface FieldDef {
  key: keyof ActuatedPolicyParams;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

const BASE_FIELDS: FieldDef[] = [
  { key: "base_green_n", label: "Base green · N",  min: 5,  max: 60,  step: 1, hint: "Default N green (s)" },
  { key: "base_green_s", label: "Base green · S",  min: 5,  max: 60,  step: 1, hint: "Default S green (s)" },
  { key: "base_green_e", label: "Base green · E",  min: 5,  max: 60,  step: 1, hint: "Default E green (s)" },
  { key: "base_green_w", label: "Base green · W",  min: 5,  max: 60,  step: 1, hint: "Default W green (s)" },
];

const TUNE_FIELDS: FieldDef[] = [
  { key: "min_green",     label: "Min green",        min: 3,  max: 30,  step: 1,    hint: "Floor for any direction" },
  { key: "max_green",     label: "Max green",        min: 20, max: 120, step: 1,    hint: "Ceiling for any direction" },
  { key: "max_redist_s",  label: "Max redistribute", min: 0,  max: 30,  step: 1,    hint: "Seconds the policy may shuffle per cycle" },
  { key: "smooth_alpha",  label: "Smooth α",         min: 0,  max: 1,   step: 0.05, hint: "EMA weight on the latest cycle" },
];

export default function PolicyTuningPanel({ value, onChange }: Props) {
  const params = value ?? DEFAULT_POLICY_PARAMS;

  const update = (key: keyof ActuatedPolicyParams, n: number) => {
    onChange({ ...params, [key]: n });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          Base greens
        </div>
        <div className="grid grid-cols-2 gap-2">
          {BASE_FIELDS.map((f) => (
            <NumberInput key={f.key} field={f} value={params[f.key]} onChange={update} />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          Adaptive knobs
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TUNE_FIELDS.map((f) => (
            <NumberInput key={f.key} field={f} value={params[f.key]} onChange={update} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NumberInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: number;
  onChange: (key: keyof ActuatedPolicyParams, n: number) => void;
}) {
  return (
    <label className="flex flex-col" title={field.hint}>
      <span className="text-[9px] text-gray-500">{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!Number.isNaN(n)) onChange(field.key, n);
        }}
        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono mt-0.5"
      />
    </label>
  );
}

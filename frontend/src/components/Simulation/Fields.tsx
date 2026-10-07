"use client";

import { POLICY_LABELS } from "@/lib/policies";
import type {
  DemandProfile,
  DominantDirection,
  PolicyType,
} from "@/lib/types";

const LABEL = "text-[10px] text-gray-500 uppercase tracking-wider";
const SELECT =
  "w-full mt-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm";

const DEFAULT_POLICY_OPTIONS: PolicyType[] = ["fixed_time", "actuated"];

export function PolicyField({
  value,
  onChange,
  options = DEFAULT_POLICY_OPTIONS,
  label = "Policy",
  disabled,
}: {
  value: PolicyType;
  onChange: (v: PolicyType) => void;
  options?: PolicyType[];
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PolicyType)}
        disabled={disabled}
        className={SELECT}
      >
        {options.map((pt) => (
          <option key={pt} value={pt}>
            {POLICY_LABELS[pt]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProfileField({
  value,
  onChange,
  disabled,
}: {
  value: DemandProfile;
  onChange: (v: DemandProfile) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={LABEL}>Demand Profile</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DemandProfile)}
        disabled={disabled}
        className={SELECT}
      >
        <option value="balanced">Balanced (50/50)</option>
        <option value="asym">Asymmetric (70/30)</option>
        <option value="extreme">Extreme (88/12)</option>
      </select>
    </label>
  );
}

export function DominantField({
  value,
  onChange,
  disabled,
}: {
  value: DominantDirection;
  onChange: (v: DominantDirection) => void;
  disabled?: boolean;
}) {
  const btn = (dir: DominantDirection, label: string) => (
    <button
      type="button"
      onClick={() => onChange(dir)}
      disabled={disabled}
      className={`flex-1 rounded px-2 py-1 text-xs border transition ${
        value === dir
          ? "bg-blue-700 border-blue-500 text-white"
          : "bg-gray-900 border-gray-700 text-gray-400"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <span className={LABEL}>Dominant Direction</span>
      <div className="flex gap-2 mt-1">
        {btn("EW", "E ↔ W")}
        {btn("NS", "N ↕ S")}
      </div>
    </div>
  );
}

export function CarsField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className={LABEL}>Total Vehicles</span>
        <span className="text-xs font-mono text-gray-300">{value}</span>
      </div>
      <input
        type="range"
        min={1500}
        max={9000}
        step={500}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full mt-1"
      />
    </label>
  );
}

export function CarlaCarsField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className={LABEL}>CARLA Vehicles</span>
        <span className="text-xs font-mono text-gray-300">{value}</span>
      </div>
      <input
        type="range"
        min={30}
        max={200}
        step={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full mt-1"
      />
      <span className="text-[10px] text-gray-500">
        TrafficManager autopilot — keep ≤120 on a 1660 Ti.
      </span>
    </label>
  );
}

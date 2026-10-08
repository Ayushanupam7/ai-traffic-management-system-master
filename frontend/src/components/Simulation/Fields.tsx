"use client";

import { POLICY_LABELS } from "@/lib/policies";
import type {
  DemandProfile,
  DominantDirection,
  PolicyType,
} from "@/lib/types";

const LABEL = "text-[10px] text-slate-500 dark:text-gray-400 font-bold uppercase tracking-wider";
const SELECT =
  "w-full mt-1 bg-slate-50 dark:bg-[#131b2a] border border-slate-300 dark:border-gray-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-gray-100 outline-none focus:border-blue-500 transition-colors font-medium";

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
      className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition-all ${
        value === dir
          ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
          : "bg-slate-100 dark:bg-[#131b2a] border-slate-200 dark:border-gray-700/80 text-slate-700 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-800"
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
        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800/40">
          {value.toLocaleString()}
        </span>
      </div>
      <input
        type="range"
        min={1500}
        max={9000}
        step={500}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full mt-1.5 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-gray-700 rounded-lg"
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
        <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800/40">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={30}
        max={200}
        step={10}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full mt-1.5 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-gray-700 rounded-lg"
      />
      <span className="text-[10px] text-slate-500 dark:text-gray-400 mt-1 block">
        TrafficManager autopilot — keep ≤120 on a 1660 Ti.
      </span>
    </label>
  );
}


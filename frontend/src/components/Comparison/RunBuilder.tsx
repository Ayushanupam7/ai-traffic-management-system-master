"use client";

import {
  CarsField,
  DominantField,
  PolicyField,
  ProfileField,
} from "@/components/Simulation/Fields";
import { useEffect, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import { COMBINED_RAMP_OPTIONS, policiesForNetwork } from "@/lib/policies";
import { Play, Plus, Trash2, SlidersHorizontal, Hash, Network as NetworkIcon, Flag, Clock } from "lucide-react";
import type {
  ActuatedPolicyParams,
  AlineaPolicyParams,
  DemandProfile,
  DominantDirection,
  NetworkType,
  PolicyType,
  PolicyVariant,
} from "@/lib/types";

export type BuilderMode = "race" | "time";

export interface BuilderRow {
  id: string;
  policy: PolicyType;
  ramp_policy?: PolicyType;
  profile: DemandProfile;
  dominant: DominantDirection;
  cars: number;
  mode: BuilderMode;
  duration_s: number;
  variant_name?: string;
  policy_params?: ActuatedPolicyParams;
  alinea_params?: AlineaPolicyParams;
}

export const DEFAULT_ROW = (id: string): BuilderRow => ({
  id,
  policy: "actuated",
  ramp_policy: "ramp_alinea",
  profile: "balanced",
  dominant: "EW",
  cars: 5500,
  mode: "race",
  duration_s: 1200,
});

const NETWORK_LABELS: Record<NetworkType, string> = {
  arterial: "Arterial (3×2 Grid)",
  highway_metered: "Highway Corridor",
  combined: "Combined Integrated",
};
const NETWORK_ORDER: NetworkType[] = ["arterial", "highway_metered", "combined"];

interface Props {
  rows: BuilderRow[];
  seed: number;
  network: NetworkType;
  onSeedChange: (v: number) => void;
  onNetworkChange: (n: NetworkType) => void;
  onRowChange: (id: string, patch: Partial<BuilderRow>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onStart: () => void;
  starting: boolean;
  error: string | null;
}

export default function RunBuilder({
  rows,
  seed,
  network,
  onSeedChange,
  onNetworkChange,
  onRowChange,
  onAdd,
  onRemove,
  onStart,
  starting,
  error,
}: Props) {
  const [variants, setVariants] = useState<PolicyVariant[]>([]);
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  useEffect(() => {
    api
      .listPolicyVariants()
      .then((list) => setVariants(list as PolicyVariant[]))
      .catch(() => setVariants([]));
  }, []);

  const handlePolicyChange = (rowId: string, v: PolicyType) =>
    onRowChange(rowId, {
      policy: v,
      variant_name: undefined,
      policy_params: undefined,
      alinea_params: undefined,
    });

  const handleVariantPick = (
    rowId: string,
    name: string,
    family: "arterial" | "highway",
  ) => {
    if (!name) {
      onRowChange(rowId, {
        variant_name: undefined,
        policy_params: undefined,
        alinea_params: undefined,
      });
      return;
    }
    const v = variants.find((x) => x.name === name);
    if (!v) return;
    if (family === "highway") {
      onRowChange(rowId, {
        variant_name: v.name,
        alinea_params: v.params as AlineaPolicyParams,
        policy_params: undefined,
      });
    } else {
      onRowChange(rowId, {
        variant_name: v.name,
        policy_params: v.params as ActuatedPolicyParams,
        alinea_params: undefined,
      });
    }
  };

  const isCombined = network === "combined";
  const isArterial = network === "arterial";

  return (
    <div className="space-y-6">
      {/* Top Configuration Bar: Seed & Network Topology */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className={`text-xs uppercase font-bold tracking-wider flex items-center gap-1.5 ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              <SlidersHorizontal className="w-4 h-4 text-blue-500" />
              <span>Experiment Environment Parameters</span>
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
              Common stochastic seed and physical topology applied uniformly to all comparative runs.
            </p>
          </div>

          <label className={`flex items-center gap-2 text-xs font-bold ${
            isDay ? "text-slate-700" : "text-gray-300"
          }`}>
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-blue-500" />
              <span>Random Seed:</span>
            </span>
            <input
              type="number"
              value={seed}
              onChange={(e) => onSeedChange(parseInt(e.target.value || "0", 10))}
              className={`w-24 rounded-xl px-3 py-1.5 text-sm font-mono font-bold border transition-all outline-none ${
                isDay
                  ? "bg-slate-50 border-slate-300 text-slate-900 focus:bg-white focus:border-blue-600 shadow-xs"
                  : "bg-gray-900 border-gray-700 text-gray-100 focus:bg-gray-950 focus:border-blue-500"
              }`}
            />
          </label>
        </div>

        {/* Network Selector Tabs */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-gray-800">
          <span className={`text-[10px] uppercase font-bold tracking-wider mb-2 block ${
            isDay ? "text-slate-500" : "text-gray-400"
          }`}>
            Topology Network Model
          </span>
          <div className="grid grid-cols-3 gap-2">
            {NETWORK_ORDER.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onNetworkChange(n)}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  network === n
                    ? isDay
                      ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "bg-blue-600 border-blue-500 text-white shadow-sm"
                    : isDay
                    ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                    : "bg-gray-900 hover:bg-gray-800 border-gray-750 text-gray-400"
                }`}
              >
                <NetworkIcon className="w-3.5 h-3.5" />
                <span>{NETWORK_LABELS[n]}</span>
              </button>
            ))}
          </div>
          {isCombined && (
            <p className={`text-[11px] mt-2 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
              Dual-controller integrated topology: simulates both the arterial signal network and 4 ALINEA highway ramp meters in sync.
            </p>
          )}
        </div>
      </div>

      {/* Comparison Run Configurations */}
      <div className="space-y-4">
        {rows.map((row, idx) => {
          const variantFamily: "arterial" | "highway" =
            row.policy === "ramp_alinea" || row.policy === "ramp_binary"
              ? "highway"
              : "arterial";
          const showVariantPicker =
            row.policy === "ramp_alinea" || row.policy === "actuated";
          const familyVariants = variants.filter(
            (v) => (v.family ?? "arterial") === variantFamily,
          );
          const selectedVariant = familyVariants.some(
            (v) => v.name === row.variant_name,
          )
            ? row.variant_name
            : "";

          return (
            <div
              key={row.id}
              className={`p-5 rounded-2xl border space-y-4 transition-all ${
                isDay
                  ? "bg-white border-slate-200/90 shadow-sm"
                  : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg border ${
                    isDay
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-blue-950/60 border-blue-800 text-blue-300"
                  }`}>
                    Comparative Run #{idx + 1}
                  </span>
                  <span className={`text-[11px] font-medium ${isDay ? "text-slate-500" : "text-gray-400"}`}>
                    Policy Config Node
                  </span>
                </div>

                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all ${
                      isDay
                        ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                        : "bg-rose-950/40 hover:bg-rose-900/60 border-rose-800 text-rose-300"
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Run</span>
                  </button>
                )}
              </div>

              {/* Policy Menus */}
              {isCombined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PolicyField
                    value={row.policy}
                    onChange={(v) => handlePolicyChange(row.id, v)}
                    options={policiesForNetwork.combined}
                    label="Arterial Grid Policy"
                  />
                  <PolicyField
                    value={row.ramp_policy ?? "ramp_alinea"}
                    onChange={(v) => onRowChange(row.id, { ramp_policy: v })}
                    options={COMBINED_RAMP_OPTIONS}
                    label="Highway Ramp Policy"
                  />
                </div>
              ) : isArterial ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <PolicyField
                    value={row.policy}
                    onChange={(v) => handlePolicyChange(row.id, v)}
                    options={policiesForNetwork.arterial}
                  />
                  <ProfileField
                    value={row.profile}
                    onChange={(v) => onRowChange(row.id, { profile: v })}
                  />
                </div>
              ) : (
                <PolicyField
                  value={row.policy}
                  onChange={(v) => handlePolicyChange(row.id, v)}
                  options={policiesForNetwork.highway_metered}
                />
              )}

              {isArterial && row.profile === "asym" && (
                <DominantField
                  value={row.dominant}
                  onChange={(v) => onRowChange(row.id, { dominant: v })}
                />
              )}

              {/* Policy Variant Selection */}
              {showVariantPicker && familyVariants.length > 0 && (
                <div>
                  <span className={`text-[10px] uppercase font-bold tracking-wider mb-1 block ${
                    isDay ? "text-slate-600" : "text-gray-400"
                  }`}>
                    Custom Saved Variant Tuning ({variantFamily})
                  </span>
                  <select
                    value={selectedVariant}
                    onChange={(e) =>
                      handleVariantPick(row.id, e.target.value, variantFamily)
                    }
                    className={`w-full rounded-xl px-3 py-2 text-xs font-mono font-medium border outline-none transition-all ${
                      isDay
                        ? "bg-slate-50 border-slate-300 text-slate-800 focus:bg-white focus:border-blue-600 shadow-xs"
                        : "bg-gray-900 border-gray-700 text-gray-200 focus:bg-gray-950 focus:border-blue-500"
                    }`}
                  >
                    <option value="">— Standard Algorithm Defaults —</option>
                    {familyVariants.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name} {v.description ? `(${v.description})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <CarsField
                value={row.cars}
                onChange={(v) => onRowChange(row.id, { cars: v })}
              />

              {/* Stop Condition */}
              <div>
                <span className={`text-[10px] uppercase font-bold tracking-wider mb-1.5 block ${
                  isDay ? "text-slate-600" : "text-gray-400"
                }`}>
                  Experiment Termination Condition
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRowChange(row.id, { mode: "race" })}
                    className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      row.mode === "race"
                        ? isDay
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
                          : "bg-blue-600 border-blue-500 text-white shadow-sm"
                        : isDay
                        ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                        : "bg-gray-900 hover:bg-gray-800 border-gray-750 text-gray-400"
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Race Until Network Empty</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRowChange(row.id, { mode: "time" })}
                    className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      row.mode === "time"
                        ? isDay
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20"
                          : "bg-blue-600 border-blue-500 text-white shadow-sm"
                        : isDay
                        ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700"
                        : "bg-gray-900 hover:bg-gray-800 border-gray-750 text-gray-400"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Fixed Duration Time Limit</span>
                  </button>
                </div>

                {row.mode === "time" && (
                  <div className="mt-3 p-3 rounded-xl border bg-slate-50/60 dark:bg-gray-900/50 border-slate-200 dark:border-gray-800">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium ${isDay ? "text-slate-600" : "text-gray-400"}`}>
                        Duration Window:
                      </span>
                      <span className={`font-mono font-bold ${isDay ? "text-slate-900" : "text-white"}`}>
                        {row.duration_s} seconds ({Math.round(row.duration_s / 60)} min)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={300}
                      max={3600}
                      step={60}
                      value={row.duration_s}
                      onChange={(e) =>
                        onRowChange(row.id, {
                          duration_s: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full cursor-pointer accent-blue-600"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Builder Actions: Add Run & Start */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onAdd}
          className={`flex-1 border-2 border-dashed py-3 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            isDay
              ? "border-slate-300 hover:border-slate-400 text-slate-600 hover:bg-slate-50"
              : "border-gray-700 hover:border-gray-600 text-gray-300 hover:bg-gray-900/50"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Add Comparison Run Slot</span>
        </button>

        <button
          type="button"
          onClick={onStart}
          disabled={starting || rows.length < 2}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
        >
          <Play className="w-4 h-4" />
          <span>{starting ? "Initializing Benchmark Runs…" : `Execute Benchmark (${rows.length} Runs)`}</span>
        </button>
      </div>

      {rows.length < 2 && (
        <p className={`text-xs text-center ${isDay ? "text-slate-500" : "text-gray-400"}`}>
          Configure at least 2 comparative run definitions to launch a head-to-head benchmark.
        </p>
      )}
      {error && (
        <div className={`p-3 rounded-xl border text-xs font-medium ${
          isDay ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-rose-950/40 border-rose-800 text-rose-300"
        }`}>
          {error}
        </div>
      )}
    </div>
  );
}

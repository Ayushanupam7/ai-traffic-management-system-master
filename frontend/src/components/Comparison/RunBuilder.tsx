"use client";

import {
  CarsField,
  DominantField,
  PolicyField,
  ProfileField,
} from "@/components/Simulation/Fields";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { COMBINED_RAMP_OPTIONS, policiesForNetwork } from "@/lib/policies";
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
  // Combined-network only: independent ramp-meter policy for this run.
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
  arterial: "Arterial",
  highway_metered: "Highway",
  combined: "Combined",
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

  useEffect(() => {
    api
      .listPolicyVariants()
      .then((list) => setVariants(list as PolicyVariant[]))
      .catch(() => setVariants([]));
  }, []);

  // Switching a row's policy invalidates any saved variant it carried, so we
  // clear the variant fields and let the user re-pick from the new family.
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Comparison Builder
        </h2>
        <label className="flex items-center gap-2 text-xs text-gray-400">
          Shared Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange(parseInt(e.target.value || "0", 10))}
            className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
          />
        </label>
      </div>

      {/* Experiment-level network — all runs share one map so results stay
          apples-to-apples. */}
      <div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          Network
        </span>
        <div className="flex gap-2 mt-1">
          {NETWORK_ORDER.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onNetworkChange(n)}
              className={`flex-1 rounded px-2 py-1 text-xs border transition ${
                network === n
                  ? "bg-blue-700 border-blue-500 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400"
              }`}
            >
              {NETWORK_LABELS[n]}
            </button>
          ))}
        </div>
        {isCombined && (
          <p className="text-[10px] text-gray-600 mt-1">
            Highway + 3×2 grid: each run sets an arterial signal policy and a
            ramp-meter policy.
          </p>
        )}
      </div>

      <div className="space-y-3">
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
              className="border border-gray-800 rounded p-3 space-y-2 bg-gray-900/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Run #{idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Policy menu adapts to the experiment network. */}
              {isCombined ? (
                <div className="grid grid-cols-2 gap-2">
                  <PolicyField
                    value={row.policy}
                    onChange={(v) => handlePolicyChange(row.id, v)}
                    options={policiesForNetwork.combined}
                    label="Arterial policy"
                  />
                  <PolicyField
                    value={row.ramp_policy ?? "ramp_alinea"}
                    onChange={(v) => onRowChange(row.id, { ramp_policy: v })}
                    options={COMBINED_RAMP_OPTIONS}
                    label="Ramp policy"
                  />
                </div>
              ) : isArterial ? (
                <div className="grid grid-cols-2 gap-2">
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

              {showVariantPicker && familyVariants.length > 0 && (
                <label className="block">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Policy Variant{" "}
                    <span className="normal-case tracking-normal text-gray-600">
                      ({variantFamily})
                    </span>
                  </span>
                  <select
                    value={selectedVariant}
                    onChange={(e) =>
                      handleVariantPick(row.id, e.target.value, variantFamily)
                    }
                    className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
                  >
                    <option value="">— defaults —</option>
                    {familyVariants.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <CarsField
                value={row.cars}
                onChange={(v) => onRowChange(row.id, { cars: v })}
              />

              <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Stop Condition
                </span>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => onRowChange(row.id, { mode: "race" })}
                    className={`flex-1 rounded px-2 py-1 text-xs border transition ${
                      row.mode === "race"
                        ? "bg-blue-700 border-blue-500 text-white"
                        : "bg-gray-900 border-gray-700 text-gray-400"
                    }`}
                  >
                    Race until empty
                  </button>
                  <button
                    type="button"
                    onClick={() => onRowChange(row.id, { mode: "time" })}
                    className={`flex-1 rounded px-2 py-1 text-xs border transition ${
                      row.mode === "time"
                        ? "bg-blue-700 border-blue-500 text-white"
                        : "bg-gray-900 border-gray-700 text-gray-400"
                    }`}
                  >
                    Time limit
                  </button>
                </div>
                {row.mode === "time" && (
                  <label className="block mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                        Duration (sim seconds)
                      </span>
                      <span className="text-xs font-mono text-gray-300">
                        {row.duration_s}s
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
                      className="w-full mt-1"
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="flex-1 border border-dashed border-gray-700 text-gray-400 rounded px-3 py-2
                     text-sm hover:bg-gray-900 transition"
        >
          + Add run
        </button>
        <button
          type="button"
          onClick={onStart}
          disabled={starting || rows.length < 2}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white rounded px-3 py-2
                     text-sm font-medium disabled:opacity-50 transition"
        >
          {starting ? "Starting..." : `Start ${rows.length} runs`}
        </button>
      </div>

      {rows.length < 2 && (
        <p className="text-xs text-gray-500">
          Add at least 2 runs to start a comparison.
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

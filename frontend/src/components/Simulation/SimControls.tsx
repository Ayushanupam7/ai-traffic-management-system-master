"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSimulation } from "@/hooks/useSimulation";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import {
  COMBINED_RAMP_OPTIONS,
  POLICY_LABELS,
  policiesForNetwork,
} from "@/lib/policies";
import {
  CarlaCarsField,
  CarsField,
  DominantField,
  ProfileField,
} from "./Fields";
import type {
  CameraStatus,
  DemandProfile,
  DominantDirection,
  PolicyType,
  PolicyVariant,
  SimulationMode,
} from "@/lib/types";

const ACTIVE_VARIANT_KEY = "traffic.activeVariantName";

const LABEL = "text-[9px] text-gray-600 uppercase tracking-widest";

function ToggleBtn({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-1.5 text-xs rounded-md border transition-colors font-medium disabled:opacity-40 ${
        active
          ? "bg-indigo-900 border-indigo-600 text-indigo-200"
          : "bg-[#1f2937] border-gray-700 text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function SimControls() {
  const { startSimulation, stopSimulation, pauseSimulation, resumeSimulation, loading, error } =
    useSimulation();
  const status      = useTrafficStore((s) => s.status);
  // The map reads `network` from the store so the layout previews live as the
  // user toggles. We mirror it here as the source-of-truth for Start payloads.
  const network     = useTrafficStore((s) => s.network);
  const setNetwork  = useTrafficStore((s) => s.setNetwork);

  const [mode,      setMode]      = useState<SimulationMode>("sumo");
  const [policy,    setPolicy]    = useState<PolicyType>("actuated");
  // Combined-network only: independent ramp meter policy. Ignored when
  // network is arterial or highway_metered.
  const [rampPolicy, setRampPolicy] = useState<PolicyType>("ramp_alinea");
  const [profile,   setProfile]   = useState<DemandProfile>("balanced");
  const [dominant,  setDominant]  = useState<DominantDirection>("EW");
  const [cars,      setCars]      = useState<number>(5500);
  const [gui,       setGui]       = useState<boolean>(false);
  const [carlaCars, setCarlaCars] = useState<number>(80);
  const [carlaStatus, setCarlaStatus] = useState<CameraStatus | null>(null);
  // Saved policy variants (CRUD lives on /policy). User picks one from the
  // dropdown below; selection persists via localStorage so it survives
  // navigation and re-renders.
  const [variants, setVariants] = useState<PolicyVariant[]>([]);
  const [activeName, setActiveName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    api.getCameraStatus()
      .then((s) => { if (!cancelled) setCarlaStatus(s as CameraStatus); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Pull saved variants on mount, every focus, and whenever localStorage
  // changes (the /policy page may have saved/deleted one).
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (typeof window === "undefined") return;
      try {
        const list = (await api.listPolicyVariants()) as PolicyVariant[];
        if (cancelled) return;
        setVariants(list);
        const stored = localStorage.getItem(ACTIVE_VARIANT_KEY) ?? "";
        // Drop a stale name that no longer exists.
        if (stored && !list.some((v) => v.name === stored)) {
          localStorage.removeItem(ACTIVE_VARIANT_KEY);
          setActiveName("");
        } else {
          setActiveName(stored);
        }
      } catch {
        if (!cancelled) setVariants([]);
      }
    };
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, []);

  const pickVariant = (name: string) => {
    setActiveName(name);
    if (name) localStorage.setItem(ACTIVE_VARIANT_KEY, name);
    else      localStorage.removeItem(ACTIVE_VARIANT_KEY);
  };

  const activeVariant = activeName
    ? variants.find((v) => v.name === activeName) ?? null
    : null;

  // Each network has its own valid policy menu (see @/lib/policies). On
  // combined we show TWO pickers — one for the 6 arterial signals, one for
  // the 4 ramp meters — so the user can run e.g. Adaptive grid + ALINEA
  // meters.
  const isHighway  = network === "highway_metered";
  const isCombined = network === "combined";
  // When the user switches networks, drop a policy that isn't valid for
  // the new menu so a stale combo never reaches the backend.
  useEffect(() => {
    const valid = policiesForNetwork[network] ?? policiesForNetwork.arterial;
    if (!valid.includes(policy)) {
      setPolicy(valid[valid.length - 1]);  // pick the "most adaptive" default
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Variant picker filters by family — arterial variants on arterial,
  // highway (ALINEA) variants on highway. Combined uses BOTH but the
  // picker shows the family that matches the chosen policy.
  const variantFamily: "arterial" | "highway" =
    policy === "ramp_alinea" || policy === "ramp_binary" ? "highway" : "arterial";
  const familyVariants = variants.filter(
    (v) => (v.family ?? "arterial") === variantFamily,
  );

  // The picker is only useful when a tunable policy is selected.
  const showVariantPicker = policy === "ramp_alinea" || policy === "actuated";

  const isIdle       = status === "idle" || status === "stopped";
  const carlaEnabled = carlaStatus?.connected === true;

  const setLastStartedConfig = useTrafficStore((s) => s.setLastStartedConfig);

  const handleStart = () => {
    if (mode === "carla") {
      const cfg = {
        mode: "carla" as const,
        policy_type: policy,
        demand_profile: profile,
        dominant_direction: dominant,
        total_vehicles: cars,
        gui: false,
        carla_vehicle_count: carlaCars,
      };
      setLastStartedConfig(cfg);
      startSimulation(cfg);
    } else {
      // Variants land in different config keys per family. The backend
      // dispatches on policy_type and reads the matching field.
      let extra: Record<string, unknown> = {};
      if (activeVariant && showVariantPicker) {
        if (variantFamily === "highway") {
          extra = { alinea_params: activeVariant.params };
        } else {
          extra = { policy_params: activeVariant.params };
        }
      }
      const cfg = {
        mode: "sumo" as const,
        network_type: network,
        policy_type: policy,
        demand_profile: profile,
        dominant_direction: dominant,
        total_vehicles: cars,
        gui,
        // Combined runs two controllers in tandem. policy_type drives the
        // arterial half; ramp_policy_type drives the 4 meters. On other
        // networks ramp_policy_type is silently ignored by the backend.
        ...(isCombined ? { ramp_policy_type: rampPolicy } : {}),
        ...extra,
      };
      setLastStartedConfig(cfg);
      startSimulation(cfg);
    }
  };

  const lastStartedConfig = useTrafficStore((s) => s.lastStartedConfig);
  const canQuickRestart = lastStartedConfig != null && status === "stopped";
  const handleQuickRestart = () => {
    if (!lastStartedConfig) return;
    startSimulation(lastStartedConfig);
  };

  const policyLabel = {
    actuated:    "Adaptive",
    fixed_time:  "Fixed Time",
    ramp_binary: "Ramp · Binary",
    ramp_alinea: "Ramp · ALINEA",
  }[policy];
  const profileLabel = profile.charAt(0).toUpperCase() + profile.slice(1);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[9px] text-gray-600 uppercase tracking-widest">Simulation</div>

      {isIdle ? (
        <>
          {/* Mode */}
          <div>
            <div className={LABEL}>Mode</div>
            <div className="flex gap-1.5 mt-1">
              <ToggleBtn active={mode === "sumo"} onClick={() => setMode("sumo")}>SUMO</ToggleBtn>
              <ToggleBtn
                active={mode === "carla"}
                disabled={!carlaEnabled}
                onClick={() => setMode("carla")}
              >
                CARLA{!carlaEnabled ? " ✕" : ""}
              </ToggleBtn>
            </div>
            {!carlaEnabled && (
              <p className="text-[9px] text-gray-600 mt-1">Launch CarlaUE4 to enable CARLA mode.</p>
            )}
          </div>

          {mode === "sumo" ? (
            <>
              {/* Network toggle */}
              <div>
                <div className={LABEL}>Network</div>
                <div className="flex gap-1.5 mt-1">
                  <ToggleBtn active={network === "arterial"} onClick={() => setNetwork("arterial")}>
                    Arterial
                  </ToggleBtn>
                  <ToggleBtn active={network === "highway_metered"} onClick={() => setNetwork("highway_metered")}>
                    Highway
                  </ToggleBtn>
                  <ToggleBtn active={network === "combined"} onClick={() => setNetwork("combined")}>
                    Combined
                  </ToggleBtn>
                </div>
                {isCombined && (
                  <p className="text-[9px] text-gray-600 mt-1">
                    Highway + 3×2 grid: freeway exits feed into signalized city streets.
                  </p>
                )}
              </div>

              {/* Policy picker. On combined we show TWO pickers — one
                  per controller family. On other networks just one. */}
              <div>
                <div className={LABEL}>
                  {isCombined ? "Arterial policy" : "Policy"}
                </div>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {(policiesForNetwork[network] ?? []).map((pt) => (
                    <ToggleBtn key={pt} active={policy === pt} onClick={() => setPolicy(pt)}>
                      {POLICY_LABELS[pt]}
                    </ToggleBtn>
                  ))}
                </div>
                {isHighway && (
                  <p className="text-[9px] text-gray-600 mt-1">
                    Binary: speed-threshold v0. ALINEA: occupancy-feedback law.
                  </p>
                )}
              </div>

              {/* Second picker — ramp meters, only on combined. */}
              {isCombined && (
                <div>
                  <div className={LABEL}>Ramp meter policy</div>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {COMBINED_RAMP_OPTIONS.map((pt) => (
                      <ToggleBtn
                        key={pt}
                        active={rampPolicy === pt}
                        onClick={() => setRampPolicy(pt)}
                      >
                        {pt === "fixed_time" ? "No metering" : POLICY_LABELS[pt]}
                      </ToggleBtn>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1">
                    Arterial signals + ramp meters run independently in tandem.
                  </p>
                </div>
              )}

              {/* Profile + dominant only meaningful for arterial */}
              {network === "arterial" && (
                <>
                  <ProfileField value={profile} onChange={setProfile} />
                  {profile === "asym" && <DominantField value={dominant} onChange={setDominant} />}
                </>
              )}
              <CarsField value={cars} onChange={setCars} />

              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gui}
                  onChange={(e) => setGui(e.target.checked)}
                  className="accent-blue-500"
                />
                Open SUMO window
              </label>
              {/* Variant picker — hidden entirely when there are no saved
                  variants for this family (avoids a useless one-option
                  dropdown). A tiny 'create variants →' link still hints
                  that this is a feature. */}
              {showVariantPicker && familyVariants.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className={LABEL}>
                      Policy variant
                      <span className="ml-1 normal-case tracking-normal text-gray-500">
                        ({variantFamily})
                      </span>
                    </div>
                    <Link
                      href="/policy"
                      className="text-blue-400 hover:text-blue-300 text-[10px]"
                    >
                      manage →
                    </Link>
                  </div>
                  <select
                    value={
                      familyVariants.some((v) => v.name === activeName) ? activeName : ""
                    }
                    onChange={(e) => pickVariant(e.target.value)}
                    className="w-full mt-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-200"
                  >
                    <option value="">— defaults —</option>
                    {familyVariants.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {showVariantPicker && familyVariants.length === 0 && (
                <Link
                  href="/policy"
                  className="text-[10px] text-gray-500 hover:text-blue-300"
                >
                  create policy variants →
                </Link>
              )}
            </>
          ) : (
            <CarlaCarsField value={carlaCars} onChange={setCarlaCars} />
          )}

          <div className="flex gap-1.5">
            <button
              onClick={handleStart}
              disabled={loading || (mode === "carla" && !carlaEnabled)}
              className="flex-1 bg-[#14532d] hover:bg-green-800 border border-green-900 text-green-300
                         rounded-md py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? "Starting…" : "▶ Start"}
            </button>
            {/* Quick-restart — only after a previous successful run, only
                when we're stopped. One click re-launches with the exact
                same config used last time. */}
            {canQuickRestart && (
              <button
                onClick={handleQuickRestart}
                disabled={loading}
                title="Re-run with the same config"
                className="bg-[#1e3a5f] hover:bg-blue-900 border border-blue-900 text-blue-300
                           rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                ↻
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Running summary */}
          <div className="bg-[#1f2937] rounded-md px-3 py-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === "running" ? "bg-green-500" : "bg-yellow-500"
            }`} />
            <span className="text-xs text-gray-400">
              {policyLabel} · {profileLabel}
            </span>
          </div>

          <div className="flex gap-1.5">
            {status === "running" ? (
              <button
                onClick={pauseSimulation}
                className="flex-1 bg-[#1f2937] hover:bg-yellow-900 border border-gray-700
                           text-yellow-300 rounded-md py-2 text-xs font-semibold transition-colors"
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                onClick={resumeSimulation}
                className="flex-1 bg-[#1f2937] hover:bg-blue-900 border border-gray-700
                           text-blue-300 rounded-md py-2 text-xs font-semibold transition-colors"
              >
                ▶ Resume
              </button>
            )}
            <button
              onClick={stopSimulation}
              disabled={loading}
              className="flex-1 bg-[#450a0a] hover:bg-red-900 border border-red-900
                         text-red-300 rounded-md py-2 text-xs font-semibold
                         disabled:opacity-50 transition-colors"
            >
              ■ Stop
            </button>
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}

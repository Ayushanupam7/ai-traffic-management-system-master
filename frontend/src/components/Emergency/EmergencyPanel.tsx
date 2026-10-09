"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTrafficStore } from "@/store/trafficStore";

const INTERSECTION_IDS = ["A0", "A1", "B0", "B1", "C0", "C1"] as const;

const VEHICLE_TYPES = [
  { value: "ambulance", label: "🚑 Ambulance" },
  { value: "fire_truck", label: "🚒 Fire Truck" },
  { value: "police", label: "🚓 Police" },
] as const;

interface ActiveEv {
  vehicle_id: string;
  label: string;
  route_intersections: string[];
}

export default function EmergencyPanel() {
  const status = useTrafficStore((s) => s.status);
  const network = useTrafficStore((s) => s.network);
  const setActiveEvRoutes = useTrafficStore((s) => s.setActiveEvRoutes);
  const setTrackedEv = useTrafficStore((s) => s.setTrackedEv);
  const trackedEvId = useTrafficStore((s) => s.trackedEvId);

  const [from, setFrom] = useState("A0");
  const [to, setTo] = useState("C1");
  const [vehicleType, setVehicleType] = useState("ambulance");
  const [loading, setLoading] = useState(false);
  const [activeEvs, setActiveEvs] = useState<ActiveEv[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Keep route visualization in sync with active EVs
  useEffect(() => {
    setActiveEvRoutes(activeEvs.map((ev) => ev.route_intersections));
  }, [activeEvs, setActiveEvRoutes]);

  // Clear EVs when simulation stops
  useEffect(() => {
    if (status === "idle" || status === "stopped") {
      setActiveEvs([]);
      setTrackedEv(null, "none");
    }
  }, [status, setTrackedEv]);

  if (status !== "running" && status !== "paused") return null;

  // Graceful "not available" state on highway / combined — the route
  // graph for emergency dispatch only knows the arterial grid.
  if (network !== "arterial") {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-[10px] text-slate-600 dark:text-gray-400 font-bold uppercase tracking-wider">
          Emergency Dispatch
        </div>
        <div className="bg-slate-100 dark:bg-[#111827] border border-slate-200 dark:border-gray-800 rounded-xl p-3
                        flex items-start gap-2.5 text-[11px] text-slate-600 dark:text-gray-400">
          <span className="text-base leading-none">🚧</span>
          <span>
            Emergency dispatch is active on the{" "}
            <span className="font-bold text-slate-900 dark:text-gray-200">Arterial</span> network. Switch network in controls to dispatch.
          </span>
        </div>
      </div>
    );
  }

  async function dispatch() {
    if (from === to || loading) return;
    setError(null);
    setLoading(true);
    try {
      const data = await api.dispatchEmergency({
        from_intersection: from,
        to_intersection: to,
        vehicle_type: vehicleType,
      });
      const typeLabel = VEHICLE_TYPES.find((v) => v.value === vehicleType)?.label ?? vehicleType;
      setActiveEvs((prev) => [
        ...prev,
        {
          vehicle_id: data.vehicle_id,
          label: `${typeLabel}: ${from} → ${to}`,
          route_intersections: data.route_intersections,
        },
      ]);
      // Immediately track the new emergency vehicle with the 3D camera
      setTrackedEv(data.vehicle_id, "chase");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dispatch failed.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel(vehicleId: string) {
    try {
      await api.cancelEmergency(vehicleId);
    } catch {
      // best-effort
    }
    setActiveEvs((prev) => prev.filter((ev) => ev.vehicle_id !== vehicleId));
    if (trackedEvId === vehicleId) {
      setTrackedEv(null, "none");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-red-500 dark:text-red-400 tracking-wider uppercase flex items-center gap-1.5">
          <span>🚨 Emergency Dispatch</span>
        </p>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
          Green Wave Active
        </span>
      </div>

      {/* From / To selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-slate-500 dark:text-gray-400">Origin</label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-slate-100 dark:bg-[#1f2937] border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1.5
                       text-[11px] font-medium text-slate-800 dark:text-gray-200 outline-none focus:border-red-500 transition-colors"
          >
            {INTERSECTION_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-slate-500 dark:text-gray-400">Destination</label>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-slate-100 dark:bg-[#1f2937] border border-slate-300 dark:border-gray-700 rounded-lg px-2 py-1.5
                       text-[11px] font-medium text-slate-800 dark:text-gray-200 outline-none focus:border-red-500 transition-colors"
          >
            {INTERSECTION_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Vehicle type */}
      <div className="flex gap-1">
        {VEHICLE_TYPES.map((vt) => (
          <button
            key={vt.value}
            onClick={() => setVehicleType(vt.value)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${vehicleType === vt.value
                ? "bg-red-600 text-white border-red-500 shadow-sm shadow-red-500/25"
                : "bg-slate-100 dark:bg-[#1f2937] border-slate-200 dark:border-gray-700/60 text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200"
              }`}
          >
            {vt.label}
          </button>
        ))}
      </div>

      {/* Dispatch button */}
      <button
        onClick={dispatch}
        disabled={loading || from === to}
        className="w-full py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-40
                   rounded-lg text-[11px] text-white font-bold transition-all shadow-md shadow-red-600/20"
      >
        {loading ? "Dispatching Route & Preempting…" : "🚨 Dispatch Vehicle Now"}
      </button>

      {error && (
        <p className="text-[10px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {/* Active EVs */}
      {activeEvs.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-gray-400 font-medium">
            <span>Priority Corridors</span>
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">100% PREEMPTION</span>
          </div>
          {activeEvs.map((ev) => {
            const isTrackingThis = trackedEvId === ev.vehicle_id;
            return (
              <div
                key={ev.vehicle_id}
                className={`flex items-center justify-between rounded-xl px-2.5 py-2 gap-2 border transition-all ${isTrackingThis
                    ? "bg-red-500/10 dark:bg-red-950/40 border-red-500/60 shadow-md shadow-red-500/15"
                    : "bg-slate-100/80 dark:bg-[#1f2937] border-slate-200 dark:border-gray-700/60"
                  }`}
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-gray-200 truncate">{ev.label}</span>
                  <span className="text-[9px] text-slate-500 dark:text-gray-400 font-mono font-medium">
                    {ev.route_intersections.join(" ➔ ")}
                  </span>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setTrackedEv(isTrackingThis ? null : ev.vehicle_id, "chase")}
                    title={isTrackingThis ? "Exit Camera View" : "Attach Live 3D EV Camera"}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${isTrackingThis
                        ? "bg-red-600 border-red-500 text-white animate-pulse shadow-sm shadow-red-500/30"
                        : "bg-slate-200 dark:bg-gray-800 border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-300 dark:hover:bg-gray-700 hover:text-slate-900 dark:hover:text-white"
                      }`}
                  >
                    {isTrackingThis ? "🎥 Live" : "🎥 Cam"}
                  </button>
                  <button
                    onClick={() => cancel(ev.vehicle_id)}
                    className="text-slate-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 text-xs p-1 transition-colors leading-none font-bold"
                    title="Cancel Preemption"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

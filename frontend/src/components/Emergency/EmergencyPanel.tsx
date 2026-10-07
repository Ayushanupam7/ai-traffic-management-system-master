"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTrafficStore } from "@/store/trafficStore";

const INTERSECTION_IDS = ["A0", "A1", "B0", "B1", "C0", "C1"] as const;

const VEHICLE_TYPES = [
  { value: "ambulance", label: "🚑 Ambulance" },
  { value: "fire_truck", label: "🚒 Fire Truck" },
  { value: "police",    label: "🚓 Police" },
] as const;

interface ActiveEv {
  vehicle_id: string;
  label: string;
  route_intersections: string[];
}

export default function EmergencyPanel() {
  const status          = useTrafficStore((s) => s.status);
  const network         = useTrafficStore((s) => s.network);
  const setActiveEvRoutes = useTrafficStore((s) => s.setActiveEvRoutes);

  const [from, setFrom]           = useState("A0");
  const [to, setTo]               = useState("C1");
  const [vehicleType, setVehicleType] = useState("ambulance");
  const [loading, setLoading]     = useState(false);
  const [activeEvs, setActiveEvs] = useState<ActiveEv[]>([]);
  const [error, setError]         = useState<string | null>(null);

  // Keep route visualization in sync with active EVs
  useEffect(() => {
    setActiveEvRoutes(activeEvs.map((ev) => ev.route_intersections));
  }, [activeEvs, setActiveEvRoutes]);

  // Clear EVs when simulation stops
  useEffect(() => {
    if (status === "idle" || status === "stopped") {
      setActiveEvs([]);
    }
  }, [status]);

  if (status !== "running" && status !== "paused") return null;

  // Graceful "not available" state on highway / combined — the route
  // graph for emergency dispatch only knows the arterial grid.
  if (network !== "arterial") {
    return (
      <div>
        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">
          Emergency
        </div>
        <div className="bg-[#111827] border border-gray-800 rounded-md p-2.5
                        flex items-start gap-2 text-[11px] text-gray-500">
          <span className="text-base leading-none">🚧</span>
          <span>
            Emergency dispatch is only available on the{" "}
            <span className="text-gray-300">Arterial</span> network.
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
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-semibold text-red-400 tracking-widest uppercase">
        Emergency Dispatch
      </p>

      {/* From / To selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">From</label>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-[#1f2937] border border-gray-700 rounded-md px-2 py-1
                       text-[11px] text-gray-200 outline-none focus:border-red-500"
          >
            {INTERSECTION_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-gray-500">To</label>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-[#1f2937] border border-gray-700 rounded-md px-2 py-1
                       text-[11px] text-gray-200 outline-none focus:border-red-500"
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
            className={`flex-1 py-1 rounded-md text-[10px] transition-colors ${
              vehicleType === vt.value
                ? "bg-red-600 text-white"
                : "bg-[#1f2937] text-gray-400 hover:text-gray-200"
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
        className="w-full py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40
                   rounded-md text-[11px] text-white font-semibold transition-colors"
      >
        {loading ? "Dispatching…" : "Dispatch"}
      </button>

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      {/* Active EVs */}
      {activeEvs.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-gray-500">Active</p>
          {activeEvs.map((ev) => (
            <div
              key={ev.vehicle_id}
              className="flex items-center justify-between bg-[#1f2937]
                         rounded-md px-2 py-1.5 gap-2"
            >
              <span className="text-[10px] text-gray-300 truncate">{ev.label}</span>
              <button
                onClick={() => cancel(ev.vehicle_id)}
                className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0
                           transition-colors leading-none"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

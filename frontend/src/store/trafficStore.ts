"use client";

import { create } from "zustand";
import type {
  EmergencyVehicleInfo,
  IntersectionState,
  MetricsSnapshot,
  NetworkType,
  SimulationConfig,
  SimulationMode,
  SimulationStatus,
  TickData,
  VehicleState,
} from "@/lib/types";

// Wide metrics history row used by the live timeline + sparkline trends.
export interface MetricsHistoryRow {
  tick: number;
  sim_time: number;
  total_vehicles: number;
  total_completed: number;
  avg_delay_s: number;
  throughput_veh_per_min: number;
  total_halting: number;
  avg_control_delay_s: number;
  avg_trip_time_s: number;
  completed_trips: number;
}

export interface PolicyLogEntry {
  simTime: number;
  directions: Record<"N" | "E" | "S" | "W", { base: number; target: number; delta: number }>;
}

interface TrafficStore {
  status: SimulationStatus;
  mode: SimulationMode;
  network: NetworkType;
  tick: number;
  simTime: number;
  intersections: IntersectionState[];
  vehicles: VehicleState[];
  metrics: MetricsSnapshot;
  emergencyVehicles: EmergencyVehicleInfo[];
  selectedIntersection: string | null;
  wsConnected: boolean;
  metricsHistory: MetricsHistoryRow[];
  policyLog: Record<string, PolicyLogEntry[]>;
  activeEvRoutes: string[][];  // Each entry is an ordered list of intersection IDs
  trackedEvId: string | null;
  evCameraMode: "none" | "chase" | "dash" | "drone";
  themeMode: "night" | "day" | "sunset";
  viewMode: "3d" | "2d";
  locateTrigger: number;
  // The last config the user successfully started. Powers the Quick-restart
  // button + the System Summary card. null on a fresh session.
  lastStartedConfig: Partial<SimulationConfig> | null;

  updateFromTick: (data: TickData) => void;
  setStatus: (status: SimulationStatus) => void;
  setMode: (mode: SimulationMode) => void;
  setNetwork: (network: NetworkType) => void;
  selectIntersection: (id: string | null) => void;
  triggerLocate: (id: string) => void;
  setWsConnected: (connected: boolean) => void;
  appendPolicyLog: (id: string, entry: PolicyLogEntry) => void;
  setActiveEvRoutes: (routes: string[][]) => void;
  setTrackedEv: (id: string | null, mode?: "none" | "chase" | "dash" | "drone") => void;
  setThemeMode: (theme: "night" | "day" | "sunset") => void;
  setViewMode: (view: "3d" | "2d") => void;
  setLastStartedConfig: (cfg: Partial<SimulationConfig> | null) => void;
  userName: string;
  setUserName: (name: string) => void;
  reachedEvNotification: { id: string; label: string; to: string; timestamp: number } | null;
  setReachedEvNotification: (notif: { id: string; label: string; to: string; timestamp: number } | null) => void;
  targetFps: number;
  setTargetFps: (fps: number) => void;
  reset: () => void;
}

const MAX_HISTORY = 300;
const MAX_POLICY_LOG = 20;

export const useTrafficStore = create<TrafficStore>((set) => ({
  status: "idle",
  mode: "sumo",
  network: "arterial",
  tick: 0,
  simTime: 0,
  intersections: [],
  vehicles: [],
  locateTrigger: 0,
  metrics: {
    total_vehicles: 0,
    total_completed: 0,
    avg_delay_s: 0,
    throughput_veh_per_min: 0,
    total_halting: 0,
    avg_control_delay_s: 0,
    control_delay_samples: 0,
    avg_trip_time_s: 0,
    completed_trips: 0,
  },
  emergencyVehicles: [],
  selectedIntersection: null,
  wsConnected: false,
  metricsHistory: [],
  policyLog: {},
  activeEvRoutes: [],
  trackedEvId: null,
  evCameraMode: "none",
  themeMode: "night",
  viewMode: "3d",
  lastStartedConfig: null,
  userName: "User",
  setUserName: (userName: string) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("marg_user_name", userName);
      } catch {}
    }
    set({ userName });
  },
  reachedEvNotification: null,
  setReachedEvNotification: (reachedEvNotification) => set({ reachedEvNotification }),
  targetFps: 60,
  setTargetFps: (targetFps: number) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("marg_target_fps", String(targetFps));
      } catch {}
    }
    set({ targetFps });
  },

  updateFromTick: (data) =>
    set((state) => ({
      tick: data.tick,
      simTime: data.sim_time,
      intersections: data.intersections,
      vehicles: data.vehicles,
      metrics: data.metrics,
      emergencyVehicles: data.emergency.active,
      metricsHistory: [
        ...state.metricsHistory.slice(-(MAX_HISTORY - 1)),
        {
          tick: data.tick,
          sim_time: data.sim_time,
          total_vehicles: data.metrics.total_vehicles,
          total_completed: data.metrics.total_completed,
          avg_delay_s: data.metrics.avg_delay_s,
          throughput_veh_per_min: data.metrics.throughput_veh_per_min,
          total_halting: data.metrics.total_halting,
          avg_control_delay_s: data.metrics.avg_control_delay_s,
          avg_trip_time_s: data.metrics.avg_trip_time_s,
          completed_trips: data.metrics.completed_trips,
        },
      ],
    })),

  setStatus: (status) => set({ status }),
  setMode: (mode) => set({ mode }),
  setNetwork: (network) => set({ network }),
  selectIntersection: (id) => set({ selectedIntersection: id }),
  triggerLocate: (id) =>
    set((state) => ({
      selectedIntersection: id,
      locateTrigger: state.locateTrigger + 1,
    })),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setActiveEvRoutes: (routes) => set({ activeEvRoutes: routes }),
  setTrackedEv: (id, mode = "chase") =>
    set({
      trackedEvId: id,
      evCameraMode: id ? mode : "none",
    }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLastStartedConfig: (cfg) => set({ lastStartedConfig: cfg }),

  appendPolicyLog: (id, entry) =>
    set((state) => {
      const prev = state.policyLog[id] ?? [];
      return {
        policyLog: {
          ...state.policyLog,
          [id]: [...prev.slice(-(MAX_POLICY_LOG - 1)), entry],
        },
      };
    }),

  reset: () =>
    set({
      status: "idle",
      tick: 0,
      simTime: 0,
      intersections: [],
      vehicles: [],
      metricsHistory: [],
      emergencyVehicles: [],
      selectedIntersection: null,
      policyLog: {},
      activeEvRoutes: [],
    }),
}));

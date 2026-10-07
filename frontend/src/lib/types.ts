/** TypeScript type definitions mirroring the Python Pydantic models. */

export type VehicleType = "car" | "truck" | "bus" | "motorcycle" | "emergency";
export type Direction = "N" | "S" | "E" | "W";
export type SimulationStatus = "idle" | "running" | "paused" | "stopped";
export type PolicyType =
  | "fixed_time"
  | "actuated"
  | "ramp_binary"   // highway: speed-threshold heuristic
  | "ramp_alinea";  // highway: ALINEA occupancy-feedback

export type PolicyFamily = "arterial" | "highway";
export type DemandProfile = "balanced" | "asym" | "extreme";
export type DominantDirection = "EW" | "NS";

export interface VehicleState {
  id: string;
  type: VehicleType;
  x: number;
  y: number;
  speed: number;
  lane_id: string;
  accumulated_wait_s: number;
}

export interface QueueLengths {
  N: number;
  S: number;
  E: number;
  W: number;
}

export interface IntersectionState {
  id: string;
  signal_state: string;
  phase_index: number;
  phase_remaining_s: number;
  queue_lengths: QueueLengths;
  vehicle_count: number;
  avg_wait_s: number;
}

export interface MetricsSnapshot {
  total_vehicles: number;
  total_completed: number;
  avg_delay_s: number;
  throughput_veh_per_min: number;
  total_halting: number;
  avg_control_delay_s: number;
  control_delay_samples: number;
  avg_trip_time_s: number;
  completed_trips: number;
}

export interface EmergencyVehicleInfo {
  id: string;
  x: number;
  y: number;
  target_intersection: string;
  eta_s: number;
  current_edge?: string | null;
}

export interface TickData {
  tick: number;
  sim_time: number;
  intersections: IntersectionState[];
  vehicles: VehicleState[];
  metrics: MetricsSnapshot;
  emergency: { active: EmergencyVehicleInfo[] };
  camera_frame_url: string | null;
}

export type SimulationMode = "sumo" | "carla";
export type NetworkType = "arterial" | "highway_metered" | "combined";

export interface ActuatedPolicyParams {
  base_green_n: number;
  base_green_s: number;
  base_green_e: number;
  base_green_w: number;
  min_green: number;
  max_green: number;
  max_redist_s: number;
  smooth_alpha: number;
}

export interface AlineaPolicyParams {
  target_occupancy_pct: number;
  gain_K: number;
  r_min_vph: number;
  r_max_vph: number;
  control_interval_s: number;
  queue_max_veh: number;
  green_s: number;
  yellow_s: number;
}

// A variant stores either ActuatedPolicyParams or AlineaPolicyParams under
// `params`; the `family` field tags which schema applies.
export interface PolicyVariant {
  name: string;
  params: ActuatedPolicyParams | AlineaPolicyParams | Record<string, number>;
  family?: PolicyFamily;
  description?: string;
}

export interface VariantRun {
  run_id: string;
  started_at: string | null;
  ended_at: string | null;
  demand_profile: string | null;
  total_vehicles: number | null;
  network_type: string | null;
  clearance_s: number | null;
  avg_trip_time_s: number | null;
  completed_trips: number | null;
  avg_control_delay_s: number | null;
  throughput_veh_per_min: number | null;
}

export interface PolicySuggestion {
  field: string;
  value: number;
  reason: string;
}

export interface PolicySuggestResponse {
  suggestions: PolicySuggestion[];
  sample_size: number;
  note?: string;
}

export const DEFAULT_POLICY_PARAMS: ActuatedPolicyParams = {
  base_green_n: 15,
  base_green_s: 15,
  base_green_e: 35,
  base_green_w: 35,
  min_green: 10,
  max_green: 50,
  max_redist_s: 12,
  smooth_alpha: 0.7,
};

export const DEFAULT_ALINEA_PARAMS: AlineaPolicyParams = {
  target_occupancy_pct: 20.0,
  gain_K: 70.0,
  r_min_vph: 240,
  r_max_vph: 1800,
  control_interval_s: 30,
  queue_max_veh: 20,
  green_s: 2.0,
  yellow_s: 1.0,
};

// Schema metadata for the schema-driven /policy editor. Each entry is one
// numeric field; the editor renders a label + input + min/max validation.
export interface ParamFieldDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
}

export const ARTERIAL_PARAM_FIELDS: ParamFieldDef[] = [
  { key: "base_green_n", label: "Base green N",    min: 5,  max: 60,  step: 1, unit: "s" },
  { key: "base_green_s", label: "Base green S",    min: 5,  max: 60,  step: 1, unit: "s" },
  { key: "base_green_e", label: "Base green E",    min: 5,  max: 60,  step: 1, unit: "s" },
  { key: "base_green_w", label: "Base green W",    min: 5,  max: 60,  step: 1, unit: "s" },
  { key: "min_green",    label: "Min green",       min: 3,  max: 30,  step: 1, unit: "s" },
  { key: "max_green",    label: "Max green",       min: 20, max: 120, step: 1, unit: "s" },
  { key: "max_redist_s", label: "Max redistribute", min: 0, max: 30,  step: 1, unit: "s" },
  { key: "smooth_alpha", label: "Smoothing α",     min: 0,  max: 1,   step: 0.05 },
];

export const HIGHWAY_PARAM_FIELDS: ParamFieldDef[] = [
  { key: "target_occupancy_pct", label: "Target occupancy", min: 10, max: 35,   step: 0.5, unit: "%",
    hint: "Critical occupancy at capacity knee — ALINEA holds the downstream lane here." },
  { key: "gain_K",               label: "Feedback gain K",  min: 10, max: 200,  step: 1,   unit: "veh/h/%" },
  { key: "r_min_vph",            label: "Min meter rate",   min: 120, max: 600, step: 10,  unit: "veh/h" },
  { key: "r_max_vph",            label: "Max meter rate",   min: 900, max: 2400, step: 10, unit: "veh/h" },
  { key: "control_interval_s",   label: "Control interval", min: 10, max: 120,  step: 1,   unit: "s" },
  { key: "queue_max_veh",        label: "Queue override",   min: 10, max: 80,   step: 1,   unit: "veh",
    hint: "Force the meter open when the ramp queue meets this." },
  { key: "green_s",              label: "Green per cycle",  min: 1,  max: 6,    step: 0.5, unit: "s" },
  { key: "yellow_s",             label: "Yellow per cycle", min: 0.5, max: 2,   step: 0.1, unit: "s" },
];

export interface SimulationConfig {
  mode: SimulationMode;
  network_type?: NetworkType;
  policy_type: PolicyType;
  tick_rate: number;
  seed: number;
  duration_ticks: number | null;
  demand_profile: DemandProfile;
  total_vehicles: number;
  dominant_direction: DominantDirection;
  race_mode?: boolean;
  gui?: boolean;
  carla_vehicle_count?: number;
  policy_params?: ActuatedPolicyParams;
  alinea_params?: AlineaPolicyParams;
  // Combined-network only: independent ramp-meter policy. When omitted,
  // the backend falls back to the legacy single-picker behavior where
  // policy_type drives whichever family it belongs to.
  ramp_policy_type?: PolicyType;
}

export interface SimulationInfo {
  run_id: string | null;
  status: SimulationStatus;
  tick: number;
  sim_time: number;
  config: SimulationConfig | null;
}

export type ComparisonRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ComparisonExperimentStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export interface ComparisonRunResult {
  clearance_s: number | null;
  avg_trip_time_s: number;
  completed_trips: number;
  avg_control_delay_s: number;
  throughput_veh_per_min: number;
}

export interface ComparisonRun {
  run_id: string;
  config: SimulationConfig;
  status: ComparisonRunStatus;
  result: ComparisonRunResult | null;
  error: string | null;
}

export interface ComparisonRequest {
  name?: string;
  seed: number;
  runs: SimulationConfig[];
}

export interface ComparisonExperiment {
  experiment_id: string;
  name: string;
  seed: number;
  status: ComparisonExperimentStatus;
  current_run_idx: number;
  runs: ComparisonRun[];
  created_at: number;
}

export type CameraApproach = "N" | "E" | "S" | "W";

export interface CameraEntry {
  approach: CameraApproach;
  // Optional — populated when listCameras is called with detail=full.
  x?: number;
  y?: number;
  z?: number;
  pitch?: number;
  yaw?: number;
  roll?: number;
  width?: number;
  height?: number;
  fov?: number;
}

export interface IntersectionCameras {
  intersection_id: string;
  carla_junction_id: number;
  cx: number;
  cy: number;
  cameras: CameraEntry[];
}

export interface CameraListResponse {
  intersections: IntersectionCameras[];
}

export interface CameraStatus {
  connected: boolean;
  town: string | null;
  server_version: string | null;
  error: string | null;
}

export interface ExperimentUpdateMessage {
  type: "experiment_update";
  experiment_id: string;
  status: ComparisonExperimentStatus;
  current_run_idx: number;
  run_idx: number | null;
  experiment: ComparisonExperiment;
}

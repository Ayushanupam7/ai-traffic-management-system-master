"""Shared Pydantic models used across all packages."""

from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class VehicleType(str, Enum):
    CAR = "car"
    TRUCK = "truck"
    BUS = "bus"
    MOTORCYCLE = "motorcycle"
    EMERGENCY = "emergency"


class Direction(str, Enum):
    N = "N"
    S = "S"
    E = "E"
    W = "W"


class SimulationStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPED = "stopped"


class PolicyType(str, Enum):
    FIXED_TIME = "fixed_time"
    ACTUATED = "actuated"
    # Highway ramp-metering policies (only valid when network_type == "highway_metered").
    RAMP_BINARY = "ramp_binary"   # speed-threshold heuristic (the original RampMeterController)
    RAMP_ALINEA = "ramp_alinea"   # ALINEA occupancy-feedback law


# --- State Models (extracted from SUMO each tick) ---


class VehicleState(BaseModel):
    id: str
    type: VehicleType = VehicleType.CAR
    x: float
    y: float
    speed: float
    lane_id: str = ""
    accumulated_wait_s: float = 0.0


class QueueLengths(BaseModel):
    N: int = 0
    S: int = 0
    E: int = 0
    W: int = 0


class IntersectionState(BaseModel):
    id: str
    signal_state: str  # e.g., "GGrrGGrr"
    phase_index: int = 0
    phase_remaining_s: float = 0.0
    queue_lengths: QueueLengths = Field(default_factory=QueueLengths)
    vehicle_count: int = 0
    avg_wait_s: float = 0.0


class MetricsSnapshot(BaseModel):
    total_vehicles: int = 0
    total_completed: int = 0
    avg_delay_s: float = 0.0
    avg_travel_time_s: float = 0.0
    throughput_veh_per_min: float = 0.0
    total_halting: int = 0
    # Running average of per-vehicle control delay (HCM-style): time spent
    # inside the 50m zone around a light, minus the free-flow baseline.
    # Accumulates across the whole run — not a last-tick snapshot.
    avg_control_delay_s: float = 0.0
    control_delay_samples: int = 0
    # Average trip time across all completed trips (departure → arrival).
    avg_trip_time_s: float = 0.0
    completed_trips: int = 0


class EmergencyVehicleInfo(BaseModel):
    id: str
    x: float
    y: float
    target_intersection: str = ""
    eta_s: float = 0.0
    current_edge: Optional[str] = None  # SUMO edge the EV is currently on


class EmergencyState(BaseModel):
    active: List[EmergencyVehicleInfo] = Field(default_factory=list)


class TickData(BaseModel):
    """Complete state snapshot for one simulation tick."""

    tick: int
    sim_time: float
    intersections: List[IntersectionState]
    vehicles: List[VehicleState]
    metrics: MetricsSnapshot
    emergency: EmergencyState = Field(default_factory=EmergencyState)
    camera_frame_url: Optional[str] = None


# --- Command Models (sent to SUMO) ---


class SignalCommand(BaseModel):
    intersection_id: str
    phase_index: Optional[int] = None
    state_string: Optional[str] = None
    duration_s: Optional[float] = None


class PolicyDecision(BaseModel):
    commands: List[SignalCommand]
    reason: str = ""


# --- API Request/Response Models ---


class ActuatedPolicyParams(BaseModel):
    """Tunable parameters for the leftover-queue actuated controller."""
    base_green_n: float = Field(default=15.0, ge=5.0, le=60.0)
    base_green_s: float = Field(default=15.0, ge=5.0, le=60.0)
    base_green_e: float = Field(default=35.0, ge=5.0, le=60.0)
    base_green_w: float = Field(default=35.0, ge=5.0, le=60.0)
    min_green: float = Field(default=10.0, ge=3.0, le=30.0)
    max_green: float = Field(default=50.0, ge=20.0, le=120.0)
    max_redist_s: float = Field(default=12.0, ge=0.0, le=30.0)
    smooth_alpha: float = Field(default=0.7, ge=0.0, le=1.0)


class AlineaPolicyParams(BaseModel):
    """Tunable parameters for the ALINEA ramp-metering controller.

    Standard closed-loop occupancy-feedback law:
        r(k) = clamp( r(k-1) + K * (o_target - o_measured(k)), r_min, r_max )
    """
    target_occupancy_pct: float = Field(default=20.0, ge=10.0, le=35.0)
    gain_K: float = Field(default=70.0, ge=10.0, le=200.0)
    r_min_vph: float = Field(default=240.0, ge=120.0, le=600.0)
    r_max_vph: float = Field(default=1800.0, ge=900.0, le=2400.0)
    control_interval_s: float = Field(default=30.0, ge=10.0, le=120.0)
    queue_max_veh: int = Field(default=20, ge=10, le=80)
    green_s: float = Field(default=2.0, ge=1.0, le=6.0)
    yellow_s: float = Field(default=1.0, ge=0.5, le=2.0)


class SimulationConfig(BaseModel):
    # Top-level mode discriminator — drives entirely separate code paths.
    # "sumo" = synthetic 3x2 arterial + policies (the comparison-runs path).
    # "carla" = CARLA TrafficManager on Town10HD; dashboard data sourced live
    # from CARLA actors. The two modes do NOT share state.
    mode: Literal["sumo", "carla"] = "sumo"

    # Which SUMO network to load when mode == "sumo".
    network_type: Literal["arterial", "highway_metered", "combined"] = "arterial"

    policy_type: PolicyType = PolicyType.FIXED_TIME
    # Combined-network only: independent policy for the 4 ramp meters.
    # When None (the default) the combined branch falls back to deriving
    # both halves from policy_type using the legacy single-picker matrix.
    # When set, the arterial half follows policy_type (fixed_time/actuated)
    # and the ramp half follows ramp_policy_type (fixed_time/ramp_binary/
    # ramp_alinea). Ignored on non-combined networks.
    ramp_policy_type: Optional[PolicyType] = None
    tick_rate: int = 10
    seed: int = 42
    duration_ticks: Optional[int] = None  # None = run indefinitely
    demand_profile: Literal["balanced", "asym", "extreme"] = "balanced"
    total_vehicles: int = Field(default=5500, ge=500, le=15000)
    dominant_direction: Literal["EW", "NS"] = "EW"  # only used when demand_profile == "asym"
    gui: bool = False  # Launch SUMO-GUI if True, headless sumo if False
    race_mode: bool = False  # Run until all vehicles have cleared the network
    policy_params: Optional[ActuatedPolicyParams] = None  # only used when policy_type == "actuated"
    alinea_params: Optional[AlineaPolicyParams] = None    # only used when policy_type == "ramp_alinea"

    # Used only when mode == "carla":
    carla_vehicle_count: int = Field(default=80, ge=30, le=200)


class SimulationInfo(BaseModel):
    run_id: Optional[str] = None
    status: SimulationStatus = SimulationStatus.IDLE
    tick: int = 0
    sim_time: float = 0.0
    config: Optional[SimulationConfig] = None


class ExperimentRequest(BaseModel):
    name: str
    description: str = ""
    baseline_policy: PolicyType = PolicyType.FIXED_TIME
    treatment_policy: PolicyType = PolicyType.ACTUATED
    demand_profile: str = "default"
    duration_ticks: int = 3600
    seed: int = 42
    repetitions: int = 1


ComparisonRunStatus = Literal["pending", "running", "completed", "failed", "cancelled"]
ComparisonExperimentStatus = Literal[
    "pending", "running", "completed", "cancelled", "failed"
]


class ComparisonRunResult(BaseModel):
    # None when the run was time-limited (didn't clear the network).
    clearance_s: Optional[float] = None
    avg_trip_time_s: float = 0.0
    completed_trips: int = 0
    avg_control_delay_s: float = 0.0
    throughput_veh_per_min: float = 0.0


class ComparisonRun(BaseModel):
    run_id: str
    config: SimulationConfig
    status: ComparisonRunStatus = "pending"
    result: Optional[ComparisonRunResult] = None
    error: Optional[str] = None


class ComparisonRequest(BaseModel):
    name: str = ""
    seed: int = 42
    runs: List[SimulationConfig] = Field(..., min_length=2)


class ComparisonExperiment(BaseModel):
    experiment_id: str
    name: str
    seed: int
    status: ComparisonExperimentStatus = "pending"
    current_run_idx: int = -1
    runs: List[ComparisonRun]
    created_at: float


class EmergencyInjectRequest(BaseModel):
    route_edges: List[str]  # List of SUMO edge IDs for the route
    vehicle_id: Optional[str] = None  # Auto-generated if not provided


class EmergencyDispatchRequest(BaseModel):
    from_intersection: str
    to_intersection: str
    vehicle_type: str = "ambulance"  # ambulance | fire_truck | police
    label: Optional[str] = None


class EmergencyDispatchResponse(BaseModel):
    vehicle_id: str
    edges: List[str]
    route_intersections: List[str]

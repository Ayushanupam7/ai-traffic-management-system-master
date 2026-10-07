"""Constants for the 3x2 arterial intersection network."""

GRID_ROWS = 2
GRID_COLS = 3

# Intersection IDs matching SUMO traffic light IDs
# Columns A(west)-B(center)-C(east), Rows 0(south)-1(north)
INTERSECTION_IDS = [
    "A0", "A1",
    "B0", "B1",
    "C0", "C1",
]

# Map grid position (row, col) to SUMO TL ID
GRID_TO_ID = {
    (0, 0): "A0", (0, 1): "B0", (0, 2): "C0",
    (1, 0): "A1", (1, 1): "B1", (1, 2): "C1",
}

# Approach directions
DIRECTIONS = ("N", "S", "E", "W")

# Intersection IDs per network type
NETWORK_INTERSECTIONS = {
    "arterial":        INTERSECTION_IDS,
    "highway_metered": ["E1", "E2", "W1", "W2"],
    # Combined network: full 3x2 grid + all 4 meters in a single sim.
    "combined":        INTERSECTION_IDS + ["E1", "E2", "W1", "W2"],
}

# Per-meter detection metadata used by the RampMeterController.
# downstream_lanes: highway lanes immediately past the merge — used for mean
#                   speed sampling to decide whether to throttle the meter.
# svc_in_edge: the short merge-ramp edge that feeds cars onto the highway.
#              Cars queueing for the meter sit on this edge (and one hop
#              upstream on svc_*_s*) — the snapshot mapping tags both.
METER_INFO = {
    "E1": {
        "downstream_lanes": ["hwy_E_s2_0", "hwy_E_s2_1", "hwy_E_s2_2", "hwy_E_s2_3"],
        "svc_in_edge":      "svc_E_s1",
    },
    "E2": {
        "downstream_lanes": ["hwy_E_s3_0", "hwy_E_s3_1", "hwy_E_s3_2", "hwy_E_s3_3"],
        "svc_in_edge":      "svc_E_s2",
    },
    "W1": {
        "downstream_lanes": ["hwy_W_s2_0", "hwy_W_s2_1", "hwy_W_s2_2", "hwy_W_s2_3"],
        "svc_in_edge":      "svc_W_s1",
    },
    "W2": {
        "downstream_lanes": ["hwy_W_s3_0", "hwy_W_s3_1", "hwy_W_s3_2", "hwy_W_s3_3"],
        "svc_in_edge":      "svc_W_s2",
    },
}

# Signal phase defaults (seconds)
MIN_GREEN = 5.0
MAX_GREEN = 60.0
DEFAULT_YELLOW = 3.0
ALL_RED_CLEARANCE = 2.0
DEFAULT_GREEN = 30.0

# Emergency vehicle preemption
EV_DETECTION_DISTANCE_M = 150.0  # meters before intersection to trigger preemption
MAX_STARVATION_S = 120.0  # max seconds a direction can be starved

# Simulation defaults
DEFAULT_TICK_RATE = 10  # ticks per second for real-time playback
DEFAULT_CV_FRAME_INTERVAL = 10  # run CV every N ticks
DEFAULT_DB_BATCH_SIZE = 50  # ticks to batch before DB insert

# Vehicle types
VEHICLE_TYPES = ("car", "truck", "bus", "motorcycle", "emergency")

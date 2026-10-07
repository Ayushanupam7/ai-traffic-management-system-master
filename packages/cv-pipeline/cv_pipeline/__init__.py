"""Computer vision pipeline: YOLOS (legacy) + custom YOLOv11m detector."""

from .classes import (
    CLASS_TO_VEHICLE_TYPE,
    EMERGENCY_CLASSES,
    MODEL_CLASS_NAMES,
    is_emergency,
    vehicle_type_for,
)
from .yolos_detector import Detection, YOLSDetector
from .yolov11_detector import DEFAULT_MODEL_PATH, TrackedDetection, YoloV11Detector
from .calibration import homography_from_cameraspec, homography_from_params
from .approach_analyzer import ApproachAnalyzer, ApproachResult, ApproachVehicle
from .regions import (
    ViolationDetector,
    compute_queue_counts,
    draw_forbidden_lines,
    draw_lanes_overlay,
    load_regions,
    regions_for,
    save_regions,
)

__all__ = [
    "Detection",
    "YOLSDetector",
    "YoloV11Detector",
    "TrackedDetection",
    "DEFAULT_MODEL_PATH",
    "vehicle_type_for",
    "is_emergency",
    "CLASS_TO_VEHICLE_TYPE",
    "EMERGENCY_CLASSES",
    "MODEL_CLASS_NAMES",
    "homography_from_cameraspec",
    "homography_from_params",
    "ApproachAnalyzer",
    "ApproachResult",
    "ApproachVehicle",
    "ViolationDetector",
    "compute_queue_counts",
    "draw_forbidden_lines",
    "draw_lanes_overlay",
    "load_regions",
    "save_regions",
    "regions_for",
]

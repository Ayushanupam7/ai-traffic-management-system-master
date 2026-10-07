"""Per-approach vision analytics: speed + queue + violations for one camera.

Wraps the YOLOv11m detector's tracking output with the capstone analytics
primitives (homography world-projection + smoothed per-track speed + stationary
queue detection + per-lane queue + red-light violations). One ApproachAnalyzer
instance handles one camera (one approach of one intersection); it owns its own
detector so ByteTrack IDs stay separate across cameras.

Produces, per frame, a queue count (+ per-lane breakdown), new violations, and a
list of vehicles with track_id, mapped VehicleType, speed, world position, and
is_queued / is_emergency flags — the inputs TRaffic's QueueLengths / VehicleState
need, plus the richer lane/violation analytics drawn on the stream.

If `log_dir` is given, every session writes per_track.csv, violations.csv, and a
summary.json — so the model's output is always persisted, not just streamed.
"""

from __future__ import annotations

import csv
import json
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from .regions import ViolationDetector, compute_queue_counts, point_in_polygon
from .yolov11_detector import YoloV11Detector

# Queue defaults (overridable; mirror the capstone analytics_config `queue:` block).
# 7.2 km/h (2 m/s) is the capstone convention — keeps our queue definition identical
# across our own analytics and this integration. (TRaffic's ground-truth carla_snapshot
# uses 3.5 m/s to catch CARLA TM cars creeping at reds; if their sim undercounts with
# 2 m/s, raise this per-scenario — it's the one knob.)
DEFAULT_QUEUE_SPEED_KMH = 7.2            # 2 m/s
DEFAULT_QUEUE_MIN_STATIONARY_SECONDS = 2.0

# Vehicle ground-contact reference point as fractions of the bbox: centered
# horizontally, 85% down (just above the bumper) for a stable ground projection.
VEHICLE_REF_X_FRAC = 0.50
VEHICLE_REF_Y_FRAC = 0.85


def pixel_to_world(H, px, py):
    """Apply homography H to a pixel (px, py) -> world (X, Y) on the ground plane."""
    src = np.array([px, py, 1.0])
    dst = H @ src
    if abs(dst[2]) < 1e-9:
        return None
    return (float(dst[0] / dst[2]), float(dst[1] / dst[2]))


def vehicle_ground_point(bbox_xyxy):
    """Pixel point used as the vehicle's ground-contact reference."""
    x1, y1, x2, y2 = bbox_xyxy
    return (
        float(x1 + VEHICLE_REF_X_FRAC * (x2 - x1)),
        float(y1 + VEHICLE_REF_Y_FRAC * (y2 - y1)),
    )


class _SpeedTracker:
    """Smoothed per-track speed (m/s) from world-position history."""

    SMOOTHING_WINDOW = 5

    def __init__(self, fps, homography):
        self.dt = 1.0 / fps
        self.H = homography
        self.world_history = {}
        self.speed_history = {}

    def update(self, frame_idx, track_id, bbox_xyxy):
        ref_x, ref_y = vehicle_ground_point(bbox_xyxy)
        world_xy = pixel_to_world(self.H, ref_x, ref_y)
        if world_xy is None:
            return 0.0, None
        history = self.world_history.setdefault(track_id, deque(maxlen=10))
        history.append((frame_idx, world_xy))
        if len(history) < 2:
            return 0.0, world_xy
        prev_frame, prev_xy = history[-2]
        dt = max(1, frame_idx - prev_frame) * self.dt
        dx = world_xy[0] - prev_xy[0]
        dy = world_xy[1] - prev_xy[1]
        raw = (dx * dx + dy * dy) ** 0.5 / dt
        speeds = self.speed_history.setdefault(track_id, deque(maxlen=self.SMOOTHING_WINDOW))
        speeds.append(raw)
        return sum(speeds) / len(speeds), world_xy


class _QueueTracker:
    """Marks a track queued after N continuous frames below the speed threshold."""

    def __init__(self, speed_threshold_kmh, min_stationary_seconds, fps):
        self.speed_threshold_mps = speed_threshold_kmh / 3.6
        self.min_stationary_frames = max(1, int(round(min_stationary_seconds * fps)))
        self.stationary_count = {}

    def is_queued(self, track_id, speed_mps) -> bool:
        if speed_mps < self.speed_threshold_mps:
            self.stationary_count[track_id] = self.stationary_count.get(track_id, 0) + 1
        else:
            self.stationary_count[track_id] = 0
        return self.stationary_count[track_id] >= self.min_stationary_frames


@dataclass
class ApproachVehicle:
    track_id: int
    class_name: str
    vehicle_type: str  # TRaffic VehicleType value
    speed_mps: float
    speed_kmh: float
    world_xy: Optional[tuple]
    is_queued: bool
    is_emergency: bool
    bbox: tuple


@dataclass
class ApproachResult:
    queue_count: int
    vehicles: list = field(default_factory=list)
    per_lane_queue: dict = field(default_factory=dict)   # {lane_id: count}, empty if no lanes
    violations: list = field(default_factory=list)        # new violations THIS frame

    @property
    def emergency_vehicles(self):
        return [v for v in self.vehicles if v.is_emergency]


class ApproachAnalyzer:
    """Speed + queue + violation analytics for a single approach camera.

    Args:
        homography: 3x3 pixel->world matrix (e.g. from calibration.homography_from_cameraspec).
        fps: frame rate, used for speed (dt) and the queue stationary window.
        detector: a YoloV11Detector; one is created if not supplied. Give each
            camera its OWN analyzer/detector so track IDs don't collide.
        zone: optional polygon restricting which detections count toward queue
            (used only when no lanes are defined). None = whole frame.
        lanes: optional [{"id", "polygon"}] — per-lane queue (overrides `zone`).
        forbidden_lines: optional [{"id", "points"}] — red-light violation lines.
        log_dir: if set, writes per_track.csv / violations.csv / summary.json.
    """

    def __init__(
        self,
        homography,
        fps,
        detector: Optional[YoloV11Detector] = None,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        conf: float = 0.25,
        iou: float = 0.5,
        queue_speed_kmh: float = DEFAULT_QUEUE_SPEED_KMH,
        queue_min_stationary_seconds: float = DEFAULT_QUEUE_MIN_STATIONARY_SECONDS,
        zone=None,
        lanes=None,
        forbidden_lines=None,
        log_dir=None,
    ):
        self.H = np.asarray(homography, dtype=float)
        self.conf = conf
        self.zone = zone
        self.lanes = lanes or []
        self.forbidden_lines = forbidden_lines or []
        self.detector = detector or YoloV11Detector(model_path=model_path, device=device, iou=iou)
        self._speed = _SpeedTracker(fps=fps, homography=self.H)
        self._queue = _QueueTracker(queue_speed_kmh, queue_min_stationary_seconds, fps)
        self._violation = ViolationDetector(self.forbidden_lines) if self.forbidden_lines else None
        self._frame_idx = -1

        # Logging (lazy: files open on the first update when log_dir is set).
        self._log_dir = Path(log_dir) if log_dir else None
        self._track_file = None
        self._track_writer = None
        self._viol_file = None
        self._viol_writer = None
        self._tracks_seen = set()
        self._total_violations = 0
        self._max_queue = 0

    def _ensure_logs(self):
        if self._log_dir is None or self._track_writer is not None:
            return
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._track_file = open(self._log_dir / "per_track.csv", "w", newline="")
        self._track_writer = csv.writer(self._track_file)
        self._track_writer.writerow(
            ["frame", "track_id", "class", "vehicle_type", "world_x", "world_y",
             "speed_kmh", "is_queued"]
        )
        self._viol_file = open(self._log_dir / "violations.csv", "w", newline="")
        self._viol_writer = csv.writer(self._viol_file)
        self._viol_writer.writerow(["frame", "track_id", "line_id", "light_state"])

    def update(self, frame, light_state: str = "unknown") -> ApproachResult:
        """Process one frame; returns queue/violation analytics for this approach.

        light_state: 'red'|'yellow'|'green'|'unknown' for the approach this frame
        (from the CARLA traffic light). Violations only fire on 'red'.
        """
        self._frame_idx += 1
        self._ensure_logs()
        tracked = self.detector.track(frame, confidence_threshold=self.conf)

        vehicles = []
        detections = []
        for t in tracked:
            if t.track_id < 0:
                continue
            speed_mps, world_xy = self._speed.update(self._frame_idx, t.track_id, t.bbox)
            ref = vehicle_ground_point(t.bbox)
            in_zone = self.zone is None or point_in_polygon(ref, self.zone)
            is_queued = in_zone and self._queue.is_queued(t.track_id, speed_mps)
            vehicles.append(
                ApproachVehicle(
                    track_id=t.track_id, class_name=t.class_name,
                    vehicle_type=t.vehicle_type, speed_mps=speed_mps,
                    speed_kmh=speed_mps * 3.6, world_xy=world_xy,
                    is_queued=is_queued, is_emergency=t.is_emergency, bbox=t.bbox,
                )
            )
            detections.append(
                {"track_id": t.track_id, "point": ref,
                 "is_queued": is_queued, "speed_mps": speed_mps}
            )

        # Queue: per-lane if lanes defined, else count queued in zone/frame.
        per_lane = compute_queue_counts(self.lanes, detections) if self.lanes else {}
        queue_count = sum(per_lane.values()) if self.lanes else sum(
            1 for v in vehicles if v.is_queued
        )

        # Red-light violations (only fire on red).
        violations = (
            self._violation.check(detections, light_state, self._frame_idx)
            if self._violation else []
        )

        # Logging
        if self._track_writer is not None:
            for v in vehicles:
                self._tracks_seen.add(v.track_id)
                wx, wy = v.world_xy if v.world_xy else (0.0, 0.0)
                self._track_writer.writerow(
                    [self._frame_idx, v.track_id, v.class_name, v.vehicle_type,
                     round(wx, 3), round(wy, 3), round(v.speed_kmh, 1), int(v.is_queued)]
                )
            for vio in violations:
                self._viol_writer.writerow(
                    [vio["frame"], vio["track_id"], vio["line_id"], light_state]
                )

        self._total_violations += len(violations)
        self._max_queue = max(self._max_queue, queue_count)

        return ApproachResult(
            queue_count=queue_count, vehicles=vehicles,
            per_lane_queue=per_lane, violations=violations,
        )

    def finalize(self):
        """Write summary.json and close log files. Safe to call once at session end."""
        if self._log_dir is None:
            return
        summary = {
            "frames": self._frame_idx + 1,
            "unique_tracks": len(self._tracks_seen),
            "total_violations": self._total_violations,
            "max_queue": self._max_queue,
            "lanes": [l["id"] for l in self.lanes],
            "forbidden_lines": [l["id"] for l in self.forbidden_lines],
        }
        (self._log_dir / "summary.json").write_text(json.dumps(summary, indent=2))
        if self._track_file:
            self._track_file.close()
        if self._viol_file:
            self._viol_file.close()
        self._track_writer = None
        self._viol_writer = None


def draw_overlay(frame, result: ApproachResult, lanes=None, forbidden_lines=None):
    """Annotate a BGR frame with the analyzer output: lanes (+ queue counts),
    vehicle boxes (red for emergency, green otherwise) with class + speed, and
    forbidden lines (thicker when a violation just fired). Mutates `frame`."""
    import cv2

    from .regions import draw_forbidden_lines, draw_lanes_overlay

    if lanes:
        per_lane = result.per_lane_queue or {}
        draw_lanes_overlay(frame, lanes, per_lane)

    for v in result.vehicles:
        x1, y1, x2, y2 = [int(c) for c in v.bbox]
        color = (0, 0, 255) if v.is_emergency else (0, 220, 0)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{v.class_name} {v.speed_kmh:.0f}km/h"
        cv2.putText(frame, label, (x1, max(12, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

    if forbidden_lines:
        draw_forbidden_lines(frame, forbidden_lines, active_violation=bool(result.violations))
    return frame

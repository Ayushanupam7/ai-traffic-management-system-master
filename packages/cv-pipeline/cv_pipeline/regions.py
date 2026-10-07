"""Lane polygons + forbidden-line (red-light violation) logic + per-camera region
storage. Geometry ported faithfully from the capstone analytics pipeline.

Regions are pixel-space, defined per camera:
    lanes:           [{"id": "lane1", "polygon": [[x, y], ...]}]
    forbidden_lines: [{"id": "stop1", "points": [[x1, y1], [x2, y2]]}]

They are stored per (intersection_id, approach):
    {"A0": {"N": {"lanes": [...], "forbidden_lines": [...]}, ...}, ...}
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np


def point_in_polygon(point, polygon) -> bool:
    """True if a pixel point is inside the polygon (list of [x, y] pixel coords)."""
    poly = np.array(polygon, dtype=np.int32)
    return cv2.pointPolygonTest(poly, (float(point[0]), float(point[1])), False) >= 0


def compute_queue_counts(lanes, detections) -> dict:
    """Count queued vehicles per lane.

    detections: list of dicts with at least {'point', 'is_queued'}. Each vehicle
    counts toward at most one lane. Returns {lane_id: count}.
    """
    counts = {lane["id"]: 0 for lane in lanes}
    for det in detections:
        if not det.get("is_queued"):
            continue
        for lane in lanes:
            if point_in_polygon(det["point"], lane["polygon"]):
                counts[lane["id"]] += 1
                break
    return counts


def _segment_side(p, a, b):
    """Signed cross product: which side of line A->B point P is on."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def _projection_param(p, a, b):
    """Parameter t of P's perpendicular projection onto segment A->B (in [0,1] = within)."""
    abx, aby = b[0] - a[0], b[1] - a[1]
    denom = abx * abx + aby * aby
    if denom == 0:
        return -1.0
    return ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / denom


class ViolationDetector:
    """Detects a tracked vehicle crossing a forbidden line while the light is red.

    Fires when the vehicle's ground point flips sides of the line segment (within
    the segment span) and the current light state is 'red'. Each (track, line)
    counts once.
    """

    def __init__(self, lines):
        self.lines = lines or []
        self.prev_side = {}
        self.flagged = set()

    def check(self, detections, light_state, frame_idx):
        """Return new violations this frame: [{track_id, line_id, frame}]."""
        new_violations = []
        is_red = light_state == "red"
        for det in detections:
            tid = det["track_id"]
            p = det["point"]
            for line in self.lines:
                a, b = line["points"][0], line["points"][1]
                raw = _segment_side(p, a, b)
                sign = 1 if raw > 0 else (-1 if raw < 0 else 0)
                key = (tid, line["id"])
                prev = self.prev_side.get(key)
                self.prev_side[key] = sign
                if prev is None or sign == 0 or prev == 0 or sign == prev:
                    continue  # no clean side flip
                t = _projection_param(p, a, b)
                if not (-0.1 <= t <= 1.1):
                    continue  # crossed the infinite line, but outside the segment
                if is_red and key not in self.flagged:
                    self.flagged.add(key)
                    new_violations.append(
                        {"track_id": tid, "line_id": line["id"], "frame": frame_idx}
                    )
        return new_violations


def draw_lanes_overlay(frame, lanes, queue_counts):
    """Draw lane polygons (translucent) with per-lane queue counts."""
    if not lanes:
        return
    overlay = frame.copy()
    for lane in lanes:
        poly = np.array(lane["polygon"], dtype=np.int32)
        cv2.fillPoly(overlay, [poly], (60, 60, 200))
        cv2.polylines(frame, [poly], True, (100, 100, 255), 2)
    cv2.addWeighted(overlay, 0.15, frame, 0.85, 0, frame)
    for lane in lanes:
        poly = np.array(lane["polygon"], dtype=np.int32)
        c = poly.mean(axis=0).astype(int)
        n = queue_counts.get(lane["id"], 0)
        label = f"{lane['id']}: {n} queued"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        bg = (0, 0, 200) if n > 0 else (40, 40, 40)
        cv2.rectangle(frame, (c[0] - 5, c[1] - th - 6), (c[0] + tw + 5, c[1] + 6), bg, -1)
        cv2.putText(frame, label, (c[0], c[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                    (255, 255, 255), 2)


def draw_forbidden_lines(frame, lines, active_violation=False):
    """Draw forbidden lines (red; thicker when a violation just fired)."""
    if not lines:
        return
    for line in lines:
        a = tuple(int(v) for v in line["points"][0])
        b = tuple(int(v) for v in line["points"][1])
        cv2.line(frame, a, b, (0, 0, 255), 4 if active_violation else 2)
        mid = ((a[0] + b[0]) // 2, (a[1] + b[1]) // 2)
        cv2.putText(frame, line["id"], (mid[0], mid[1] - 8), cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (0, 0, 255), 1)


# --------------------------------------------------------------------------- #
# Per-camera region storage
# --------------------------------------------------------------------------- #

def load_regions(path) -> dict:
    """Load the regions JSON ({intersection: {approach: {lanes, forbidden_lines}}})."""
    p = Path(path)
    if not p.exists():
        return {}
    return json.loads(p.read_text())


def save_regions(path, regions: dict) -> None:
    """Write the regions JSON."""
    Path(path).write_text(json.dumps(regions, indent=2))


def regions_for(regions: dict, intersection_id: str, approach: str):
    """Return (lanes, forbidden_lines) for one camera; ([], []) if none defined."""
    cam = regions.get(intersection_id, {}).get(approach, {})
    return cam.get("lanes", []), cam.get("forbidden_lines", [])

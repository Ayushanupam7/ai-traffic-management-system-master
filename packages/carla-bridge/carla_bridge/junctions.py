"""Junction + camera map loader.

Reads `packages/sumo-engine/configs/carla_junctions.json`, which maps our 6
logical intersection IDs (A0..C1) to specific junctions and 4 camera
transforms each in CARLA's Town03.

This file is hand-edited — it depends on which junctions of Town03 we pick
as our arterial's signalized crossings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Literal


Approach = Literal["N", "E", "S", "W"]


@dataclass
class CameraSpec:
    approach: Approach
    # CARLA world transform for the camera. x, y, z in meters; pitch/yaw/roll in degrees.
    x: float
    y: float
    z: float
    pitch: float
    yaw: float
    roll: float = 0.0
    width: int = 1280
    height: int = 720
    fov: float = 90.0


@dataclass
class JunctionSpec:
    intersection_id: str              # e.g., "A0"
    carla_junction_id: int            # CARLA's junction id in Town03
    cameras: List[CameraSpec]


DEFAULT_PATH = (
    Path(__file__).resolve().parents[2]
    / "sumo-engine" / "configs" / "carla_junctions.json"
)


def load_junction_map(path: Path | None = None) -> Dict[str, JunctionSpec]:
    """Load the intersection → junction + cameras mapping. Returns {} if the
    file doesn't exist (so the backend can still boot)."""
    p = path or DEFAULT_PATH
    if not p.exists():
        return {}
    raw = json.loads(p.read_text())
    out: Dict[str, JunctionSpec] = {}
    for entry in raw.get("junctions", []):
        cams = [CameraSpec(**c) for c in entry.get("cameras", [])]
        spec = JunctionSpec(
            intersection_id=entry["intersection_id"],
            carla_junction_id=entry["carla_junction_id"],
            cameras=cams,
        )
        out[spec.intersection_id] = spec
    return out

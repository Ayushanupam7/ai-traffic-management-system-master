"""Build a TickData from live CARLA actor state.

Used only in CARLA-only run mode. The output is shape-compatible with what
sumo_engine.snapshot.extract_tick_data produces, so the existing dashboard
pipeline (WS broadcast → Zustand store → grid/metrics widgets) renders it
without changes.

What we populate:
  - VehicleState[] from `vehicle.*` actors
  - IntersectionState[] for each entry in carla_junctions.json:
      * queue counts per N/E/S/W approach (slow vehicles within ~30 m,
        bucketed by quadrant)
      * signal_state + phase_index synthesized from CARLA TrafficLights
        at the junction
  - MetricsSnapshot: total_vehicles, total_halting, avg vehicle speed
    (we don't compute trip time / completed_trips / throughput — CARLA TM
    cars wander indefinitely so those metrics aren't meaningful here)
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from shared.types import (
    EmergencyState,
    IntersectionState,
    MetricsSnapshot,
    QueueLengths,
    TickData,
    VehicleState,
    VehicleType,
)

from .junctions import JunctionSpec


QUEUE_RADIUS_M = 60.0           # vehicles within this distance count for the junction
                                # 30m was too tight — a queue of 5+ cars on a real arterial
                                # spans 40–50 m and was getting clipped.
QUEUE_SPEED_THRESHOLD = 3.5     # m/s — slightly above the SUMO 2.8 m/s convention because
                                # CARLA TM cars creep at ~3 m/s while waiting (still queued).
PHASE_GROUP_BY_DIR = {"N": 0, "E": 3, "S": 6, "W": 9}  # phase_index for "<dir> green"


def _junction_center(spec: JunctionSpec) -> Tuple[float, float]:
    """Junction center = mean of its 4 camera world positions."""
    if not spec.cameras:
        return 0.0, 0.0
    cx = sum(c.x for c in spec.cameras) / len(spec.cameras)
    cy = sum(c.y for c in spec.cameras) / len(spec.cameras)
    return cx, cy


def _classify_quadrant(dx: float, dy: float) -> str:
    """Bucket a vehicle's offset from junction center into N/E/S/W."""
    if abs(dy) >= abs(dx):
        return "N" if dy < 0 else "S"   # CARLA: y+ is south
    return "E" if dx > 0 else "W"


def _carla_state_to_sub(state_name: str) -> str:
    """Map CARLA TrafficLightState → our sub-phase letter ('G', 'y', 'r')."""
    s = (state_name or "").lower()
    if "green" in s:
        return "G"
    if "yellow" in s:
        return "y"
    return "r"  # Red, Off, Unknown all → red


def _build_signal_state(active_dir: str, sub: str) -> str:
    """Produce an 8-char signal_state string, lit on the active direction.

    The dashboard's IntersectionNode reads `signal_state` as a string of per-
    link colors. We don't model lanes precisely in CARLA mode — the indicator
    just needs to reflect 'this direction is currently <color>' which the
    UI derives from phase_index alone. The 8-char shape is preserved for
    compatibility with type validators.
    """
    base = ["r"] * 8
    # Position 0 corresponds to N, 2 to E, 4 to S, 6 to W (rough quadrant map).
    pos_map = {"N": 0, "E": 2, "S": 4, "W": 6}
    idx = pos_map.get(active_dir, 0)
    if sub == "G":
        base[idx] = "G"
    elif sub == "y":
        base[idx] = "y"
    return "".join(base)


def _yaw_to_dir(yaw_deg: float) -> str:
    """CARLA yaw of a TL pole's face direction → which approach it controls.
    Yaw 0=+x (E), 90=+y (S), 180=-x (W), 270=-y (N).
    """
    y = yaw_deg % 360.0
    if 45 <= y < 135:
        return "S"
    if 135 <= y < 225:
        return "W"
    if 225 <= y < 315:
        return "N"
    return "E"


def _group_tls_by_junction(world: Any) -> Dict[int, List[Any]]:
    """Map carla_junction_id → list of TrafficLight actors at that junction."""
    out: Dict[int, List[Any]] = {}
    smap = world.get_map()
    for tl in world.get_actors().filter("traffic.traffic_light*"):
        try:
            wp = smap.get_waypoint(tl.get_location())
            j = wp.get_junction() if wp else None
            if j is None:
                continue
            out.setdefault(int(j.id), []).append(tl)
        except Exception:
            continue
    return out


def _intersection_signal(
    spec: JunctionSpec, tls: List[Any]
) -> Tuple[str, int, float]:
    """Synthesize (signal_state, phase_index, phase_remaining_s) for one junction
    from its associated TrafficLight actors. Returns ('rrrrrrrr', 0, 0) if
    nothing usable is found."""
    if not tls:
        return "rrrrrrrr", 0, 0.0

    # Pick the TL that is most "active" — green wins, else yellow, else red.
    rank = {"Green": 2, "Yellow": 1, "Red": 0, "Off": -1, "Unknown": -1}
    tls_sorted = sorted(
        tls, key=lambda tl: rank.get(str(tl.get_state()).split(".")[-1], -1), reverse=True
    )
    leader = tls_sorted[0]
    state_name = str(leader.get_state()).split(".")[-1]
    sub = _carla_state_to_sub(state_name)
    active_dir = _yaw_to_dir(leader.get_transform().rotation.yaw)
    base = PHASE_GROUP_BY_DIR.get(active_dir, 0)
    phase_index = base + (0 if sub == "G" else 1 if sub == "y" else 2)
    try:
        if sub == "G":
            remaining = max(0.0, leader.get_green_time() - leader.get_elapsed_time())
        elif sub == "y":
            remaining = max(0.0, leader.get_yellow_time() - leader.get_elapsed_time())
        else:
            remaining = max(0.0, leader.get_red_time() - leader.get_elapsed_time())
    except Exception:
        remaining = 0.0
    return _build_signal_state(active_dir, sub), phase_index, remaining


def build_tick_data(
    world: Any,
    junctions: Dict[str, JunctionSpec],
    tick: int,
    sim_time: float,
) -> TickData:
    """Read live CARLA state and produce a TickData."""
    # ---- 1) Vehicle list ----
    vehicle_actors = list(world.get_actors().filter("vehicle.*"))
    vehicle_states: List[VehicleState] = []
    vehicle_records: List[Tuple[float, float, float]] = []  # (x, y, speed)
    for v in vehicle_actors:
        try:
            loc = v.get_location()
            vel = v.get_velocity()
            speed = math.sqrt(vel.x * vel.x + vel.y * vel.y)
        except Exception:
            continue
        vehicle_states.append(
            VehicleState(
                id=str(v.id),
                type=VehicleType.CAR,
                x=float(loc.x),
                y=float(loc.y),
                speed=float(speed),
                lane_id="",
                accumulated_wait_s=0.0,
            )
        )
        vehicle_records.append((float(loc.x), float(loc.y), float(speed)))

    # ---- 2) Per-junction queues + signals ----
    tls_by_jid = _group_tls_by_junction(world)
    intersections: List[IntersectionState] = []
    for inter_id, spec in junctions.items():
        cx, cy = _junction_center(spec)
        ql = QueueLengths()
        nearby = 0
        wait_sum = 0.0
        for vx, vy, vspeed in vehicle_records:
            dx, dy = vx - cx, vy - cy
            if dx * dx + dy * dy > QUEUE_RADIUS_M * QUEUE_RADIUS_M:
                continue
            nearby += 1
            wait_sum += max(0.0, QUEUE_SPEED_THRESHOLD - vspeed)
            if vspeed >= QUEUE_SPEED_THRESHOLD:
                continue
            d = _classify_quadrant(dx, dy)
            setattr(ql, d, getattr(ql, d) + 1)

        signal_state, phase_index, phase_remaining_s = _intersection_signal(
            spec, tls_by_jid.get(spec.carla_junction_id, [])
        )
        avg_wait = (wait_sum / nearby) if nearby else 0.0
        intersections.append(
            IntersectionState(
                id=inter_id,
                signal_state=signal_state,
                phase_index=phase_index,
                phase_remaining_s=phase_remaining_s,
                queue_lengths=ql,
                vehicle_count=nearby,
                avg_wait_s=avg_wait,
            )
        )

    # ---- 3) Metrics ----
    total = len(vehicle_records)
    halting = sum(1 for _, _, s in vehicle_records if s < QUEUE_SPEED_THRESHOLD)
    avg_speed = (sum(s for _, _, s in vehicle_records) / total) if total else 0.0
    metrics = MetricsSnapshot(
        total_vehicles=total,
        total_completed=0,
        avg_delay_s=0.0,
        avg_travel_time_s=0.0,
        throughput_veh_per_min=0.0,
        total_halting=halting,
        avg_control_delay_s=0.0,
        control_delay_samples=0,
        avg_trip_time_s=0.0,
        completed_trips=0,
    )

    # `avg_speed` isn't a field in MetricsSnapshot today; if you want to expose
    # it later, add it to the shared model and the panel will pick it up.
    _ = avg_speed

    return TickData(
        tick=tick,
        sim_time=sim_time,
        intersections=intersections,
        vehicles=vehicle_states,
        metrics=metrics,
        emergency=EmergencyState(),
    )

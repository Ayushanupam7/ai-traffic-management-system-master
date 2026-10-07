"""Vision-sourced TickData for CARLA mode.

Sibling to `carla_snapshot.build_tick_data`, but the per-approach queue counts,
vehicle types, and speeds come from the YOLOv11m + analytics pipeline running on
the approach cameras instead of from CARLA actor ground truth. Signal state is
still read from the CARLA TrafficLight actors (reusing carla_snapshot helpers),
since that's the controller's own output, not something to infer from vision.

What this adds over the ground-truth builder:
  - real per-vehicle classification (the ground-truth builder hardcodes CAR)
  - emergency vehicles (ambulance/police_car/fire_truck) populate EmergencyState
    — impossible for the ground-truth builder to identify from actor state.

The output is shape-identical to build_tick_data, so the dashboard + adaptive
policy consume it unchanged. Selecting this builder vs. the ground-truth one is
the `use_vision` toggle (wired in carla_service — Phase D).

Note: the emergency *subtype* (ambulance vs police vs fire) is known on the
analyzer output but collapses to VehicleType.EMERGENCY here to stay within the
current shared schema. Surfacing the subtype needs an optional field added to
EmergencyVehicleInfo (coordinated change to shared/types.py).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from shared.types import (
    EmergencyState,
    EmergencyVehicleInfo,
    IntersectionState,
    MetricsSnapshot,
    QueueLengths,
    TickData,
    VehicleState,
    VehicleType,
)

from cv_pipeline import ApproachAnalyzer, homography_from_cameraspec, regions_for

from .carla_snapshot import _group_tls_by_junction, _intersection_signal
from .junctions import JunctionSpec

# (intersection_id, approach) -> value
FrameMap = Dict[Tuple[str, str], Any]            # -> BGR np.ndarray frame
AnalyzerMap = Dict[Tuple[str, str], ApproachAnalyzer]


# CARLA-mode queue threshold: matches carla_snapshot's ground-truth value, which
# is tuned to CARLA TrafficManager cars creeping at ~3 m/s while waiting at reds.
# Using the same threshold also makes the vision queue directly comparable to the
# ground-truth queue in the use_vision side-by-side toggle. (The ApproachAnalyzer
# library default stays at 2 m/s for real-video use; this is the CARLA override.)
CARLA_QUEUE_SPEED_KMH = 12.6  # 3.5 m/s


def build_analyzers(
    junctions: Dict[str, JunctionSpec],
    fps: float,
    model_path: Optional[str] = None,
    device: Optional[str] = None,
    conf: float = 0.25,
    queue_speed_kmh: float = CARLA_QUEUE_SPEED_KMH,
    queue_min_stationary_seconds: Optional[float] = None,
    regions: Optional[dict] = None,
    log_root=None,
) -> AnalyzerMap:
    """Build one ApproachAnalyzer per approach camera, auto-calibrated from its
    CameraSpec. Cameras whose angle never hits the ground are skipped + logged.

    Defaults the queue threshold to CARLA's 3.5 m/s convention (TM creep); pass
    queue_speed_kmh to override. The returned analyzers are stateful (tracker +
    speed history) — keep them across ticks; don't rebuild per frame.

    regions: optional per-camera lane/violation-line config (from cv_pipeline.load_regions).
        Each camera's lanes + forbidden_lines are looked up by (intersection, approach).
    log_root: optional dir; each camera logs to <log_root>/<intersection>_<approach>/.
    """
    extra: Dict[str, float] = {}
    if queue_speed_kmh is not None:
        extra["queue_speed_kmh"] = queue_speed_kmh
    if queue_min_stationary_seconds is not None:
        extra["queue_min_stationary_seconds"] = queue_min_stationary_seconds

    analyzers: AnalyzerMap = {}
    for inter_id, spec in junctions.items():
        for cam in spec.cameras or []:
            H = homography_from_cameraspec(cam)
            if H is None:
                print(f"[vision] skip {inter_id}/{cam.approach}: camera doesn't see the ground")
                continue
            lanes, forbidden_lines = (
                regions_for(regions, inter_id, cam.approach) if regions else ([], [])
            )
            log_dir = (
                str(Path(log_root) / f"{inter_id}_{cam.approach}") if log_root else None
            )
            analyzers[(inter_id, cam.approach)] = ApproachAnalyzer(
                homography=H,
                fps=fps,
                model_path=model_path,
                device=device,
                conf=conf,
                lanes=lanes,
                forbidden_lines=forbidden_lines,
                log_dir=log_dir,
                **extra,
            )
    return analyzers


def build_vision_tick_data(
    world: Any,
    junctions: Dict[str, JunctionSpec],
    tick: int,
    sim_time: float,
    frames: FrameMap,
    analyzers: AnalyzerMap,
) -> TickData:
    """Build a TickData from vision analytics on the approach cameras.

    Args:
        world: CARLA world (used only for signal_state). May be None — signals
            then default to all-red.
        junctions: {intersection_id: JunctionSpec}.
        tick, sim_time: passed through unchanged.
        frames: {(intersection_id, approach): latest BGR frame}. Missing cameras
            are simply skipped (that approach contributes 0).
        analyzers: {(intersection_id, approach): ApproachAnalyzer} — persistent
            across ticks (hold tracker/speed state).
    """
    tls_by_jid = _group_tls_by_junction(world) if world is not None else {}

    intersections = []
    all_vehicles = []
    emergency = []
    total_halting = 0

    for inter_id, spec in junctions.items():
        ql = QueueLengths()
        vcount = 0

        for cam in spec.cameras or []:
            key = (inter_id, cam.approach)
            frame = frames.get(key)
            analyzer = analyzers.get(key)
            if frame is None or analyzer is None:
                continue

            res = analyzer.update(frame)
            setattr(ql, cam.approach, getattr(ql, cam.approach) + res.queue_count)

            for v in res.vehicles:
                vcount += 1
                if v.is_queued:
                    total_halting += 1
                x, y = v.world_xy if v.world_xy else (0.0, 0.0)
                vid = f"{inter_id}_{cam.approach}_{v.track_id}"
                all_vehicles.append(
                    VehicleState(
                        id=vid,
                        type=VehicleType(v.vehicle_type),
                        x=float(x),
                        y=float(y),
                        speed=float(v.speed_mps),
                        lane_id=cam.approach,
                    )
                )
                if v.is_emergency:
                    emergency.append(
                        EmergencyVehicleInfo(
                            id=vid,
                            x=float(x),
                            y=float(y),
                            target_intersection=inter_id,
                        )
                    )

        signal_state, phase_index, phase_remaining_s = _intersection_signal(
            spec, tls_by_jid.get(spec.carla_junction_id, [])
        )
        intersections.append(
            IntersectionState(
                id=inter_id,
                signal_state=signal_state,
                phase_index=phase_index,
                phase_remaining_s=phase_remaining_s,
                queue_lengths=ql,
                vehicle_count=vcount,
                avg_wait_s=0.0,  # vision doesn't track per-vehicle wait yet
            )
        )

    metrics = MetricsSnapshot(
        total_vehicles=len(all_vehicles),
        total_halting=total_halting,
    )

    return TickData(
        tick=tick,
        sim_time=sim_time,
        intersections=intersections,
        vehicles=all_vehicles,
        metrics=metrics,
        emergency=EmergencyState(active=emergency),
    )


def merge_vision_into_tick(tick_data: TickData, vision_results) -> TickData:
    """Hybrid mode: keep a ground-truth TickData, but override the *watched*
    approaches with vision.

    Only the camera(s) currently being viewed run our model; every other
    intersection stays on CARLA ground truth. For each viewed (intersection,
    approach) we replace that approach's queue count with the vision count and
    append any vision-detected emergency vehicles (which ground truth can't
    identify). All other intersections pass through untouched.

    Args:
        tick_data: a ground-truth TickData (from carla_snapshot.build_tick_data).
        vision_results: {(intersection_id, approach): ApproachResult} for the
            camera(s) being watched right now. Empty -> tick_data unchanged.

    Returns the same TickData instance, mutated in place.
    """
    if not vision_results:
        return tick_data

    inter_by_id = {i.id: i for i in tick_data.intersections}
    for (inter_id, approach), res in vision_results.items():
        inter = inter_by_id.get(inter_id)
        if inter is None:
            continue
        setattr(inter.queue_lengths, approach, res.queue_count)
        for v in res.emergency_vehicles:
            x, y = v.world_xy if v.world_xy else (0.0, 0.0)
            tick_data.emergency.active.append(
                EmergencyVehicleInfo(
                    id=f"{inter_id}_{approach}_{v.track_id}",
                    x=float(x),
                    y=float(y),
                    target_intersection=inter_id,
                )
            )
    return tick_data

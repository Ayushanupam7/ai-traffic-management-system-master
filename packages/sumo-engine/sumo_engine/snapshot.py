"""Per-tick state extraction from SUMO via TraCI subscriptions."""

from __future__ import annotations

from typing import Optional

import traci

from shared.constants import DIRECTIONS
from shared.types import (
    EmergencyState,
    IntersectionState,
    MetricsSnapshot,
    QueueLengths,
    TickData,
    VehicleState,
    VehicleType,
)

from .control_delay import ControlDelayTracker
from .trip_time import TripTimeTracker


def _classify_vehicle_type(vtype_id: str) -> VehicleType:
    """Map SUMO vehicle type ID to our VehicleType enum."""
    vtype_lower = vtype_id.lower()
    if "emergency" in vtype_lower or "ambulance" in vtype_lower or "fire" in vtype_lower:
        return VehicleType.EMERGENCY
    if "truck" in vtype_lower:
        return VehicleType.TRUCK
    if "bus" in vtype_lower:
        return VehicleType.BUS
    if "motorcycle" in vtype_lower or "moto" in vtype_lower:
        return VehicleType.MOTORCYCLE
    return VehicleType.CAR


def get_vehicle_states() -> list[VehicleState]:
    """Extract state of all active vehicles."""
    vehicles = []
    for veh_id in traci.vehicle.getIDList():
        x, y = traci.vehicle.getPosition(veh_id)
        vehicles.append(VehicleState(
            id=veh_id,
            type=_classify_vehicle_type(traci.vehicle.getTypeID(veh_id)),
            x=x,
            y=y,
            speed=traci.vehicle.getSpeed(veh_id),
            lane_id=traci.vehicle.getLaneID(veh_id),
            accumulated_wait_s=traci.vehicle.getAccumulatedWaitingTime(veh_id),
        ))
    return vehicles


def get_intersection_states() -> list[IntersectionState]:
    """Extract state of all traffic-light-controlled intersections."""
    states = []
    for tl_id in traci.trafficlight.getIDList():
        # Get controlled lanes grouped by approach direction
        controlled_lanes = traci.trafficlight.getControlledLanes(tl_id)
        queue_by_dir = {d: 0 for d in DIRECTIONS}
        vehicle_count = 0
        total_wait = 0.0
        wait_count = 0

        QUEUE_SPEED_THRESHOLD = 2.8  # m/s (~10 km/h)

        for lane_id in set(controlled_lanes):
            veh_ids = traci.lane.getLastStepVehicleIDs(lane_id)
            vehicle_count += len(veh_ids)

            # Determine direction from lane ID (heuristic based on SUMO naming)
            direction = _lane_to_direction(lane_id)

            # Count queued cars: any vehicle slower than threshold
            for veh_id in veh_ids:
                speed = traci.vehicle.getSpeed(veh_id)
                if direction and speed < QUEUE_SPEED_THRESHOLD:
                    queue_by_dir[direction] += 1
                total_wait += traci.vehicle.getAccumulatedWaitingTime(veh_id)
                wait_count += 1

        avg_wait = total_wait / wait_count if wait_count > 0 else 0.0

        # Get signal subscription results
        sub_results = traci.trafficlight.getSubscriptionResults(tl_id)
        signal_state = sub_results.get(
            traci.constants.TL_RED_YELLOW_GREEN_STATE,
            traci.trafficlight.getRedYellowGreenState(tl_id),
        )
        phase_index = sub_results.get(
            traci.constants.TL_CURRENT_PHASE,
            traci.trafficlight.getPhase(tl_id),
        )
        next_switch = sub_results.get(
            traci.constants.TL_NEXT_SWITCH,
            traci.simulation.getTime(),
        )
        phase_remaining = max(0.0, next_switch - traci.simulation.getTime())

        states.append(IntersectionState(
            id=tl_id,
            signal_state=signal_state,
            phase_index=phase_index,
            phase_remaining_s=round(phase_remaining, 1),
            queue_lengths=QueueLengths(**queue_by_dir),
            vehicle_count=vehicle_count,
            avg_wait_s=round(avg_wait, 2),
        ))
    return states


def get_metrics(
    vehicles: list[VehicleState],
    tracker: Optional[ControlDelayTracker] = None,
    trip_tracker: Optional[TripTimeTracker] = None,
) -> MetricsSnapshot:
    """Compute global metrics from current vehicle states."""
    halting = sum(1 for v in vehicles if v.speed < 0.1)
    total_wait = sum(v.accumulated_wait_s for v in vehicles)

    avg_cd = tracker.avg_control_delay_s if tracker else 0.0
    cd_samples = tracker.total_samples if tracker else 0
    avg_trip = trip_tracker.avg_trip_time_s if trip_tracker else 0.0
    trips = trip_tracker.completed_trips if trip_tracker else 0

    # Throughput = cumulative completed trips per minute of sim time.
    # NOTE: We deliberately do NOT use traci.simulation.getArrivedNumber()
    # here — that returns the count for the LAST step only (typically 0 or
    # 1), which gave nonsensical values like 0.01 veh/min instead of ~33.
    sim_time = max(traci.simulation.getTime(), 1.0)

    return MetricsSnapshot(
        total_vehicles=len(vehicles),
        total_completed=trips,
        avg_delay_s=round(total_wait / len(vehicles), 2) if vehicles else 0.0,
        throughput_veh_per_min=round(trips * 60 / sim_time, 2),
        total_halting=halting,
        avg_control_delay_s=round(avg_cd, 2),
        control_delay_samples=cd_samples,
        avg_trip_time_s=round(avg_trip, 2),
        completed_trips=trips,
    )


def extract_race_tick(
    tick: int,
    trip_tracker: Optional[TripTimeTracker] = None,
    tracker: Optional[ControlDelayTracker] = None,
) -> tuple[float, list[IntersectionState]]:
    """Lightweight tick for race mode — trackers + intersection states.

    Skips: per-vehicle states, halting/delay scans, MetricsSnapshot
    construction. Still updates the trip-time and control-delay trackers
    so the final snapshot at the end of a race carries honest cumulative
    values for those metrics (without them, the comparison results show
    avg_control_delay_s = 0 for every race row).
    """
    sim_time = traci.simulation.getTime()
    if trip_tracker is not None:
        trip_tracker.update(sim_time)
    if tracker is not None:
        tracker.update(sim_time)
    intersections = get_intersection_states()
    return sim_time, intersections


def extract_tick_data(
    tick: int,
    tracker: Optional[ControlDelayTracker] = None,
    trip_tracker: Optional[TripTimeTracker] = None,
) -> TickData:
    """Extract complete state snapshot for the current simulation tick."""
    sim_time = traci.simulation.getTime()

    if tracker is not None:
        tracker.update(sim_time)
    if trip_tracker is not None:
        trip_tracker.update(sim_time)

    vehicles = get_vehicle_states()
    intersections = get_intersection_states()
    metrics = get_metrics(vehicles, tracker, trip_tracker)

    from .emergency import get_active_emergency_vehicles
    emergency = EmergencyState(active=get_active_emergency_vehicles())

    return TickData(
        tick=tick,
        sim_time=sim_time,
        intersections=intersections,
        vehicles=vehicles,
        metrics=metrics,
        emergency=emergency,
    )


def _lane_to_direction(lane_id: str) -> Optional[str]:
    """Determine approach direction (N/S/E/W) from a SUMO grid lane ID.

    SUMO netgenerate grid edges are named by concatenating src+dst node IDs:
      - Interior: 'A0B0' (A0 -> B0), 'A0A1' (A0 -> A1), 'B1A1' (B1 -> A1)
      - Boundary inbound: 'left1A1', 'bottom0A0', 'top2C2', 'right1C1'

    Grid node IDs are [A-C][0-2] where letter = column (A west -> C east)
    and digit = row (0 south/bottom -> 2 north/top).

    The direction we return is the approach direction at the *destination*
    intersection — i.e. the compass from which the vehicle arrives.
    """
    # Strip the '_laneIndex' suffix to get the edge ID
    edge_id = lane_id.rsplit("_", 1)[0] if "_" in lane_id else lane_id
    if len(edge_id) < 4:
        return None

    # ---- Highway + service-road (ramp metered) edges ----
    # generate_highway.py uses two co-located junctions per meter:
    #   hwy_E1 (traffic-light) ← merge_E1 ← svc_E1
    # Cars queueing for the meter actually pile up on the merge ramp edge
    # (merge_E1 / merge_E2 / merge_W1 / merge_W2). We tag those as the meter's
    # signalized approach: 'W' for E-bound meters, 'E' for W-bound.
    if edge_id.startswith(("merge_E", "merge_W")):
        return "W" if edge_id.startswith("merge_E") else "E"

    if edge_id.startswith(("hwy_E_s", "svc_E_s", "hwy_W_s", "svc_W_s")):
        is_svc = edge_id.startswith("svc_")
        is_e   = "_E_" in edge_id
        # Edge IDs are like 'hwy_E_s1', 'hwy_E_s2_accel', 'svc_E_s3'.
        # We only tag s1/s2 segments (the ones that feed signal queues for
        # the controller); s3 and *_accel are downstream / extra and not
        # part of a meter's approach queue.
        # rsplit on the last '_s' gives the segment-and-suffix.
        suffix = edge_id.split("_s")[-1]      # e.g. "1", "1_accel", "2", "3"
        seg = suffix.split("_")[0]            # strip "_accel" if present
        if seg not in ("1", "2"):
            return None
        # The accel section past a meter isn't a queue location — skip it.
        if "_accel" in suffix:
            return None
        if is_svc:
            return "W" if is_e else "E"
        else:
            return "N" if is_e else "S"

    # ---- Combined-network feeder edges ----
    # The combined network bridges hwy_E_out / hwy_W_in to the arterial
    # grid via feeder edges (feed_E_to_grid_*, feed_grid_to_W_*). They
    # end at priority junctions, never at TLS, so they never show up in
    # any controlled-lane list — but skip explicitly for clarity.
    if edge_id.startswith("feed_"):
        return None

    # ---- Arterial grid edges ----
    # Destination is always a grid node at the tail of the edge name
    dst = edge_id[-2:]
    src = edge_id[:-2]
    if dst[0] not in "ABC" or dst[1] not in "01":
        return None

    dst_col = ord(dst[0]) - ord("A")
    dst_row = int(dst[1])

    # Grid-interior source: another [A-C][0-1] node
    if len(src) == 2 and src[0] in "ABC" and src[1] in "01":
        src_col = ord(src[0]) - ord("A")
        src_row = int(src[1])
        if src_row < dst_row:
            return "S"  # arrived from the south (lower row)
        if src_row > dst_row:
            return "N"  # arrived from the north (higher row)
        if src_col < dst_col:
            return "W"  # arrived from the west
        if src_col > dst_col:
            return "E"  # arrived from the east
        return None

    # Boundary source tokens from netgenerate
    if src.startswith("left"):
        return "W"
    if src.startswith("right"):
        return "E"
    if src.startswith("bottom"):
        return "S"
    if src.startswith("top"):
        return "N"

    return None

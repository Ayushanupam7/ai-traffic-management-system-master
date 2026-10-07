"""Control-delay tracker — measures per-intersection signal impact.

We define **control delay** the same way HCM (Highway Capacity Manual) does:
the extra time a vehicle spends near a traffic light beyond what it would
have taken to traverse that same stretch of road at free flow.

Mechanism:

* For every traffic-light-controlled intersection, watch the last
  ``ZONE_LENGTH_M`` meters of each incoming lane. Call that the *zone*.
* When a vehicle first appears inside a zone, start a stopwatch and remember
  the free-flow baseline (zone_length / lane_max_speed).
* When the vehicle is no longer on that incoming lane (it has crossed the
  stop line into the junction's internal lane, or been removed), stop the
  stopwatch. The vehicle's control delay for that intersection is
  ``dwell_time - baseline``, clamped to >= 0.
* Accumulate those samples across the whole run and expose a running
  average. One car passing three lights contributes three samples — which
  is exactly what we want, since each signal either helped or hurt it.

This is more honest than the "last-tick average waiting time" metric we
were using before: it counts every vehicle that transited, not just the
ones that happen to still be on screen at the final tick.
"""

from __future__ import annotations

from typing import Dict, Set, Tuple

import traci


class ControlDelayTracker:
    """Rolls up control-delay samples across a run."""

    ZONE_LENGTH_M = 50.0

    def __init__(self) -> None:
        # {tl_id: {veh_id: (entry_sim_time, baseline_s)}}
        self._active: Dict[str, Dict[str, Tuple[float, float]]] = {}
        # Per-intersection completed samples
        self._sum_by_tl: Dict[str, float] = {}
        self._count_by_tl: Dict[str, int] = {}
        # Run-wide aggregates
        self._sum_total: float = 0.0
        self._count_total: int = 0
        # Cached topology (populated on first update)
        self._lanes_by_tl: Dict[str, Set[str]] = {}
        self._lane_info: Dict[str, Tuple[float, float]] = {}  # lane_id -> (length, max_speed)

    # ------------------------------------------------------------------
    # Topology caching
    # ------------------------------------------------------------------
    def _ensure_cache(self) -> None:
        if self._lanes_by_tl:
            return
        for tl_id in traci.trafficlight.getIDList():
            lanes: Set[str] = set()
            for lane_id in traci.trafficlight.getControlledLanes(tl_id):
                # Internal junction lanes start with ':' — we only want the
                # real approach lanes where cars queue up.
                if lane_id.startswith(":"):
                    continue
                lanes.add(lane_id)
                if lane_id not in self._lane_info:
                    length = traci.lane.getLength(lane_id)
                    max_speed = traci.lane.getMaxSpeed(lane_id)
                    self._lane_info[lane_id] = (length, max_speed)
            self._lanes_by_tl[tl_id] = lanes
            self._active[tl_id] = {}
            self._sum_by_tl[tl_id] = 0.0
            self._count_by_tl[tl_id] = 0

    # ------------------------------------------------------------------
    # Per-tick update
    # ------------------------------------------------------------------
    def update(self, sim_time: float) -> None:
        """Record entries/exits for the current tick."""
        self._ensure_cache()

        # Who is inside any zone right now, grouped by intersection
        current_in_zone: Dict[str, Set[str]] = {tl: set() for tl in self._lanes_by_tl}

        for tl_id, lanes in self._lanes_by_tl.items():
            for lane_id in lanes:
                length, max_speed = self._lane_info[lane_id]
                zone_start = max(0.0, length - self.ZONE_LENGTH_M)
                zone_len = length - zone_start
                baseline = zone_len / max_speed if max_speed > 0 else 0.0

                for veh_id in traci.lane.getLastStepVehicleIDs(lane_id):
                    try:
                        pos = traci.vehicle.getLanePosition(veh_id)
                    except traci.TraCIException:
                        continue
                    if pos >= zone_start:
                        current_in_zone[tl_id].add(veh_id)
                        if veh_id not in self._active[tl_id]:
                            self._active[tl_id][veh_id] = (sim_time, baseline)

        # Finalize samples for vehicles that just left the zone
        for tl_id, still_in in current_in_zone.items():
            active = self._active[tl_id]
            for veh_id in list(active.keys()):
                if veh_id in still_in:
                    continue
                entry_time, baseline = active.pop(veh_id)
                dwell = sim_time - entry_time
                control_delay = max(0.0, dwell - baseline)
                self._sum_by_tl[tl_id] += control_delay
                self._count_by_tl[tl_id] += 1
                self._sum_total += control_delay
                self._count_total += 1

    # ------------------------------------------------------------------
    # Readouts
    # ------------------------------------------------------------------
    @property
    def avg_control_delay_s(self) -> float:
        return self._sum_total / self._count_total if self._count_total else 0.0

    @property
    def total_samples(self) -> int:
        return self._count_total

    def per_intersection(self) -> Dict[str, Dict[str, float]]:
        return {
            tl_id: {
                "avg_control_delay_s": (
                    self._sum_by_tl[tl_id] / self._count_by_tl[tl_id]
                    if self._count_by_tl[tl_id]
                    else 0.0
                ),
                "samples": self._count_by_tl[tl_id],
            }
            for tl_id in self._sum_by_tl
        }

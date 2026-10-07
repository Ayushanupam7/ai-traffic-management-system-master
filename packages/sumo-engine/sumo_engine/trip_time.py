"""Trip-time tracker — measures departure-to-arrival time for every car.

Each tick, we check which vehicles just arrived (completed their trip)
and record `arrival_time - departure_time`.  The running average across
all completed trips is the primary evaluation metric.
"""

from __future__ import annotations

import traci


class TripTimeTracker:
    """Accumulates trip times across a run."""

    def __init__(self) -> None:
        self._sum: float = 0.0
        self._count: int = 0
        # Cache depart times: {veh_id: depart_time}
        self._depart_times: dict = {}

    def update(self, sim_time: float) -> None:
        """Call once per tick. Records departed and arrived vehicles."""
        # Track newly departed vehicles
        for veh_id in traci.simulation.getDepartedIDList():
            self._depart_times[veh_id] = sim_time

        # Record trip time for vehicles that just arrived
        for veh_id in traci.simulation.getArrivedIDList():
            depart_time = self._depart_times.pop(veh_id, None)
            if depart_time is not None:
                trip_time = sim_time - depart_time
                self._sum += trip_time
                self._count += 1

    @property
    def avg_trip_time_s(self) -> float:
        return self._sum / self._count if self._count else 0.0

    @property
    def completed_trips(self) -> int:
        return self._count

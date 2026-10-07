"""Ramp metering controller for the highway + service road network.

One independent state machine per meter (E1, E2, W1, W2). The meter signal
controls the merge connection from the service road onto the highway:

    Phase 0  merge green   (cars on svc may merge)
    Phase 1  merge red     (cars on svc queue up)
    Cycle is short (~20 s baseline).

Policy logic per cycle:
1. Sample the mean speed of cars on the highway lanes immediately
   downstream of the merge (over a short rolling window).
2. If the highway is moving freely (speed ≥ threshold) → "free" mode:
   nearly-full green, almost no red. Service road empties fast.
3. If the highway is slow → "metered" mode: short green + 10 s red,
   restricting the rate at which svc cars join the mainline.
4. Safety override: if the service-road queue grows beyond
   ``svc_queue_override`` the controller forces "free" mode to keep
   the side road from jamming back into the entry.

The controller emits ``SignalCommand(intersection_id, duration_s)`` on the
*next* tick after entering a new mode, sized to the green phase duration
for the chosen mode. TraCI applies that to phase 0 of the meter's TLS.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from shared.types import IntersectionState, PolicyDecision, SignalCommand


@dataclass
class MeterTuning:
    speed_threshold_mps: float = 16.7    # ≈ 60 km/h → below this, "slow"
    green_when_free: float    = 19.0
    red_when_free: float      = 1.0
    green_when_metered: float = 5.0
    red_when_metered: float   = 10.0
    svc_queue_override: int   = 20
    detector_window_s: float  = 6.0      # rolling window for downstream speed


class _MeterState:
    __slots__ = ("prev_phase", "mode", "speed_samples")

    def __init__(self) -> None:
        self.prev_phase: int = -1
        self.mode: str = "free"             # "free" | "metered"
        # rolling list of (sim_time, mean_speed_mps) samples — pruned every tick
        self.speed_samples: list[tuple[float, float]] = []


class RampMeterController:
    """Adaptive ramp metering. One TraCI handle per controller instance is
    required to read downstream speed; pass it on construction so the
    controller can sample lane speeds independently of the snapshot pipeline.
    """

    def __init__(
        self,
        traci_module=None,
        tuning: Optional[MeterTuning] = None,
        meter_info: Optional[Dict[str, dict]] = None,
    ) -> None:
        self.traci = traci_module
        self.tuning = tuning or MeterTuning()
        self.meter_info = meter_info or {}
        self._state: Dict[str, _MeterState] = {}

    # --------------------------------------------------------------- #
    def _ensure(self, tl_id: str) -> _MeterState:
        if tl_id not in self._state:
            self._state[tl_id] = _MeterState()
        return self._state[tl_id]

    def _sample_downstream_speed(self, tl_id: str) -> Optional[float]:
        """Return mean speed (m/s) across downstream highway lanes, or None
        if TraCI is unavailable or the lanes aren't found.
        """
        if self.traci is None:
            return None
        info = self.meter_info.get(tl_id)
        if info is None:
            return None
        lanes: List[str] = info.get("downstream_lanes", [])
        if not lanes:
            return None
        speeds: list[float] = []
        for lid in lanes:
            try:
                s = self.traci.lane.getLastStepMeanSpeed(lid)
                if s >= 0:
                    speeds.append(s)
            except Exception:
                # Lane might not exist in another network; tolerate it
                continue
        if not speeds:
            return None
        return sum(speeds) / len(speeds)

    def _svc_queue(self, intersection: IntersectionState) -> int:
        """Pick the queue length that represents the service-road approach.

        snapshot.py maps the svc_in_edge queue to either ``W`` (for E-bound
        meters) or ``E`` (for W-bound), so we just read the matching field.
        """
        qid = intersection.id
        q = intersection.queue_lengths
        if qid in ("E1", "E2"):
            return q.W
        if qid in ("W1", "W2"):
            return q.E
        return 0

    # --------------------------------------------------------------- #
    def decide(
        self,
        intersections: List[IntersectionState],
        sim_time: float,
    ) -> PolicyDecision:
        commands: List[SignalCommand] = []
        t = self.tuning

        for it in intersections:
            if it.id not in self.meter_info:
                continue
            st = self._ensure(it.id)
            current_phase = it.phase_index
            prev_phase = st.prev_phase
            st.prev_phase = current_phase

            # Sample speed every tick; keep rolling window
            speed = self._sample_downstream_speed(it.id)
            if speed is not None:
                st.speed_samples.append((sim_time, speed))
                cutoff = sim_time - t.detector_window_s
                st.speed_samples = [
                    s for s in st.speed_samples if s[0] >= cutoff
                ]

            # Decide regime
            mean_speed = (
                sum(s for _, s in st.speed_samples) / len(st.speed_samples)
                if st.speed_samples else None
            )
            queue = self._svc_queue(it)
            override = queue >= t.svc_queue_override
            slow    = mean_speed is not None and mean_speed < t.speed_threshold_mps
            new_mode = "metered" if (slow and not override) else "free"

            # On entry to phase 0 (merge green) we hand TraCI the duration
            # appropriate for the current mode. SUMO will run that long
            # before flipping to phase 1, which itself has a separate
            # duration we set via the snapshot loop (see simulation_service).
            entered_green = (
                prev_phase != current_phase and current_phase == 0
            )
            mode_changed = new_mode != st.mode

            if entered_green or mode_changed:
                green_dur = (
                    t.green_when_free if new_mode == "free"
                    else t.green_when_metered
                )
                commands.append(SignalCommand(
                    intersection_id=it.id,
                    duration_s=green_dur,
                ))
            st.mode = new_mode

        return PolicyDecision(commands=commands)

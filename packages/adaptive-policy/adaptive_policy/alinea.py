"""ALINEA ramp metering controller.

Closed-loop occupancy-feedback law from Papageorgiou et al. (1991):

    r(k) = clamp( r(k-1) + K * (o_target - o_measured(k)), r_min, r_max )

where r(k) is the metering rate (veh/h) at control interval k, o_measured is
the lane-occupancy (%) on the highway immediately downstream of the merge,
and o_target is the critical occupancy at the freeway-capacity knee
(typically 18-22 %).

The rate is converted into a metering cycle:
    cycle_s = 3600 / r
    red_s   = cycle_s - green_s - yellow_s

One independent ALINEA state machine per meter (E1, E2, W1, W2). Each meter's
TLS has phase 0 = merge green, phase 1 = merge red. We emit a SignalCommand
with duration_s sized to the current phase, so SUMO's setPhaseDuration
overrides the static cycle length.

Hooks for future corridor coordination (METALINE): the controller accepts an
optional ``corridor_state`` argument that's None today, and the per-meter
decide call could one day average occupancy across upstream/downstream
meters before running the update.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from shared.types import (
    AlineaPolicyParams,
    IntersectionState,
    PolicyDecision,
    SignalCommand,
)


@dataclass
class _MeterState:
    # Last metering rate (veh/h). Initialized at r_max so a fresh meter
    # starts permissive and only throttles when occupancy actually rises.
    r_prev: float = 0.0
    # Phase index observed on the last decide() call. Used to detect entry
    # into a new phase, which is when we (re-)apply the duration override.
    prev_phase: int = -1
    # Sim time at which the next ALINEA update is due.
    next_update_s: float = 0.0
    # Most recently computed red duration (s); cached so the same value
    # can be re-applied on each phase-1 entry until the next update tick.
    red_s: float = 0.0
    # True while a queue-override is forcing r_max (drained next update).
    queue_override: bool = False


class AlineaRampController:
    """ALINEA controller — one rate per meter, updated every
    ``control_interval_s``. ``decide()`` returns the SignalCommand list to
    apply this tick; the simulation loop hands it to ``apply_commands()``.
    """

    def __init__(
        self,
        traci_module=None,
        params: Optional[AlineaPolicyParams] = None,
        meter_info: Optional[Dict[str, dict]] = None,
        corridor_state=None,  # reserved for future METALINE coordination
    ) -> None:
        self.traci = traci_module
        self.params = params or AlineaPolicyParams()
        self.meter_info = meter_info or {}
        self.corridor_state = corridor_state
        self._state: Dict[str, _MeterState] = {}

    # ------------------------------------------------------------------ #
    def _ensure(self, tl_id: str) -> _MeterState:
        if tl_id not in self._state:
            # Start at r_max so the meter is permissive at sim start; the
            # first update tightens it if occupancy is already high.
            self._state[tl_id] = _MeterState(r_prev=self.params.r_max_vph)
        return self._state[tl_id]

    def _measure_occupancy(self, tl_id: str) -> Optional[float]:
        """Mean lane-occupancy (%) across the downstream highway lanes.

        SUMO's getLastStepOccupancy returns a fraction (0-1) per lane; we
        average across lanes and scale to %. Returns None if TraCI is
        unavailable or no lanes report.
        """
        if self.traci is None:
            return None
        info = self.meter_info.get(tl_id)
        if info is None:
            return None
        lanes: List[str] = info.get("downstream_lanes", [])
        if not lanes:
            return None
        occs: List[float] = []
        for lid in lanes:
            try:
                o = self.traci.lane.getLastStepOccupancy(lid)
                if o >= 0:
                    occs.append(o)
            except Exception:
                continue
        if not occs:
            return None
        return 100.0 * (sum(occs) / len(occs))

    def _svc_queue(self, intersection: IntersectionState) -> int:
        """Service-road queue feeding this meter.

        snapshot.py maps the svc_in_edge queue to W (for E-bound meters) or
        E (for W-bound). Matches the layout used by RampMeterController.
        """
        qid = intersection.id
        q = intersection.queue_lengths
        if qid in ("E1", "E2"):
            return q.W
        if qid in ("W1", "W2"):
            return q.E
        return 0

    def _alinea_update(
        self,
        state: _MeterState,
        occupancy_pct: Optional[float],
        queue: int,
    ) -> None:
        """Run the closed-loop update. Modifies ``state`` in place."""
        p = self.params

        # Queue safety override: ramp is filling up, free the meter for a
        # full interval so the queue can drain. Skip the feedback law.
        if queue >= p.queue_max_veh:
            state.r_prev = p.r_max_vph
            state.queue_override = True
        else:
            state.queue_override = False
            if occupancy_pct is not None:
                err = p.target_occupancy_pct - occupancy_pct
                r_new = state.r_prev + p.gain_K * err
                state.r_prev = max(p.r_min_vph, min(p.r_max_vph, r_new))
            # If we have no occupancy reading, keep r_prev unchanged.

        # Convert rate (veh/h) -> red duration (s) of one metering cycle.
        # cycle = 3600/r; red = cycle - green - yellow.
        cycle_s = 3600.0 / max(state.r_prev, 1e-3)
        state.red_s = max(0.0, cycle_s - p.green_s - p.yellow_s)

    # ------------------------------------------------------------------ #
    def decide(
        self,
        intersections: List[IntersectionState],
        sim_time: float,
    ) -> PolicyDecision:
        commands: List[SignalCommand] = []
        p = self.params

        for it in intersections:
            if it.id not in self.meter_info:
                continue
            st = self._ensure(it.id)
            current_phase = it.phase_index
            prev_phase = st.prev_phase
            st.prev_phase = current_phase

            # ALINEA update on the control-interval cadence (default 30 s).
            if sim_time >= st.next_update_s:
                occ = self._measure_occupancy(it.id)
                queue = self._svc_queue(it)
                self._alinea_update(st, occ, queue)
                st.next_update_s = sim_time + p.control_interval_s

            # Apply the duration override only on phase entry — once per
            # phase, so SUMO's countdown owns the timing within the phase.
            entered_phase = prev_phase != current_phase
            if entered_phase:
                if current_phase == 0:
                    # Merge green: fixed short duration.
                    commands.append(SignalCommand(
                        intersection_id=it.id,
                        duration_s=p.green_s,
                    ))
                elif current_phase == 1:
                    # Merge red: ALINEA-controlled length.
                    commands.append(SignalCommand(
                        intersection_id=it.id,
                        duration_s=st.red_s,
                    ))

        reason = "ALINEA occupancy-feedback metering"
        return PolicyDecision(commands=commands, reason=reason)

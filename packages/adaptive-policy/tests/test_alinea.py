"""Unit tests for the ALINEA ramp-metering controller."""

from __future__ import annotations

from typing import List

import pytest

from adaptive_policy.alinea import AlineaRampController, _MeterState
from shared.types import (
    AlineaPolicyParams,
    IntersectionState,
    QueueLengths,
)

METER_INFO = {
    "E1": {
        "downstream_lanes": ["hwy_E_s2_0", "hwy_E_s2_1"],
        "svc_in_edge": "svc_E_s1",
    },
}


class FakeLane:
    """TraCI lane stub. Returns a configurable occupancy fraction."""

    def __init__(self) -> None:
        self.occupancy_by_lane: dict[str, float] = {}

    def getLastStepOccupancy(self, lane_id: str) -> float:
        return self.occupancy_by_lane.get(lane_id, 0.0)


class FakeTraci:
    def __init__(self) -> None:
        self.lane = FakeLane()


def _intersection(meter_id: str, phase: int, svc_queue: int) -> IntersectionState:
    # svc-road queue lives in the W field for E-bound meters.
    q = QueueLengths(W=svc_queue) if meter_id.startswith("E") else QueueLengths(E=svc_queue)
    return IntersectionState(
        id=meter_id,
        signal_state="Gr",
        phase_index=phase,
        phase_remaining_s=0.0,
        queue_lengths=q,
        vehicle_count=0,
        avg_wait_s=0.0,
    )


def _make(params: AlineaPolicyParams = None, occupancy_pct_per_lane: float = 0.0):
    traci = FakeTraci()
    if occupancy_pct_per_lane > 0:
        for lid in METER_INFO["E1"]["downstream_lanes"]:
            traci.lane.occupancy_by_lane[lid] = occupancy_pct_per_lane / 100.0
    ctl = AlineaRampController(
        traci_module=traci,
        params=params or AlineaPolicyParams(),
        meter_info=METER_INFO,
    )
    return ctl, traci


def test_first_update_starts_at_r_max_and_responds_to_high_occupancy():
    """If occupancy > target, the rate should decrease from r_max."""
    p = AlineaPolicyParams(target_occupancy_pct=20.0, gain_K=70.0)
    ctl, _traci = _make(params=p, occupancy_pct_per_lane=40.0)  # 40% occ, target 20%

    its = [_intersection("E1", phase=0, svc_queue=0)]
    ctl.decide(its, sim_time=0.0)

    st = ctl._state["E1"]
    # r_new = r_max + K * (target - measured) = 1800 + 70 * (20 - 40) = 400
    assert st.r_prev == pytest.approx(400.0, abs=1e-3)
    # cycle = 3600/400 = 9s; red = 9 - 2 - 1 = 6s
    assert st.red_s == pytest.approx(6.0, abs=1e-3)


def test_saturation_at_r_min_when_occupancy_is_extreme():
    """Sustained high occupancy should drive the rate down to r_min, not below."""
    p = AlineaPolicyParams(
        target_occupancy_pct=20.0, gain_K=200.0,
        r_min_vph=300.0, control_interval_s=10.0,
    )
    ctl, _traci = _make(params=p, occupancy_pct_per_lane=60.0)

    its = [_intersection("E1", phase=0, svc_queue=0)]
    # Drive several control intervals; rate should clamp at r_min.
    for t in (0.0, 10.0, 20.0, 30.0, 40.0):
        ctl.decide(its, sim_time=t)

    assert ctl._state["E1"].r_prev == pytest.approx(p.r_min_vph, abs=1e-3)


def test_saturation_at_r_max_when_occupancy_is_below_target():
    """Sustained low occupancy should drive the rate back up to r_max."""
    p = AlineaPolicyParams(
        target_occupancy_pct=20.0, gain_K=200.0,
        r_max_vph=1800.0, control_interval_s=10.0,
    )
    # Start at r_min by faking initial state, then run with low occupancy.
    ctl, _traci = _make(params=p, occupancy_pct_per_lane=5.0)
    ctl._state["E1"] = _MeterState(r_prev=p.r_min_vph)

    its = [_intersection("E1", phase=0, svc_queue=0)]
    for t in (0.0, 10.0, 20.0, 30.0, 40.0):
        ctl.decide(its, sim_time=t)

    assert ctl._state["E1"].r_prev == pytest.approx(p.r_max_vph, abs=1e-3)


def test_queue_override_forces_r_max():
    """When the service-road queue meets queue_max, the controller must
    free the meter regardless of mainline occupancy."""
    p = AlineaPolicyParams(queue_max_veh=30)
    ctl, _traci = _make(params=p, occupancy_pct_per_lane=50.0)
    # Pre-state at a throttled rate so we can tell the override kicked in.
    ctl._state["E1"] = _MeterState(r_prev=300.0)

    its = [_intersection("E1", phase=0, svc_queue=30)]  # at threshold
    ctl.decide(its, sim_time=0.0)

    st = ctl._state["E1"]
    assert st.r_prev == pytest.approx(p.r_max_vph, abs=1e-3)
    assert st.queue_override is True


def test_command_emitted_only_on_phase_entry():
    """A duration override is applied on phase entry, not every tick."""
    ctl, _traci = _make()
    its = [_intersection("E1", phase=0, svc_queue=0)]

    # First call enters phase 0 -> emits one green command.
    dec = ctl.decide(its, sim_time=0.0)
    assert len(dec.commands) == 1
    assert dec.commands[0].duration_s == pytest.approx(ctl.params.green_s)

    # Same phase on the next tick -> no new command.
    dec = ctl.decide(its, sim_time=0.1)
    assert dec.commands == []


def test_phase_transition_emits_red_duration_from_alinea():
    """When the meter flips to phase 1 (red), the emitted duration should
    be the ALINEA-computed red_s from the last update."""
    p = AlineaPolicyParams(target_occupancy_pct=20.0, gain_K=70.0,
                           green_s=2.0, yellow_s=1.0)
    ctl, _traci = _make(params=p, occupancy_pct_per_lane=40.0)

    its_g = [_intersection("E1", phase=0, svc_queue=0)]
    its_r = [_intersection("E1", phase=1, svc_queue=0)]

    # Tick 1: phase 0 entry — runs ALINEA, sets red_s, emits green duration.
    ctl.decide(its_g, sim_time=0.0)
    red_s_expected = ctl._state["E1"].red_s
    assert red_s_expected == pytest.approx(6.0, abs=1e-3)

    # Tick 2: phase 1 entry — emits the cached red duration.
    dec = ctl.decide(its_r, sim_time=0.1)
    assert len(dec.commands) == 1
    assert dec.commands[0].duration_s == pytest.approx(red_s_expected)


def test_no_command_for_non_meter_intersection():
    """Intersections not in meter_info are ignored entirely."""
    ctl, _traci = _make()
    not_a_meter = _intersection("A0", phase=0, svc_queue=0)
    dec = ctl.decide([not_a_meter], sim_time=0.0)
    assert dec.commands == []
    assert "A0" not in ctl._state

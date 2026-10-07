"""Tests for the CompositePolicy."""

from __future__ import annotations

from adaptive_policy.composite import CompositePolicy
from shared.types import (
    IntersectionState,
    PolicyDecision,
    QueueLengths,
    SignalCommand,
)


class _StubController:
    """Returns a fixed list of commands every tick, ignoring inputs."""
    def __init__(self, commands, reason=""):
        self._commands = commands
        self._reason = reason

    def decide(self, intersections, sim_time):
        return PolicyDecision(commands=list(self._commands), reason=self._reason)


def _make_intersection(tl_id: str) -> IntersectionState:
    return IntersectionState(
        id=tl_id,
        signal_state="GG",
        phase_index=0,
        phase_remaining_s=0.0,
        queue_lengths=QueueLengths(),
        vehicle_count=0,
        avg_wait_s=0.0,
    )


def test_concatenates_commands_from_all_children():
    a = _StubController([SignalCommand(intersection_id="A0", duration_s=10.0)], reason="actuated")
    b = _StubController([SignalCommand(intersection_id="E1", duration_s=5.0)],  reason="alinea")
    composite = CompositePolicy([a, b])

    decision = composite.decide([_make_intersection("A0"), _make_intersection("E1")], sim_time=0.0)

    assert len(decision.commands) == 2
    ids = sorted(c.intersection_id for c in decision.commands)
    assert ids == ["A0", "E1"]
    assert "actuated" in decision.reason and "alinea" in decision.reason


def test_empty_when_all_children_empty():
    composite = CompositePolicy([
        _StubController([]),
        _StubController([]),
    ])
    decision = composite.decide([], sim_time=0.0)
    assert decision.commands == []


def test_handles_single_child():
    a = _StubController([SignalCommand(intersection_id="B0", duration_s=12.0)])
    composite = CompositePolicy([a])
    decision = composite.decide([_make_intersection("B0")], sim_time=0.0)
    assert len(decision.commands) == 1
    assert decision.commands[0].intersection_id == "B0"

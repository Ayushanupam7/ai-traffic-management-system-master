"""Composite policy: runs multiple sub-policies in tandem on one tick.

Use on networks that mix intersection types — e.g. the `combined` network
has arterial 4-way signals AND ramp meters, each needing their own
controller. Each child's `decide()` returns a `PolicyDecision`; we
concatenate the commands. Each child is responsible for ignoring
intersections it doesn't manage (which both `ActuatedController` and
`AlineaRampController` already do via `meter_info` / `phase_plan` guards).
"""

from __future__ import annotations

from typing import Iterable, List

from shared.types import IntersectionState, PolicyDecision, SignalCommand


class CompositePolicy:
    def __init__(self, children: Iterable[object]) -> None:
        self.children = list(children)

    def decide(
        self,
        intersections: List[IntersectionState],
        sim_time: float,
    ) -> PolicyDecision:
        commands: List[SignalCommand] = []
        reasons: List[str] = []
        for child in self.children:
            sub = child.decide(intersections, sim_time)
            commands.extend(sub.commands)
            if sub.reason:
                reasons.append(sub.reason)
        return PolicyDecision(commands=commands, reason=" | ".join(reasons))

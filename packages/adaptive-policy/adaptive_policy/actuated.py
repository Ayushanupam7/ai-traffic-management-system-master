"""Adaptive signal controller — leftover-queue policy.

At the end of each direction's green (the tick yellow starts), we record
how many cars are still queued.  After each full cycle we smooth the
readings and redistribute the green budget so undersupplied directions
get more time, taken equally from satisfied directions.

Each intersection adapts independently — no global offsets or
coordination assumptions.  Coordination emerges naturally: faster
clearing at one intersection reduces backups at its neighbors.

Phase plans
-----------
The controller accepts an optional ``phase_plan`` describing the TLS
program. Default plan = the arterial 4-phase split-phase TLS
(N → E → S → W). All-red phases between greens are implicit and not
part of the plan.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from shared.types import (
    ActuatedPolicyParams,
    IntersectionState,
    PolicyDecision,
    QueueLengths,
    SignalCommand,
)


DIRECTIONS = ["N", "E", "S", "W"]


@dataclass
class PhaseGroup:
    """One green-phase block in a TLS program.

    A group has a single green/yellow phase index and serves one approach
    direction in the arterial network.
    """
    name: str
    green_phase: int
    yellow_phase: int
    member_dirs: List[str]
    base_green: float


@dataclass
class PhasePlan:
    groups: List[PhaseGroup]

    # ----- precomputed lookups (filled by __post_init__) -----
    yellow_to_group: Dict[int, int] = field(default_factory=dict)
    green_to_group:  Dict[int, int] = field(default_factory=dict)
    group_for_dir:   Dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for idx, g in enumerate(self.groups):
            self.yellow_to_group[g.yellow_phase] = idx
            self.green_to_group[g.green_phase] = idx
            for d in g.member_dirs:
                self.group_for_dir[d] = idx


def default_arterial_plan(params: ActuatedPolicyParams) -> PhasePlan:
    """4-phase split: N(0,1) → E(3,4) → S(6,7) → W(9,10). All-reds at 2/5/8/11."""
    return PhasePlan(groups=[
        PhaseGroup("N", 0, 1, ["N"], params.base_green_n),
        PhaseGroup("E", 3, 4, ["E"], params.base_green_e),
        PhaseGroup("S", 6, 7, ["S"], params.base_green_s),
        PhaseGroup("W", 9, 10, ["W"], params.base_green_w),
    ])


# Backward-compat aliases used by the /signals/{id}/targets endpoint.
BASE_GREEN_BY_DIR = {"N": 15.0, "S": 15.0, "E": 35.0, "W": 35.0}
GREEN_PHASE_FOR_DIR = {"N": 0, "E": 3, "S": 6, "W": 9}
MIN_GREEN = 10.0
MAX_GREEN = 50.0
MAX_REDIST_S = 12.0
SMOOTH_ALPHA = 0.7


class IntersectionTracker:
    """Per-intersection state. Leftovers and targets are per-group, but
    the controller's public surface exposes per-direction view as well."""

    __slots__ = (
        "prev_phase",
        "leftovers",     # group index -> last cycle's leftover queue
        "smoothed",      # group index -> EMA-smoothed leftover
        "groups_seen",   # set of group indices that completed this cycle
        "targets",       # group index -> current green duration (s)
    )

    def __init__(self, plan: PhasePlan) -> None:
        self.prev_phase: int = -1
        n = len(plan.groups)
        self.leftovers: Dict[int, int] = {i: 0 for i in range(n)}
        self.smoothed: Optional[Dict[int, float]] = None
        self.groups_seen: set = set()
        self.targets: Dict[int, float] = {i: g.base_green for i, g in enumerate(plan.groups)}


class ActuatedController:
    """Leftover-queue green-time adjuster. Plan-driven (default: 4-phase NESW)."""

    def __init__(
        self,
        params: Optional[ActuatedPolicyParams] = None,
        phase_plan: Optional[PhasePlan] = None,
    ) -> None:
        p = params or ActuatedPolicyParams()
        self._params = p
        self.plan = phase_plan or default_arterial_plan(p)
        self.min_green: float = p.min_green
        self.max_green: float = p.max_green
        self.max_redist_s: float = p.max_redist_s
        self.smooth_alpha: float = p.smooth_alpha
        self._trackers: Dict[str, IntersectionTracker] = {}

    @property
    def base_green_by_dir(self) -> Dict[str, float]:
        """Per-direction view of base greens (for the /targets endpoint).
        For a multi-dir group, every member surfaces the group's base."""
        out: Dict[str, float] = {}
        for g in self.plan.groups:
            for d in g.member_dirs:
                out[d] = g.base_green
        # Fill any unmapped direction with the controller params for completeness.
        for d in DIRECTIONS:
            out.setdefault(d, {
                "N": self._params.base_green_n,
                "S": self._params.base_green_s,
                "E": self._params.base_green_e,
                "W": self._params.base_green_w,
            }[d])
        return out

    def _targets_by_dir(self, tr: IntersectionTracker) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for gi, g in enumerate(self.plan.groups):
            for d in g.member_dirs:
                out[d] = tr.targets[gi]
        for d in DIRECTIONS:
            out.setdefault(d, out.get(d, 0.0))
        return out

    def _ensure(self, tl_id: str) -> IntersectionTracker:
        if tl_id not in self._trackers:
            self._trackers[tl_id] = IntersectionTracker(self.plan)
        return self._trackers[tl_id]

    # ------------------------------------------------------------------ #
    # Cycle bookkeeping
    # ------------------------------------------------------------------ #
    def _record_leftover(self, tr: IntersectionTracker, group_idx: int, queue: int) -> None:
        tr.leftovers[group_idx] = queue
        tr.groups_seen.add(group_idx)
        if len(tr.groups_seen) == len(self.plan.groups):
            self._end_of_cycle(tr)
            tr.leftovers = {i: 0 for i in range(len(self.plan.groups))}
            tr.groups_seen = set()

    def _end_of_cycle(self, tr: IntersectionTracker) -> None:
        n = len(self.plan.groups)
        if tr.smoothed is None:
            tr.smoothed = {i: float(tr.leftovers[i]) for i in range(n)}
        else:
            for i in range(n):
                tr.smoothed[i] = (
                    self.smooth_alpha * tr.leftovers[i]
                    + (1 - self.smooth_alpha) * tr.smoothed[i]
                )
        self._redistribute(tr)

    def _redistribute(self, tr: IntersectionTracker) -> None:
        assert tr.smoothed is not None
        groups = list(range(len(self.plan.groups)))
        total_leftover = sum(tr.smoothed.values())

        if total_leftover <= 0:
            # All clear — drift back to base
            for i in groups:
                delta = self.plan.groups[i].base_green - tr.targets[i]
                if abs(delta) > 0.5:
                    step = max(-1.0, min(1.0, delta))
                    tr.targets[i] = round(tr.targets[i] + step, 1)
            return

        undersupplied = {i: tr.smoothed[i] for i in groups if tr.smoothed[i] > 0}
        satisfied = [i for i in groups if tr.smoothed[i] <= 0]

        if not satisfied:
            total_budget = sum(tr.targets.values())
            for i in groups:
                share = tr.smoothed[i] / total_leftover
                desired = total_budget * share
                delta = desired - tr.targets[i]
                cap = self.max_redist_s / len(groups)
                step = max(-cap, min(cap, delta))
                new_val = tr.targets[i] + step
                tr.targets[i] = round(max(self.min_green, min(self.max_green, new_val)), 1)
            return

        total_undersupplied = sum(undersupplied.values())
        max_donatable = sum(tr.targets[i] - self.min_green for i in satisfied)
        redist = min(self.max_redist_s, max_donatable)
        if redist <= 0:
            return

        per_donor = redist / len(satisfied)
        for i in satisfied:
            give = min(per_donor, tr.targets[i] - self.min_green)
            tr.targets[i] = round(tr.targets[i] - give, 1)

        for i, left in undersupplied.items():
            share = left / total_undersupplied
            gain = redist * share
            new_val = tr.targets[i] + gain
            tr.targets[i] = round(min(self.max_green, new_val), 1)

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def decide(
        self,
        intersections: List[IntersectionState],
        sim_time: float,
    ) -> PolicyDecision:
        commands: List[SignalCommand] = []

        for it in intersections:
            tr = self._ensure(it.id)
            current_phase = it.phase_index
            prev_phase = tr.prev_phase
            tr.prev_phase = current_phase

            # Detect yellow entry — preceding group's green just ended
            if (
                current_phase != prev_phase
                and current_phase in self.plan.yellow_to_group
            ):
                group_idx = self.plan.yellow_to_group[current_phase]
                group = self.plan.groups[group_idx]
                q: QueueLengths = it.queue_lengths
                queue_map = {"N": q.N, "E": q.E, "S": q.S, "W": q.W}
                # Sum queues across all member directions of this group.
                queue_sum = sum(queue_map[d] for d in group.member_dirs)
                self._record_leftover(tr, group_idx, queue_sum)

            # On green entry, push the group's current target duration
            if (
                current_phase != prev_phase
                and current_phase in self.plan.green_to_group
            ):
                group_idx = self.plan.green_to_group[current_phase]
                duration = tr.targets[group_idx]
                commands.append(SignalCommand(
                    intersection_id=it.id,
                    duration_s=duration,
                ))

        return PolicyDecision(commands=commands)

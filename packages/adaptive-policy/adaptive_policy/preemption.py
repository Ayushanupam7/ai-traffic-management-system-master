"""Emergency vehicle preemption with compensation logic."""

from __future__ import annotations

from shared.types import (
    EmergencyVehicleInfo,
    IntersectionState,
    SignalCommand,
)

# Phase indices for each approach direction (4-phase split-phase TLS)
# N=0, E=3, S=6, W=9  — confirmed by CLAUDE.md signal phase layout
_DIRECTION_PHASE: dict[str, int] = {"N": 0, "E": 3, "S": 6, "W": 9}


def _direction_from_edge(edge_id: str) -> str | None:
    """Parse a 4-char internal grid edge ID to determine travel direction.

    'A0B0' → 'E'  (vehicle travels east, approaching B0 from the west)
    Returns None for non-grid edges (boundary, junction-internal, etc.).
    """
    if len(edge_id) != 4:
        return None
    try:
        from_col = ord(edge_id[0]) - ord("A")
        from_row = int(edge_id[1])
        to_col   = ord(edge_id[2]) - ord("A")
        to_row   = int(edge_id[3])
    except (ValueError, TypeError):
        return None

    if to_col > from_col:
        return "E"
    if to_col < from_col:
        return "W"
    if to_row > from_row:
        return "N"
    return "S"


class PreemptionManager:
    """Handles signal preemption for emergency vehicles and post-preemption compensation."""

    def __init__(self) -> None:
        # {intersection_id: {ev_id, starved_directions}}
        self._preempted: dict[str, dict] = {}
        # {intersection_id: {direction: extra_green_owed_s}}
        self._compensation: dict[str, dict[str, float]] = {}

    def reset(self) -> None:
        """Clear all preemption state — call when a new simulation starts."""
        self._preempted.clear()
        self._compensation.clear()

    def check_preemption(
        self,
        intersections: list[IntersectionState],
        emergency_vehicles: list[EmergencyVehicleInfo],
    ) -> list[SignalCommand]:
        """Return signal commands that give green to approaching emergency vehicles.

        Uses each EV's current_edge (populated by emergency.get_active_emergency_vehicles)
        to determine the next intersection and approach direction.
        """
        commands: list[SignalCommand] = []
        currently_preempted: set[str] = set()
        valid_ids = {i.id for i in intersections}

        for ev in emergency_vehicles:
            if not ev.current_edge or ev.current_edge.startswith(":"):
                continue

            dest = ev.current_edge[2:]  # destination intersection ID
            direction = _direction_from_edge(ev.current_edge)
            if dest not in valid_ids or direction is None:
                continue

            currently_preempted.add(dest)
            commands.append(SignalCommand(
                intersection_id=dest,
                phase_index=_DIRECTION_PHASE[direction],
            ))

            if dest not in self._preempted:
                self._preempted[dest] = {
                    "ev_id": ev.id,
                    "starved": self._get_starved_directions(direction),
                }

        # Ended preemptions → accrue compensation debt
        ended = set(self._preempted.keys()) - currently_preempted
        for iid in ended:
            info = self._preempted.pop(iid)
            if iid not in self._compensation:
                self._compensation[iid] = {}
            for direction in info["starved"]:
                self._compensation[iid][direction] = (
                    self._compensation[iid].get(direction, 0) + 10.0
                )

        return commands

    def get_compensation_commands(
        self,
        intersections: list[IntersectionState],
    ) -> list[SignalCommand]:
        """Generate commands to compensate starved directions after preemption."""
        commands: list[SignalCommand] = []

        for intersection in intersections:
            iid = intersection.id
            if iid not in self._compensation:
                continue

            debt = self._compensation[iid]
            if not debt:
                del self._compensation[iid]
                continue

            max_dir = max(debt, key=lambda d: debt[d])
            owed = debt[max_dir]

            if owed > 0:
                commands.append(SignalCommand(
                    intersection_id=iid,
                    phase_index=_DIRECTION_PHASE[max_dir],
                    duration_s=min(owed, 15.0),
                ))
                debt[max_dir] = max(0.0, owed - 15.0)

                if all(v <= 0 for v in debt.values()):
                    del self._compensation[iid]

        return commands

    def is_preempted(self, intersection_id: str) -> bool:
        return intersection_id in self._preempted

    @staticmethod
    def _get_starved_directions(green_direction: str) -> list[str]:
        if green_direction in ("N", "S"):
            return ["E", "W"]
        return ["N", "S"]


preemption_manager = PreemptionManager()

"""Fixed-time signal controller — the baseline for A/B comparisons.

For the baseline, we rely on SUMO's auto-generated default traffic light
programs. This controller is a no-op that does not send any signal commands,
letting each intersection cycle through its default phases as configured
in the .net.xml file.

This is also useful because netgenerate creates valid programs that match
the number of controlled links at each intersection (which can vary).
"""

from __future__ import annotations

from typing import Union
from pathlib import Path

from shared.types import IntersectionState, PolicyDecision


class FixedTimeController:
    """No-op controller — defers to SUMO's built-in TLS programs."""

    def __init__(self, config_path: Union[str, Path, None] = None):
        self.config_path = config_path

    def decide(
        self,
        intersections,
        sim_time: float,
    ) -> PolicyDecision:
        """Do nothing — let SUMO's default TLS logic run."""
        return PolicyDecision(
            commands=[],
            reason="Fixed-time baseline (SUMO default TLS programs)",
        )

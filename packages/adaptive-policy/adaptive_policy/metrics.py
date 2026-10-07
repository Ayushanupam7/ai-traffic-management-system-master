"""Policy performance metrics computation."""

from __future__ import annotations

from dataclasses import dataclass, field

from shared.types import MetricsSnapshot, TickData


@dataclass
class RunningMetrics:
    """Accumulates metrics over a simulation run for summary statistics."""

    total_ticks: int = 0
    total_delay_sum: float = 0.0
    total_vehicles_seen: int = 0
    total_completed: int = 0
    total_halting_sum: int = 0
    peak_vehicles: int = 0
    delay_history: list[float] = field(default_factory=list)
    throughput_history: list[float] = field(default_factory=list)

    def update(self, tick_data: TickData) -> None:
        self.total_ticks += 1
        self.total_delay_sum += tick_data.metrics.avg_delay_s * tick_data.metrics.total_vehicles
        self.total_vehicles_seen += tick_data.metrics.total_vehicles
        self.total_completed = tick_data.metrics.total_completed
        self.total_halting_sum += tick_data.metrics.total_halting
        self.peak_vehicles = max(self.peak_vehicles, tick_data.metrics.total_vehicles)
        self.delay_history.append(tick_data.metrics.avg_delay_s)
        self.throughput_history.append(tick_data.metrics.throughput_veh_per_min)

    def summary(self) -> dict:
        """Compute summary statistics for the entire run."""
        avg_delay = (
            self.total_delay_sum / self.total_vehicles_seen
            if self.total_vehicles_seen > 0
            else 0.0
        )
        avg_throughput = (
            sum(self.throughput_history) / len(self.throughput_history)
            if self.throughput_history
            else 0.0
        )
        avg_halting = (
            self.total_halting_sum / self.total_ticks if self.total_ticks > 0 else 0.0
        )

        return {
            "total_ticks": self.total_ticks,
            "avg_delay_s": round(avg_delay, 2),
            "avg_throughput_veh_per_min": round(avg_throughput, 2),
            "total_completed": self.total_completed,
            "avg_halting_vehicles": round(avg_halting, 2),
            "peak_vehicles": self.peak_vehicles,
        }

"""Comparison experiment endpoints.

Queue N SimulationConfigs, run them sequentially, collect per-run metrics,
surface a results table. Progress is also streamed on the existing WS as
{"type": "experiment_update", ...}.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from shared.types import ComparisonExperiment, ComparisonRequest

from ..services.experiment_service import experiment_manager
from ..services.simulation_service import sim_manager

router = APIRouter()


@router.post("/comparison", response_model=ComparisonExperiment)
async def create_comparison(request: ComparisonRequest) -> ComparisonExperiment:
    """Queue a new comparison experiment and start its run loop."""
    if sim_manager.is_running:
        raise HTTPException(
            400,
            "A simulation is already running. Stop it before starting a comparison.",
        )
    return await experiment_manager.create(request)


@router.get("/", response_model=list[ComparisonExperiment])
async def list_experiments() -> list[ComparisonExperiment]:
    """List all experiments (most recent first)."""
    return await experiment_manager.list()


@router.get("/{experiment_id}", response_model=ComparisonExperiment)
async def get_experiment(experiment_id: str) -> ComparisonExperiment:
    exp = await experiment_manager.get(experiment_id)
    if exp is None:
        raise HTTPException(404, f"experiment {experiment_id} not found")
    return exp


@router.post("/{experiment_id}/cancel", response_model=ComparisonExperiment)
async def cancel_experiment(experiment_id: str) -> ComparisonExperiment:
    exp = await experiment_manager.cancel(experiment_id)
    if exp is None:
        raise HTTPException(404, f"experiment {experiment_id} not found")
    return exp

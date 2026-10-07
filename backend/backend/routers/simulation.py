"""Simulation control endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from shared.types import SimulationConfig, SimulationInfo, SimulationStatus

from ..services.simulation_service import sim_manager

router = APIRouter()


@router.post("/start", response_model=SimulationInfo)
async def start_simulation(config: Optional[SimulationConfig] = None):
    """Start a new simulation with the given configuration."""
    if sim_manager.is_running:
        raise HTTPException(400, "Simulation already running. Stop it first.")

    cfg = config or SimulationConfig()
    await sim_manager.start(cfg)
    return sim_manager.get_info()


@router.post("/stop", response_model=SimulationInfo)
async def stop_simulation():
    """Stop the current simulation."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    await sim_manager.stop()
    return sim_manager.get_info()


@router.post("/pause", response_model=SimulationInfo)
async def pause_simulation():
    """Pause the current simulation."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    sim_manager.pause()
    return sim_manager.get_info()


@router.post("/resume", response_model=SimulationInfo)
async def resume_simulation():
    """Resume a paused simulation."""
    if sim_manager.status != SimulationStatus.PAUSED:
        raise HTTPException(400, "Simulation is not paused.")

    sim_manager.resume()
    return sim_manager.get_info()


@router.get("/status", response_model=SimulationInfo)
async def get_simulation_status():
    """Get current simulation status."""
    return sim_manager.get_info()

"""Metrics endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from ..services.simulation_service import sim_manager

router = APIRouter()


@router.get("/current")
async def get_current_metrics():
    """Get the most recent per-tick snapshot.

    Returns the last tick data as long as a run exists — whether the sim
    is still running, paused, or has just finished. That lets callers grab
    final metrics of a completed run without racing the termination.
    """
    last_tick = sim_manager.last_tick_data
    if last_tick is None:
        raise HTTPException(400, "No simulation data available yet.")

    return {
        "run_id": sim_manager.get_info().run_id,
        "status": sim_manager.status.value,
        "tick": last_tick.tick,
        "sim_time": last_tick.sim_time,
        "metrics": last_tick.metrics.model_dump(),
        "intersections": [i.model_dump() for i in last_tick.intersections],
    }


@router.get("/history")
async def get_metrics_history(run_id: Optional[str] = None, limit: int = 100):
    """Get historical metrics from Supabase."""
    # This will query Supabase for historical data
    # Placeholder until logging service is connected
    return {"message": "Historical metrics endpoint — connect to Supabase", "limit": limit}

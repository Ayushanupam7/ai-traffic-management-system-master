"""Runs history endpoints — read-only views over Supabase simulation_runs,
global_metrics, and intersection_metrics."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..services.db_service import db_service


router = APIRouter()


@router.get("")
@router.get("/")
async def list_runs(limit: int = 50) -> list[dict]:
    """List recent simulation runs (most recent first)."""
    return await db_service.list_runs(limit=limit)


@router.get("/{run_id}")
async def get_run(run_id: str) -> dict:
    """Single simulation_runs row by id."""
    row = await db_service.get_run(run_id)
    if not row:
        raise HTTPException(404, f"run {run_id} not found")
    return row


@router.get("/{run_id}/metrics")
async def get_run_metrics(run_id: str) -> list[dict]:
    """Cycle-level global_metrics rows for the given run, ordered by tick."""
    return await db_service.get_run_global_metrics(run_id)


@router.get("/{run_id}/intersection-metrics")
async def get_run_intersection_metrics(run_id: str) -> list[dict]:
    """Cycle-level intersection_metrics rows for the given run,
    ordered by (intersection_id, tick)."""
    return await db_service.get_run_intersection_metrics(run_id)

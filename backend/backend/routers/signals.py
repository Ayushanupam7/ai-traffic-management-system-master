"""Signal control endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from shared.types import SignalCommand

from ..services.simulation_service import sim_manager

router = APIRouter()


@router.get("/")
async def get_all_signals():
    """Get signal states for all intersections."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.signals import get_all_signal_states
    return get_all_signal_states()


@router.get("/{intersection_id}")
async def get_signal(intersection_id: str):
    """Get signal state for a specific intersection."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.signals import get_signal_state
    try:
        return get_signal_state(intersection_id)
    except Exception as e:
        raise HTTPException(404, f"Intersection not found: {e}")


@router.get("/{intersection_id}/targets")
async def get_signal_targets(intersection_id: str):
    """Return per-direction base, current target, and delta (seconds).

    For the actuated policy, `target` is the live adaptive value and
    `delta` is how far it has drifted from the direction's base. For
    fixed_time, targets always equal the base.
    """
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from adaptive_policy.actuated import ActuatedController, BASE_GREEN_BY_DIR, DIRECTIONS

    policy = sim_manager._policy
    policy_name = type(policy).__name__ if policy else "None"

    # Bases come from the actuated controller's instance fields when available,
    # so user-tuned variants are reflected. Fixed-time falls back to module defaults.
    if isinstance(policy, ActuatedController):
        base_by_dir = policy.base_green_by_dir
    else:
        base_by_dir = BASE_GREEN_BY_DIR

    # For actuated, derive per-direction target from the controller's plan
    # (one group can serve multiple directions; all members share the target).
    target_by_dir = {d: base_by_dir[d] for d in DIRECTIONS}
    if isinstance(policy, ActuatedController):
        tr = policy._trackers.get(intersection_id)
        if tr is not None:
            for gi, g in enumerate(policy.plan.groups):
                for d in g.member_dirs:
                    target_by_dir[d] = tr.targets[gi]

    directions = {}
    for d in DIRECTIONS:
        base = base_by_dir[d]
        target = target_by_dir[d]
        directions[d] = {
            "base": round(base, 1),
            "target": round(target, 1),
            "delta": round(target - base, 1),
        }

    return {
        "intersection_id": intersection_id,
        "policy": policy_name,
        "directions": directions,
    }


@router.put("/{intersection_id}")
async def set_signal(intersection_id: str, command: SignalCommand):
    """Manually set signal state for an intersection."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    command.intersection_id = intersection_id
    from sumo_engine.signals import set_signal_state
    try:
        set_signal_state(command)
        return {"status": "ok", "applied": command.model_dump()}
    except Exception as e:
        raise HTTPException(400, f"Failed to apply signal command: {e}")

"""Emergency vehicle endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from shared.types import EmergencyDispatchRequest, EmergencyDispatchResponse, EmergencyInjectRequest

from ..services.simulation_service import sim_manager

router = APIRouter()


@router.post("/inject")
async def inject_emergency_vehicle(request: EmergencyInjectRequest):
    """Inject an emergency vehicle with a pre-computed edge route."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.emergency import inject_emergency_vehicle

    try:
        ev_id = inject_emergency_vehicle(
            route_edges=request.route_edges,
            vehicle_id=request.vehicle_id,
        )
        return {"status": "ok", "vehicle_id": ev_id}
    except Exception as e:
        raise HTTPException(400, f"Failed to inject emergency vehicle: {e}")


@router.post("/dispatch", response_model=EmergencyDispatchResponse)
async def dispatch_emergency_vehicle(request: EmergencyDispatchRequest):
    """Compute shortest route and dispatch an emergency vehicle."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.emergency import dispatch_emergency_vehicle
    from sumo_engine.ev_routing import bfs_path, edge_destination

    try:
        edges = bfs_path(request.from_intersection, request.to_intersection)
        vehicle_id = dispatch_emergency_vehicle(
            from_intersection=request.from_intersection,
            to_intersection=request.to_intersection,
            label=request.label,
            vehicle_type=request.vehicle_type,
        )
        route_intersections = [request.from_intersection] + [edge_destination(e) for e in edges]
        return EmergencyDispatchResponse(
            vehicle_id=vehicle_id,
            edges=edges,
            route_intersections=route_intersections,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"Failed to dispatch emergency vehicle: {e}")


@router.delete("/{vehicle_id}")
async def cancel_emergency_vehicle(vehicle_id: str):
    """Remove an active emergency vehicle from the simulation."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.emergency import cancel_emergency_vehicle

    try:
        cancel_emergency_vehicle(vehicle_id)
        return {"status": "ok", "vehicle_id": vehicle_id}
    except Exception as e:
        raise HTTPException(400, f"Failed to cancel emergency vehicle: {e}")


@router.get("/active")
async def get_active_emergency_vehicles():
    """Get status of all active emergency vehicles."""
    if not sim_manager.is_running:
        raise HTTPException(400, "No simulation is running.")

    from sumo_engine.emergency import get_active_emergency_vehicles

    return {"emergency_vehicles": [ev.model_dump() for ev in get_active_emergency_vehicles()]}

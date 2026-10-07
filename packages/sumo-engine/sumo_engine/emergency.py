"""Emergency vehicle injection, dispatch, and tracking via TraCI."""

from __future__ import annotations

import traci

from shared.types import EmergencyVehicleInfo


_EMERGENCY_VTYPE = "emergency"
_active_evs: dict[str, dict] = {}  # vehicle_id → {route_edges, injected_at_tick}
_ev_destinations: dict[str, str] = {}  # vehicle_id → destination intersection ID
_ev_counter = 0


def ensure_emergency_vtype() -> None:
    """Create the emergency vehicle type in SUMO if it doesn't exist."""
    existing_types = traci.vehicletype.getIDList()
    if _EMERGENCY_VTYPE not in existing_types:
        traci.vehicletype.copy("DEFAULT_VEHTYPE", _EMERGENCY_VTYPE)
        traci.vehicletype.setColor(_EMERGENCY_VTYPE, (255, 0, 0, 255))
        traci.vehicletype.setSpeedFactor(_EMERGENCY_VTYPE, 1.5)
        traci.vehicletype.setEmergencyDecel(_EMERGENCY_VTYPE, 9.0)


def inject_emergency_vehicle(route_edges: list[str], vehicle_id: str | None = None) -> str:
    """Inject an emergency vehicle into the simulation.

    Args:
        route_edges: Ordered list of SUMO edge IDs forming the route.
        vehicle_id: Custom ID, or auto-generated if None.

    Returns:
        The vehicle ID of the injected emergency vehicle.
    """
    global _ev_counter
    ensure_emergency_vtype()

    if vehicle_id is None:
        _ev_counter += 1
        vehicle_id = f"ev_{_ev_counter}"

    route_id = f"route_{vehicle_id}"
    traci.route.add(route_id, route_edges)
    traci.vehicle.add(
        vehicle_id,
        route_id,
        typeID=_EMERGENCY_VTYPE,
        departSpeed="max",
    )
    traci.vehicle.setSpeedMode(vehicle_id, 0)  # Disable all speed checks

    _active_evs[vehicle_id] = {
        "route_edges": route_edges,
        "injected_at_tick": int(traci.simulation.getTime()),
    }
    return vehicle_id


def dispatch_emergency_vehicle(
    from_intersection: str,
    to_intersection: str,
    label: str | None = None,
    vehicle_type: str = "ambulance",
) -> str:
    """Compute shortest route and inject an emergency vehicle.

    Returns the vehicle ID.
    """
    from .ev_routing import bfs_path, edge_destination

    global _ev_counter
    edges = bfs_path(from_intersection, to_intersection)
    if label:
        vid: str = label
    else:
        _ev_counter += 1
        vid = f"{vehicle_type}_{_ev_counter}"
    ev_id = inject_emergency_vehicle(edges, vid)
    _ev_destinations[ev_id] = edge_destination(edges[-1])
    return ev_id


def cancel_emergency_vehicle(vehicle_id: str) -> None:
    """Remove an active emergency vehicle from the simulation and registry."""
    try:
        if vehicle_id in traci.vehicle.getIDList():
            traci.vehicle.remove(vehicle_id)
    except Exception:
        pass
    _active_evs.pop(vehicle_id, None)
    _ev_destinations.pop(vehicle_id, None)


def get_active_emergency_vehicles() -> list[EmergencyVehicleInfo]:
    """Get info about all active emergency vehicles."""
    result = []
    arrived = set()

    for ev_id, meta in _active_evs.items():
        if ev_id not in traci.vehicle.getIDList():
            arrived.add(ev_id)
            continue

        x, y = traci.vehicle.getPosition(ev_id)

        # current_edge: the SUMO edge the vehicle is on right now.
        # Junction-internal edges start with ':' — skip them for preemption.
        raw_edge = traci.vehicle.getRoadID(ev_id)
        current_edge = raw_edge if raw_edge and not raw_edge.startswith(":") else None

        # Destination: last edge in route → destination intersection
        route_edges: list[str] = meta.get("route_edges", [])
        destination = _ev_destinations.get(ev_id, "")
        if not destination and route_edges:
            from .ev_routing import edge_destination
            destination = edge_destination(route_edges[-1])

        result.append(EmergencyVehicleInfo(
            id=ev_id,
            x=x,
            y=y,
            target_intersection=destination,
            current_edge=current_edge,
        ))

    for ev_id in arrived:
        del _active_evs[ev_id]
        _ev_destinations.pop(ev_id, None)

    return result


def clear_all() -> None:
    """Reset module state — call when simulation stops."""
    _active_evs.clear()
    _ev_destinations.clear()

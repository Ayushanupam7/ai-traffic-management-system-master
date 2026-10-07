"""Spawn vehicles into a CARLA world and hand them to the TrafficManager.

CARLA's TrafficManager handles the autopilot — vehicles obey traffic lights,
stop signs, and basic right-of-way. Per-vehicle aggressiveness can be tuned;
we keep defaults for predictable behavior in the camera feed.

Used only in the CARLA-only run mode. SUMO co-sim is gone.
"""

from __future__ import annotations

import random
from typing import Any, List


def spawn_traffic(
    client: Any,
    world: Any,
    count: int,
    tm_port: int = 8000,
) -> List[Any]:
    """Spawn up to `count` autopilot vehicles. Returns the list of actually-
    spawned actors (TM rejects spawns that would collide; the caller may end
    up with fewer than `count`).
    """
    import carla  # type: ignore[import-not-found]

    blueprints = [
        bp for bp in world.get_blueprint_library().filter("vehicle.*")
        # Skip 2-wheelers / bikes — they're harder to see from cameras.
        if int(bp.get_attribute("number_of_wheels").as_int() or 4) >= 4
    ]
    if not blueprints:
        blueprints = list(world.get_blueprint_library().filter("vehicle.*"))

    spawn_points = world.get_map().get_spawn_points()
    random.shuffle(spawn_points)

    tm = client.get_trafficmanager(tm_port)
    tm.set_synchronous_mode(False)
    tm.global_percentage_speed_difference(10.0)  # ~10% slower than limit

    spawned: List[Any] = []
    for transform in spawn_points:
        if len(spawned) >= count:
            break
        bp = random.choice(blueprints)
        if bp.has_attribute("color"):
            colors = bp.get_attribute("color").recommended_values
            if colors:
                bp.set_attribute("color", random.choice(colors))
        bp.set_attribute("role_name", "tm_autopilot")
        actor = world.try_spawn_actor(bp, transform)
        if actor is None:
            continue
        actor.set_autopilot(True, tm_port)
        spawned.append(actor)

    return spawned


def destroy_traffic(actors: List[Any]) -> None:
    for a in actors:
        try:
            a.set_autopilot(False)
        except Exception:
            pass
        try:
            a.destroy()
        except Exception:
            pass


def pause_traffic(world: Any, actors: List[Any]) -> None:
    """Freeze TM vehicles in place and stop traffic-light cycling.

    `set_simulate_physics(False)` freezes the actor at its current pose so
    it can't coast forward. `set_autopilot(False)` tells TrafficManager to
    stop sending control commands. `freeze_all_traffic_lights(True)` holds
    every TL in its current state so the scene is fully static.
    """
    for a in actors:
        try:
            a.set_autopilot(False)
        except Exception:
            pass
        try:
            a.set_simulate_physics(False)
        except Exception:
            pass
    try:
        world.freeze_all_traffic_lights(True)
    except Exception as e:
        print(f"[carla] freeze TLs failed: {e}")


def resume_traffic(world: Any, actors: List[Any], tm_port: int = 8000) -> None:
    """Reverse `pause_traffic`: re-enable physics + autopilot + TL cycling."""
    try:
        world.freeze_all_traffic_lights(False)
    except Exception as e:
        print(f"[carla] unfreeze TLs failed: {e}")
    for a in actors:
        try:
            a.set_simulate_physics(True)
        except Exception:
            pass
        try:
            a.set_autopilot(True, tm_port)
        except Exception:
            pass

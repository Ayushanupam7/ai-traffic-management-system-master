"""Thin wrapper around carla.Client with graceful fallback when CARLA isn't installed or reachable."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ConnectResult:
    connected: bool
    town: Optional[str] = None
    server_version: Optional[str] = None
    error: Optional[str] = None


def connect(
    host: str = "localhost",
    port: int = 2000,
    timeout_s: float = 5.0,
    town: Optional[str] = None,
) -> tuple[Optional[Any], ConnectResult]:
    """Attempt to connect to a running CARLA server.

    If `town` is None (recommended), use whatever map is already loaded.
    If a town is requested but a different one is loaded, we accept the
    loaded map rather than calling `load_world` — switching maps mid-session
    is risky on some GPUs and the user is expected to launch CARLA with the
    map they want.

    Returns (world, result). On failure `world` is None and `result.error`
    is set. Never raises — callers should check `result.connected`.
    """
    try:
        import carla  # type: ignore[import-not-found]
    except Exception as e:
        return None, ConnectResult(connected=False, error=f"carla package not installed: {e}")

    try:
        client = carla.Client(host, port)
        client.set_timeout(timeout_s)
        version = client.get_server_version()
        client_version = client.get_client_version()
        if version != client_version:
            print(f"[carla] server={version} client={client_version} (mismatch)")
        world = client.get_world()
        loaded_town = world.get_map().name.split("/")[-1]
        if town is not None and loaded_town != town:
            print(
                f"[carla] requested town={town} but {loaded_town} is loaded; "
                "using loaded map (skipping load_world)."
            )
        return world, ConnectResult(
            connected=True, town=loaded_town, server_version=version
        )
    except Exception as e:
        return None, ConnectResult(connected=False, error=str(e))

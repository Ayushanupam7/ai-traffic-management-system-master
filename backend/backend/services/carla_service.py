"""CARLA bridge service — connects to a user-launched CARLA server, spawns
TrafficManager-driven autopilot vehicles, and exposes camera streams.

Never crashes the backend: if CARLA isn't running or the `carla` package
isn't installed, this just reports `connected=False` and all entry points
no-op gracefully.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from carla_bridge import CameraSpec, JunctionSpec, load_junction_map
from carla_bridge.carla_snapshot import build_tick_data
from carla_bridge.client import ConnectResult, connect
from carla_bridge.sensors import CameraRegistry, encode_jpeg
from carla_bridge.vision_manager import VisionManager
from carla_bridge.vision_snapshot import merge_vision_into_tick
from carla_bridge.traffic_manager import (
    destroy_traffic,
    pause_traffic,
    resume_traffic,
    spawn_traffic,
)
from shared.types import TickData


class CarlaBridge:
    def __init__(self):
        self._client: Optional[Any] = None
        self._world: Optional[Any] = None
        self._status: ConnectResult = ConnectResult(connected=False)
        self._cameras = CameraRegistry()
        self._junctions: Dict[str, JunctionSpec] = load_junction_map()
        self._tm_actors: List[Any] = []
        self._lock = asyncio.Lock()
        self._use_vision = False
        self._vision: Optional[VisionManager] = None

    @property
    def connected(self) -> bool:
        return self._status.connected

    @property
    def status(self) -> ConnectResult:
        return self._status

    @property
    def junctions(self) -> Dict[str, JunctionSpec]:
        return self._junctions

    @property
    def world(self) -> Optional[Any]:
        return self._world

    @property
    def use_vision(self) -> bool:
        return self._use_vision

    def set_vision(
        self,
        enabled: bool,
        model_path: str | None = None,
        regions_path: str | None = None,
        log_root: str | None = None,
        fps: float = 20.0,
        device: str | None = None,
    ) -> bool:
        """Toggle the vision overlay + hybrid merge at runtime. Builds the
        VisionManager on first enable, using repo-default model/regions paths."""
        self._use_vision = enabled
        if enabled and self._vision is None:
            from pathlib import Path

            root = Path(__file__).resolve().parents[3]
            mp = model_path or str(root / "packages" / "cv-pipeline" / "models" / "best.pt")
            rp = regions_path or str(
                root / "packages" / "sumo-engine" / "configs" / "camera_regions.json"
            )
            self._vision = VisionManager(
                self._junctions, fps=fps, model_path=mp, regions_path=rp,
                log_root=log_root, device=device,
            )
        if not enabled and self._vision is not None:
            self._vision.reset()
            self._vision = None
        return self._use_vision

    async def ensure_connected(self, town: str | None = None) -> ConnectResult:
        """Attempt to connect. Safe to call repeatedly — idempotent.

        If `town` is None (default), accept whatever map is already loaded
        in CARLA.
        """
        async with self._lock:
            if self._status.connected and self._world is not None:
                return self._status
            world, result = await asyncio.to_thread(connect, "localhost", 2000, 5.0, town)
            self._world = world
            self._status = result
            # Cache the underlying client so the traffic manager can reach it.
            # `connect()` constructs a fresh client; we re-derive one here for
            # subsequent calls. CARLA clients are cheap.
            if world is not None:
                try:
                    import carla  # type: ignore[import-not-found]
                    c = carla.Client("localhost", 2000)
                    c.set_timeout(5.0)
                    self._client = c
                except Exception:
                    self._client = None
            return result

    async def spawn_traffic(self, count: int) -> int:
        """Hand-off to TrafficManager. Returns number of actors actually spawned
        (TM may reject a few on collision)."""
        if not self.connected or self._world is None or self._client is None:
            return 0
        actors = await asyncio.to_thread(
            spawn_traffic, self._client, self._world, count
        )
        self._tm_actors.extend(actors)
        return len(actors)

    async def snapshot(self, tick: int, sim_time: float) -> Optional[TickData]:
        """Build a TickData from current CARLA actor state.

        When vision is enabled, the watched camera's queue + emergencies override
        that intersection; every other intersection stays on ground truth.
        """
        if not self.connected or self._world is None:
            return None
        tick_data = await asyncio.to_thread(
            build_tick_data, self._world, self._junctions, tick, sim_time
        )
        if self._use_vision and self._vision is not None and tick_data is not None:
            self._vision.update_light_states(tick_data)
            merge_vision_into_tick(tick_data, self._vision.latest_results())
        return tick_data

    async def subscribe_camera(
        self, intersection_id: str, approach: str
    ) -> Optional[asyncio.Queue]:
        """Spawn a camera for this (intersection, approach) and return its
        frame queue. Returns None if CARLA isn't connected or the junction
        isn't mapped."""
        if not self.connected or self._world is None:
            return None
        spec = self._junctions.get(intersection_id)
        if spec is None:
            return None
        cam = next((c for c in spec.cameras if c.approach == approach), None)
        if cam is None:
            return None
        # Create the queue on the event-loop thread (Python 3.9's
        # asyncio.Queue() reads the running loop at __init__).
        queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        loop = asyncio.get_running_loop()
        await asyncio.to_thread(
            self._cameras.spawn, self._world, intersection_id, cam, queue, loop
        )
        return queue

    def release_camera(self, intersection_id: str, approach: str) -> None:
        self._cameras.release(intersection_id, approach)
        if self._vision is not None:
            self._vision.release(intersection_id, approach)

    async def vision_process_frame(
        self, intersection_id: str, approach: str, frame
    ) -> bytes:
        """Run our model on a RAW frame (and cache its analytics) in a worker
        thread, returning annotated JPEG bytes for the browser. When vision is
        off, just JPEG-encode the frame so the stream is untouched."""
        if not (self._use_vision and self._vision is not None):
            return await asyncio.to_thread(encode_jpeg, frame)
        return await asyncio.to_thread(
            self._vision.process_frame, intersection_id, approach, frame
        )

    async def encode_frame(self, frame) -> bytes:
        """JPEG-encode a raw frame off the event loop (preview path)."""
        return await asyncio.to_thread(encode_jpeg, frame)

    async def subscribe_preview_camera(
        self, spec: CameraSpec
    ) -> Optional[asyncio.Queue]:
        """Spawn a one-off camera at the given transform (used by the
        calibration page). Bypasses the junctions.json lookup. Reuses the
        same registry so it inherits the 'release everything before spawn'
        rule that prevents actor races."""
        if not self.connected or self._world is None:
            return None
        queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        loop = asyncio.get_running_loop()
        await asyncio.to_thread(
            self._cameras.spawn, self._world, "__preview__", spec, queue, loop
        )
        return queue

    def release_preview_camera(self, approach: str) -> None:
        self._cameras.release("__preview__", approach)

    def reload_junctions(self) -> None:
        """Re-read carla_junctions.json and replace the in-memory map."""
        self._junctions = load_junction_map()

    async def pause(self) -> None:
        """Freeze TM vehicles + traffic lights so the CARLA world actually
        stops moving while the dashboard is paused (not just frozen on our
        side). Cameras keep streaming a static frame."""
        if not self.connected or self._world is None or not self._tm_actors:
            return
        try:
            await asyncio.to_thread(pause_traffic, self._world, list(self._tm_actors))
        except Exception as e:
            print(f"[carla] pause failed: {e}")

    async def resume(self) -> None:
        """Reverse `pause` — re-enable physics, autopilot, and TL cycling."""
        if not self.connected or self._world is None or not self._tm_actors:
            return
        try:
            await asyncio.to_thread(resume_traffic, self._world, list(self._tm_actors))
        except Exception as e:
            print(f"[carla] resume failed: {e}")

    async def shutdown(self) -> None:
        """Destroy all TM vehicles + active cameras. Called on simulation stop."""
        self._cameras.release_all()
        if self._tm_actors:
            actors = list(self._tm_actors)
            self._tm_actors.clear()
            try:
                await asyncio.to_thread(destroy_traffic, actors)
            except Exception as e:
                print(f"[carla] shutdown: destroy_traffic failed: {e}")


carla_bridge = CarlaBridge()

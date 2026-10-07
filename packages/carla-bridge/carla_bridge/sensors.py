"""On-demand RGB camera management.

Each active camera owns:
  - a carla.Sensor actor
  - an asyncio.Queue[bytes] of JPEG-encoded frames

When a subscriber goes away (HTTP client disconnects), the sensor is destroyed
and the queue drained. At most one camera per intersection is active at a time
to bound the render cost on a GTX 1660 Ti.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict

import numpy as np

from .junctions import CameraSpec


# Quality for the BROWSER preview only. The model now runs on the RAW frame
# (the queue carries BGR numpy arrays, not JPEG), so this never touches
# detection accuracy — it's purely the MJPEG shown in the dashboard.
JPEG_QUALITY = 85


def encode_jpeg(bgr, quality: int = JPEG_QUALITY) -> bytes:
    """Encode a BGR numpy frame to JPEG bytes for the browser stream."""
    import cv2

    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else b""


@dataclass
class _ActiveCamera:
    sensor: Any          # carla.Sensor
    queue: asyncio.Queue
    loop: asyncio.AbstractEventLoop


class CameraRegistry:
    def __init__(self):
        # Keyed by (intersection_id, approach) — at most one active per intersection.
        self._active: Dict[str, _ActiveCamera] = {}

    def _key(self, intersection_id: str, approach: str) -> str:
        return f"{intersection_id}/{approach}"

    def spawn(
        self,
        world: Any,
        intersection_id: str,
        cam: CameraSpec,
        queue: asyncio.Queue,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        """Create (or replace) the active camera and feed its frames into
        the supplied asyncio queue.

        We enforce **at most one camera world-wide** at any moment. Spawning
        a new camera here destroys every existing one first, then waits for
        CARLA to actually finish the destroy before creating the replacement.
        Without this, switching approach (or intersection) leaves the old
        sensor alive for a few hundred ms while the new one is created — a
        cross-thread spawn-vs-destroy race that crashes CARLA's actor
        manager on weaker GPUs.

        The queue + loop are created by the caller (which is on the event
        loop thread) and passed in here so this method can run in a worker
        thread without needing to grab the loop itself — Python 3.9's
        asyncio.Queue() pulls the loop at construction, which fails off-loop.
        """
        self.release_all()
        try:
            world.wait_for_tick(2.0)
        except Exception:
            # In async / non-synchronous mode wait_for_tick may return quickly
            # or no-op; that's fine — we just want to give the destroy a beat.
            pass

        import carla  # type: ignore[import-not-found]

        bp_lib = world.get_blueprint_library()
        bp = bp_lib.find("sensor.camera.rgb")
        bp.set_attribute("image_size_x", str(cam.width))
        bp.set_attribute("image_size_y", str(cam.height))
        bp.set_attribute("fov", str(cam.fov))
        bp.set_attribute("sensor_tick", "0.05")  # ~20 Hz

        transform = carla.Transform(
            carla.Location(x=cam.x, y=cam.y, z=cam.z),
            carla.Rotation(pitch=cam.pitch, yaw=cam.yaw, roll=cam.roll),
        )
        sensor = world.spawn_actor(bp, transform)

        def on_image(image: Any) -> None:
            # Hand the RAW BGR frame to the queue — no JPEG encode here, so the
            # model sees full-quality pixels (JPEG q70 recompression was costing
            # detections). raw_data is BGRA; drop alpha and copy (CARLA reuses
            # the buffer after this returns).
            try:
                arr = np.frombuffer(image.raw_data, dtype=np.uint8)
                bgr = arr.reshape((image.height, image.width, 4))[:, :, :3].copy()
            except Exception as e:
                print(f"[carla] frame decode failed: {e}")
                return
            # Drop oldest frame if full — live feed, don't build up latency.
            if queue.full():
                try:
                    queue.get_nowait()
                except Exception:
                    pass
            try:
                loop.call_soon_threadsafe(queue.put_nowait, bgr)
            except Exception:
                pass

        sensor.listen(on_image)
        self._active[self._key(intersection_id, cam.approach)] = _ActiveCamera(
            sensor=sensor, queue=queue, loop=loop
        )

    def release(self, intersection_id: str, approach: str) -> None:
        self._release_key(self._key(intersection_id, approach))

    def _release_for_intersection(self, intersection_id: str) -> None:
        keys = [k for k in self._active if k.startswith(f"{intersection_id}/")]
        for k in keys:
            self._release_key(k)

    def _release_key(self, key: str) -> None:
        active = self._active.pop(key, None)
        if active is None:
            return
        try:
            active.sensor.stop()
            active.sensor.destroy()
        except Exception as e:
            print(f"[carla] sensor destroy failed: {e}")

    def release_all(self) -> None:
        for key in list(self._active):
            self._release_key(key)

"""CARLA camera endpoints.

Endpoints gracefully degrade when CARLA isn't running: /status returns
`connected: false`, /{id}/{approach}/stream returns 503.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from carla_bridge import CameraSpec

from ..services.carla_service import carla_bridge

router = APIRouter()


JUNCTIONS_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages" / "sumo-engine" / "configs" / "carla_junctions.json"
)

# Per-camera analytics regions (lane polygons + violation lines), drawn in the
# dashboard and consumed by the vision analyzer. Separate file, additive — does
# not touch carla_junctions.json.
REGIONS_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages" / "sumo-engine" / "configs" / "camera_regions.json"
)


@router.get("/status")
async def get_status() -> dict[str, Any]:
    await carla_bridge.ensure_connected()
    s = carla_bridge.status
    return {
        "connected": s.connected,
        "town": s.town,
        "server_version": s.server_version,
        "error": s.error,
    }


@router.get("/")
async def list_cameras(detail: str = "summary") -> dict[str, Any]:
    """List mapped intersections and their camera approaches.

    Does NOT require CARLA to be connected — the mapping is static.

    `cx`/`cy` are the junction's CARLA world coordinates (mean of its
    cameras' positions). The dashboard uses these to position nodes on
    the CARLA-mode grid map — the layout matches Town10's actual shape
    rather than our synthetic 3x2 arterial.

    With `?detail=full` each camera entry also includes its full transform
    (x/y/z/pitch/yaw/width/height/fov) — used by the calibration page.
    """
    out = []
    for spec in carla_bridge.junctions.values():
        cams = spec.cameras or []
        cx = sum(c.x for c in cams) / len(cams) if cams else 0.0
        cy = sum(c.y for c in cams) / len(cams) if cams else 0.0
        if detail == "full":
            cams_out = [
                {
                    "approach": c.approach,
                    "x": c.x, "y": c.y, "z": c.z,
                    "pitch": c.pitch, "yaw": c.yaw, "roll": c.roll,
                    "width": c.width, "height": c.height, "fov": c.fov,
                }
                for c in cams
            ]
        else:
            cams_out = [{"approach": c.approach} for c in cams]
        out.append(
            {
                "intersection_id": spec.intersection_id,
                "carla_junction_id": spec.carla_junction_id,
                "cx": cx,
                "cy": cy,
                "cameras": cams_out,
            }
        )
    out.sort(key=lambda x: x["intersection_id"])
    return {"intersections": out}


@router.get("/{intersection_id}/{approach}/stream")
async def stream_camera(intersection_id: str, approach: str):
    """MJPEG stream for a single camera.

    Spawns the sensor on first request, tears it down when the client
    disconnects.
    """
    await carla_bridge.ensure_connected()
    if not carla_bridge.connected:
        raise HTTPException(503, "CARLA server not connected")

    queue = await carla_bridge.subscribe_camera(intersection_id, approach)
    if queue is None:
        raise HTTPException(
            404, f"no camera mapped for {intersection_id}/{approach}"
        )

    boundary = "frame"

    async def generator():
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    break
                # Run our model on the RAW frame when vision is on; otherwise just
                # encode it. Either way returns JPEG bytes for the browser.
                jpg = await carla_bridge.vision_process_frame(
                    intersection_id, approach, frame
                )
                yield (
                    f"--{boundary}\r\n"
                    f"Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(jpg)}\r\n\r\n"
                ).encode() + jpg + b"\r\n"
        finally:
            carla_bridge.release_camera(intersection_id, approach)

    return StreamingResponse(
        generator(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
    )


# ---------------------------------------------------------------- #
# Calibration: live-preview a one-off camera transform + save it
# back to carla_junctions.json. Only used by frontend/.../calibrate.
# ---------------------------------------------------------------- #


@router.get("/preview")
async def preview_camera(
    x: float, y: float, z: float, pitch: float, yaw: float,
    width: int = 640, height: int = 360, fov: float = 90.0,
):
    """MJPEG stream from a one-off camera at the given world transform.

    Each call replaces any previous preview camera (the registry's
    spawn() releases all prior cameras first). The browser remounts the
    `<img>` whenever any param changes, which automatically swaps the
    backend sensor.
    """
    await carla_bridge.ensure_connected()
    if not carla_bridge.connected:
        raise HTTPException(503, "CARLA server not connected")

    spec = CameraSpec(
        approach="N",  # placeholder; preview cameras live under a fake intersection
        x=x, y=y, z=z, pitch=pitch, yaw=yaw,
        width=width, height=height, fov=fov,
    )
    queue = await carla_bridge.subscribe_preview_camera(spec)
    if queue is None:
        raise HTTPException(503, "could not spawn preview camera")

    boundary = "frame"

    async def generator():
        try:
            while True:
                try:
                    frame = await asyncio.wait_for(queue.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    break
                jpg = await carla_bridge.encode_frame(frame)
                yield (
                    f"--{boundary}\r\n"
                    f"Content-Type: image/jpeg\r\n"
                    f"Content-Length: {len(jpg)}\r\n\r\n"
                ).encode() + jpg + b"\r\n"
        finally:
            carla_bridge.release_preview_camera(spec.approach)

    return StreamingResponse(
        generator(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
    )


class CameraSavePayload(BaseModel):
    intersection_id: str
    approach: Literal["N", "E", "S", "W"]
    x: float
    y: float
    z: float
    pitch: float
    yaw: float


@router.post("/save")
async def save_camera(payload: CameraSavePayload) -> dict[str, Any]:
    """Patch one approach's transform in carla_junctions.json and reload
    the in-memory junction map so the change takes effect immediately."""
    if not JUNCTIONS_PATH.exists():
        raise HTTPException(500, f"junctions file not found at {JUNCTIONS_PATH}")

    raw = json.loads(JUNCTIONS_PATH.read_text())
    junctions = raw.get("junctions", [])
    target = next(
        (j for j in junctions if j.get("intersection_id") == payload.intersection_id),
        None,
    )
    if target is None:
        raise HTTPException(
            404, f"intersection {payload.intersection_id} not in junctions.json"
        )

    cam = next(
        (c for c in target.get("cameras", []) if c.get("approach") == payload.approach),
        None,
    )
    if cam is None:
        # No existing entry for this approach — create one with sensible defaults.
        cam = {"approach": payload.approach}
        target.setdefault("cameras", []).append(cam)

    cam["x"] = payload.x
    cam["y"] = payload.y
    cam["z"] = payload.z
    cam["pitch"] = payload.pitch
    cam["yaw"] = payload.yaw

    JUNCTIONS_PATH.write_text(json.dumps(raw, indent=2))
    carla_bridge.reload_junctions()

    return {
        "saved": True,
        "intersection_id": payload.intersection_id,
        "approach": payload.approach,
    }


# ---------------------------------------------------------------- #
# Per-camera analytics regions: lane polygons + red-light violation
# lines, drawn on the camera view in the dashboard. Stored in
# camera_regions.json, keyed by intersection_id -> approach.
# ---------------------------------------------------------------- #


class RegionsSavePayload(BaseModel):
    intersection_id: str
    approach: Literal["N", "E", "S", "W"]
    # lanes:           [{"id": str, "polygon": [[x, y], ...]}]
    # forbidden_lines: [{"id": str, "points": [[x1, y1], [x2, y2]]}]
    lanes: list = []
    forbidden_lines: list = []


@router.get("/regions")
async def get_regions() -> dict[str, Any]:
    """All per-camera lane/violation regions ({intersection: {approach: {...}}})."""
    if not REGIONS_PATH.exists():
        return {"regions": {}}
    return {"regions": json.loads(REGIONS_PATH.read_text())}


@router.post("/regions")
async def save_regions(payload: RegionsSavePayload) -> dict[str, Any]:
    """Replace one camera's lanes + violation lines in camera_regions.json."""
    raw = json.loads(REGIONS_PATH.read_text()) if REGIONS_PATH.exists() else {}
    raw.setdefault(payload.intersection_id, {})[payload.approach] = {
        "lanes": payload.lanes,
        "forbidden_lines": payload.forbidden_lines,
    }
    REGIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGIONS_PATH.write_text(json.dumps(raw, indent=2))
    return {
        "saved": True,
        "intersection_id": payload.intersection_id,
        "approach": payload.approach,
        "lanes": len(payload.lanes),
        "forbidden_lines": len(payload.forbidden_lines),
    }


# ---------------------------------------------------------------- #
# Vision toggle: turn the YOLOv11m overlay + hybrid merge on/off at
# runtime (off by default — when off, streams + TickData are exactly
# the stock CARLA behaviour).
# ---------------------------------------------------------------- #


class VisionTogglePayload(BaseModel):
    enabled: bool


@router.get("/vision")
async def get_vision() -> dict[str, Any]:
    """Whether the vision overlay + hybrid merge is currently on."""
    return {"use_vision": carla_bridge.use_vision}


@router.post("/vision")
async def set_vision(payload: VisionTogglePayload) -> dict[str, Any]:
    """Turn the vision overlay + hybrid merge on/off at runtime."""
    enabled = carla_bridge.set_vision(payload.enabled)
    return {"use_vision": enabled}

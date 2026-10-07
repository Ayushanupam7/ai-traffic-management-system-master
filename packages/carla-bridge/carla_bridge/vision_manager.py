"""Runtime vision overlay + hybrid-merge manager for CARLA mode.

OFF by default. When enabled (via the /api/cameras/vision toggle), the single
active camera's frames are run through an ApproachAnalyzer:

  - the camera stream gets an annotated frame (boxes, classes, speed, lanes,
    violation lines), and
  - the latest per-approach result (queue + emergencies) is cached so the
    snapshot can override the WATCHED intersection with vision while every other
    intersection stays on CARLA ground truth.

Because CARLA only keeps one camera alive at a time (see sensors.CameraRegistry),
at most one analyzer runs at once — cheap enough for a single GPU.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from cv_pipeline import (
    ApproachAnalyzer,
    homography_from_cameraspec,
    load_regions,
    regions_for,
)
from cv_pipeline.approach_analyzer import draw_overlay

from .sensors import encode_jpeg

_PHASE_DIRS = ["N", "E", "S", "W"]


def approach_light_state(phase_index: int, approach: str) -> str:
    """Derive an approach's light from an intersection phase_index.

    The 4-phase plan cycles N->E->S->W, each as green/yellow/red (sub 0/1/2).
    Only the active direction can be non-red; all others are red.
    """
    active = _PHASE_DIRS[(phase_index // 3) % 4]
    sub = phase_index % 3
    if approach != active:
        return "red"
    return "green" if sub == 0 else ("yellow" if sub == 1 else "red")


class VisionManager:
    def __init__(
        self,
        junctions: Dict[str, Any],
        fps: float = 20.0,
        model_path: Optional[str] = None,
        device: Optional[str] = None,
        regions_path: Optional[str] = None,
        log_root: Optional[str] = None,
        queue_speed_kmh: float = 12.6,
    ):
        self.junctions = junctions
        self.fps = fps
        self.model_path = model_path
        self.device = device
        self.log_root = log_root
        self.queue_speed_kmh = queue_speed_kmh
        self.regions = load_regions(regions_path) if regions_path else {}
        self._analyzers: Dict[Tuple[str, str], ApproachAnalyzer] = {}
        self.results: Dict[Tuple[str, str], Any] = {}
        self.light_states: Dict[Tuple[str, str], str] = {}

    def _analyzer(self, inter: str, appr: str) -> Optional[ApproachAnalyzer]:
        key = (inter, appr)
        a = self._analyzers.get(key)
        if a is not None:
            return a
        spec = self.junctions.get(inter)
        cam = next((c for c in spec.cameras if c.approach == appr), None) if spec else None
        if cam is None:
            return None
        H = homography_from_cameraspec(cam)
        if H is None:
            print(f"[vision] {inter}/{appr}: camera doesn't see the ground; skipping analytics")
            return None
        lanes, lines = regions_for(self.regions, inter, appr)
        log_dir = str(Path(self.log_root) / f"{inter}_{appr}") if self.log_root else None
        a = ApproachAnalyzer(
            homography=H, fps=self.fps, model_path=self.model_path, device=self.device,
            lanes=lanes, forbidden_lines=lines, queue_speed_kmh=self.queue_speed_kmh,
            log_dir=log_dir,
        )
        self._analyzers[key] = a
        return a

    def update_light_states(self, tick_data) -> None:
        """Cache each approach's red/green from the ground-truth tick (for violations)."""
        for inter in tick_data.intersections:
            for appr in _PHASE_DIRS:
                self.light_states[(inter.id, appr)] = approach_light_state(
                    inter.phase_index, appr
                )

    def latest_results(self) -> dict:
        return dict(self.results)

    def process_frame(self, inter: str, appr: str, bgr) -> bytes:
        """Run analytics on a RAW BGR frame (full quality — no JPEG round-trip),
        draw the overlay, and return JPEG bytes for the browser preview. Returns
        a plain JPEG of the frame if no analyzer is available, so the stream
        never breaks."""
        a = self._analyzer(inter, appr)
        if a is None:
            return encode_jpeg(bgr)
        light = self.light_states.get((inter, appr), "unknown")
        res = a.update(bgr, light_state=light)
        self.results[(inter, appr)] = res
        draw_overlay(bgr, res, a.lanes, a.forbidden_lines)
        return encode_jpeg(bgr)

    def release(self, inter: str, appr: str) -> None:
        """Drop one camera's analyzer + cached result when its stream closes,
        finalizing its log and freeing its model from GPU memory. Because only one
        camera is active at a time, this keeps exactly the active analyzer resident
        (VRAM does not accumulate as the operator switches cameras) and stops the
        map override from lingering on a no-longer-watched intersection."""
        a = self._analyzers.pop((inter, appr), None)
        if a is not None:
            try:
                a.finalize()
            except Exception:
                pass
        self.results.pop((inter, appr), None)
        self.light_states.pop((inter, appr), None)
        self._free_gpu()

    def _free_gpu(self) -> None:
        try:
            import torch

            torch.cuda.empty_cache()
        except Exception:
            pass

    def reset(self) -> None:
        """Finalize logs + clear state (called when vision is toggled off)."""
        for a in self._analyzers.values():
            try:
                a.finalize()
            except Exception:
                pass
        self._analyzers.clear()
        self.results.clear()
        self.light_states.clear()
        self._free_gpu()

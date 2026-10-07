"""YOLOv11m vehicle detection + tracking (custom 7-class CARLA-trained model).

Drop-in replacement for the YOLOS detector: exposes the same `Detection`
dataclass and a `detect()` method with the same signature, so existing call
sites that use `cv_pipeline` work unchanged. Adds a `track()` method that
returns persistent ByteTrack IDs + a mapped TRaffic VehicleType — needed for
the speed/queue analytics that feed the adaptive policy.

Unlike YOLOS (general COCO classes), this model distinguishes emergency
vehicles (ambulance / police_car / fire_truck), which is the whole point of the
custom CARLA dataset.

Note on tracking: ByteTrack state persists per detector instance. For multiple
cameras, give each camera its OWN YoloV11Detector instance so their track-ID
spaces stay separate.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .classes import is_emergency, vehicle_type_for
from .yolos_detector import Detection

# Bundled weights — packages/cv-pipeline/models/best.pt
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "best.pt"


@dataclass
class TrackedDetection:
    """A Detection with a persistent tracking ID and mapped vehicle type."""

    track_id: int
    class_name: str
    confidence: float
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)
    vehicle_type: str  # TRaffic VehicleType value: car/truck/bus/motorcycle/emergency

    @property
    def is_emergency(self) -> bool:
        return is_emergency(self.class_name)


class YoloV11Detector:
    """Custom YOLOv11m detector (Ultralytics) — 7 traffic classes incl. emergency.

    Interface-compatible with `YOLSDetector`: same `Detection` output and the
    same `detect(frame, confidence_threshold)` signature, so the two are
    swappable at any call site.
    """

    def __init__(
        self,
        model_path: str | None = None,
        device: str | None = None,
        iou: float = 0.5,
    ):
        self.model_path = str(model_path) if model_path else str(DEFAULT_MODEL_PATH)
        self.device = device  # None -> auto-pick on load()
        self.iou = iou
        self._model = None

    def load(self) -> None:
        """Load the YOLOv11m model (Ultralytics)."""
        from ultralytics import YOLO

        if self.device is None:
            try:
                import torch

                self.device = "0" if torch.cuda.is_available() else "cpu"
            except Exception:
                self.device = "cpu"

        self._model = YOLO(self.model_path)
        print(f"YOLOv11m model loaded from {self.model_path} on device {self.device}")

    def detect(
        self,
        frame: np.ndarray,
        confidence_threshold: float = 0.5,
    ) -> list[Detection]:
        """Stateless per-frame detection. Same contract as YOLSDetector.detect().

        Args:
            frame: BGR image as numpy array (H, W, 3).
            confidence_threshold: Minimum confidence to include a detection.

        Returns:
            List of Detection objects (class_name is the model's own label).
        """
        if self._model is None:
            self.load()

        results = self._model.predict(
            frame,
            conf=confidence_threshold,
            iou=self.iou,
            device=self.device,
            verbose=False,
        )[0]

        names = results.names
        out: list[Detection] = []
        if results.boxes is None:
            return out
        for box in results.boxes:
            cls_id = int(box.cls[0])
            out.append(
                Detection(
                    class_name=names[cls_id],
                    confidence=round(float(box.conf[0]), 3),
                    bbox=tuple(round(float(c), 1) for c in box.xyxy[0].tolist()),
                )
            )
        return out

    def track(
        self,
        frame: np.ndarray,
        confidence_threshold: float = 0.5,
    ) -> list[TrackedDetection]:
        """Stateful detection + ByteTrack tracking.

        Must be called on consecutive frames of a single stream — tracker state
        persists across calls on this detector instance.

        Returns:
            List of TrackedDetection (adds track_id + mapped VehicleType value).
        """
        if self._model is None:
            self.load()

        results = self._model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            conf=confidence_threshold,
            iou=self.iou,
            device=self.device,
            verbose=False,
        )[0]

        names = results.names
        out: list[TrackedDetection] = []
        if results.boxes is None:
            return out
        for box in results.boxes:
            cls_id = int(box.cls[0])
            cname = names[cls_id]
            tid = int(box.id[0]) if box.id is not None else -1
            out.append(
                TrackedDetection(
                    track_id=tid,
                    class_name=cname,
                    confidence=round(float(box.conf[0]), 3),
                    bbox=tuple(round(float(c), 1) for c in box.xyxy[0].tolist()),
                    vehicle_type=vehicle_type_for(cname),
                )
            )
        return out

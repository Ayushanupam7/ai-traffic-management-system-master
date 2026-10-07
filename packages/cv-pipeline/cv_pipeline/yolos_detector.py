"""YOLOS vehicle detection inference."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Detection:
    """Single object detection result."""

    class_name: str
    confidence: float
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)


class YOLSDetector:
    """Fine-tuned YOLOS model for traffic vehicle detection.

    Wraps the HuggingFace transformers pipeline for object detection.
    """

    def __init__(self, model_path: str | None = None, device: str = "cpu"):
        self.model_path = model_path
        self.device = device
        self._model = None
        self._processor = None

    def load(self) -> None:
        """Load the YOLOS model and processor."""
        from transformers import AutoFeatureExtractor, AutoModelForObjectDetection

        model_name = self.model_path or "hustvl/yolos-tiny"
        self._processor = AutoFeatureExtractor.from_pretrained(model_name)
        self._model = AutoModelForObjectDetection.from_pretrained(model_name)
        self._model.to(self.device)
        self._model.eval()
        print(f"YOLOS model loaded from {model_name} on {self.device}")

    def detect(
        self,
        frame: np.ndarray,
        confidence_threshold: float = 0.5,
    ) -> list[Detection]:
        """Run detection on a single frame.

        Args:
            frame: BGR image as numpy array (H, W, 3).
            confidence_threshold: Minimum confidence to include a detection.

        Returns:
            List of Detection objects.
        """
        if self._model is None:
            self.load()

        import torch
        from PIL import Image

        # Convert BGR to RGB PIL image
        rgb = frame[:, :, ::-1]
        image = Image.fromarray(rgb)

        inputs = self._processor(images=image, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)

        # Post-process
        target_sizes = torch.tensor([image.size[::-1]])
        results = self._processor.post_process_object_detection(
            outputs, target_sizes=target_sizes, threshold=confidence_threshold
        )[0]

        detections = []
        for score, label, box in zip(
            results["scores"], results["labels"], results["boxes"]
        ):
            detections.append(Detection(
                class_name=self._model.config.id2label[label.item()],
                confidence=round(score.item(), 3),
                bbox=tuple(round(c, 1) for c in box.tolist()),
            ))

        return detections

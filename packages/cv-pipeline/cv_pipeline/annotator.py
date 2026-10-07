"""Draw detection results on frames."""

from __future__ import annotations

import numpy as np

from .yolos_detector import Detection

# Color map for vehicle types (BGR)
_COLORS = {
    "car": (0, 255, 255),      # Yellow
    "truck": (255, 144, 30),   # Blue
    "bus": (0, 165, 255),      # Orange
    "motorcycle": (255, 0, 255),  # Magenta
    "emergency": (0, 0, 255),  # Red
}
_DEFAULT_COLOR = (0, 255, 0)   # Green


def annotate_frame(
    frame: np.ndarray,
    detections: list[Detection],
) -> np.ndarray:
    """Draw bounding boxes and labels on a frame.

    Args:
        frame: BGR image as numpy array (H, W, 3).
        detections: List of Detection objects.

    Returns:
        Annotated frame (copy of input).
    """
    import cv2

    annotated = frame.copy()

    for det in detections:
        x1, y1, x2, y2 = [int(c) for c in det.bbox]
        color = _COLORS.get(det.class_name.lower(), _DEFAULT_COLOR)

        # Bounding box
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

        # Label background
        label = f"{det.class_name} {det.confidence:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)

        # Label text
        cv2.putText(
            annotated, label, (x1 + 2, y1 - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1,
        )

    # Detection count overlay
    count_text = f"Detections: {len(detections)}"
    cv2.putText(
        annotated, count_text, (10, 25),
        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2,
    )

    return annotated

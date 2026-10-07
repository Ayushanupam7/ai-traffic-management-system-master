"""Frame capture from SUMO-GUI or CARLA cameras."""

from __future__ import annotations

from pathlib import Path

import numpy as np

# Frame source abstraction for future CARLA support
_capture_source = "sumo"  # "sumo" or "carla"


def capture_sumo_frame(
    view_id: str = "View #0",
    output_path: str | None = None,
) -> np.ndarray | None:
    """Capture a screenshot from SUMO-GUI via TraCI.

    Args:
        view_id: SUMO-GUI view identifier.
        output_path: Path to save the screenshot. If None, uses a temp path.

    Returns:
        Frame as a numpy array (H, W, 3) BGR, or None if capture fails.
    """
    try:
        import traci
        import cv2

        if output_path is None:
            output_path = str(Path(__file__).parent / "_temp_frame.png")

        traci.gui.screenshot(view_id, output_path)
        frame = cv2.imread(output_path)
        return frame

    except Exception as e:
        print(f"Frame capture error: {e}")
        return None


def set_camera_view(
    view_id: str,
    x: float,
    y: float,
    zoom: float = 500.0,
) -> None:
    """Set the SUMO-GUI camera to a specific position and zoom level."""
    try:
        import traci
        traci.gui.setOffset(view_id, x, y)
        traci.gui.setZoom(view_id, zoom)
    except Exception as e:
        print(f"Camera view error: {e}")

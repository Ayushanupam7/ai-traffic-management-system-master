"""Auto-homography from a CARLA camera's known intrinsics + extrinsics.

Ported from the capstone analytics pipeline (setup_analytics.auto_calibrate_from_carla).
Given a camera's world transform + image dims + FOV, projects 4 image points onto
the ground plane (z = 0) and solves the pixel->world homography. This calibrates a
TRaffic approach camera (CameraSpec) for vision-based speed/queue without any manual
4-point picking.

The camera->world rotation uses the `carla` module directly because CARLA's
pitch/yaw/roll conventions are non-standard (positive pitch = nose up). A manual
fallback is provided for environments without carla, but the carla path is the
source of truth.
"""

from __future__ import annotations

import math
from typing import Optional

import cv2
import numpy as np


def build_intrinsic_matrix(w: float, h: float, fov_deg: float) -> np.ndarray:
    """Camera intrinsic matrix K from image dims and horizontal FOV."""
    focal = w / (2.0 * math.tan(math.radians(fov_deg) / 2.0))
    return np.array([
        [focal, 0.0, w / 2.0],
        [0.0, focal, h / 2.0],
        [0.0, 0.0, 1.0],
    ])


def camera_to_world_rotation(pitch_deg: float, yaw_deg: float, roll_deg: float) -> np.ndarray:
    """Rotation matrix converting CAMERA-frame vectors to WORLD frame.

    Uses CARLA's API when available (always correct); falls back to manual math.
    """
    try:
        import carla

        tf = carla.Transform(
            carla.Location(0, 0, 0),
            carla.Rotation(pitch=pitch_deg, yaw=yaw_deg, roll=roll_deg),
        )
        fwd = tf.get_forward_vector()
        right = tf.get_right_vector()
        up = tf.get_up_vector()
        return np.array([
            [fwd.x, right.x, up.x],
            [fwd.y, right.y, up.y],
            [fwd.z, right.z, up.z],
        ])
    except ImportError:
        pass

    p = math.radians(pitch_deg)
    y = math.radians(yaw_deg)
    r = math.radians(roll_deg)
    cy, sy = math.cos(y), math.sin(y)
    cp, sp = math.cos(p), math.sin(p)
    cr, sr = math.cos(r), math.sin(r)
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Ry = np.array([[cp, 0, -sp], [0, 1, 0], [sp, 0, cp]])
    Rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    return Rz @ Ry @ Rx


def pixel_to_ground(u, v, K, cam_pos, cam_rot_matrix) -> Optional[tuple]:
    """Project a pixel (u, v) onto the world ground plane (z = 0).

    Returns (x_world, y_world) in meters, or None if the ray misses the ground.
    """
    K_inv = np.linalg.inv(K)
    pixel_ray_cam = K_inv @ np.array([u, v, 1.0])
    # standard pinhole (x right, y down, z forward) -> UE4 camera frame (x fwd, y right, z up)
    ray_ue4 = np.array([pixel_ray_cam[2], pixel_ray_cam[0], -pixel_ray_cam[1]])
    ray_world = cam_rot_matrix @ ray_ue4
    if abs(ray_world[2]) < 1e-9:
        return None
    t = -cam_pos[2] / ray_world[2]
    if t <= 0:
        return None
    x = cam_pos[0] + t * ray_world[0]
    y = cam_pos[1] + t * ray_world[1]
    return (x, y)


def homography_from_params(
    x, y, z, pitch, yaw, roll, width, height, fov,
) -> Optional[np.ndarray]:
    """Solve the pixel->world homography (3x3 np.ndarray) for a camera, or None.

    Picks 4 image points across the lower portion of the frame (where ground is
    visible on an angled CCTV-style camera) and projects each to the ground plane.
    """
    K = build_intrinsic_matrix(width, height, fov)
    R = camera_to_world_rotation(pitch, yaw, roll)
    cam_pos = (x, y, z)

    margin_x = int(width * 0.1)
    upper_y = int(height * 0.55)
    lower_y = int(height * 0.95)
    image_pts = [
        (margin_x, upper_y),
        (width - margin_x, upper_y),
        (width - margin_x, lower_y),
        (margin_x, lower_y),
    ]

    world_pts = []
    for (u, v) in image_pts:
        wp = pixel_to_ground(u, v, K, cam_pos, R)
        if wp is None:
            return None
        world_pts.append(wp)

    H, _ = cv2.findHomography(
        np.array(image_pts, dtype=np.float32),
        np.array(world_pts, dtype=np.float32),
    )
    return H


def homography_from_cameraspec(spec) -> Optional[np.ndarray]:
    """Convenience: homography for a carla_bridge.CameraSpec (or any object with
    x/y/z/pitch/yaw/roll/width/height/fov attributes)."""
    return homography_from_params(
        spec.x, spec.y, spec.z, spec.pitch, spec.yaw,
        getattr(spec, "roll", 0.0), spec.width, spec.height, spec.fov,
    )

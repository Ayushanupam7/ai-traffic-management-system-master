"""CARLA co-simulation bridge.

All imports of the `carla` package are lazy (inside functions) so that this
module can be imported even when CARLA isn't installed. The bridge just
reports `connected=False` in that case.
"""

from __future__ import annotations

from .junctions import CameraSpec, JunctionSpec, load_junction_map

__all__ = ["CameraSpec", "JunctionSpec", "load_junction_map"]

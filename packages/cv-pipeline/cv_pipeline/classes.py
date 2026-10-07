"""Mapping from our custom 7-class model to TRaffic's VehicleType taxonomy.

The CARLA-trained YOLOv11m model emits 7 classes. TRaffic's shared VehicleType
enum has 5 values (car/truck/bus/motorcycle/emergency). This module maps between
them. Values are plain strings (matching VehicleType member values) so this
module has no dependency on `shared` — callers do `VehicleType(vehicle_type_for(name))`.
"""

from __future__ import annotations

# Class names as emitted by the custom model (see models/best.pt training set).
MODEL_CLASS_NAMES = (
    "car", "ambulance", "bus", "truck", "police_car", "fire_truck", "bike",
)

# The three classes our model can distinguish that map to an emergency vehicle.
EMERGENCY_CLASSES = frozenset({"ambulance", "police_car", "fire_truck"})

# Model class name -> TRaffic VehicleType *value*.
CLASS_TO_VEHICLE_TYPE = {
    "car": "car",
    "bus": "bus",
    "truck": "truck",
    "bike": "motorcycle",
    "ambulance": "emergency",
    "police_car": "emergency",
    "fire_truck": "emergency",
}


def vehicle_type_for(class_name: str) -> str:
    """Map a model class name to a TRaffic VehicleType value (default 'car')."""
    return CLASS_TO_VEHICLE_TYPE.get(class_name, "car")


def is_emergency(class_name: str) -> bool:
    """True if the class is an emergency vehicle (ambulance/police/fire)."""
    return class_name in EMERGENCY_CLASSES

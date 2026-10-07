"""Smoke tests — FastAPI app loads without SUMO or CARLA running."""

from __future__ import annotations

from backend.main import app


def test_app_metadata() -> None:
    assert app.title == "Traffic Management System"
    assert app.version == "0.1.0"


def test_health_route_registered() -> None:
    paths = {getattr(route, "path", "") for route in app.routes}
    assert "/api/health" in paths

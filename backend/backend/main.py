"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import (
    cameras,
    chat,
    emergency,
    experiments,
    metrics,
    policy_variants,
    runs,
    signals,
    simulation,
)
from .ws.handlers import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    print("Traffic Management System starting...")
    yield
    # Shutdown: ensure simulation is stopped
    from .services.simulation_service import sim_manager
    if sim_manager.is_running:
        await sim_manager.stop()
    print("Traffic Management System stopped.")


app = FastAPI(
    title="Traffic Management System",
    description="AI-based traffic management and monitoring API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"http://localhost:{p}" for p in range(3000, 3010)] +
                  [f"http://127.0.0.1:{p}" for p in range(3000, 3010)],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(simulation.router, prefix="/api/sim", tags=["simulation"])
app.include_router(signals.router, prefix="/api/signals", tags=["signals"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(emergency.router, prefix="/api/emergency", tags=["emergency"])
app.include_router(experiments.router, prefix="/api/experiments", tags=["experiments"])
app.include_router(policy_variants.router, prefix="/api/policy/variants", tags=["policy"])
app.include_router(runs.router, prefix="/api/runs", tags=["runs"])
app.include_router(cameras.router, prefix="/api/cameras", tags=["cameras"])
app.include_router(chat.router)
app.include_router(ws_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "traffic-management-system"}

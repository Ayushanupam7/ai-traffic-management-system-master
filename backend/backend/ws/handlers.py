"""WebSocket route handlers."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .manager import ws_manager

router = APIRouter()


@router.websocket("/ws/traffic")
async def traffic_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time traffic data.

    Clients connect here to receive per-tick simulation updates.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; we broadcast from the simulation loop
            # Client can send commands (e.g., manual signal overrides) here
            data = await websocket.receive_text()
            # Handle incoming commands from the frontend if needed
            # For now, just acknowledge
            await websocket.send_text('{"ack": true}')
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

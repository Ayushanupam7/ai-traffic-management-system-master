"""TraCI connection manager for SUMO simulation."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import traci

from shared.config import get_settings


class TraCIClient:
    """Manages the TraCI connection lifecycle with SUMO."""

    def __init__(self, config_file: str | Path, gui: bool = True, seed: int = 42):
        self.config_file = str(config_file)
        self.gui = gui
        self.seed = seed
        self._connected = False
        self._label = "default"

    @property
    def connected(self) -> bool:
        return self._connected

    def start(self) -> None:
        """Launch SUMO and connect via TraCI."""
        if self._connected:
            raise RuntimeError("Already connected to SUMO")

        # Clean up any stale connection with this label from a previous crashed run
        try:
            traci.switch(self._label)
            traci.close()
        except Exception:
            pass

        settings = get_settings()
        sumo_home = settings.sumo_home or os.environ.get("SUMO_HOME", "")
        if sumo_home:
            tools = os.path.join(sumo_home, "tools")
            if tools not in sys.path:
                sys.path.append(tools)

        # Resolve binary. SUMO_BINARY may point to either 'sumo' or 'sumo-gui'.
        # Always derive both variants from the same directory.
        sumo_binary = settings.sumo_binary
        if os.path.isabs(sumo_binary):
            binary_dir = os.path.dirname(sumo_binary)
            binary_name = "sumo-gui" if self.gui else "sumo"
            binary = os.path.join(binary_dir, binary_name)
            if os.name == "nt" and not binary.endswith(".exe"):
                binary += ".exe"
        else:
            binary_name = "sumo-gui" if self.gui else "sumo"
            if sumo_home:
                candidate = os.path.join(sumo_home, "bin", binary_name)
                if os.name == "nt" and not candidate.endswith(".exe"):
                    candidate += ".exe"
                binary = candidate if os.path.exists(candidate) else binary_name
            else:
                binary = binary_name
        sumo_cmd = [
            binary,
            "-c", self.config_file,
            "--seed", str(self.seed),
            "--start", "true",
            "--quit-on-end", "true",
        ]

        traci.start(sumo_cmd, label=self._label)
        self._connected = True
        self._setup_subscriptions()

    def _setup_subscriptions(self) -> None:
        """Subscribe to simulation-wide data for efficient per-tick retrieval."""
        # Subscribe to all traffic lights
        for tl_id in traci.trafficlight.getIDList():
            traci.trafficlight.subscribe(tl_id, [
                traci.constants.TL_RED_YELLOW_GREEN_STATE,
                traci.constants.TL_CURRENT_PHASE,
                traci.constants.TL_NEXT_SWITCH,
            ])

    def step(self) -> float:
        """Advance simulation by one step. Returns current simulation time."""
        if not self._connected:
            raise RuntimeError("Not connected to SUMO")
        traci.simulationStep()
        return traci.simulation.getTime()

    def get_simulation_time(self) -> float:
        return traci.simulation.getTime()

    def get_remaining_vehicle_count(self) -> int:
        """Vehicles still running + waiting to depart. 0 means the network is empty."""
        return traci.simulation.getMinExpectedNumber()

    def close(self) -> None:
        """Close the TraCI connection and stop SUMO."""
        if self._connected:
            try:
                traci.switch(self._label)
                traci.close()
            except Exception:
                pass
            self._connected = False

    def __enter__(self) -> TraCIClient:
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

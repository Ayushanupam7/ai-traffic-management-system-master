"""Traffic light signal read/write operations via TraCI."""

from __future__ import annotations

import traci

from shared.types import SignalCommand


def get_signal_state(tl_id: str) -> dict:
    """Get current signal state for a traffic light."""
    return {
        "id": tl_id,
        "state": traci.trafficlight.getRedYellowGreenState(tl_id),
        "phase_index": traci.trafficlight.getPhase(tl_id),
        "phase_duration": traci.trafficlight.getPhaseDuration(tl_id),
        "next_switch": traci.trafficlight.getNextSwitch(tl_id),
        "program_id": traci.trafficlight.getProgram(tl_id),
    }


def set_signal_state(command: SignalCommand) -> None:
    """Apply a signal command to a traffic light."""
    tl_id = command.intersection_id

    if command.state_string is not None:
        traci.trafficlight.setRedYellowGreenState(tl_id, command.state_string)

    if command.phase_index is not None:
        traci.trafficlight.setPhase(tl_id, command.phase_index)

    if command.duration_s is not None:
        traci.trafficlight.setPhaseDuration(tl_id, command.duration_s)


def apply_commands(commands: list[SignalCommand]) -> None:
    """Apply a batch of signal commands."""
    for cmd in commands:
        set_signal_state(cmd)


def get_all_signal_states() -> list[dict]:
    """Get signal states for all traffic lights."""
    return [get_signal_state(tl_id) for tl_id in traci.trafficlight.getIDList()]

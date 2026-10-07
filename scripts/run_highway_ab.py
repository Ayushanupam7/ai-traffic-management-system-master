"""A/B test: highway with ramps always green vs ALINEA ramp metering.

Runs two headless SUMO simulations on identical demand (same seed, same
route file). For each run we collect:
  - clearance time (when the network finally empties)
  - mean trip time across completed trips
  - mean downstream-lane occupancy on the bottleneck section
  - max ramp queue across the run

The point of the comparison: with the ramp held open, the merging traffic
is allowed to push the mainline past its capacity knee and cause stop-and-go.
ALINEA's feedback law should hold downstream occupancy near the target and
keep the mean trip time lower, at the cost of building some queue on the
service road.

Run:  .venv/Scripts/python.exe scripts/run_highway_ab.py
"""

from __future__ import annotations

import os
import statistics
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

# --- SUMO setup ---
SUMO_HOME = os.environ.get("SUMO_HOME") or r"C:\Program Files (x86)\Eclipse\Sumo"
if SUMO_HOME and os.path.join(SUMO_HOME, "tools") not in sys.path:
    sys.path.append(os.path.join(SUMO_HOME, "tools"))

import traci  # noqa: E402

# Project imports
from adaptive_policy.alinea import AlineaRampController  # noqa: E402
from shared.constants import METER_INFO  # noqa: E402
from shared.types import (  # noqa: E402
    AlineaPolicyParams,
    IntersectionState,
    QueueLengths,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
NETWORK_DIR  = PROJECT_ROOT / "packages" / "sumo-engine" / "networks"
CONFIG_DIR   = PROJECT_ROOT / "packages" / "sumo-engine" / "configs"
SUMO_BINARY = "sumo"  # headless. set to "sumo-gui" to watch.
MAX_SIM_TIME_S = 7200  # 2h cap so a broken run can't hang the script.
SAMPLE_EVERY_S = 5     # how often we record occupancy / queue samples.

METER_IDS = ["E1", "E2", "W1", "W2"]

# --- Stress demand + downstream incident scenario.
#
# Real ramp metering shines when there's a downstream bottleneck the meter
# can protect. The accel lanes on this network absorb merges too well for
# pure merge-volume to congest the freeway, so we add an artificial
# incident: at INCIDENT_START_S we drop 2 of the 4 lanes on hwy_E_s3 to
# 5 m/s (heavy slowdown), and lift it at INCIDENT_END_S. This is the
# textbook scenario ALINEA exists to handle.
STRESS_DURATION_S = 1500
INCIDENT_START_S  = 600       # incident appears 10 minutes in
INCIDENT_END_S    = 1500      # lasts 15 minutes
INCIDENT_LANES    = ["hwy_E_s3_0", "hwy_E_s3_1"]   # close 2 of 4 lanes
INCIDENT_SPEED    = 5.0       # m/s when the lane is "closed"

STRESS_DEMAND = {
    "hwy_E_thru":     4000,
    "svc_E_merge_E1": 2000,
    "svc_E_merge_E2": 2000,
    # A little W-bound + svc-through baseline so the network isn't half empty.
    "hwy_W_thru":     1500,
    "svc_E_thru":      300,
    "svc_W_thru":      300,
    "svc_W_merge_W1":  400,
    "svc_W_merge_W2":  400,
}
STRESS_ROUTES = {
    "hwy_E_thru":     "hwy_E_s1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3",
    "hwy_W_thru":     "hwy_W_s1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3",
    "svc_E_thru":     "svc_E_s1 svc_E_s2 svc_E_s3",
    "svc_W_thru":     "svc_W_s1 svc_W_s2 svc_W_s3",
    "svc_E_merge_E1": "svc_E_s1 merge_E1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3",
    "svc_E_merge_E2": "svc_E_s1 svc_E_s2 merge_E2 hwy_E_s2_accel hwy_E_s3",
    "svc_W_merge_W1": "svc_W_s1 merge_W1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3",
    "svc_W_merge_W2": "svc_W_s1 svc_W_s2 merge_W2 hwy_W_s2_accel hwy_W_s3",
}


def _build_stress_demand(rou_path: Path) -> None:
    """Write a high-load .rou.xml that *will* congest the corridor."""
    import random
    rng = random.Random(42)
    total = sum(STRESS_DEMAND.values())
    interval = STRESS_DURATION_S / total

    pool: list[str] = []
    for name, count in STRESS_DEMAND.items():
        pool.extend([name] * count)
    rng.shuffle(pool)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<!-- Stress demand: {total} cars over {STRESS_DURATION_S}s -->',
        '<routes>',
        '    <vType id="car" accel="1.3" decel="2.25" sigma="0.5" '
        'length="5" minGap="2.5" maxSpeed="27.78" lcKeepRight="0"/>',
    ]
    for name, edges in STRESS_ROUTES.items():
        lines.append(f'    <route id="{name}" edges="{edges}"/>')
    lines.append("")

    HWY_ROUTES = {"hwy_E_thru", "hwy_W_thru"}
    hwy_counter = 0
    for i, name in enumerate(pool):
        depart = round(i * interval, 1)
        if name in HWY_ROUTES:
            dl = str(hwy_counter % 4)
            hwy_counter += 1
        else:
            dl = "best"
        lines.append(
            f'    <vehicle id="v_{i}" type="car" route="{name}" '
            f'depart="{depart}" departLane="{dl}" departSpeed="max"/>'
        )
    lines.append("</routes>")
    rou_path.write_text("\n".join(lines))


def _build_stress_config(cfg_path: Path, rou_filename: str) -> None:
    """Write a .sumocfg pointing at the stress demand file."""
    net_path = os.path.relpath(NETWORK_DIR / "highway.net.xml", cfg_path.parent)
    rou_path = os.path.relpath(NETWORK_DIR / rou_filename, cfg_path.parent)
    cfg_path.write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<configuration>\n'
        f'  <input>\n'
        f'    <net-file value="{net_path}"/>\n'
        f'    <route-files value="{rou_path}"/>\n'
        f'  </input>\n'
        f'  <time>\n'
        f'    <begin value="0"/>\n'
        f'    <end value="{MAX_SIM_TIME_S}"/>\n'
        f'    <step-length value="1.0"/>\n'
        f'  </time>\n'
        f'  <processing>\n'
        f'    <time-to-teleport value="-1"/>\n'
        f'  </processing>\n'
        f'  <report>\n'
        f'    <verbose value="false"/>\n'
        f'    <no-step-log value="true"/>\n'
        f'  </report>\n'
        f'</configuration>\n'
    )


# --------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------- #

def _svc_queue_for(meter_id: str) -> int:
    """Count cars on the service-road edge feeding this meter that are
    moving slower than 2.8 m/s (~10 km/h) — the project's standard queue
    definition."""
    edge = METER_INFO[meter_id]["svc_in_edge"]
    count = 0
    for veh_id in traci.edge.getLastStepVehicleIDs(edge):
        if traci.vehicle.getSpeed(veh_id) < 2.8:
            count += 1
    return count


def _mean_occupancy_for(meter_id: str) -> float:
    """Mean lane occupancy (%) on the downstream lanes."""
    lanes = METER_INFO[meter_id]["downstream_lanes"]
    occs = [traci.lane.getLastStepOccupancy(lid) for lid in lanes]
    occs = [o for o in occs if o >= 0]
    return 100.0 * (sum(occs) / len(occs)) if occs else 0.0


def _build_intersection_states() -> List[IntersectionState]:
    """Minimal IntersectionState list the controllers expect."""
    out: List[IntersectionState] = []
    for mid in METER_IDS:
        state = traci.trafficlight.getRedYellowGreenState(mid)
        phase = traci.trafficlight.getPhase(mid)
        # Map ramp queue into the W slot (E-bound) or E slot (W-bound),
        # matching the convention RampMeterController / AlineaRampController use.
        q = _svc_queue_for(mid)
        ql = QueueLengths(W=q) if mid.startswith("E") else QueueLengths(E=q)
        out.append(IntersectionState(
            id=mid,
            signal_state=state,
            phase_index=phase,
            phase_remaining_s=0.0,
            queue_lengths=ql,
            vehicle_count=0,
            avg_wait_s=0.0,
        ))
    return out


# --------------------------------------------------------------------- #
# Controllers
# --------------------------------------------------------------------- #

class AlwaysGreenController:
    """Holds every meter at phase 0 (merge green) for the whole run by
    overriding the phase duration to a large value each tick we re-enter
    phase 0. Cheap and reliable on this simple 2-phase TLS.
    """
    def decide(self, intersections, sim_time):
        from shared.types import PolicyDecision, SignalCommand
        cmds = []
        for it in intersections:
            if it.id not in METER_IDS:
                continue
            # Force phase 0 and pin the duration so SUMO never advances.
            traci.trafficlight.setPhase(it.id, 0)
            cmds.append(SignalCommand(intersection_id=it.id, duration_s=10_000.0))
        return PolicyDecision(commands=cmds)


# --------------------------------------------------------------------- #
# One full run
# --------------------------------------------------------------------- #

def run_once(label: str, controller, config_path: Path) -> Dict:
    print(f"\n=== Run: {label} ===")

    traci.start([
        SUMO_BINARY, "-c", str(config_path),
        "--no-step-log", "true",
        "--no-warnings", "true",
        "--time-to-teleport", "-1",
        "--seed", "42",
    ])

    sim_time = 0.0
    trip_times: List[float] = []
    mainline_trip_times: List[float] = []  # cars that never used a ramp meter
    ramp_trip_times: List[float] = []      # cars that did
    arrival_count = 0
    samples_by_meter: Dict[str, Dict[str, List[float]]] = {
        m: {"occ": [], "queue": []} for m in METER_IDS
    }
    bottleneck_occ_samples: List[float] = []
    next_sample_at = SAMPLE_EVERY_S
    start_wall = time.time()

    departed_at: Dict[str, float] = {}
    departed_route: Dict[str, str] = {}   # vehicle_id -> route name
    RAMP_ROUTES = {"svc_E_merge_E1", "svc_E_merge_E2",
                   "svc_W_merge_W1", "svc_W_merge_W2"}

    # Capture the original maxSpeed of the incident lanes so we can lift the
    # bottleneck at INCIDENT_END_S without hard-coding a value.
    incident_baseline: Dict[str, float] = {}
    for lid in INCIDENT_LANES:
        try:
            incident_baseline[lid] = traci.lane.getMaxSpeed(lid)
        except traci.TraCIException:
            pass
    incident_active = False

    try:
        while True:
            # Step before reading state so subscribed values are fresh.
            traci.simulationStep()
            sim_time = traci.simulation.getTime()

            # Track departures / arrivals to compute per-vehicle trip times.
            for vid in traci.simulation.getDepartedIDList():
                departed_at[vid] = sim_time
                try:
                    departed_route[vid] = traci.vehicle.getRouteID(vid)
                except traci.TraCIException:
                    pass
            for vid in traci.simulation.getArrivedIDList():
                start = departed_at.pop(vid, None)
                route = departed_route.pop(vid, "")
                if start is not None:
                    dur = sim_time - start
                    trip_times.append(dur)
                    if route in RAMP_ROUTES:
                        ramp_trip_times.append(dur)
                    else:
                        mainline_trip_times.append(dur)
                    arrival_count += 1

            # Incident hook: drop the maxSpeed on selected lanes during the
            # incident window. ALINEA should react to the resulting
            # downstream backup; always-green has nothing to fall back on.
            if not incident_active and INCIDENT_START_S <= sim_time < INCIDENT_END_S:
                for lid in INCIDENT_LANES:
                    try:
                        traci.lane.setMaxSpeed(lid, INCIDENT_SPEED)
                    except traci.TraCIException:
                        pass
                incident_active = True
                print(f"  Incident OPEN at t={sim_time:.0f}s "
                      f"(lanes {INCIDENT_LANES} -> {INCIDENT_SPEED} m/s)")
            elif incident_active and sim_time >= INCIDENT_END_S:
                for lid, sp in incident_baseline.items():
                    try:
                        traci.lane.setMaxSpeed(lid, sp)
                    except traci.TraCIException:
                        pass
                incident_active = False
                print(f"  Incident CLEARED at t={sim_time:.0f}s")

            # Sample bottleneck state on a coarse cadence.
            if sim_time >= next_sample_at:
                for mid in METER_IDS:
                    samples_by_meter[mid]["occ"].append(_mean_occupancy_for(mid))
                    samples_by_meter[mid]["queue"].append(_svc_queue_for(mid))
                # Also sample the bottleneck section itself (all 4 lanes of
                # hwy_E_s3) so we can quantify how bad the backup gets.
                bn_lanes = ["hwy_E_s3_0", "hwy_E_s3_1", "hwy_E_s3_2", "hwy_E_s3_3"]
                occs = [traci.lane.getLastStepOccupancy(l) for l in bn_lanes]
                occs = [o for o in occs if o >= 0]
                if occs:
                    bottleneck_occ_samples.append(100.0 * sum(occs) / len(occs))
                next_sample_at += SAMPLE_EVERY_S

            # Hand control to the policy.
            intersections = _build_intersection_states()
            decision = controller.decide(intersections, sim_time)
            for cmd in decision.commands:
                if cmd.duration_s is not None:
                    try:
                        traci.trafficlight.setPhaseDuration(
                            cmd.intersection_id, cmd.duration_s,
                        )
                    except traci.TraCIException:
                        pass

            # Race-mode exit conditions.
            on_net = traci.simulation.getMinExpectedNumber()  # remaining + en route
            if on_net == 0:
                print(f"  Network cleared at sim_time={sim_time:.0f}s")
                break
            if sim_time >= MAX_SIM_TIME_S:
                print(f"  Hit time cap ({MAX_SIM_TIME_S}s) with {on_net} cars remaining")
                break
    finally:
        try:
            traci.close()
        except Exception:
            pass

    wall = time.time() - start_wall

    # Aggregate samples to corridor-wide medians.
    corridor_occ = []
    corridor_queue_max = 0
    for mid in METER_IDS:
        corridor_occ.extend(samples_by_meter[mid]["occ"])
        if samples_by_meter[mid]["queue"]:
            corridor_queue_max = max(
                corridor_queue_max, max(samples_by_meter[mid]["queue"])
            )

    result = {
        "label": label,
        "clearance_s": sim_time,
        "completed_trips": arrival_count,
        "mean_trip_time_s": statistics.mean(trip_times) if trip_times else None,
        "median_trip_time_s": statistics.median(trip_times) if trip_times else None,
        "p90_trip_time_s": (
            statistics.quantiles(trip_times, n=10)[-1] if len(trip_times) >= 10 else None
        ),
        "mean_mainline_trip_time_s": (
            statistics.mean(mainline_trip_times) if mainline_trip_times else None
        ),
        "mean_ramp_trip_time_s": (
            statistics.mean(ramp_trip_times) if ramp_trip_times else None
        ),
        "mean_downstream_occupancy_pct": (
            statistics.mean(corridor_occ) if corridor_occ else None
        ),
        "mean_bottleneck_occupancy_pct": (
            statistics.mean(bottleneck_occ_samples) if bottleneck_occ_samples else None
        ),
        "max_bottleneck_occupancy_pct": (
            max(bottleneck_occ_samples) if bottleneck_occ_samples else None
        ),
        "max_ramp_queue_veh": corridor_queue_max,
        "wall_s": wall,
    }

    print(f"  Completed trips        : {result['completed_trips']}")
    print(f"  Clearance time         : {result['clearance_s']:.0f} s")
    print(f"  Mean trip time (all)   : {_fmt(result['mean_trip_time_s'])} s")
    print(f"    mainline-only        : {_fmt(result['mean_mainline_trip_time_s'])} s")
    print(f"    ramp-merging only    : {_fmt(result['mean_ramp_trip_time_s'])} s")
    print(f"  Median trip time       : {_fmt(result['median_trip_time_s'])} s")
    print(f"  P90 trip time          : {_fmt(result['p90_trip_time_s'])} s")
    print(f"  Mean downstream occ.   : {_fmt(result['mean_downstream_occupancy_pct'])} %")
    print(f"  Mean bottleneck occ.   : {_fmt(result['mean_bottleneck_occupancy_pct'])} %")
    print(f"  Max bottleneck occ.    : {_fmt(result['max_bottleneck_occupancy_pct'])} %")
    print(f"  Max ramp queue         : {result['max_ramp_queue_veh']} veh")
    print(f"  Wall-clock             : {result['wall_s']:.1f} s")
    return result


def _fmt(v: Optional[float]) -> str:
    return "—" if v is None else f"{v:.1f}"


# --------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------- #

def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", choices=["highway", "combined"],
                        default="combined",
                        help="Which network to run the A/B on. 'combined' (default) "
                             "uses the city+highway corridor where freeway exits feed "
                             "real signalized streets — no synthetic incident needed.")
    args = parser.parse_args()

    if args.network == "combined":
        # The combined map has its own canonical demand + config baked in
        # by scripts/generate_combined.py. Real downstream constraint from
        # the city signals replaces the synthetic incident.
        cfg_path = CONFIG_DIR / "simulation_combined.sumocfg"
        if not cfg_path.exists():
            print(f"Combined config not found: {cfg_path}", file=sys.stderr)
            print("Run: python scripts/generate_combined.py first", file=sys.stderr)
            sys.exit(1)
        # Skip the incident — the grid IS the bottleneck.
        global INCIDENT_START_S, INCIDENT_END_S
        INCIDENT_START_S = 1e9
        INCIDENT_END_S   = 1e9
    else:
        if not (NETWORK_DIR / "highway.net.xml").exists():
            print(f"Highway network not found in {NETWORK_DIR}", file=sys.stderr)
            sys.exit(1)
        # Build the dense stress demand + matching .sumocfg in-place.
        rou_path = NETWORK_DIR / "highway_stress.rou.xml"
        cfg_path = CONFIG_DIR  / "highway_stress.sumocfg"
        print(f"Writing stress demand: {sum(STRESS_DEMAND.values())} cars over {STRESS_DURATION_S}s")
        _build_stress_demand(rou_path)
        _build_stress_config(cfg_path, rou_path.name)

    print(f"\n*** A/B on network: {args.network} ***")

    # Run A — always green.
    a = run_once("Always-green (no metering)", AlwaysGreenController(), cfg_path)

    # Run B — ALINEA tuned for an incident scenario: lower target (start
    # throttling earlier) + higher gain (react more strongly per % over).
    alinea_params = AlineaPolicyParams(
        target_occupancy_pct=15.0,
        gain_K=150.0,
        control_interval_s=15.0,
    )
    alinea = AlineaRampController(
        traci_module=traci,
        params=alinea_params,
        meter_info=METER_INFO,
    )
    b = run_once("ALINEA (target=15%, K=150)", alinea, cfg_path)

    # Side-by-side delta.
    print("\n=== A/B summary ===")
    rows = [
        ("Clearance (s)",         a["clearance_s"],                   b["clearance_s"]),
        ("Completed trips",       a["completed_trips"],               b["completed_trips"]),
        ("Trip (all, mean)",      a["mean_trip_time_s"],              b["mean_trip_time_s"]),
        ("Trip (mainline, mean)", a["mean_mainline_trip_time_s"],     b["mean_mainline_trip_time_s"]),
        ("Trip (ramp, mean)",     a["mean_ramp_trip_time_s"],         b["mean_ramp_trip_time_s"]),
        ("Trip (median)",         a["median_trip_time_s"],            b["median_trip_time_s"]),
        ("Trip (P90)",            a["p90_trip_time_s"],               b["p90_trip_time_s"]),
        ("Mean bottleneck occ.",  a["mean_bottleneck_occupancy_pct"], b["mean_bottleneck_occupancy_pct"]),
        ("Max bottleneck occ.",   a["max_bottleneck_occupancy_pct"],  b["max_bottleneck_occupancy_pct"]),
        ("Max ramp queue (veh)",  a["max_ramp_queue_veh"],            b["max_ramp_queue_veh"]),
    ]
    print(f"{'Metric':<22} | {'Always green':>12} | {'ALINEA':>12} | {'diff':>14}")
    print("-" * 64)
    for name, av, bv in rows:
        if av is None or bv is None:
            print(f"{name:<22} | {_fmt(av):>12} | {_fmt(bv):>12} | {'-':>14}")
            continue
        delta = bv - av
        if isinstance(av, (int, float)) and isinstance(bv, (int, float)) and av != 0:
            pct = 100.0 * delta / av
            delta_s = f"{delta:+.1f} ({pct:+.1f}%)"
        else:
            delta_s = f"{delta:+.1f}"
        print(f"{name:<22} | {_fmt(av):>12} | {_fmt(bv):>12} | {delta_s:>14}")


if __name__ == "__main__":
    main()

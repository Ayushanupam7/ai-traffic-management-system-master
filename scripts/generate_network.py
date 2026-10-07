"""Generate a realistic arterial SUMO network with traffic demand.

Layout: 2 main east-west arterials (3 lanes, 60 km/h) crossed by
3 north-south streets (2 lanes, 40 km/h). 6 intersections total.

    700m between cross streets (E-W), 500m between arterials (N-S).

Run:
    python scripts/generate_network.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


# --- 4-phase split-phase TLS parameters ---
PHASE_ORDER = ["N", "E", "S", "W"]
# E-W arterials get more green than N-S cross streets
GREEN_DURATION_BY_DIR = {"N": 15, "S": 15, "E": 35, "W": 35}
YELLOW_DURATION = 3
ALL_RED_DURATION = 1

# --- Network geometry ---
EW_SPACING = 700   # meters between cross streets (along arterials)
NS_SPACING = 500   # meters between arterials (along cross streets)
STUB_LENGTH = 500  # boundary stub length

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
NETWORK_DIR = PROJECT_ROOT / "packages" / "sumo-engine" / "networks"
CONFIG_DIR = PROJECT_ROOT / "packages" / "sumo-engine" / "configs"
NETWORK_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

SUMO_HOME = os.environ.get("SUMO_HOME", "")


# ──────────────────────────────────────────────
# Step 1: Build .nod.xml, .edg.xml, .typ.xml
# ──────────────────────────────────────────────

def _write_nodes(path: Path) -> None:
    """Write intersection + boundary nodes."""
    root = ET.Element("nodes")

    # 6 intersections: columns A/B/C, rows 0/1
    positions = {
        "A0": (0, 0),        "B0": (EW_SPACING, 0),        "C0": (2 * EW_SPACING, 0),
        "A1": (0, NS_SPACING), "B1": (EW_SPACING, NS_SPACING), "C1": (2 * EW_SPACING, NS_SPACING),
    }
    for nid, (x, y) in positions.items():
        ET.SubElement(root, "node", id=nid, x=str(x), y=str(y), type="traffic_light")

    # Boundary stubs — arterial ends (left/right) and cross-street ends (bottom/top)
    boundary = {
        # West stubs (arterial)
        "left0": (-STUB_LENGTH, 0),
        "left1": (-STUB_LENGTH, NS_SPACING),
        # East stubs (arterial)
        "right0": (2 * EW_SPACING + STUB_LENGTH, 0),
        "right1": (2 * EW_SPACING + STUB_LENGTH, NS_SPACING),
        # South stubs (cross street)
        "bottom0": (0, -STUB_LENGTH),
        "bottom1": (EW_SPACING, -STUB_LENGTH),
        "bottom2": (2 * EW_SPACING, -STUB_LENGTH),
        # North stubs (cross street)
        "top0": (0, NS_SPACING + STUB_LENGTH),
        "top1": (EW_SPACING, NS_SPACING + STUB_LENGTH),
        "top2": (2 * EW_SPACING, NS_SPACING + STUB_LENGTH),
    }
    for nid, (x, y) in boundary.items():
        ET.SubElement(root, "node", id=nid, x=str(x), y=str(y), type="priority")

    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def _write_types(path: Path) -> None:
    """Write edge type definitions."""
    root = ET.Element("types")
    ET.SubElement(root, "type", id="arterial", numLanes="3", speed="5.56")  # 20 km/h
    ET.SubElement(root, "type", id="cross", numLanes="2", speed="3.61")    # 13 km/h
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def _write_edges(path: Path) -> None:
    """Write all edges (bidirectional via <edge> pairs)."""
    root = ET.Element("edges")

    def _edge(src, dst, etype):
        ET.SubElement(root, "edge", id=f"{src}{dst}", **{"from": src, "to": dst, "type": etype})

    # E-W arterials (3 lanes, 60 km/h)
    # Row 0: left0 → A0 → B0 → C0 → right0
    for src, dst in [("left0", "A0"), ("A0", "B0"), ("B0", "C0"), ("C0", "right0")]:
        _edge(src, dst, "arterial")
        _edge(dst, src, "arterial")
    # Row 1: left1 → A1 → B1 → C1 → right1
    for src, dst in [("left1", "A1"), ("A1", "B1"), ("B1", "C1"), ("C1", "right1")]:
        _edge(src, dst, "arterial")
        _edge(dst, src, "arterial")

    # N-S cross streets (2 lanes, 40 km/h)
    # Column A: bottom0 → A0 → A1 → top0
    for src, dst in [("bottom0", "A0"), ("A0", "A1"), ("A1", "top0")]:
        _edge(src, dst, "cross")
        _edge(dst, src, "cross")
    # Column B: bottom1 → B0 → B1 → top1
    for src, dst in [("bottom1", "B0"), ("B0", "B1"), ("B1", "top1")]:
        _edge(src, dst, "cross")
        _edge(dst, src, "cross")
    # Column C: bottom2 → C0 → C1 → top2
    for src, dst in [("bottom2", "C0"), ("C0", "C1"), ("C1", "top2")]:
        _edge(src, dst, "cross")
        _edge(dst, src, "cross")

    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# ──────────────────────────────────────────────
# Step 2: Run netconvert + rewrite TLS
# ──────────────────────────────────────────────

def generate_network() -> Path:
    """Build the network via netconvert from .nod/.edg/.typ files."""
    nod_file = NETWORK_DIR / "arterial.nod.xml"
    edg_file = NETWORK_DIR / "arterial.edg.xml"
    typ_file = NETWORK_DIR / "arterial.typ.xml"
    net_file = NETWORK_DIR / "arterial.net.xml"

    _write_nodes(nod_file)
    _write_types(typ_file)
    _write_edges(edg_file)
    print(f"Wrote {nod_file.name}, {typ_file.name}, {edg_file.name}")

    cmd = [
        "netconvert",
        "--node-files", str(nod_file),
        "--edge-files", str(edg_file),
        "--type-files", str(typ_file),
        "--output-file", str(net_file),
        "--no-turnarounds", "true",
        "--tls.default-type", "static",
    ]
    print(f"Running netconvert...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"netconvert error: {result.stderr}")
        sys.exit(1)
    print(f"Network generated: {net_file}")

    rewrite_tls_to_split_phase(net_file)
    return net_file


# ──────────────────────────────────────────────
# TLS rewriting (same logic, updated for 3x2)
# ──────────────────────────────────────────────

def _approach_dir_for_edge(edge_id: str, tl_id: str) -> str:
    """Return N/E/S/W approach direction for an edge arriving at tl_id."""
    dst = tl_id
    if not edge_id.endswith(dst):
        return ""
    src = edge_id[: -len(dst)]

    if src.startswith("left"):
        return "W"
    if src.startswith("right"):
        return "E"
    if src.startswith("bottom"):
        return "S"
    if src.startswith("top"):
        return "N"

    if len(src) == 2 and src[0] in "ABC" and src[1] in "01":
        src_col = ord(src[0]) - ord("A")
        src_row = int(src[1])
        dst_col = ord(dst[0]) - ord("A")
        dst_row = int(dst[1])
        if src_row < dst_row:
            return "S"
        if src_row > dst_row:
            return "N"
        if src_col < dst_col:
            return "W"
        if src_col > dst_col:
            return "E"
    return ""


def rewrite_tls_to_split_phase(net_file: Path) -> None:
    """Rewrite every intersection's TLS to 4-phase split-phase (N→E→S→W)."""
    print(f"Rewriting TLS programs in {net_file.name}...")
    tree = ET.parse(net_file)
    root = tree.getroot()

    link_in_edge: dict = {}
    for conn in root.findall("connection"):
        tl_id = conn.get("tl")
        if tl_id is None:
            continue
        idx = int(conn.get("linkIndex"))
        link_in_edge[(tl_id, idx)] = conn.get("from")

    rewritten = 0
    for tl in root.findall("tlLogic"):
        tl_id = tl.get("id")
        indices = [i for (t, i) in link_in_edge if t == tl_id]
        if not indices:
            continue
        num_links = max(indices) + 1

        dir_links: dict = {d: [] for d in PHASE_ORDER}
        for i in range(num_links):
            in_edge = link_in_edge.get((tl_id, i), "")
            d = _approach_dir_for_edge(in_edge, tl_id)
            if d:
                dir_links[d].append(i)

        for phase in list(tl.findall("phase")):
            tl.remove(phase)
        tl.set("type", "static")
        tl.set("programID", "0")
        tl.set("offset", "0")

        def _state(green_indices, prev_green_indices=None, yellow_for_prev=False):
            chars = ["r"] * num_links
            if yellow_for_prev and prev_green_indices:
                for idx in prev_green_indices:
                    chars[idx] = "y"
                return "".join(chars)
            for idx in green_indices:
                chars[idx] = "G"
            return "".join(chars)

        prev_dir = None
        for d in PHASE_ORDER:
            greens = dir_links[d]
            if prev_dir is not None:
                yellow_state = _state([], dir_links[prev_dir], yellow_for_prev=True)
                ET.SubElement(tl, "phase", duration=str(YELLOW_DURATION), state=yellow_state)
                ET.SubElement(tl, "phase", duration=str(ALL_RED_DURATION), state="r" * num_links)
            ET.SubElement(tl, "phase", duration=str(GREEN_DURATION_BY_DIR[d]), state=_state(greens))
            prev_dir = d

        yellow_state = _state([], dir_links[prev_dir], yellow_for_prev=True)
        ET.SubElement(tl, "phase", duration=str(YELLOW_DURATION), state=yellow_state)
        ET.SubElement(tl, "phase", duration=str(ALL_RED_DURATION), state="r" * num_links)
        rewritten += 1

    tree.write(net_file, encoding="UTF-8", xml_declaration=True)
    total_green = sum(GREEN_DURATION_BY_DIR.values())
    total_cycle = total_green + 4 * (YELLOW_DURATION + ALL_RED_DURATION)
    print(f"  Rewrote {rewritten} TLS programs. Cycle = {total_cycle}s")


# ──────────────────────────────────────────────
# Route generation
# ──────────────────────────────────────────────

import random


# ──────────────────────────────────────────────
# Route / demand generation
# ──────────────────────────────────────────────

# Named routes through the network
EW_ROUTES = [
    # Eastbound row 0
    ("EB0_full", "left0A0 A0B0 B0C0 C0right0"),
    # Westbound row 0
    ("WB0_full", "right0C0 C0B0 B0A0 A0left0"),
    # Eastbound row 1
    ("EB1_full", "left1A1 A1B1 B1C1 C1right1"),
    # Westbound row 1
    ("WB1_full", "right1C1 C1B1 B1A1 A1left1"),
    # Partial E-W
    ("EB0_half", "left0A0 A0B0"),
    ("WB0_half", "C0B0 B0A0 A0left0"),
    ("EB1_half", "left1A1 A1B1"),
    ("WB1_half", "C1B1 B1A1 A1left1"),
]

NS_ROUTES = [
    # Northbound columns
    ("NB_A", "bottom0A0 A0A1 A1top0"),
    ("NB_B", "bottom1B0 B0B1 B1top1"),
    ("NB_C", "bottom2C0 C0C1 C1top2"),
    # Southbound columns
    ("SB_A", "top0A1 A1A0 A0bottom0"),
    ("SB_B", "top1B1 B1B0 B0bottom1"),
    ("SB_C", "top2C1 C1C0 C0bottom2"),
]

TURN_ROUTES = [
    # Enter from west on row 0, turn north at B, exit top
    ("W_turn_N_B", "left0A0 A0B0 B0B1 B1top1"),
    # Enter from east on row 0, turn north at B, exit top
    ("E_turn_N_B", "right0C0 C0B0 B0B1 B1top1"),
    # Enter from south at A, turn east on row 0, exit east
    ("S_turn_E_A", "bottom0A0 A0B0 B0C0 C0right0"),
    # Enter from south at C, turn west on row 0, exit west
    ("S_turn_W_C", "bottom2C0 C0B0 B0A0 A0left0"),
    # Enter from north at A, turn east on row 1
    ("N_turn_E_A", "top0A1 A1B1 B1C1 C1right1"),
    # Enter from north at C, turn west on row 1
    ("N_turn_W_C", "top2C1 C1B1 B1A1 A1left1"),
]


def _build_route_xml(
    profile_name: str,
    ew_share: float,
    ns_share: float,
    turn_share: float,
    total_vehicles: int,
    duration_s: int,
    seed: int,
) -> str:
    """Build a .rou.xml string with the given demand split."""
    rng = random.Random(seed)

    # Build weighted route pool
    pool: list[tuple[str, str]] = []
    ew_count = int(total_vehicles * ew_share)
    ns_count = int(total_vehicles * ns_share)
    turn_count = total_vehicles - ew_count - ns_count

    for _ in range(ew_count):
        name, edges = rng.choice(EW_ROUTES)
        pool.append((name, edges))
    for _ in range(ns_count):
        name, edges = rng.choice(NS_ROUTES)
        pool.append((name, edges))
    for _ in range(turn_count):
        name, edges = rng.choice(TURN_ROUTES)
        pool.append((name, edges))

    rng.shuffle(pool)

    # Spread departures evenly across the duration
    interval = duration_s / total_vehicles

    # Collect unique routes
    unique_routes: dict[str, str] = {}
    for name, edges in pool:
        if name not in unique_routes:
            unique_routes[name] = edges

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<!-- Demand profile: {profile_name} | {total_vehicles} vehicles over {duration_s}s -->',
        '<routes>',
        '    <vType id="car" accel="1.3" decel="2.25" sigma="0.5" '
        'length="5" minGap="2.5" maxSpeed="5.56"/>',
    ]
    for name, edges in unique_routes.items():
        lines.append(f'    <route id="{name}" edges="{edges}"/>')
    lines.append("")

    for i, (route_name, _edges) in enumerate(pool):
        depart = round(i * interval, 1)
        lines.append(
            f'    <vehicle id="v_{i}" type="car" route="{route_name}" '
            f'depart="{depart}" departLane="best" departSpeed="max"/>'
        )

    lines.append("</routes>")
    return "\n".join(lines)


PROFILES = {
    "balanced": (0.40, 0.40, 0.20),   # 40% E-W, 40% N-S, 20% turns
    "asym":     (0.56, 0.24, 0.20),   # 70:30 EW:NS ratio (with 20% turns)
    "extreme":  (0.75, 0.10, 0.15),   # 75% E-W, 10% N-S, 15% turns
}


def generate_demand_profiles(
    total_vehicles: int = 5500,
    duration_s: int = 3600,
) -> None:
    """Generate route files for all demand profiles."""
    for profile_name, (ew, ns, turn) in PROFILES.items():
        route_file = NETWORK_DIR / f"arterial_{profile_name}.rou.xml"
        xml = _build_route_xml(
            profile_name, ew, ns, turn,
            total_vehicles, duration_s, seed=42,
        )
        route_file.write_text(xml)
        ew_n = int(total_vehicles * ew)
        ns_n = int(total_vehicles * ns)
        turn_n = total_vehicles - ew_n - ns_n
        print(f"  {profile_name}: {route_file.name}  "
              f"(EW={ew_n}, NS={ns_n}, turn={turn_n})")

    # Also write a default route file (balanced) for the main simulation
    default_xml = _build_route_xml("balanced", 0.40, 0.40, 0.20,
                                    total_vehicles, duration_s, seed=42)
    default_route = NETWORK_DIR / "arterial.rou.xml"
    default_route.write_text(default_xml)
    print(f"  default: {default_route.name} (copy of balanced)")


# ──────────────────────────────────────────────
# SUMO config files
# ──────────────────────────────────────────────

def _write_sumocfg(config_file: Path, route_file_name: str, end_time: int = 7200) -> None:
    """Write a .sumocfg pointing to the arterial network + given route file."""
    net_path = os.path.relpath(NETWORK_DIR / "arterial.net.xml", CONFIG_DIR)
    route_path = os.path.relpath(NETWORK_DIR / route_file_name, CONFIG_DIR)

    config_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value="{net_path}"/>
        <route-files value="{route_path}"/>
    </input>
    <time>
        <begin value="0"/>
        <end value="{end_time}"/>
        <step-length value="1.0"/>
    </time>
    <processing>
        <time-to-teleport value="-1"/>
    </processing>
    <report>
        <verbose value="false"/>
        <no-step-log value="true"/>
    </report>
</configuration>
"""
    config_file.write_text(config_xml)


def generate_sumo_configs() -> None:
    """Generate main + race SUMO config files."""
    # Main simulation config (balanced demand)
    _write_sumocfg(CONFIG_DIR / "simulation.sumocfg", "arterial.rou.xml")
    print(f"  simulation.sumocfg (default)")

    # Race configs for each demand profile
    for profile_name in PROFILES:
        cfg_file = CONFIG_DIR / f"race_{profile_name}.sumocfg"
        route_name = f"arterial_{profile_name}.rou.xml"
        _write_sumocfg(cfg_file, route_name)
        print(f"  {cfg_file.name}")


def generate_carla_network() -> None:
    """Derive a SUMO network from CARLA Town03's OpenDRIVE.

    Requires env var CARLA_ROOT pointing at the CARLA server root
    (e.g., C:/CARLA_0.9.15). Uses SUMO's netconvert with --opendrive-files.

    Output: packages/sumo-engine/networks/carla_town03.net.xml.

    After running this you still need to:
      1. Hand-pick 6 junctions in the converted net and fill in
         packages/sumo-engine/configs/carla_junctions.json.
      2. Regenerate route files on the new topology (not yet automated —
         Town03's road graph differs from our synthetic arterial, so routes
         have to be authored per-junction).
    """
    carla_root = os.environ.get("CARLA_ROOT")
    if not carla_root:
        print("  ERROR: set CARLA_ROOT to your CARLA server install path, e.g.")
        print("         $env:CARLA_ROOT = 'C:/CARLA_0.9.15'")
        return
    xodr = Path(carla_root) / "CarlaUE4" / "Content" / "Carla" / "Maps" / "OpenDrive" / "Town03.xodr"
    if not xodr.exists():
        print(f"  ERROR: Town03.xodr not found at {xodr}")
        return

    out = NETWORK_DIR / "carla_town03.net.xml"
    cmd = [
        "netconvert",
        "--opendrive-files", str(xodr),
        "-o", str(out),
        "--geometry.remove", "true",
        "--ramps.guess", "false",
    ]
    try:
        subprocess.run(cmd, check=True)
    except Exception as e:
        print(f"  netconvert failed: {e}")
        return

    print(f"  wrote {out}")
    print("  NEXT: edit packages/sumo-engine/configs/carla_junctions.json with")
    print("        the real junction ids + camera transforms for 6 junctions.")


def main(argv: list[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate SUMO networks")
    parser.add_argument(
        "--map",
        choices=["arterial", "carla"],
        default="arterial",
        help="arterial = 3x2 synthetic grid (default); carla = derive from Town03 OpenDRIVE",
    )
    args = parser.parse_args(argv)

    if args.map == "carla":
        print("=== CARLA-derived Network Generation ===\n")
        generate_carla_network()
        return

    print("=== SUMO Network Generation ===\n")

    print("Step 1: Building network...")
    generate_network()

    print("\nStep 2: Generating demand profiles (1200 cars, 1 hour)...")
    generate_demand_profiles()

    print("\nStep 3: Writing SUMO configs...")
    generate_sumo_configs()

    print("\nDone! Files are in:")
    print(f"  Networks: {NETWORK_DIR}")
    print(f"  Configs:  {CONFIG_DIR}")


if __name__ == "__main__":
    main()

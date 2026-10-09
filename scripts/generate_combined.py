"""Generate the COMBINED city + highway SUMO network (colinear-merge v2).

Topology — straight-line corridor with the freeway and the arterial rows
sharing y-axes so the join is geometrically clean (no diagonal feeders):

       y = 500  ════ hwy_E (E-bound) ════ feed_E ═══ left1 ═ A1 ═ B1 ═ C1 ═ right1
                                                      │
                                                      │ cross
                                                      │
       y =   0  ════ hwy_W (W-bound) ════ feed_W ═══ left0 ═ A0 ═ B0 ═ C0 ═ right0

Service roads run parallel to their freeways but offset 40 m outward, so
the existing 40 m merge-ramp taper at each meter is preserved verbatim.

The previous version (v1) glued the highway corridor (centered at y=±200)
to the arterial grid (rows at y=0 / y=500) via diagonal feeder edges. The
result was a `<` chevron at the join — SUMO drew the feeder as a sharp
40-degree turn that broke lane connections and caused vehicles to fail
routing. v2 puts everything on the same two y-axes so the join is a
short, straight, lane-dropping edge.

Run:
    python scripts/generate_combined.py
"""

from __future__ import annotations

import os
import random
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# We share TLS-rewrite helpers and meter-position constants with the
# standalone highway generator, but we do NOT reuse its NODE_POS dict —
# combined needs different y-axes so the join with the arterial is clean.
import generate_highway as hwy
import generate_network as art


PROJECT_ROOT = Path(__file__).resolve().parent.parent
NETWORK_DIR  = PROJECT_ROOT / "packages" / "sumo-engine" / "networks"
CONFIG_DIR   = PROJECT_ROOT / "packages" / "sumo-engine" / "configs"
NETWORK_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# --- Layout ---
# E-bound highway aligns with arterial row 1 (y=500) so cars leaving the
# freeway pour onto the row-1 arterial without a vertical jump. W-bound
# highway mirrors at y=0 (row 0).
HWY_E_Y = 500.0
HWY_W_Y = 0.0
SVC_E_Y = HWY_E_Y + 40.0   # service road 40 m NORTH of E-bound freeway
SVC_W_Y = HWY_W_Y - 40.0   # service road 40 m SOUTH of W-bound freeway

# Arterial grid shifted so left0/left1 sit 300 m east of hwy_E_out /
# hwy_W_in respectively, leaving room for a colinear feeder edge.
# left0/left1 have native x = -STUB_LENGTH (-500). With shift = 2300,
# they land at x = 1800 — 300 m east of hwy_E_out / hwy_W_in (x = 1500).
ARTERIAL_X_SHIFT = 2300

# Highway geometry constants — reused from generate_highway so the meter
# positions and acceleration zones match the standalone map exactly.
HALF_CORR = hwy.HALF_CORR
RAMP_HALF = hwy.RAMP_HALF
ACCEL_LEN = hwy.ACCEL_LEN
E1_X      = hwy.E1_X
E2_X      = hwy.E2_X
W1_X      = hwy.W1_X
W2_X      = hwy.W2_X


# --------------------------------------------------------------------- #
# Step 1: Nodes
# --------------------------------------------------------------------- #

def _highway_node_positions() -> dict[str, tuple[float, float]]:
    """Build the highway-side node positions on the combined y-axes."""
    return {
        # Termini
        "hwy_E_in":   (-HALF_CORR, HWY_E_Y),
        "hwy_E_out":  ( HALF_CORR, HWY_E_Y),
        "hwy_W_in":   ( HALF_CORR, HWY_W_Y),
        "hwy_W_out":  (-HALF_CORR, HWY_W_Y),
        "svc_E_in":   (-HALF_CORR, SVC_E_Y),
        "svc_E_out":  ( HALF_CORR, SVC_E_Y),
        "svc_W_in":   ( HALF_CORR, SVC_W_Y),
        "svc_W_out":  (-HALF_CORR, SVC_W_Y),
        # Meter junctions — same x offsets as the standalone highway,
        # but pinned to the new y-axes.
        "hwy_E1":     (E1_X + RAMP_HALF,             HWY_E_Y),
        "hwy_E1_end": (E1_X + RAMP_HALF + ACCEL_LEN, HWY_E_Y),
        "hwy_E2":     (E2_X + RAMP_HALF,             HWY_E_Y),
        "hwy_E2_end": (E2_X + RAMP_HALF + ACCEL_LEN, HWY_E_Y),
        "svc_E1":     (E1_X - RAMP_HALF,             SVC_E_Y),
        "svc_E2":     (E2_X - RAMP_HALF,             SVC_E_Y),
        "hwy_W1":     (W1_X - RAMP_HALF,             HWY_W_Y),
        "hwy_W1_end": (W1_X - RAMP_HALF - ACCEL_LEN, HWY_W_Y),
        "hwy_W2":     (W2_X - RAMP_HALF,             HWY_W_Y),
        "hwy_W2_end": (W2_X - RAMP_HALF - ACCEL_LEN, HWY_W_Y),
        "svc_W1":     (W1_X + RAMP_HALF,             SVC_W_Y),
        "svc_W2":     (W2_X + RAMP_HALF,             SVC_W_Y),
    }


def _write_nodes(path: Path) -> None:
    root = ET.Element("nodes")

    # Highway side.
    SVC_METER_NODES = {"svc_E1", "svc_E2", "svc_W1", "svc_W2"}
    TLS_FOR_NODE = {"svc_E1": "E1", "svc_E2": "E2",
                    "svc_W1": "W1", "svc_W2": "W2"}
    for nid, (x, y) in _highway_node_positions().items():
        attrs = {"id": nid, "x": str(x), "y": str(y)}
        if nid in SVC_METER_NODES:
            attrs["type"] = "traffic_light"
            attrs["tl"] = TLS_FOR_NODE[nid]
        else:
            attrs["type"] = "priority"
        ET.SubElement(root, "node", **attrs)

    # Arterial side — shifted east, native y-coordinates preserved.
    art_positions = {
        "A0": (0,                       0),                       "B0": (art.EW_SPACING,                       0),                       "C0": (2 * art.EW_SPACING,                       0),
        "A1": (0,                       art.NS_SPACING),          "B1": (art.EW_SPACING,                       art.NS_SPACING),          "C1": (2 * art.EW_SPACING,                       art.NS_SPACING),
    }
    for nid, (x, y) in art_positions.items():
        ET.SubElement(root, "node", id=nid,
                      x=str(x + ARTERIAL_X_SHIFT), y=str(y),
                      type="traffic_light")

    boundary = {
        "left0":   (-art.STUB_LENGTH, 0),
        "left1":   (-art.STUB_LENGTH, art.NS_SPACING),
        "right0":  (2 * art.EW_SPACING + art.STUB_LENGTH, 0),
        "right1":  (2 * art.EW_SPACING + art.STUB_LENGTH, art.NS_SPACING),
        "bottom0": (0, -art.STUB_LENGTH),
        "bottom1": (art.EW_SPACING, -art.STUB_LENGTH),
        "bottom2": (2 * art.EW_SPACING, -art.STUB_LENGTH),
        "top0":    (0, art.NS_SPACING + art.STUB_LENGTH),
        "top1":    (art.EW_SPACING, art.NS_SPACING + art.STUB_LENGTH),
        "top2":    (2 * art.EW_SPACING, art.NS_SPACING + art.STUB_LENGTH),
    }
    for nid, (x, y) in boundary.items():
        ET.SubElement(root, "node", id=nid,
                      x=str(x + ARTERIAL_X_SHIFT), y=str(y),
                      type="priority")

    # NO feeder midpoint nodes in v2 — the feeders are single colinear
    # edges that go directly from hwy_E_out → left1 and left0 → hwy_W_in.

    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# --------------------------------------------------------------------- #
# Step 2: Edge types
# --------------------------------------------------------------------- #

def _write_types(path: Path) -> None:
    root = ET.Element("types")
    ET.SubElement(root, "type", id="freeway",       numLanes="4", speed="27.78")
    ET.SubElement(root, "type", id="freeway_accel", numLanes="5", speed="27.78")
    ET.SubElement(root, "type", id="service",      numLanes="2", speed="11.11")
    ET.SubElement(root, "type", id="ramp",         numLanes="1", speed="19.44")
    ET.SubElement(root, "type", id="arterial",     numLanes="3", speed="5.56")
    ET.SubElement(root, "type", id="cross",        numLanes="2", speed="3.61")
    # Feeder: 3-lane, ~50 km/h transition between the 4-lane freeway and
    # the 3-lane arterial. Drops one lane and most of the speed in a
    # single colinear segment, replacing v1's diagonal chevron.
    ET.SubElement(root, "type", id="feeder",       numLanes="3", speed="13.89")
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# --------------------------------------------------------------------- #
# Step 3: Edges
# --------------------------------------------------------------------- #

# Reuse the highway edge list as-is (edge ids and endpoints don't change;
# only the node positions moved).
HIGHWAY_EDGES = hwy.EDGES


def _arterial_edges() -> list[tuple[str, str, str, str]]:
    out: list[tuple[str, str, str, str]] = []

    def pair(src, dst, etype):
        out.append((f"{src}{dst}", src, dst, etype))
        out.append((f"{dst}{src}", dst, src, etype))

    # E-W arterials
    for src, dst in [("left0", "A0"), ("A0", "B0"), ("B0", "C0"), ("C0", "right0")]:
        pair(src, dst, "arterial")
    for src, dst in [("left1", "A1"), ("A1", "B1"), ("B1", "C1"), ("C1", "right1")]:
        pair(src, dst, "arterial")
    # N-S cross streets
    for src, dst in [("bottom0", "A0"), ("A0", "A1"), ("A1", "top0")]:
        pair(src, dst, "cross")
    for src, dst in [("bottom1", "B0"), ("B0", "B1"), ("B1", "top1")]:
        pair(src, dst, "cross")
    for src, dst in [("bottom2", "C0"), ("C0", "C1"), ("C1", "top2")]:
        pair(src, dst, "cross")
    return out


# Feeder edges — one per direction, colinear with the highway/row pair.
#   feed_E: hwy_E_out (1500, 500) → left1 (1800, 500)   [E-bound highway → grid row 1]
#   feed_W: left0    (1800,   0) → hwy_W_in (1500, 0)   [grid row 0 → W-bound highway]
FEEDER_EDGES = [
    ("feed_E", "hwy_E_out", "left1",    "feeder"),
    ("feed_W", "left0",     "hwy_W_in", "feeder"),
]


def _write_edges(path: Path) -> None:
    root = ET.Element("edges")
    for eid, src, dst, etype in HIGHWAY_EDGES:
        ET.SubElement(root, "edge", id=eid,
                      **{"from": src, "to": dst, "type": etype})
    for eid, src, dst, etype in _arterial_edges():
        ET.SubElement(root, "edge", id=eid,
                      **{"from": src, "to": dst, "type": etype})
    for eid, src, dst, etype in FEEDER_EDGES:
        ET.SubElement(root, "edge", id=eid,
                      **{"from": src, "to": dst, "type": etype})
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# --------------------------------------------------------------------- #
# Step 4: Connections (highway-side only — netconvert infers arterial
#         and feeder connections automatically)
# --------------------------------------------------------------------- #

def _write_connections(path: Path) -> None:
    """Highway-side lane-to-lane connections. Same wiring as the
    standalone highway generator, plus a 4→3 lane drop on each feeder."""
    root = ET.Element("connections")

    def _conn(frm: str, to: str, fl: int, tl: int):
        ET.SubElement(root, "connection",
                      **{"from": frm, "to": to,
                         "fromLane": str(fl), "toLane": str(tl)})

    def _meter_entry(hwy_in: str, hwy_accel: str, merge_in: str) -> None:
        for k in range(4):
            _conn(hwy_in, hwy_accel, k, k + 1)
        _conn(merge_in, hwy_accel, 0, 0)

    def _meter_taper(hwy_accel: str, hwy_out: str) -> None:
        for k in range(1, 5):
            _conn(hwy_accel, hwy_out, k, k - 1)

    for i in range(2):
        _conn("svc_E_s1", "svc_E_s2", i, i)
    _conn("svc_E_s1", "merge_E1", 0, 0)
    for i in range(2):
        _conn("svc_E_s2", "svc_E_s3", i, i)
    _conn("svc_E_s2", "merge_E2", 0, 0)
    for i in range(2):
        _conn("svc_W_s1", "svc_W_s2", i, i)
    _conn("svc_W_s1", "merge_W1", 0, 0)
    for i in range(2):
        _conn("svc_W_s2", "svc_W_s3", i, i)
    _conn("svc_W_s2", "merge_W2", 0, 0)

    _meter_entry("hwy_E_s1", "hwy_E_s1_accel", "merge_E1")
    _meter_entry("hwy_E_s2", "hwy_E_s2_accel", "merge_E2")
    _meter_entry("hwy_W_s1", "hwy_W_s1_accel", "merge_W1")
    _meter_entry("hwy_W_s2", "hwy_W_s2_accel", "merge_W2")

    _meter_taper("hwy_E_s1_accel", "hwy_E_s2")
    _meter_taper("hwy_E_s2_accel", "hwy_E_s3")
    _meter_taper("hwy_W_s1_accel", "hwy_W_s2")
    _meter_taper("hwy_W_s2_accel", "hwy_W_s3")

    # Feeder lane drops: 4-lane freeway → 3-lane feeder. Take lanes 1-3
    # of the freeway (skipping the rightmost which served the ramp), map
    # to lanes 0-2 of the feeder. Cars merging from the ramp side will
    # have already reshuffled into the through lanes by this point.
    for k in range(3):
        _conn("hwy_E_s3", "feed_E", k + 1, k)
    # Reverse direction: left0 (arterial outbound, 3 lanes) → feed_W
    # (3 lanes) → hwy_W_s1 (4 lanes). Arterial-to-feeder is auto-inferred
    # by netconvert (3→3 straight). Feeder-to-freeway we shift up by one.
    for k in range(3):
        _conn("feed_W", "hwy_W_s1", k, k + 1)

    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# --------------------------------------------------------------------- #
# Step 5: Generate network via netconvert + rewrite both TLS families
# --------------------------------------------------------------------- #

def generate_network() -> Path:
    nod_file = NETWORK_DIR / "combined.nod.xml"
    edg_file = NETWORK_DIR / "combined.edg.xml"
    typ_file = NETWORK_DIR / "combined.typ.xml"
    con_file = NETWORK_DIR / "combined.con.xml"
    net_file = NETWORK_DIR / "combined.net.xml"

    _write_nodes(nod_file)
    _write_types(typ_file)
    _write_edges(edg_file)
    _write_connections(con_file)
    print(f"Wrote {nod_file.name}, {typ_file.name}, {edg_file.name}, {con_file.name}")

    cmd = [
        "netconvert",
        "--node-files", str(nod_file),
        "--edge-files", str(edg_file),
        "--type-files", str(typ_file),
        "--connection-files", str(con_file),
        "--output-file", str(net_file),
        "--no-turnarounds", "true",
        "--tls.default-type", "static",
    ]
    print("Running netconvert...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"netconvert error: {result.stderr}")
        sys.exit(1)
    print(f"Network generated: {net_file}")

    # TLS rewrite order: arterial first (would clobber meter programs as
    # all-red since it doesn't recognize meter approach edges), then meter
    # rewriter restores the 2-phase programs on E1-W2.
    art.rewrite_tls_to_split_phase(net_file)
    hwy.rewrite_meter_tls(net_file)
    return net_file


# --------------------------------------------------------------------- #
# Step 6: Routes — single-edge feeders, otherwise identical to v1
# --------------------------------------------------------------------- #

# All routes source/sink ONLY at true off-map boundary nodes. The
# interior junctions left0 and left1 are NOT spawn points — they're the
# inside corner where the highway feeder meets the arterial grid. The
# only way cars reach left0 / left1 is by passing through the through-
# corridor routes (highway → feeder, or feeder → highway).
#
# Valid off-map sources/sinks:
#   West edge of map:  hwy_E_in, hwy_W_out, svc_E_in
#   East edge of map:  right0, right1
#   North edge of map: top0, top1, top2
#   South edge of map: bottom0, bottom1, bottom2

ROUTES = {
    # ---- Through-corridor (the headline freeway-into-city flow) ----
    # E-bound: off-map west (highway entry) → freeway → feeder → row 1 → off-map east
    "thru_E": (
        "hwy_E_s1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3 "
        "feed_E "
        "left1A1 A1B1 B1C1 C1right1"
    ),
    # W-bound: off-map east → row 0 → feeder → freeway → off-map west
    "thru_W": (
        "right0C0 C0B0 B0A0 A0left0 "
        "feed_W "
        "hwy_W_s1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3"
    ),

    # ---- Service-road through-traffic ----
    # Drive the frontage end to end without merging onto the highway. Keeps
    # svc_E_s3 and the full W-bound service road populated (otherwise those
    # segments are visually dead even though they're topologically connected).
    "svc_E_thru": "svc_E_s1 svc_E_s2 svc_E_s3",
    "svc_W_thru": "svc_W_s1 svc_W_s2 svc_W_s3",

    # ---- Ramp-merge demand (sources at the service-road west / east entry) ----
    "svc_E_merge_E1": (
        "svc_E_s1 merge_E1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3 "
        "feed_E left1A1 A1B1 B1C1 C1right1"
    ),
    "svc_E_merge_E2": (
        "svc_E_s1 svc_E_s2 merge_E2 hwy_E_s2_accel hwy_E_s3 "
        "feed_E left1A1 A1B1 B1C1 C1right1"
    ),
    # W-bound mirrors — enter the highway from the eastern service-road
    # entry (svc_W_in), drive the whole W-bound freeway, exit off-map west.
    "svc_W_merge_W1": (
        "svc_W_s1 merge_W1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3"
    ),
    "svc_W_merge_W2": (
        "svc_W_s1 svc_W_s2 merge_W2 hwy_W_s2_accel hwy_W_s3"
    ),

    # ---- Local cross-grid traffic ----
    # North-south through each column. All sources and sinks are off-map
    # top/bottom stubs — no interior spawning. Both directions for each
    # column so the cross-streets see balanced flow at the signals.
    "local_NS_A": "bottom0A0 A0A1 A1top0",
    "local_SN_A": "top0A1 A1A0 A0bottom0",
    "local_NS_B": "bottom1B0 B0B1 B1top1",
    "local_SN_B": "top1B1 B1B0 B0bottom1",
    "local_NS_C": "bottom2C0 C0C1 C1top2",
    "local_SN_C": "top2C1 C1C0 C0bottom2",
}


SHARES = {
    "thru_E":          0.20,
    "thru_W":          0.20,
    "svc_E_thru":      0.05,
    "svc_W_thru":      0.05,
    "svc_E_merge_E1":  0.08,
    "svc_E_merge_E2":  0.08,
    "svc_W_merge_W1":  0.05,
    "svc_W_merge_W2":  0.05,
    "local_NS_A":      0.04,
    "local_SN_A":      0.04,
    "local_NS_B":      0.04,
    "local_SN_B":      0.04,
    "local_NS_C":      0.04,
    "local_SN_C":      0.04,
}


def _build_route_xml(total_vehicles: int, duration_s: int, seed: int) -> str:
    rng = random.Random(seed)

    counts: dict[str, int] = {}
    assigned = 0
    for k, v in SHARES.items():
        c = int(round(total_vehicles * v))
        counts[k] = c
        assigned += c
    counts["thru_E"] += (total_vehicles - assigned)

    interval = duration_s / max(total_vehicles, 1)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<!-- Combined corridor demand: {total_vehicles} vehicles over {duration_s}s -->',
        '<routes>',
        '    <vType id="car" accel="1.3" decel="2.25" sigma="0.5" '
        'length="5" minGap="2.5" maxSpeed="27.78" lcKeepRight="0"/>',
    ]
    for name, edges in ROUTES.items():
        lines.append(f'    <route id="{name}" edges="{edges}"/>')
    lines.append("")

    pool: list[str] = []
    for name, c in counts.items():
        pool.extend([name] * c)
    rng.shuffle(pool)

    HWY_ROUTES = {"thru_E"}
    hwy_counter = 0
    for i, name in enumerate(pool):
        depart = round(i * interval, 1)
        if name in HWY_ROUTES:
            depart_lane = str(hwy_counter % 4)
            hwy_counter += 1
        else:
            depart_lane = "best"
        lines.append(
            f'    <vehicle id="v_{i}" type="car" route="{name}" '
            f'depart="{depart}" departLane="{depart_lane}" departSpeed="max"/>'
        )
    lines.append("</routes>")
    return "\n".join(lines)


def generate_demand(total_vehicles: int = 4000, duration_s: int = 3600,
                    seed: int = 42) -> None:
    xml = _build_route_xml(total_vehicles, duration_s, seed=seed)
    (NETWORK_DIR / "combined.rou.xml").write_text(xml)
    print(f"  combined.rou.xml ({total_vehicles} vehicles over {duration_s}s)")


# --------------------------------------------------------------------- #
# Step 7: SUMO configs
# --------------------------------------------------------------------- #

def _write_sumocfg(config_file: Path, route_file_name: str, end_time: int = 7200) -> None:
    net_path = os.path.relpath(NETWORK_DIR / "combined.net.xml", CONFIG_DIR)
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
    _write_sumocfg(CONFIG_DIR / "simulation_combined.sumocfg", "combined.rou.xml")
    print("  simulation_combined.sumocfg")
    _write_sumocfg(CONFIG_DIR / "race_combined.sumocfg",       "combined.rou.xml")
    print("  race_combined.sumocfg")


def main() -> None:
    print("=== Combined City+Highway Network Generation (v2: colinear merge) ===\n")
    print("Step 1: Building network...")
    generate_network()
    print("\nStep 2: Generating demand...")
    generate_demand()
    print("\nStep 3: Writing SUMO configs...")
    generate_sumo_configs()
    print("\nDone!")


if __name__ == "__main__":
    main()

"""Generate the highway + service road (ramp-metered) SUMO network.

Layout (north up; cars E-bound flow L→R, W-bound R→L):

    [E-svc entry] ─── svc_E_s1 ── [E1] ── svc_E_s2 ── [E2]   service road dead-ends past E2
                                   │ merge             │ merge
                                   ▼                   ▼
    [E-hwy] hwy_E_s1 ── [E1] ── hwy_E_s2 ── [E2] ── hwy_E_s3  4-lane highway 100 km/h
    ───────────────── median ────────────────────────────────
    [W-hwy] hwy_W_s3 ── [W2] ── hwy_W_s2 ── [W1] ── hwy_W_s1  4-lane highway 100 km/h
                                   ▲                   ▲
                                   │                   │
    [W-svc entry] ─── svc_W_s1 ── [W1] ── svc_W_s2 ── [W2]   service road dead-ends past W2

4 signalized meter junctions (E1, E2, W1, W2). At each meter:
    Phase 0 — merge connection green (svc → hwy lane 0). Highway through always-G.
    Phase 1 — merge connection red. Highway through still G.

Cycle adapts at runtime via the RampMeterController:
    free  → 19 s green / 1 s red
    metered → 5 s green / 10 s red

Run:
    python scripts/generate_highway.py
"""

from __future__ import annotations

import os
import random
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


# --- 2-phase TLS defaults (controller will override durations at runtime) ---
MERGE_GREEN = 19      # phase 0 default
MERGE_RED   = 1       # phase 1 default

# --- Geometry (meters) ---
CORRIDOR_LEN     = 3000   # total east-west extent (x = 0 ... 3000 after netconvert shift)
HALF_CORR        = CORRIDOR_LEN / 2
HWY_CENTERLINE_Y = 200    # E-hwy at +200, W-hwy at -200
SVC_CENTERLINE_Y = 240    # E-svc at +240, W-svc at -240 — frontage right next to the hwy
MERGE_RAMP_LEN   = 350    # x-distance covered by each tapered acceleration ramp
                          # — extended from 200 m so the ramp itself holds
                          # more queued vehicles before the queue spills back
                          # onto the service road.
RAMP_HALF        = MERGE_RAMP_LEN / 2
ACCEL_LEN        = 250    # length of the 5-lane acceleration zone after each merge

# Meter positions along the corridor (x). 1/3 and 2/3 of the way.
E1_X = -CORRIDOR_LEN / 6   # ≈ -500 (becomes ~1000 after shift)
E2_X =  CORRIDOR_LEN / 6   # ≈  500 (becomes ~2000 after shift)
W1_X =  CORRIDOR_LEN / 6   # mirror — W1 east of W2 since W-bound flows east→west
W2_X = -CORRIDOR_LEN / 6

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
NETWORK_DIR = PROJECT_ROOT / "packages" / "sumo-engine" / "networks"
CONFIG_DIR  = PROJECT_ROOT / "packages" / "sumo-engine" / "configs"
NETWORK_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

SUMO_HOME = os.environ.get("SUMO_HOME", "")


# Node positions (origin at corridor center; +x east, +y north).
# Each meter has TWO co-located junctions: hwy_E1 on the highway centerline,
# svc_E1 on the service-road centerline. A short merge-ramp edge connects them.
# Keeping the highway/service edges perfectly horizontal — the only diagonal
# element is the merge ramp.
NODE_POS = {
    # Highway termini
    "hwy_E_in":   (-HALF_CORR,  HWY_CENTERLINE_Y),
    "hwy_E_out":  ( HALF_CORR,  HWY_CENTERLINE_Y),
    "hwy_W_in":   ( HALF_CORR, -HWY_CENTERLINE_Y),
    "hwy_W_out":  (-HALF_CORR, -HWY_CENTERLINE_Y),

    # Service road termini — runs the full corridor length, mirroring the highway.
    "svc_E_in":   (-HALF_CORR,  SVC_CENTERLINE_Y),
    "svc_E_out":  ( HALF_CORR,  SVC_CENTERLINE_Y),
    "svc_W_in":   ( HALF_CORR, -SVC_CENTERLINE_Y),
    "svc_W_out":  (-HALF_CORR, -SVC_CENTERLINE_Y),

    # ─── Meter junctions ───
    # Tapered acceleration ramps: the svc junction sits UPSTREAM of the hwy
    # junction (by RAMP_HALF in the cars' travel direction), so the merge
    # edge spans MERGE_RAMP_LEN horizontally and (SVC - HWY) vertically — a
    # long shallow taper instead of a perpendicular drop.
    #
    # E-bound flow goes +x, so svc is at smaller x (upstream); hwy at larger x.
    "hwy_E1":     (E1_X + RAMP_HALF,             HWY_CENTERLINE_Y),
    "hwy_E1_end": (E1_X + RAMP_HALF + ACCEL_LEN, HWY_CENTERLINE_Y),
    "hwy_E2":     (E2_X + RAMP_HALF,             HWY_CENTERLINE_Y),
    "hwy_E2_end": (E2_X + RAMP_HALF + ACCEL_LEN, HWY_CENTERLINE_Y),
    "svc_E1":     (E1_X - RAMP_HALF,             SVC_CENTERLINE_Y),
    "svc_E2":     (E2_X - RAMP_HALF,             SVC_CENTERLINE_Y),

    # W-bound flow goes -x, so svc is at larger x (upstream); hwy at smaller x.
    "hwy_W1":     (W1_X - RAMP_HALF,             -HWY_CENTERLINE_Y),
    "hwy_W1_end": (W1_X - RAMP_HALF - ACCEL_LEN, -HWY_CENTERLINE_Y),
    "hwy_W2":     (W2_X - RAMP_HALF,             -HWY_CENTERLINE_Y),
    "hwy_W2_end": (W2_X - RAMP_HALF - ACCEL_LEN, -HWY_CENTERLINE_Y),
    "svc_W1":     (W1_X + RAMP_HALF,             -SVC_CENTERLINE_Y),
    "svc_W2":     (W2_X + RAMP_HALF,             -SVC_CENTERLINE_Y),
}

# Edge definitions: (id, from, to, type)
EDGES = [
    # ---- E-bound highway (5 segments, alternating 4-lane and 5-lane). ----
    # Each meter (hwy_E1 / hwy_E2) is followed by a 5-lane acceleration zone,
    # which then tapers back to 4 lanes at hwy_E*_end.
    ("hwy_E_s1",       "hwy_E_in",    "hwy_E1",      "freeway"),
    ("hwy_E_s1_accel", "hwy_E1",      "hwy_E1_end",  "freeway_accel"),
    ("hwy_E_s2",       "hwy_E1_end",  "hwy_E2",      "freeway"),
    ("hwy_E_s2_accel", "hwy_E2",      "hwy_E2_end",  "freeway_accel"),
    ("hwy_E_s3",       "hwy_E2_end",  "hwy_E_out",   "freeway"),

    # ---- W-bound highway (mirror) ----
    ("hwy_W_s1",       "hwy_W_in",    "hwy_W1",      "freeway"),
    ("hwy_W_s1_accel", "hwy_W1",      "hwy_W1_end",  "freeway_accel"),
    ("hwy_W_s2",       "hwy_W1_end",  "hwy_W2",      "freeway"),
    ("hwy_W_s2_accel", "hwy_W2",      "hwy_W2_end",  "freeway_accel"),
    ("hwy_W_s3",       "hwy_W2_end",  "hwy_W_out",   "freeway"),

    # ---- E-bound service road (3 segments; runs full corridor length) ----
    ("svc_E_s1", "svc_E_in", "svc_E1",     "service"),
    ("svc_E_s2", "svc_E1",   "svc_E2",     "service"),
    ("svc_E_s3", "svc_E2",   "svc_E_out",  "service"),

    # ---- W-bound service road ----
    ("svc_W_s1", "svc_W_in", "svc_W1",     "service"),
    ("svc_W_s2", "svc_W1",   "svc_W2",     "service"),
    ("svc_W_s3", "svc_W2",   "svc_W_out",  "service"),

    # ---- Merge ramps (the only diagonals — svc to hwy at each meter) ----
    ("merge_E1", "svc_E1",   "hwy_E1",     "ramp"),
    ("merge_E2", "svc_E2",   "hwy_E2",     "ramp"),
    ("merge_W1", "svc_W1",   "hwy_W1",     "ramp"),
    ("merge_W2", "svc_W2",   "hwy_W2",     "ramp"),
]


def _write_nodes(path: Path) -> None:
    root = ET.Element("nodes")
    # Signal sits at the START of each ramp (on the service road).
    #
    # Every other junction is `priority`: the merge entry (hwy_E1 etc.) has
    # no conflicting connections because the ramp lands in its own dedicated
    # lane 0 of the 5-lane accel section; the taper (hwy_E1_end etc.) drops
    # accel-lane 0 entirely so its cars must merge left strategically.
    SVC_METER_NODES = {"svc_E1", "svc_E2", "svc_W1", "svc_W2"}
    TLS_FOR_NODE = {
        "svc_E1": "E1", "svc_E2": "E2",
        "svc_W1": "W1", "svc_W2": "W2",
    }
    for nid, (x, y) in NODE_POS.items():
        attrs = {"id": nid, "x": str(x), "y": str(y)}
        if nid in SVC_METER_NODES:
            attrs["type"] = "traffic_light"
            attrs["tl"] = TLS_FOR_NODE[nid]
        else:
            attrs["type"] = "priority"
        ET.SubElement(root, "node", **attrs)
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def _write_types(path: Path) -> None:
    root = ET.Element("types")
    ET.SubElement(root, "type", id="freeway",       numLanes="4", speed="27.78")  # 100 km/h
    ET.SubElement(root, "type", id="freeway_accel", numLanes="5", speed="27.78")  # accel zone, +1 lane
    ET.SubElement(root, "type", id="service",       numLanes="2", speed="11.11")  # ~40 km/h
    ET.SubElement(root, "type", id="ramp",          numLanes="1", speed="19.44")  # ~70 km/h merge ramp
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def _write_edges(path: Path) -> None:
    root = ET.Element("edges")
    for eid, src, dst, etype in EDGES:
        ET.SubElement(root, "edge", id=eid,
                      **{"from": src, "to": dst, "type": etype})
    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


# Explicit connection list per meter junction.
#
# Each meter is two junctions:
#   hwy_E1 — highway-side, traffic_light. Receives the merge ramp and the
#            through highway segment. The merge connection is the signalized
#            one (G in phase 0, r in phase 1); the through connections stay
#            always-green.
#   svc_E1 — service-side, priority. Lets cars continue along svc OR peel
#            off onto the merge ramp toward hwy_E1.
def _write_connections(path: Path) -> None:
    root = ET.Element("connections")

    def _conn(frm: str, to: str, fl: int, tl: int):
        ET.SubElement(root, "connection",
                      **{"from": frm, "to": to,
                         "fromLane": str(fl), "toLane": str(tl)})

    # Helper: at each meter, set up the merge entry (4-lane → 5-lane shifted
    # by 1, with the ramp landing on the new lane 0) and the taper drop
    # (5-lane → 4-lane shifted back; lane 0 has NO outgoing so cars on it
    # must merge left strategically before reaching the taper).
    def _meter_entry(hwy_in: str, hwy_accel: str, merge_in: str) -> None:
        # 4-lane through cars shift up one lane number
        for k in range(4):
            _conn(hwy_in, hwy_accel, k, k + 1)
        # Ramp lands on the new rightmost lane (the acceleration lane)
        _conn(merge_in, hwy_accel, 0, 0)

    def _meter_taper(hwy_accel: str, hwy_out: str) -> None:
        # Lanes 1-4 of the accel section continue as lanes 0-3 of the next
        # 4-lane segment. Lane 0 of the accel section dead-ends — strategic
        # LC moves cars left before they reach this point.
        for k in range(1, 5):
            _conn(hwy_accel, hwy_out, k, k - 1)

    # ── svc_E1 (signalized): service through always-G + peel-off toggles ──
    for i in range(2):
        _conn("svc_E_s1", "svc_E_s2", i, i)
    _conn("svc_E_s1", "merge_E1", 0, 0)

    # ── svc_E2 (signalized) ──
    for i in range(2):
        _conn("svc_E_s2", "svc_E_s3", i, i)
    _conn("svc_E_s2", "merge_E2", 0, 0)

    # ── svc_W1 (signalized) ──
    for i in range(2):
        _conn("svc_W_s1", "svc_W_s2", i, i)
    _conn("svc_W_s1", "merge_W1", 0, 0)

    # ── svc_W2 (signalized) ──
    for i in range(2):
        _conn("svc_W_s2", "svc_W_s3", i, i)
    _conn("svc_W_s2", "merge_W2", 0, 0)

    # ── Highway meter entries (priority; no conflict because the ramp gets
    #     its own dedicated lane in the 5-lane accel section) ──
    _meter_entry("hwy_E_s1", "hwy_E_s1_accel", "merge_E1")
    _meter_entry("hwy_E_s2", "hwy_E_s2_accel", "merge_E2")
    _meter_entry("hwy_W_s1", "hwy_W_s1_accel", "merge_W1")
    _meter_entry("hwy_W_s2", "hwy_W_s2_accel", "merge_W2")

    # ── Highway taper junctions (priority; 5-lane → 4-lane drop) ──
    _meter_taper("hwy_E_s1_accel", "hwy_E_s2")
    _meter_taper("hwy_E_s2_accel", "hwy_E_s3")
    _meter_taper("hwy_W_s1_accel", "hwy_W_s2")
    _meter_taper("hwy_W_s2_accel", "hwy_W_s3")

    tree = ET.ElementTree(root)
    ET.indent(tree)
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def generate_network() -> Path:
    nod_file = NETWORK_DIR / "highway.nod.xml"
    edg_file = NETWORK_DIR / "highway.edg.xml"
    typ_file = NETWORK_DIR / "highway.typ.xml"
    con_file = NETWORK_DIR / "highway.con.xml"
    net_file = NETWORK_DIR / "highway.net.xml"

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

    rewrite_meter_tls(net_file)
    return net_file


# --------------------------------------------------------------------- #
# TLS rewriter — every connection AT the meter junction is always G
# except the one that originates on the service road. That one toggles.
# --------------------------------------------------------------------- #

# Identify the signalized peel-off connection at each meter TLS. The signal
# now lives on the SVC side, controlling the connection
#   (from=svc_*_s_upstream, to=merge_*)
METER_SVC_IN_EDGE = {
    "E1": "svc_E_s1",
    "E2": "svc_E_s2",
    "W1": "svc_W_s1",
    "W2": "svc_W_s2",
}
METER_MERGE_EDGE = {
    "E1": "merge_E1",
    "E2": "merge_E2",
    "W1": "merge_W1",
    "W2": "merge_W2",
}


def rewrite_meter_tls(net_file: Path) -> None:
    """For each meter junction, set:
       - merge connection (svc_in_edge → hwy_out_edge) = signal-controlled
       - everything else = always green
    """
    print(f"Rewriting TLS programs in {net_file.name}...")
    tree = ET.parse(net_file)
    root = tree.getroot()

    # Build {(tl_id, linkIndex) -> (from_edge, to_edge)}
    link_info: dict = {}
    for conn in root.findall("connection"):
        tl_id = conn.get("tl")
        if tl_id is None:
            continue
        idx = int(conn.get("linkIndex"))
        link_info[(tl_id, idx)] = (conn.get("from"), conn.get("to"))

    rewritten = 0
    for tl in root.findall("tlLogic"):
        tl_id = tl.get("id")
        if tl_id not in METER_SVC_IN_EDGE:
            continue
        merge_from = METER_SVC_IN_EDGE[tl_id]
        merge_to   = METER_MERGE_EDGE[tl_id]

        indices = sorted(i for (t, i) in link_info if t == tl_id)
        num_links = (max(indices) + 1) if indices else 0

        # Identify merge connection link indices (could be more than one if SUMO
        # generates multiple lane→lane connections for the merge).
        merge_idx = {
            i for i in indices
            if link_info[(tl_id, i)] == (merge_from, merge_to)
        }

        # Wipe existing phases
        for phase in list(tl.findall("phase")):
            tl.remove(phase)
        tl.set("type", "static")
        tl.set("programID", "0")
        tl.set("offset", "0")

        def state(merge_char: str) -> str:
            chars = ["G"] * num_links     # default: highway/service through = always green
            for i in merge_idx:
                chars[i] = merge_char
            return "".join(chars)

        # Phase 0: merge green
        ET.SubElement(tl, "phase", duration=str(MERGE_GREEN), state=state("G"))
        # Phase 1: merge red (everything else still green)
        ET.SubElement(tl, "phase", duration=str(MERGE_RED), state=state("r"))
        rewritten += 1

    tree.write(net_file, encoding="UTF-8", xml_declaration=True)
    cycle = MERGE_GREEN + MERGE_RED
    print(f"  Rewrote {rewritten} meter TLS programs. Cycle = {cycle}s (adaptive at runtime)")


# --------------------------------------------------------------------- #
# Demand / route generation
# --------------------------------------------------------------------- #

# Named routes. Each car runs one of these.
# Routes thread through the alternating 4-lane / 5-lane-accel highway sections.
ROUTES = [
    # Highway through-traffic (the bulk)
    ("hwy_E_thru", "hwy_E_s1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3"),
    ("hwy_W_thru", "hwy_W_s1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3"),

    # Service road through — drive the full frontage, never merge.
    ("svc_E_thru", "svc_E_s1 svc_E_s2 svc_E_s3"),
    ("svc_W_thru", "svc_W_s1 svc_W_s2 svc_W_s3"),

    # Service road E-bound, merging at E1 then continuing along the highway
    ("svc_E_merge_E1", "svc_E_s1 merge_E1 hwy_E_s1_accel hwy_E_s2 hwy_E_s2_accel hwy_E_s3"),
    # Service road E-bound, staying on svc through E1 and merging at E2
    ("svc_E_merge_E2", "svc_E_s1 svc_E_s2 merge_E2 hwy_E_s2_accel hwy_E_s3"),

    # W-bound mirrors
    ("svc_W_merge_W1", "svc_W_s1 merge_W1 hwy_W_s1_accel hwy_W_s2 hwy_W_s2_accel hwy_W_s3"),
    ("svc_W_merge_W2", "svc_W_s1 svc_W_s2 merge_W2 hwy_W_s2_accel hwy_W_s3"),
]


# Demand mix:
#   60 % highway through  (30 % each direction)
#   20 % service-road through (10 % each direction) — frontage trip, no merge
#   20 % service-road merging (5 % at each of the 4 meters)
SHARES = {
    "hwy_E_thru":     0.30,
    "hwy_W_thru":     0.30,
    "svc_E_thru":     0.10,
    "svc_W_thru":     0.10,
    "svc_E_merge_E1": 0.05,
    "svc_E_merge_E2": 0.05,
    "svc_W_merge_W1": 0.05,
    "svc_W_merge_W2": 0.05,
}


# --- Demand profiles for fair policy comparison ---
#
# Each profile is { total_vehicles, depart_curve }. The depart_curve is a
# function f(i, n) -> [0, 1] that maps the i'th of n cars to a fraction of
# the simulation duration. Cars are then dispatched at depart = curve * duration_s.
#
# off_peak       — flat 50 % capacity. No congestion. Sanity baseline.
# building_peak  — flat 80 % for the first half, then a 30-min surge to
#                  110 % capacity. Tests *prevention* — ALINEA should hold
#                  occupancy at target before breakdown; binary controller
#                  only reacts after speed has collapsed.
# incident       — flat 95 % capacity throughout. Approximates a sustained
#                  shock; true downstream-capacity reduction would require a
#                  TraCI lane-closure hook (parked for follow-up).
def _uniform(i: int, n: int) -> float:
    return (i + 0.5) / max(n, 1)


def _building_peak_curve(i: int, n: int) -> float:
    # First 50 % of cars depart over the first 50 % of sim time at flat 80 %
    # capacity; the remaining 50 % crowd into the next 30 % of sim time.
    # The middle 20 % stays empty so the surge is visible in the rate.
    half = n // 2
    if i < half:
        return 0.5 * (i + 0.5) / max(half, 1)
    j = i - half
    rest = n - half
    return 0.7 + 0.3 * (j + 0.5) / max(rest, 1)


PROFILES: dict = {
    # vehicles | depart-curve | sumocfg suffix
    "off_peak":      {"vehicles": 2750, "curve": _uniform,             "suffix": "off_peak"},
    "building_peak": {"vehicles": 5500, "curve": _building_peak_curve, "suffix": "building_peak"},
    "incident":      {"vehicles": 6500, "curve": _uniform,             "suffix": "incident"},
}


def _build_route_xml(total_vehicles: int, duration_s: int, seed: int,
                     dominant_direction: str = "EW",
                     depart_curve=None) -> str:
    rng = random.Random(seed)

    shares = dict(SHARES)
    if dominant_direction == "NS":
        # NS doesn't really apply to a highway corridor — leave as-is.
        pass

    counts: dict = {}
    assigned = 0
    for k, v in shares.items():
        c = int(round(total_vehicles * v))
        counts[k] = c
        assigned += c
    counts["hwy_E_thru"] += (total_vehicles - assigned)

    # The curve decides what fraction of the duration each car departs at.
    # Default is uniform (the original behavior).
    curve = depart_curve or _uniform

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<!-- Highway+service demand | {total_vehicles} vehicles over {duration_s}s -->',
        '<routes>',
        # LC2013 tuning — with the acceleration-lane network there's no
        # funnel at the merge any more, so most LC motivations can stay at
        # their defaults. Only lcKeepRight is overridden: at default 1.0
        # everyone drifts back to lane 0 of the 4-lane segments, undoing
        # the round-robin depart spread.
        '    <vType id="car" accel="1.3" decel="2.25" sigma="0.5" '
        'length="5" minGap="2.5" maxSpeed="27.78" lcKeepRight="0"/>',
    ]
    for name, edges in ROUTES:
        lines.append(f'    <route id="{name}" edges="{edges}"/>')
    lines.append("")

    pool: list[str] = []
    for name, c in counts.items():
        pool.extend([name] * c)
    rng.shuffle(pool)

    # Round-robin the depart lane for highway-through cars across all 4
    # lanes. "random" / "best" both end up biased toward whichever lane the
    # downstream zipper happens to clear first, so we force uniform spread.
    # Service-road and merge cars still use "best" (their lane choice is
    # constrained by the route anyway).
    HWY_ROUTES = {"hwy_E_thru", "hwy_W_thru"}
    hwy_counter = 0
    n = len(pool)
    for i, route_name in enumerate(pool):
        depart = round(curve(i, n) * duration_s, 1)
        if route_name in HWY_ROUTES:
            depart_lane = str(hwy_counter % 4)
            hwy_counter += 1
        else:
            depart_lane = "best"
        lines.append(
            f'    <vehicle id="v_{i}" type="car" route="{route_name}" '
            f'depart="{depart}" departLane="{depart_lane}" departSpeed="max"/>'
        )

    lines.append("</routes>")
    return "\n".join(lines)


def generate_demand(total_vehicles: int = 5500, duration_s: int = 3600,
                    seed: int = 42) -> None:
    """Generate the default highway.rou.xml (legacy entry point) and one
    profile-specific route file for each entry in PROFILES."""
    # Default file used by the live dashboard sim.
    xml = _build_route_xml(total_vehicles, duration_s, seed=seed)
    (NETWORK_DIR / "highway.rou.xml").write_text(xml)
    print(f"  highway.rou.xml ({total_vehicles} vehicles over {duration_s}s)")

    # Per-profile route files used by comparison/race configs.
    for name, spec in PROFILES.items():
        xml = _build_route_xml(
            total_vehicles=spec["vehicles"],
            duration_s=duration_s,
            seed=seed,
            depart_curve=spec["curve"],
        )
        path = NETWORK_DIR / f"highway_{name}.rou.xml"
        path.write_text(xml)
        print(f"  {path.name} ({spec['vehicles']} vehicles, profile={name})")


# --------------------------------------------------------------------- #
# SUMO config files
# --------------------------------------------------------------------- #

def _write_sumocfg(config_file: Path, route_file_name: str, end_time: int = 7200) -> None:
    net_path = os.path.relpath(NETWORK_DIR / "highway.net.xml", CONFIG_DIR)
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
    _write_sumocfg(CONFIG_DIR / "simulation_highway.sumocfg", "highway.rou.xml")
    print("  simulation_highway.sumocfg (default)")
    _write_sumocfg(CONFIG_DIR / "race_highway.sumocfg", "highway.rou.xml")
    print("  race_highway.sumocfg")
    # One race config per demand profile, mirroring the arterial pattern.
    for name in PROFILES:
        cfg = CONFIG_DIR / f"race_highway_{name}.sumocfg"
        _write_sumocfg(cfg, f"highway_{name}.rou.xml")
        print(f"  {cfg.name}")


def main() -> None:
    print("=== Highway + Service Road (ramp metered) Network Generation ===\n")
    print("Step 1: Building network...")
    generate_network()
    print("\nStep 2: Generating demand...")
    generate_demand()
    print("\nStep 3: Writing SUMO configs...")
    generate_sumo_configs()
    print("\nDone!")


if __name__ == "__main__":
    main()

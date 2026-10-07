"""Inspect CARLA's loaded map and write `packages/sumo-engine/configs/carla_junctions.json`.

Run this with CARLA already running on localhost:2000:

    .venv/Scripts/python.exe scripts/inspect_carla_junctions.py

Two modes:

  - **Refresh** (default if the JSON already exists):
    Keeps the existing intersection_id → carla_junction_id mapping and only
    refreshes the camera transforms by querying each junction's actual
    TrafficLight actors. The cameras are mounted on the TL poles, looking
    back at the queue waiting at that light.

  - **Pick** (used if the JSON is missing or you choose `r` for re-pick):
    Lists every signalized junction and auto-picks up to 6 in a 2x3-ish
    layout, then writes the JSON with TL-derived cameras for the picks.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

OUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "packages" / "sumo-engine" / "configs" / "carla_junctions.json"
)


def _connect():
    import carla  # type: ignore[import-not-found]

    client = carla.Client("localhost", 2000)
    client.set_timeout(30.0)
    world = client.get_world()
    map_name = world.get_map().name.split("/")[-1]
    print(f"Using already-loaded map: {map_name}")
    return world


def _yaw_to_dir(yaw_deg: float) -> str:
    """CARLA TL yaw → which approach direction the TL controls.
    Yaw 0=+x (E), 90=+y (S), 180=-x (W), 270=-y (N).
    Must stay in lockstep with packages/carla-bridge/carla_bridge/carla_snapshot.py.
    """
    y = yaw_deg % 360.0
    if 45 <= y < 135:
        return "S"
    if 135 <= y < 225:
        return "W"
    if 225 <= y < 315:
        return "N"
    return "E"


def list_signalized_junctions(world) -> list[dict]:
    smap = world.get_map()
    seen: Dict[int, dict] = {}
    for tl in world.get_actors().filter("traffic.traffic_light*"):
        wp = smap.get_waypoint(tl.get_location())
        j = wp.get_junction() if wp else None
        if j is None or j.id in seen:
            continue
        bb = j.bounding_box
        seen[int(j.id)] = {
            "id": int(j.id),
            "cx": float(bb.location.x),
            "cy": float(bb.location.y),
            "cz": float(bb.location.z),
        }
    return list(seen.values())


def tls_at_junction(world, junction_id: int) -> List[Any]:
    smap = world.get_map()
    out: List[Any] = []
    for tl in world.get_actors().filter("traffic.traffic_light*"):
        try:
            wp = smap.get_waypoint(tl.get_location())
            j = wp.get_junction() if wp else None
            if j and int(j.id) == junction_id:
                out.append(tl)
        except Exception:
            continue
    return out


def make_camera_specs_from_tls(world, junction_id: int) -> List[dict]:
    """For each TrafficLight at this junction, find the stop-line waypoint
    of the lane(s) it controls, then place a camera right at that stop line
    looking back along the lane at the cars waiting.

    Why waypoints instead of the TL transform: a TL actor's `forward` is
    not consistently aligned with the road in CARLA — it depends on how
    the asset was authored. The lane waypoint, by contrast, is always
    oriented along travel direction, so we can compute "look back at the
    queue" reliably.

    Output is N/E/S/W; if a junction is missing one approach (T-intersection),
    that approach will be absent from the dashboard.
    """
    import math

    tls = tls_at_junction(world, junction_id)
    if not tls:
        return []

    by_dir: Dict[str, dict] = {}
    for tl in tls:
        # Each TL controls one or more lanes. Use the first stop-line
        # waypoint as the camera anchor (and average if multi-lane).
        try:
            wps = tl.get_affected_lane_waypoints()
        except Exception:
            wps = []

        if wps:
            # Average position across affected waypoints (handles multi-lane).
            mx = sum(w.transform.location.x for w in wps) / len(wps)
            my = sum(w.transform.location.y for w in wps) / len(wps)
            mz = sum(w.transform.location.z for w in wps) / len(wps)
            # Lane yaw points along travel direction (into the intersection).
            # Camera should look BACK along the lane at the waiting queue.
            lane_yaw = wps[0].transform.rotation.yaw
            cam_yaw = (lane_yaw + 180.0) % 360.0
        else:
            tf = tl.get_transform()
            mx, my, mz = tf.location.x, tf.location.y, tf.location.z
            cam_yaw = (tf.rotation.yaw + 180.0) % 360.0

        # Pull the camera ~3 m forward (into the intersection) so the lead
        # car isn't pressed against the lens — gives a long view down the queue.
        offset_dist = 3.0
        back_dx = -math.cos(math.radians(cam_yaw)) * offset_dist
        back_dy = -math.sin(math.radians(cam_yaw)) * offset_dist

        approach = _yaw_to_dir(cam_yaw)
        by_dir[approach] = {
            "approach": approach,
            "x": float(mx + back_dx),
            "y": float(my + back_dy),
            # 5 m above ground keeps render load reasonable and gives a
            # clear over-the-roof view of the queue.
            "z": float(mz) + 5.0,
            "pitch": -15.0,
            "yaw": cam_yaw,
        }

    return [by_dir[d] for d in ("N", "E", "S", "W") if d in by_dir]


def make_camera_specs_fallback(cx: float, cy: float, cz: float) -> List[dict]:
    """Cameras placed on the FAR side of the intersection from each approach,
    looking back at the front of the queue.

    Convention: 'approach = N' = cars come from the north (low y in CARLA's
    left-handed frame where +y is south). To see the FRONT of those cars, the
    camera sits south of the intersection (cy + offset) facing north (yaw=-90).
    """
    z = cz + 9.0
    pitch = -25.0
    offset = 15.0
    return [
        {"approach": "N", "x": cx, "y": cy + offset, "z": z, "pitch": pitch, "yaw": -90.0},
        {"approach": "E", "x": cx - offset, "y": cy, "z": z, "pitch": pitch, "yaw": 0.0},
        {"approach": "S", "x": cx, "y": cy - offset, "z": z, "pitch": pitch, "yaw": 90.0},
        {"approach": "W", "x": cx + offset, "y": cy, "z": z, "pitch": pitch, "yaw": 180.0},
    ]


def pick_six_grid(junctions: list[dict]) -> list[dict]:
    if not junctions:
        raise SystemExit("No signalized junctions found in this map.")

    ys = sorted(j["cy"] for j in junctions)
    y_split = (ys[len(ys) // 2 - 1] + ys[len(ys) // 2]) / 2 if len(ys) >= 2 else 0
    bottom = sorted([j for j in junctions if j["cy"] < y_split], key=lambda j: j["cx"])
    top = sorted([j for j in junctions if j["cy"] >= y_split], key=lambda j: j["cx"])

    def fit_to_three(row: list[dict]) -> list[Optional[dict]]:
        if len(row) >= 3:
            mid = len(row) // 2
            return list(row[max(0, mid - 1):max(0, mid - 1) + 3])
        slots: list[Optional[dict]] = [None, None, None]
        if len(row) == 1:
            slots[1] = row[0]
        elif len(row) == 2:
            slots[0], slots[2] = row[0], row[1]
        return slots

    out = []
    for slot, label in zip(
        fit_to_three(bottom) + fit_to_three(top),
        ["A0", "B0", "C0", "A1", "B1", "C1"],
    ):
        if slot is None:
            continue
        out.append({"intersection_id": label, **slot})
    return out


def load_existing_mapping() -> Optional[List[dict]]:
    """Return [{intersection_id, carla_junction_id}, ...] from the existing
    JSON file, or None if it doesn't exist / is invalid."""
    if not OUT_PATH.exists():
        return None
    try:
        raw = json.loads(OUT_PATH.read_text())
    except Exception:
        return None
    out = []
    for j in raw.get("junctions", []):
        try:
            out.append({
                "intersection_id": str(j["intersection_id"]),
                "id": int(j["carla_junction_id"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return out or None


def write_junctions_json(world, picks: list[dict]) -> None:
    payload = {
        "_comment": "Auto-generated by scripts/inspect_carla_junctions.py. Cameras are mounted on the actual TL poles.",
        "junctions": [],
    }
    for p in picks:
        cams = make_camera_specs_from_tls(world, p["id"])
        if not cams:
            cams = make_camera_specs_fallback(
                p.get("cx", 0.0), p.get("cy", 0.0), p.get("cz", 0.0)
            )
        payload["junctions"].append({
            "intersection_id": p["intersection_id"],
            "carla_junction_id": p["id"],
            "cameras": cams,
        })
    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"\nWrote {OUT_PATH}")


def main() -> None:
    world = _connect()

    existing = load_existing_mapping()

    if existing:
        print("\nFound existing junctions.json with these picks:")
        for e in existing:
            print(f"  {e['intersection_id']} → CARLA junction {e['id']}")
        print("\nRefreshing camera transforms only (mounted on real TL poles).")
        ans = input("Proceed? [Y/n/r=re-pick] ").strip().lower()
        if ans == "n":
            print("Skipped.")
            return
        if ans != "r":
            write_junctions_json(world, existing)
            return

    junctions = list_signalized_junctions(world)
    print(f"\nFound {len(junctions)} signalized junctions:\n")
    for j in sorted(junctions, key=lambda x: (x["cy"], x["cx"])):
        print(f"  id={j['id']:4d}  center=({j['cx']:7.1f}, {j['cy']:7.1f}, {j['cz']:5.1f})")

    picks = pick_six_grid(junctions)
    print("\nAuto-picked junctions:\n")
    for p in picks:
        print(f"  {p['intersection_id']}: junction {p['id']}  "
              f"center=({p['cx']:.1f}, {p['cy']:.1f})")

    ans = input("\nWrite these into carla_junctions.json? [y/N] ").strip().lower()
    if ans == "y":
        write_junctions_json(world, picks)
    else:
        print("Skipped.")


if __name__ == "__main__":
    main()

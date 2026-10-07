"""Run 6-race evaluation: 3 demand profiles x 2 policies.

Hits the backend API to start each race, polls until done, collects results.
"""

from __future__ import annotations

import json
import time
import urllib.request

BASE = "http://localhost:8000/api/sim"

PROFILES = ["balanced", "asym", "extreme"]
POLICIES = ["fixed_time", "actuated"]


def _post(url: str, data: dict) -> dict:
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get(url: str) -> dict:
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())


def run_race(profile: str, policy: str) -> dict:
    """Start a race and poll until done. Return final status."""
    config = {
        "policy_type": policy,
        "tick_rate": 1000,
        "seed": 42,
        "demand_profile": profile,
        "gui": False,
        "race_mode": True,
    }

    print(f"\n--- {profile} / {policy} ---")
    resp = _post(f"{BASE}/start", config)
    run_id = resp.get("run_id", "?")
    print(f"  Started: {run_id[:8]}")

    while True:
        time.sleep(2)
        status = _get(f"{BASE}/status")

        if status["status"] == "stopped":
            # Get final metrics from last tick data
            tick_data = _get("http://localhost:8000/api/metrics/current")
            metrics = tick_data.get("metrics", {})
            avg_trip = metrics.get("avg_trip_time_s", 0)
            trips = metrics.get("completed_trips", 0)
            clearance = status["sim_time"]
            print(f"  DONE: clearance={clearance}s avg_trip={avg_trip}s trips={trips}")
            return {
                "profile": profile,
                "policy": policy,
                "clearance": clearance,
                "avg_trip": avg_trip,
                "trips": trips,
            }

        print(f"  tick={status['tick']} {status['status']}")


def main():
    results = []
    for profile in PROFILES:
        for policy in POLICIES:
            result = run_race(profile, policy)
            results.append(result)
            time.sleep(1)  # Brief pause between races

    print("\n=== RESULTS ===")
    print(f"{'Profile':<12} {'Policy':<12} {'Clearance(s)':<14} {'AvgTrip(s)':<12} {'Trips':<8}")
    print("-" * 58)
    for r in results:
        print(f"{r['profile']:<12} {r['policy']:<12} {r['clearance']:<14} {r['avg_trip']:<12} {r['trips']:<8}")


if __name__ == "__main__":
    main()

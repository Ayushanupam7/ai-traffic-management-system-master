"""Idempotent cleanup of standalone simulation runs.

A "standalone" run is a `simulation_runs` row whose `id` is NOT referenced
by any `experiment_runs.run_id`. Those are the rows the dashboard creates
when the user clicks Start outside of a comparison — useful at the moment
but they pile up and clutter the Lab.

Comparison sub-runs (rows linked from experiment_runs.run_id) are left
untouched, along with their metric rows.

Cascade behavior: migrations 003 - 005 declare ON DELETE CASCADE for the
metric tables (global_metrics, intersection_metrics, signal_logs,
vehicle_snapshots) against simulation_runs.id, so deleting from
simulation_runs is enough — Postgres removes the dependent rows for us.

Re-running this script after using the dashboard will clean up whatever
fresh standalone runs accumulated. Safe to invoke any number of times.

Run:
    .venv/Scripts/python.exe scripts/cleanup_standalone_runs.py
"""

from __future__ import annotations

import sys
from typing import Set

from shared.supabase_client import get_supabase_client


PAGE = 1000  # Supabase default row cap per fetch


def _all_ids(client, table: str, column: str) -> Set[str]:
    """Fetch every non-null value of `column` from `table`, paging until done."""
    seen: Set[str] = set()
    offset = 0
    while True:
        resp = (
            client.table(table)
            .select(column)
            .not_.is_(column, "null")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for r in rows:
            v = r.get(column)
            if v is not None:
                seen.add(v)
        if len(rows) < PAGE:
            break
        offset += PAGE
    return seen


def main() -> int:
    try:
        client = get_supabase_client()
    except RuntimeError as e:
        print(f"Supabase not configured: {e}", file=sys.stderr)
        return 1

    # All run IDs referenced by an experiment (preserve these).
    referenced = _all_ids(client, "experiment_runs", "run_id")
    print(f"Found {len(referenced)} comparison sub-runs (preserved)")

    # Every run ID in simulation_runs.
    all_runs = _all_ids(client, "simulation_runs", "id")
    print(f"Found {len(all_runs)} total runs in simulation_runs")

    orphans = sorted(all_runs - referenced)
    print(f"Deleting {len(orphans)} standalone runs...")

    if not orphans:
        print("Nothing to clean. Database is already tidy.")
        return 0

    # Supabase's `in_` filter accepts a list; delete in chunks so we never
    # send a giant URL or hit any per-request row cap.
    CHUNK = 200
    deleted = 0
    for i in range(0, len(orphans), CHUNK):
        chunk = orphans[i : i + CHUNK]
        client.table("simulation_runs").delete().in_("id", chunk).execute()
        deleted += len(chunk)
        print(f"  deleted {deleted}/{len(orphans)}")

    print(f"Done. Deleted {deleted} standalone runs (cascaded their metric rows).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

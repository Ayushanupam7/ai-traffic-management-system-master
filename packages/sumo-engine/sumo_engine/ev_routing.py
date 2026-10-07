"""Grid-aware BFS routing for the fixed 3×2 arterial network."""

from __future__ import annotations

from collections import deque

# Adjacency list for the 3×2 grid (A=west, C=east; 0=south, 1=north)
ADJACENCY: dict[str, list[str]] = {
    "A0": ["B0", "A1"],
    "A1": ["B1", "A0"],
    "B0": ["A0", "C0", "B1"],
    "B1": ["A1", "C1", "B0"],
    "C0": ["B0", "C1"],
    "C1": ["B1", "C0"],
}

# Maps (from_junction, to_junction) → SUMO edge ID.
# Naming confirmed by snapshot.py: internal edges are named "{src}{dst}".
EDGE_ID: dict[tuple[str, str], str] = {
    ("A0", "B0"): "A0B0", ("B0", "A0"): "B0A0",
    ("B0", "C0"): "B0C0", ("C0", "B0"): "C0B0",
    ("A1", "B1"): "A1B1", ("B1", "A1"): "B1A1",
    ("B1", "C1"): "B1C1", ("C1", "B1"): "C1B1",
    ("A0", "A1"): "A0A1", ("A1", "A0"): "A1A0",
    ("B0", "B1"): "B0B1", ("B1", "B0"): "B1B0",
    ("C0", "C1"): "C0C1", ("C1", "C0"): "C1C0",
}

INTERSECTION_IDS = set(ADJACENCY.keys())


def bfs_path(from_id: str, to_id: str) -> list[str]:
    """BFS shortest-hop path; returns ordered list of SUMO edge IDs.

    Raises ValueError for identical endpoints or unknown IDs.
    """
    if from_id not in INTERSECTION_IDS or to_id not in INTERSECTION_IDS:
        raise ValueError(f"Unknown intersection(s): {from_id!r}, {to_id!r}")
    if from_id == to_id:
        raise ValueError(f"Source and destination are the same: {from_id!r}")

    queue: deque[list[str]] = deque([[from_id]])
    visited: set[str] = {from_id}

    while queue:
        path = queue.popleft()
        current = path[-1]
        for neighbour in ADJACENCY[current]:
            node_path = path + [neighbour]
            if neighbour == to_id:
                return [EDGE_ID[(node_path[i], node_path[i + 1])]
                        for i in range(len(node_path) - 1)]
            if neighbour not in visited:
                visited.add(neighbour)
                queue.append(node_path)

    raise ValueError(f"No path from {from_id!r} to {to_id!r}")  # unreachable for valid grid


def edge_destination(edge_id: str) -> str:
    """Return the destination intersection of a 4-char edge ID.

    'A0B0' → 'B0'
    """
    return edge_id[2:]


def edge_approach_direction(edge_id: str) -> str | None:
    """Return the travel direction for a 4-char internal edge ID.

    'A0B0' → 'E'  (vehicle travels east, approaching B0 from the west)
    Returns None for non-grid edges (boundary, junction-internal, etc.).
    """
    if len(edge_id) != 4:
        return None
    try:
        from_col = ord(edge_id[0]) - ord("A")
        from_row = int(edge_id[1])
        to_col   = ord(edge_id[2]) - ord("A")
        to_row   = int(edge_id[3])
    except (ValueError, TypeError):
        return None

    if to_col > from_col:
        return "E"
    if to_col < from_col:
        return "W"
    if to_row > from_row:
        return "N"
    return "S"

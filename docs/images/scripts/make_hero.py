"""Generate README hero banner (text-based — replace with a screenshot for LinkedIn)."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt

OUT = Path(__file__).resolve().parent.parent / "hero-banner.png"

fig, ax = plt.subplots(figsize=(12, 3.2), dpi=150)
fig.patch.set_facecolor("#060a0f")
ax.set_facecolor("#060a0f")
ax.axis("off")

ax.text(
    0.5,
    0.62,
    "TRaffic",
    ha="center",
    va="center",
    fontsize=42,
    fontweight="bold",
    color="#60a5fa",
    transform=ax.transAxes,
    family="monospace",
)
ax.text(
    0.5,
    0.32,
    "AI-Based Traffic Management & Monitoring System",
    ha="center",
    va="center",
    fontsize=16,
    color="#e5e7eb",
    transform=ax.transAxes,
)
ax.text(
    0.5,
    0.12,
    "SUMO · YOLOv11 · Adaptive Control · Real-Time Dashboard",
    ha="center",
    va="center",
    fontsize=11,
    color="#9ca3af",
    transform=ax.transAxes,
)

plt.tight_layout(pad=0)
plt.savefig(OUT, facecolor=fig.get_facecolor(), bbox_inches="tight")
print(f"Wrote {OUT}")

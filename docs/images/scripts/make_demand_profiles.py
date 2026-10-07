"""Horizontal stacked bar chart of the three demand profiles for README."""
from __future__ import annotations
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "demand-profiles.png"

# (profile, ew %, ns %, turn %) — from scripts/generate_network.py PROFILES.
PROFILES = [
    ("Balanced",   40, 40, 20),
    ("Asymmetric", 56, 24, 20),
    ("Extreme",    75, 10, 15),
]
LABELS = ["E-W flow", "N-S flow", "Turning"]
COLORS = ["#2ca02c", "#7bc47f", "#bdbdbd"]   # accent green, lighter green, neutral grey

fig, ax = plt.subplots(figsize=(11, 4.2), dpi=150)
names = [p[0] for p in PROFILES]
ys = np.arange(len(PROFILES))

ew  = np.array([p[1] for p in PROFILES], dtype=float)
ns  = np.array([p[2] for p in PROFILES], dtype=float)
trn = np.array([p[3] for p in PROFILES], dtype=float)

ax.barh(ys, ew, color=COLORS[0], edgecolor="white", linewidth=1.0,
        label=LABELS[0], zorder=3)
ax.barh(ys, ns, left=ew, color=COLORS[1], edgecolor="white", linewidth=1.0,
        label=LABELS[1], zorder=3)
ax.barh(ys, trn, left=ew + ns, color=COLORS[2], edgecolor="white", linewidth=1.0,
        label=LABELS[2], zorder=3)

# Inline percentage labels on each segment.
for i, (name, e, n, t) in enumerate(PROFILES):
    if e >= 8:
        ax.text(e / 2, i, f"{e} %", ha="center", va="center",
                fontsize=11, fontweight="bold", color="white")
    if n >= 8:
        ax.text(e + n / 2, i, f"{n} %", ha="center", va="center",
                fontsize=11, fontweight="bold", color="white")
    if t >= 8:
        ax.text(e + n + t / 2, i, f"{t} %", ha="center", va="center",
                fontsize=11, fontweight="bold", color="0.20")

ax.set_yticks(ys)
ax.set_yticklabels(names, fontsize=12, fontweight="bold", color="0.15")
ax.set_xticks([0, 25, 50, 75, 100])
ax.set_xticklabels(["0 %", "25 %", "50 %", "75 %", "100 %"],
                   fontsize=9, color="0.35")
ax.set_xlim(0, 100)
ax.invert_yaxis()
ax.set_axisbelow(True)
ax.xaxis.grid(True, linestyle=":", color="0.85", linewidth=0.7, zorder=1)
for side in ("top", "right"):
    ax.spines[side].set_visible(False)
ax.spines["left"].set_color("0.60")
ax.spines["bottom"].set_color("0.60")
ax.tick_params(axis="both", length=0)

ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.28),
          ncol=3, fontsize=10, frameon=False)

fig.suptitle("Demand Profile Distribution",
             fontsize=14, fontweight="bold", color="0.10", y=0.99)
ax.set_title("Share of vehicle origin–destination pairs across the three "
             "race-mode demand profiles.",
             fontsize=9, color="0.40", style="italic", pad=10)

plt.tight_layout()
plt.subplots_adjust(bottom=0.22, top=0.84)
plt.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
print(f"saved -> {OUT}")

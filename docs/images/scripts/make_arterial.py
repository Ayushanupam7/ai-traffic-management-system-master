"""3x2 arterial grid schematic for README. B0/B1 highlighted as chokepoint."""
from __future__ import annotations
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D

OUT = Path(__file__).resolve().parent.parent / "arterial-grid.png"

EW_SPACING, NS_SPACING, STUB = 700, 500, 500
NODES = {
    "A0": (0, 0), "B0": (EW_SPACING, 0), "C0": (2 * EW_SPACING, 0),
    "A1": (0, NS_SPACING), "B1": (EW_SPACING, NS_SPACING), "C1": (2 * EW_SPACING, NS_SPACING),
}

fig, ax = plt.subplots(figsize=(10, 5), dpi=150)
for y in (0, NS_SPACING):
    ax.plot([-STUB, 2 * EW_SPACING + STUB], [y, y],
            color="0.35", linewidth=14, solid_capstyle="butt", zorder=1)
for x in (0, EW_SPACING, 2 * EW_SPACING):
    ax.plot([x, x], [-STUB, NS_SPACING + STUB],
            color="0.25", linewidth=9, solid_capstyle="butt", zorder=1)
for y in (0, NS_SPACING):
    ax.plot([-STUB, 2 * EW_SPACING + STUB], [y, y],
            color="0.78", linewidth=0.6, linestyle="--", dashes=(6, 6), zorder=2)
for x in (0, EW_SPACING, 2 * EW_SPACING):
    ax.plot([x, x], [-STUB, NS_SPACING + STUB],
            color="0.78", linewidth=0.6, linestyle="--", dashes=(6, 6), zorder=2)

CHOKE = {"B0", "B1"}
for name, (x, y) in NODES.items():
    col = "#d62728" if name in CHOKE else "#1f77b4"
    ax.add_patch(mpatches.Circle((x, y), 75, facecolor=col, edgecolor="white",
                                 linewidth=2.0, zorder=4))
    ax.text(x, y, name, ha="center", va="center", color="white",
            fontsize=11, fontweight="bold", zorder=5)

handles = [
    Line2D([0], [0], marker="o", linestyle="None", markersize=10,
           markerfacecolor="#1f77b4", markeredgecolor="white",
           label="Signalized intersection"),
    Line2D([0], [0], marker="o", linestyle="None", markersize=10,
           markerfacecolor="#d62728", markeredgecolor="white",
           label="Structural chokepoint (B0, B1)"),
]
ax.legend(handles=handles, loc="lower left", fontsize=9,
          frameon=True, framealpha=0.95, edgecolor="0.75")
ax.set_title("3x2 Arterial Grid", fontsize=14, fontweight="bold", pad=10)
ax.set_xlim(-700, 2 * EW_SPACING + STUB + 200)
ax.set_ylim(-STUB - 100, NS_SPACING + STUB + 100)
ax.set_aspect("equal")
ax.set_axis_off()
plt.tight_layout()
plt.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
print(f"saved -> {OUT}")

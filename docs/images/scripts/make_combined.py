"""Combined city + highway network with colinear merge for README."""
from __future__ import annotations
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

OUT = Path(__file__).resolve().parent.parent / "combined-network.png"

HALF_CORR = 1500
SHIFT_X = 2300
EW_SPACING, NS_SPACING = 700, 500

# Freeway centerlines pinned to arterial grid rows (y=0 and y=NS_SPACING).
HWY_E_Y = NS_SPACING
HWY_W_Y = 0

fig, ax = plt.subplots(figsize=(16, 5), dpi=150)

# Freeway carriageways colinear with arterial rows.
ax.plot([-HALF_CORR, SHIFT_X - 300], [HWY_E_Y, HWY_E_Y],
        color="0.22", linewidth=22, solid_capstyle="butt", zorder=2)
ax.plot([-HALF_CORR, SHIFT_X - 300], [HWY_W_Y, HWY_W_Y],
        color="0.22", linewidth=22, solid_capstyle="butt", zorder=2)

# Feeder edges bridging freeway -> arterial.
for y in (HWY_E_Y, HWY_W_Y):
    ax.plot([SHIFT_X - 300, SHIFT_X], [y, y],
            color="#8b4513", linewidth=18, solid_capstyle="butt", zorder=3)

# Arterial grid (shifted east).
for y in (0, NS_SPACING):
    ax.plot([SHIFT_X, SHIFT_X + 2 * EW_SPACING + 300], [y, y],
            color="0.35", linewidth=14, solid_capstyle="butt", zorder=1)
for x_off in (0, EW_SPACING, 2 * EW_SPACING):
    x = SHIFT_X + x_off
    ax.plot([x, x], [-300, NS_SPACING + 300],
            color="0.25", linewidth=9, solid_capstyle="butt", zorder=1)

# Intersection nodes.
NODES = {
    "A0": (SHIFT_X, 0), "B0": (SHIFT_X + EW_SPACING, 0), "C0": (SHIFT_X + 2 * EW_SPACING, 0),
    "A1": (SHIFT_X, NS_SPACING), "B1": (SHIFT_X + EW_SPACING, NS_SPACING),
    "C1": (SHIFT_X + 2 * EW_SPACING, NS_SPACING),
}
CHOKE = {"B0", "B1"}
for name, (x, y) in NODES.items():
    col = "#d62728" if name in CHOKE else "#1f77b4"
    ax.add_patch(mpatches.Circle((x, y), 75, facecolor=col, edgecolor="white",
                                 linewidth=2.0, zorder=4))
    ax.text(x, y, name, ha="center", va="center", color="white",
            fontsize=10, fontweight="bold", zorder=5)

# Ramp meter signals on freeway.
def signal(ax, x, y, s=20):
    ax.add_patch(mpatches.Rectangle((x - s*0.45, y - s*1.05), s*0.9, s*2.1,
                                    facecolor="0.18", edgecolor="0.0", linewidth=0.8, zorder=6))
    ax.add_patch(mpatches.Circle((x, y + s*0.55), s*0.32, facecolor="#e74c3c",
                                 edgecolor="white", linewidth=0.7, zorder=7))
    ax.add_patch(mpatches.Circle((x, y - s*0.55), s*0.32, facecolor="#2ecc71",
                                 edgecolor="white", linewidth=0.7, zorder=7))

for x, y, name in [(-500, HWY_E_Y + 60, "E1"), (500, HWY_E_Y + 60, "E2"),
                   (-500, HWY_W_Y - 60, "W2"), (500, HWY_W_Y - 60, "W1")]:
    signal(ax, x, y)
    ax.text(x + 30, y, name, ha="left", va="center",
            fontsize=10, fontweight="bold", family="monospace", color="0.10", zorder=8)

# Labels.
ax.text(-HALF_CORR / 2, HWY_E_Y + 130, "FREEWAY", fontsize=11,
        fontweight="bold", color="0.20", ha="center")
ax.text(SHIFT_X + EW_SPACING, NS_SPACING + 200, "ARTERIAL GRID",
        fontsize=11, fontweight="bold", color="0.20", ha="center")
ax.text(SHIFT_X - 150, HWY_E_Y + 100, "feeder", fontsize=9,
        style="italic", color="#8b4513", ha="center")

ax.set_title("Combined City + Highway Network (colinear merge)",
             fontsize=14, fontweight="bold", pad=10)
ax.set_xlim(-HALF_CORR - 100, SHIFT_X + 2 * EW_SPACING + 500)
ax.set_ylim(-400, NS_SPACING + 300)
ax.set_aspect("equal")
ax.set_axis_off()
plt.tight_layout()
plt.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
print(f"saved -> {OUT}")

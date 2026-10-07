"""Highway corridor with 4 ramp meters for README."""
from __future__ import annotations
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D

OUT = Path(__file__).resolve().parent.parent / "highway-corridor.png"

HALF_CORR = 1500
HWY_E_Y, HWY_W_Y = 200, -200
SVC_E_Y, SVC_W_Y = 240, -240
RAMP_HALF, ACCEL_LEN = 175, 250

def meter_pts(mx, bound):
    if bound == "E":
        return ((mx - RAMP_HALF, SVC_E_Y), (mx + RAMP_HALF, HWY_E_Y), (mx + RAMP_HALF + ACCEL_LEN, HWY_E_Y))
    return ((mx + RAMP_HALF, SVC_W_Y), (mx - RAMP_HALF, HWY_W_Y), (mx - RAMP_HALF - ACCEL_LEN, HWY_W_Y))

METERS = {"E1": meter_pts(-500, "E"), "E2": meter_pts(500, "E"),
          "W1": meter_pts(500, "W"),  "W2": meter_pts(-500, "W")}

fig, ax = plt.subplots(figsize=(14, 5), dpi=150)
for y in (HWY_E_Y, HWY_W_Y):
    ax.plot([-HALF_CORR, HALF_CORR], [y, y], color="0.22", linewidth=22, solid_capstyle="butt", zorder=2)
for y in (SVC_E_Y, SVC_W_Y):
    ax.plot([-HALF_CORR, HALF_CORR], [y, y], color="0.50", linewidth=10, solid_capstyle="butt", zorder=2)
for name, (svc, hwy, end) in METERS.items():
    ax.plot([hwy[0], end[0]], [hwy[1], end[1]], color="0.36", linewidth=26, solid_capstyle="butt", zorder=3)
    ax.plot([svc[0], hwy[0]], [svc[1], hwy[1]], color="0.45", linewidth=7,
            solid_capstyle="round", linestyle=(0, (8, 4)), zorder=3)

def draw_signal(ax, x, y, s=22):
    ax.add_patch(mpatches.Rectangle((x - s*0.45, y - s*1.05), s*0.9, s*2.1,
                                    facecolor="0.18", edgecolor="0.0", linewidth=0.8, zorder=6))
    ax.add_patch(mpatches.Circle((x, y + s*0.55), s*0.32, facecolor="#e74c3c",
                                 edgecolor="white", linewidth=0.7, zorder=7))
    ax.add_patch(mpatches.Circle((x, y - s*0.55), s*0.32, facecolor="#2ecc71",
                                 edgecolor="white", linewidth=0.7, zorder=7))

for name, (svc, hwy, end) in METERS.items():
    draw_signal(ax, svc[0], svc[1])
    dy = 50 if svc[1] > 0 else -50
    ax.text(svc[0] + 30, svc[1] + dy, name, ha="left", va="center",
            fontsize=11, fontweight="bold", family="monospace", color="0.10", zorder=8)

handles = [
    Line2D([0], [0], color="0.22", lw=8, label="Freeway (4 lanes, 100 km/h)"),
    Line2D([0], [0], color="0.50", lw=5, label="Service road (2 lanes, 40 km/h)"),
    Line2D([0], [0], color="0.36", lw=8, label="Acceleration zone"),
    Line2D([0], [0], color="0.45", lw=4, linestyle=(0, (6, 4)), label="Merge ramp (350 m)"),
    Line2D([0], [0], marker="s", linestyle="None", markersize=9,
           markerfacecolor="0.18", markeredgecolor="black", label="Ramp meter"),
]
ax.legend(handles=handles, loc="lower right", fontsize=9,
          frameon=True, framealpha=0.95, edgecolor="0.75")
ax.set_title("Highway Corridor (3 km, 4 ramp meters)", fontsize=14, fontweight="bold", pad=10)
ax.set_xlim(-HALF_CORR - 100, HALF_CORR + 100)
ax.set_ylim(-330, 320)
ax.set_aspect("equal")
ax.set_axis_off()
plt.tight_layout()
plt.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
print(f"saved -> {OUT}")

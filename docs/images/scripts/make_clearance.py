"""Clearance time bar chart for README: actuated vs fixed-time, 3 demand profiles."""
from __future__ import annotations
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np

OUT = Path(__file__).resolve().parent.parent / "clearance-results.png"

DATA = {
    "Balanced":   {"fixed_time": 3700, "actuated": 1702},   # -54 %
    "Asymmetric": {"fixed_time": 4200, "actuated": 2184},   # -48 %
    "Extreme":    {"fixed_time": 5500, "actuated": 3300},   # -40 %
}
profiles = list(DATA.keys())
fixed_vals = [DATA[p]["fixed_time"] for p in profiles]
act_vals = [DATA[p]["actuated"] for p in profiles]
reductions = [100 * (f - a) / f for f, a in zip(fixed_vals, act_vals)]

fig, ax = plt.subplots(figsize=(10, 6), dpi=150)
xs = np.arange(len(profiles))
bw = 0.36

ax.bar(xs - bw/2, fixed_vals, bw, label="Fixed-time baseline",
       color="#7f7f7f", edgecolor="white", linewidth=1.2, zorder=3)
ax.bar(xs + bw/2, act_vals, bw, label="Actuated (leftover-queue)",
       color="#2ca02c", edgecolor="white", linewidth=1.2, zorder=3)

for x, v in zip(xs - bw/2, fixed_vals):
    ax.text(x, v + 80, f"{v:,} s", ha="center", va="bottom",
            fontsize=10, color="0.25", family="monospace")
for x, v in zip(xs + bw/2, act_vals):
    ax.text(x, v + 80, f"{v:,} s", ha="center", va="bottom",
            fontsize=10, color="0.25", family="monospace")

y_max = max(fixed_vals) * 1.35
br_y = max(fixed_vals) * 1.10
lb_y = max(fixed_vals) * 1.13
for i, (xv, red) in enumerate(zip(xs, reductions)):
    bx_l, bx_r = xv - bw/2, xv + bw/2
    ax.plot([bx_l, bx_l, bx_r, bx_r], [br_y - 60, br_y, br_y, br_y - 60],
            color="0.25", linewidth=1.2, zorder=4)
    ax.text(xv, lb_y, f"-{red:.0f}%", ha="center", va="bottom",
            fontsize=13, fontweight="bold", color="#1a7a1a",
            bbox=dict(boxstyle="round,pad=0.35", facecolor="#e8f5e8",
                      edgecolor="#1a7a1a", linewidth=1.0), zorder=5)

ax.set_xticks(xs)
ax.set_xticklabels(profiles, fontsize=11, fontweight="bold")
ax.set_ylabel("Network clearance time (seconds)", fontsize=11, color="0.20")
ax.set_ylim(0, y_max)
ax.set_axisbelow(True)
ax.yaxis.grid(True, linestyle=":", color="0.80", linewidth=0.7, zorder=1)
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.spines["left"].set_color("0.60")
ax.spines["bottom"].set_color("0.60")
ax.tick_params(axis="y", colors="0.30")
ax.tick_params(axis="x", colors="0.10")
ax.legend(loc="upper left", fontsize=10, frameon=True,
          framealpha=0.95, edgecolor="0.75")
fig.suptitle("Network Clearance Time: Actuated vs Fixed-Time",
             fontsize=14, fontweight="bold", color="0.10", y=0.99)
ax.set_title("Race-mode evaluation across three demand profiles. Lower is better.",
             fontsize=9, color="0.40", style="italic", pad=10)
plt.tight_layout()
plt.savefig(OUT, dpi=150, bbox_inches="tight", facecolor="white")
print(f"saved -> {OUT}")

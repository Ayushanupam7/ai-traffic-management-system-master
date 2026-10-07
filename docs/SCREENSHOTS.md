# README screenshot checklist

Some README figures are generated automatically; others must be captured from the running app.

## Auto-generated (run from repo root)

```bash
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install matplotlib
python docs/images/scripts/make_hero.py
python docs/images/scripts/make_arterial.py
python docs/images/scripts/make_highway.py
python docs/images/scripts/make_combined.py
python docs/images/scripts/make_demand_profiles.py
python docs/images/scripts/make_waiting_time.py
python docs/images/scripts/make_clearance.py
```

Or: `bash scripts/generate_readme_figures.sh`

Regenerate the README demo GIF (slideshow from screenshots):

```bash
pip install pillow
python docs/images/scripts/make_demo_gif.py
```

## Manual captures (save under `docs/images/`)

| File | What to capture |
|------|-----------------|
| `dashboard.png` | Live dashboard — 3×2 grid, metrics panel, simulation running |
| `carla.png` | CARLA mode with vision overlay on (bounding boxes + queue counts) |
| `lab.png` | Simulation Lab comparison page with bar charts |
| `realworld-detections.png` | Real-world ramp camera with chevron zones / queue overlay |
| `collision-detection.png` | Collision detection frame with red `[COLLISION]` boxes |

### Tips

- Use **1440×900** or wider; PNG format.
- Dark theme matches the app — capture with the default UI.
- For LinkedIn: export a **15s screen recording** as GIF → `docs/images/demo.gif`, then add to README top.

## GitHub social preview

Upload `docs/images/hero-banner.png` (or `dashboard.png`) in GitHub → **Settings → General → Social preview**.

# Vision Integration — YOLOv11m on CARLA cameras

This branch (`integrated`) adds a custom **YOLOv11m** vehicle-detection model + analytics
to TRaffic's **CARLA mode**. When enabled, the camera you're watching is processed by the
model: the feed is annotated (boxes, classes, **emergency** vehicles, speed, lanes, violation
lines), and that intersection's **queue + emergencies** in the dashboard come from vision while
every other intersection stays on CARLA ground truth.

It is **OFF by default** — with vision off, streams and `TickData` are exactly the stock CARLA
behaviour. Nothing in SUMO mode is touched (SUMO has no cameras).

---

## 1. Prerequisites

- A running **CARLA server** on `localhost:2000` (the same one TRaffic's CARLA mode already uses).
- The `carla` Python wheel installed in the backend env (already required for CARLA mode).
- A GPU is recommended (the model runs ~real-time on one camera; CPU works but is slow).

The trained weights are **committed** at `packages/cv-pipeline/models/best.pt` (≈39 MB) — no download needed.

## 2. One-time setup

Install the new dependency (Ultralytics) into the **backend** virtualenv:

```bash
# Windows
.venv/Scripts/python.exe -m pip install ultralytics

# Mac/Linux
python -m pip install ultralytics
```

> Ultralytics pulls in `torch`. For GPU, install the CUDA build of torch first
> (`pip install torch --index-url https://download.pytorch.org/whl/cu121`), then `ultralytics`.

## 3. Run it

Three processes, same as normal CARLA mode:

```bash
# 1. CARLA server (separate terminal) — your existing launch, e.g.
./CarlaUE4.sh        # or CarlaUE4.exe on Windows

# 2. Backend
.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# 3. Frontend
cd frontend && npm run dev          # http://localhost:3000
```

In the dashboard: **SimControls → mode = CARLA → Start**.

## 4. Test / demo the vision

1. Click an intersection on the map → the right panel opens → **Cameras** tab.
2. Pick an approach (**N/E/S/W**) — the live camera feed appears.
3. Click **`Vision: off` → `on`**. The feed now shows our model's detections:
   - colored boxes + class labels (car / bus / truck / bike / **ambulance / police_car / fire_truck**),
   - per-vehicle **speed**,
   - lane polygons + queue counts and violation lines (if you've drawn any — see §5),
   - emergency vehicles boxed in **red**.
4. Look at that intersection on the **map / Live tab**: its **queue** and any **emergency** now come
   from vision. The other four intersections stay on ground truth — flip `Vision` off to compare.
5. Switch approaches or intersections — only the camera you're watching is processed (CARLA keeps
   one camera alive at a time), so it stays light on the GPU.

Turn it off anytime with the same button (`Vision: on → off`) — the dashboard returns to pure
ground truth and the model is released.

## 5. Draw lanes + violation lines per camera (optional)

Per-camera regions sharpen the queue (count only the approach lanes) and enable red-light violations.

1. Open a camera (as above) and click **`Edit regions`**.
2. **Lane (polygon):** click 3+ points around a lane, then **Close lane**.
3. **Violation line:** click 2 points across the stop line.
4. **Save regions** → stored in `packages/sumo-engine/configs/camera_regions.json`, keyed by
   intersection + approach. The analyzer picks them up automatically the next time vision runs.
5. **Done** to return to the live feed.

Calibration (pixel→world homography) is **automatic** from each camera's transform — you only draw
the lanes/lines, no 4-point picking.

## 6. Saved outputs (logging)

Whenever vision is on, the watched camera logs to a per-camera folder (under the backend's run dir):

- `per_track.csv` — frame, track_id, class, vehicle_type, world x/y, speed, is_queued
- `violations.csv` — frame, track_id, line_id, light_state
- `summary.json` — frames, unique tracks, total violations, max queue, lanes/lines

So the model's output is always persisted, not just streamed.

## 7. How it works (1 paragraph)

`carla_bridge/vision_manager.py` runs `cv_pipeline.ApproachAnalyzer` (YOLOv11m + ByteTrack + homography
speed/queue + lane/violation logic) on the active camera's frames. The `/api/cameras/.../stream`
endpoint passes each JPEG through `vision_process_jpeg` (annotate + cache the result); `carla_service.snapshot()`
calls `merge_vision_into_tick` to override the watched intersection's queue/emergencies in the `TickData`.
A runtime flag (`GET/POST /api/cameras/vision`) gates all of it.

## 8. Caveats / limitations

- **Watched intersection only.** Vision drives the intersection whose camera you're viewing; the rest
  stay ground truth. Running all 5 intersections × 4 cameras continuously is not feasible on a single GPU.
- **Violations rarely fire in CARLA.** TrafficManager cars *obey* red lights, so red-light violations
  won't trigger unless cars are forced to run reds (CARLA `ignore_lights_percentage`, not wired here).
  The violation lines + detector are ready; they fire on real-world video or a forced-red setup.
- **Queue threshold.** Defaults to CARLA's 3.5 m/s convention (TM cars creep at reds). Tune
  `queue_speed_kmh` if needed.
- **SUMO mode is unaffected** — vision is CARLA-only by nature (no cameras in SUMO).

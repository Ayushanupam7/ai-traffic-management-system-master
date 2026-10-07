# Changelog

All notable releases of this capstone project are documented here.

## [1.0.0] — 2026-06-25

### Added

- SUMO microsimulation: 3×2 arterial grid, highway corridor, combined network
- Adaptive signal policies: actuated, fixed-time, ALINEA ramp metering, composite
- YOLOv11m + ByteTrack computer vision pipeline with custom `best.pt` weights
- CARLA visualization bridge with hybrid vision-to-control override
- FastAPI backend with WebSocket live broadcasting
- Next.js dashboard: simulation controls, policy lab, emergency dispatch, AI assistant
- Supabase schema migrations and experiment logging
- Race-mode evaluation framework (`scripts/run_races.py`)
- Capstone report, demo guide, contributors, and README assets

### Results (capstone validation)

- Up to **54%** reduction in average waiting time vs fixed-time control
- YOLOv11m **mAP50 0.949** on held-out CARLA test set
- **27.7 FPS** inference on consumer GPU

[1.0.0]: https://github.com/3bdulah/ai-traffic-management-system/releases/tag/v1.0.0

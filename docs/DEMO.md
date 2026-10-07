# Demo guide

Run the platform locally with the minimum setup. Optional services can be skipped for a first look.

## Minimum demo (no cloud keys)

You can explore the dashboard and run SUMO simulations **without** Supabase or Groq:

1. Install [SUMO 1.26](https://eclipse.dev/sumo/) and set `SUMO_HOME`.
2. Follow [Quick start](../README.md#quick-start) through `npm run dev`.
3. Leave `SUPABASE_*` and `GROQ_API_KEY` empty in `.env`.

**What works without keys**

- Live simulation on the 3×2 arterial grid (and highway/combined networks)
- Policy switching from `/policy`
- WebSocket dashboard updates
- Race-mode runs (results stay in-memory unless Supabase is configured)

**What needs keys**

| Feature | Required env |
|---------|----------------|
| Persist runs / Simulation Lab history | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| AI assistant chat widget | `GROQ_API_KEY` |
| CARLA photorealistic mode | CARLA server on `localhost:2000` |
| Vision overlay on cameras | CARLA + `packages/cv-pipeline/models/best.pt` (included in repo) |

## Quick smoke test

```bash
# Terminal 1 — backend
source .venv/bin/activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:3000 → select **Arterial** network → **Actuated** policy → **Start**. You should see the grid update within a few seconds.

## Headless race evaluation

With the backend running:

```bash
python scripts/run_races.py
```

Runs six seeded races (3 demand profiles × 2 policies). Without Supabase, poll results via the API or dashboard Lab page for the current session.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `SUMO_HOME` not set | Export path to your SUMO install before starting the backend |
| Simulation fails to start | Run `python scripts/generate_network.py` once |
| WebSocket disconnected | Ensure backend is on port 8000; frontend defaults to `localhost:8000` |
| CV / CARLA unavailable | Use **SUMO** mode in sim controls — no CARLA required |

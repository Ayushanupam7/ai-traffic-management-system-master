"""Comparison-experiment orchestrator.

Queues multiple SimulationConfigs and runs them sequentially against the
shared sim_manager. The backend is single-TraCI, so concurrency is not an
option — this service just drives the queue.

Persistence: experiments + experiment_runs live in Supabase. The in-memory
`_experiments` dict serves as a hot cache for live experiments; on cold
start, `_ensure_hydrated()` pulls them back from Supabase.

Progress is also broadcast on the WebSocket as {"type": "experiment_update", ...}
so the dashboard reflects live status without polling.
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional
from uuid import uuid4

from shared.types import (
    ComparisonExperiment,
    ComparisonRequest,
    ComparisonRun,
    ComparisonRunResult,
    SimulationConfig,
    SimulationStatus,
)

from ..ws.manager import ws_manager
from .db_service import db_service
from .simulation_service import sim_manager


class ExperimentManager:
    def __init__(self):
        self._experiments: dict[str, ComparisonExperiment] = {}
        self._tasks: dict[str, asyncio.Task] = {}
        self._active_id: Optional[str] = None
        self._hydrated = False

    # --------------------------------------------------------------- #
    # Hydration from Supabase
    # --------------------------------------------------------------- #
    async def _ensure_hydrated(self) -> None:
        if self._hydrated:
            return
        self._hydrated = True
        rows = await db_service.list_experiments(limit=100)
        for row in rows:
            try:
                exp = await self._hydrate_one(row["id"])
                if exp is not None:
                    self._experiments[exp.experiment_id] = exp
            except Exception as e:
                print(f"Failed to hydrate experiment {row.get('id')}: {e}")

    async def _hydrate_one(self, experiment_id: str) -> Optional[ComparisonExperiment]:
        row = await db_service.get_experiment(experiment_id)
        if row is None:
            return None
        runs: list[ComparisonRun] = []
        for r in row.get("runs", []):
            result = None
            if r.get("status") == "completed":
                result = ComparisonRunResult(
                    clearance_s=r.get("clearance_s"),
                    avg_trip_time_s=r.get("avg_trip_time_s") or 0.0,
                    completed_trips=r.get("completed_trips") or 0,
                    avg_control_delay_s=r.get("avg_control_delay_s") or 0.0,
                    throughput_veh_per_min=r.get("throughput_veh_per_min") or 0.0,
                )
            runs.append(ComparisonRun(
                run_id=r.get("run_id") or str(uuid4()),
                config=SimulationConfig(**r["config"]),
                status=r.get("status", "pending"),
                error=r.get("error"),
                result=result,
            ))
        return ComparisonExperiment(
            experiment_id=row["id"],
            name=row.get("name") or f"comparison-{row['id'][:8]}",
            seed=row.get("seed", 42),
            status=row.get("status", "pending"),
            current_run_idx=-1,
            runs=runs,
            created_at=time.time(),
        )

    # --------------------------------------------------------------- #
    # Public reads
    # --------------------------------------------------------------- #
    async def list(self) -> list[ComparisonExperiment]:
        await self._ensure_hydrated()
        return sorted(
            self._experiments.values(), key=lambda e: e.created_at, reverse=True
        )

    async def get(self, experiment_id: str) -> Optional[ComparisonExperiment]:
        await self._ensure_hydrated()
        return self._experiments.get(experiment_id)

    # --------------------------------------------------------------- #
    # Lifecycle
    # --------------------------------------------------------------- #
    async def create(self, req: ComparisonRequest) -> ComparisonExperiment:
        await self._ensure_hydrated()

        # Persist parent row first so we have a real id from Supabase.
        exp_id = await db_service.create_experiment(
            name=req.name, seed=req.seed
        ) or str(uuid4())

        runs = []
        for idx, cfg in enumerate(req.runs):
            patched = cfg.model_copy(update={"seed": req.seed, "gui": False})
            local_run_id = str(uuid4())
            runs.append(ComparisonRun(run_id=local_run_id, config=patched))
            await db_service.upsert_experiment_run(
                exp_id, idx, config=patched, status="pending"
            )

        exp = ComparisonExperiment(
            experiment_id=exp_id,
            name=req.name or f"comparison-{exp_id[:8]}",
            seed=req.seed,
            status="pending",
            current_run_idx=-1,
            runs=runs,
            created_at=time.time(),
        )
        self._experiments[exp_id] = exp

        self._tasks[exp_id] = asyncio.create_task(self._run_loop(exp_id))
        return exp

    async def cancel(self, experiment_id: str) -> Optional[ComparisonExperiment]:
        exp = await self.get(experiment_id)
        if exp is None or exp.status not in ("pending", "running"):
            return exp

        exp.status = "cancelled"
        for run in exp.runs:
            if run.status in ("pending", "running"):
                run.status = "cancelled"

        if self._active_id == experiment_id and sim_manager.is_running:
            try:
                await sim_manager.stop()
            except Exception as e:
                print(f"cancel(): sim_manager.stop failed: {e}")

        task = self._tasks.get(experiment_id)
        if task and not task.done():
            task.cancel()

        await db_service.update_experiment(exp.experiment_id, status="cancelled")
        await self._broadcast(exp, None)
        return exp

    async def _broadcast(
        self, exp: ComparisonExperiment, run_idx: Optional[int]
    ) -> None:
        await ws_manager.broadcast_json(
            {
                "type": "experiment_update",
                "experiment_id": exp.experiment_id,
                "status": exp.status,
                "current_run_idx": exp.current_run_idx,
                "run_idx": run_idx,
                "experiment": exp.model_dump(),
            }
        )

    async def _wait_until_idle(self, timeout_s: float = 30.0) -> None:
        deadline = time.time() + timeout_s
        while sim_manager.is_running and time.time() < deadline:
            await asyncio.sleep(0.1)

    async def _wait_until_run_done(self, exp: ComparisonExperiment) -> None:
        while True:
            if exp.status == "cancelled":
                return
            if sim_manager.status == SimulationStatus.STOPPED:
                return
            await asyncio.sleep(0.5)

    async def _run_loop(self, exp_id: str) -> None:
        exp = self._experiments[exp_id]
        exp.status = "running"
        await db_service.update_experiment(exp_id, status="running")
        await self._broadcast(exp, None)

        try:
            for idx, run in enumerate(exp.runs):
                if exp.status == "cancelled":
                    break

                await self._wait_until_idle()

                exp.current_run_idx = idx
                run.status = "running"
                await db_service.upsert_experiment_run(
                    exp_id, idx, config=run.config, status="running"
                )
                await self._broadcast(exp, idx)
                self._active_id = exp_id

                try:
                    await sim_manager.start(run.config)
                    # Link the DB simulation_runs.id back onto the row so we
                    # can join in queries later.
                    if sim_manager._run_id:
                        run.run_id = sim_manager._run_id
                        await db_service.upsert_experiment_run(
                            exp_id, idx, config=run.config,
                            status="running", run_id=sim_manager._run_id,
                        )
                    await self._wait_until_run_done(exp)
                except Exception as e:
                    run.status = "failed"
                    run.error = str(e)
                    self._active_id = None
                    await db_service.upsert_experiment_run(
                        exp_id, idx, config=run.config,
                        status="failed", error=str(e),
                    )
                    await self._broadcast(exp, idx)
                    continue

                self._active_id = None

                if exp.status == "cancelled":
                    break

                tick_data = sim_manager.last_tick_data
                info = sim_manager.get_info()
                if tick_data is None:
                    run.status = "failed"
                    run.error = "no tick data captured"
                    await db_service.upsert_experiment_run(
                        exp_id, idx, config=run.config,
                        status="failed", error="no tick data captured",
                    )
                else:
                    metrics = tick_data.metrics
                    clearance = info.sim_time if run.config.race_mode else None
                    run.result = ComparisonRunResult(
                        clearance_s=clearance,
                        avg_trip_time_s=metrics.avg_trip_time_s,
                        completed_trips=metrics.completed_trips,
                        avg_control_delay_s=metrics.avg_control_delay_s,
                        throughput_veh_per_min=metrics.throughput_veh_per_min,
                    )
                    run.status = "completed"
                    await db_service.upsert_experiment_run(
                        exp_id, idx, config=run.config,
                        status="completed",
                        run_id=run.run_id,
                        clearance_s=clearance,
                        avg_trip_time_s=metrics.avg_trip_time_s,
                        completed_trips=metrics.completed_trips,
                        avg_control_delay_s=metrics.avg_control_delay_s,
                        throughput_veh_per_min=metrics.throughput_veh_per_min,
                    )

                await self._broadcast(exp, idx)

            if exp.status != "cancelled":
                exp.status = "completed"
        except asyncio.CancelledError:
            exp.status = "cancelled"
            raise
        except Exception as e:
            exp.status = "failed"
            for run in exp.runs:
                if run.status in ("pending", "running"):
                    run.status = "failed"
                    run.error = run.error or str(e)
        finally:
            self._active_id = None
            await db_service.update_experiment(exp_id, status=exp.status)
            try:
                await self._broadcast(exp, None)
            except Exception:
                pass


experiment_manager = ExperimentManager()

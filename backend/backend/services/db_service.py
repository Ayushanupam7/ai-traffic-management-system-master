"""Buffered Supabase writer.

Owns its own queue and flushes from a background task so the simulation
tick loop never blocks on network I/O. If SUPABASE_URL or service-role
key is unset, the service degrades to a no-op stub so the backend still
boots for dev environments without a project.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

from shared.config import get_settings


class DBService:
    def __init__(self, batch_size: Optional[int] = None) -> None:
        settings = get_settings()
        self._enabled = bool(
            settings.supabase_url and settings.supabase_service_role_key
        )
        self._batch_size = batch_size or settings.db_batch_size
        self._client = None  # supabase.Client (lazy)
        self._intersection_buf: list[dict] = []
        self._global_buf: list[dict] = []
        self._flush_lock = asyncio.Lock()

        if not self._enabled:
            print("[db] Supabase disabled (missing SUPABASE_URL or service-role key)")

    # --------------------------------------------------------------- #
    # client access (lazy so import-time isn't blocking)
    # --------------------------------------------------------------- #
    def _get_client(self):
        if not self._enabled:
            return None
        if self._client is None:
            from shared.supabase_client import get_supabase_client
            self._client = get_supabase_client()
        return self._client

    # --------------------------------------------------------------- #
    # simulation_runs
    # --------------------------------------------------------------- #
    async def start_run(self, run_id: str, config: Any) -> Optional[str]:
        """Insert a simulation_runs row with the supplied UUID so the local
        WS run_id matches the DB row. Returns the id on success, None if disabled or on error."""
        if not self._enabled:
            return None

        def _insert():
            cfg_dict = config.model_dump(mode="json") if hasattr(config, "model_dump") else dict(config)
            client = self._get_client()
            client.table("simulation_runs").insert({
                "id": run_id,
                "policy_type": cfg_dict.get("policy_type", "unknown"),
                "config": cfg_dict,
                "status": "running",
            }).execute()
            return run_id

        try:
            return await asyncio.to_thread(_insert)
        except Exception as e:
            print(f"[db] start_run failed: {e}")
            return None

    async def end_run(self, run_id: Optional[str], total_ticks: int, status: str = "completed") -> None:
        if not self._enabled or run_id is None:
            return
        # Drain buffers before marking the run as ended so charts see the last cycle.
        await self.flush()

        def _update():
            client = self._get_client()
            client.table("simulation_runs").update({
                "ended_at": datetime.now(timezone.utc).isoformat(),
                "total_ticks": total_ticks,
                "status": status,
            }).eq("id", run_id).execute()

        try:
            await asyncio.to_thread(_update)
        except Exception as e:
            print(f"[db] end_run failed: {e}")

    # --------------------------------------------------------------- #
    # metric buffering
    # --------------------------------------------------------------- #
    def enqueue_intersection_metric(self, row: dict) -> None:
        if not self._enabled:
            return
        self._intersection_buf.append(row)
        if len(self._intersection_buf) >= self._batch_size:
            asyncio.create_task(self.flush())

    def enqueue_global_metric(self, row: dict) -> None:
        if not self._enabled:
            return
        self._global_buf.append(row)
        if len(self._global_buf) >= self._batch_size:
            asyncio.create_task(self.flush())

    async def flush(self) -> None:
        if not self._enabled:
            return
        async with self._flush_lock:
            inter, self._intersection_buf = self._intersection_buf, []
            glob,  self._global_buf       = self._global_buf,       []

        if not inter and not glob:
            return

        def _write():
            client = self._get_client()
            if inter:
                client.table("intersection_metrics").insert(inter).execute()
            if glob:
                client.table("global_metrics").insert(glob).execute()

        try:
            await asyncio.to_thread(_write)
        except Exception as e:
            print(f"[db] flush failed ({len(inter)} inter, {len(glob)} global): {e}")

    # --------------------------------------------------------------- #
    # experiments
    # --------------------------------------------------------------- #
    async def create_experiment(self, name: Optional[str], seed: int) -> Optional[str]:
        if not self._enabled:
            return None

        def _insert():
            client = self._get_client()
            resp = client.table("experiments").insert({
                "name": name,
                "seed": seed,
                "status": "running",
            }).execute()
            return resp.data[0]["id"] if resp.data else None

        try:
            return await asyncio.to_thread(_insert)
        except Exception as e:
            print(f"[db] create_experiment failed: {e}")
            return None

    async def upsert_experiment_run(
        self, experiment_id: str, run_index: int, config: Any, **extra
    ) -> None:
        if not self._enabled:
            return
        cfg_dict = config.model_dump(mode="json") if hasattr(config, "model_dump") else dict(config)

        def _upsert():
            client = self._get_client()
            row = {
                "experiment_id": experiment_id,
                "run_index": run_index,
                "config": cfg_dict,
                **extra,
            }
            client.table("experiment_runs").upsert(
                row, on_conflict="experiment_id,run_index"
            ).execute()

        try:
            await asyncio.to_thread(_upsert)
        except Exception as e:
            print(f"[db] upsert_experiment_run failed: {e}")

    async def update_experiment(self, experiment_id: str, **fields) -> None:
        if not self._enabled:
            return

        def _update():
            client = self._get_client()
            client.table("experiments").update({
                **fields,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", experiment_id).execute()

        try:
            await asyncio.to_thread(_update)
        except Exception as e:
            print(f"[db] update_experiment failed: {e}")

    # --------------------------------------------------------------- #
    # reads (for the /api/runs router + experiment hydration)
    # --------------------------------------------------------------- #
    async def list_runs(self, limit: int = 50) -> list[dict]:
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            resp = (
                client.table("simulation_runs")
                .select("*")
                .order("started_at", desc=True)
                .limit(limit)
                .execute()
            )
            return resp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] list_runs failed: {e}")
            return []

    async def get_run(self, run_id: str) -> Optional[dict]:
        if not self._enabled:
            return None

        def _read():
            client = self._get_client()
            resp = (
                client.table("simulation_runs")
                .select("*")
                .eq("id", run_id)
                .maybe_single()
                .execute()
            )
            return resp.data

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] get_run failed: {e}")
            return None

    async def get_run_intersection_metrics(self, run_id: str) -> list[dict]:
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            resp = (
                client.table("intersection_metrics")
                .select("*")
                .eq("run_id", run_id)
                .order("intersection_id")
                .order("tick")
                .execute()
            )
            return resp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] get_run_intersection_metrics failed: {e}")
            return []

    async def get_run_global_metrics(self, run_id: str) -> list[dict]:
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            resp = (
                client.table("global_metrics")
                .select("*")
                .eq("run_id", run_id)
                .order("tick")
                .execute()
            )
            return resp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] get_run_global_metrics failed: {e}")
            return []

    async def list_experiments(self, limit: int = 50) -> list[dict]:
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            exp = (
                client.table("experiments")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return exp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] list_experiments failed: {e}")
            return []

    async def get_experiment(self, experiment_id: str) -> Optional[dict]:
        if not self._enabled:
            return None

        def _read():
            client = self._get_client()
            exp = (
                client.table("experiments")
                .select("*")
                .eq("id", experiment_id)
                .single()
                .execute()
            )
            runs = (
                client.table("experiment_runs")
                .select("*")
                .eq("experiment_id", experiment_id)
                .order("run_index")
                .execute()
            )
            return {**(exp.data or {}), "runs": runs.data or []}

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] get_experiment failed: {e}")
            return None

    # --------------------------------------------------------------- #
    # policy_variants CRUD
    # --------------------------------------------------------------- #
    async def list_variants(self) -> list[dict]:
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            resp = client.table("policy_variants").select("*").order("name").execute()
            return resp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] list_variants failed: {e}")
            return []

    async def upsert_variant(
        self,
        name: str,
        params: dict,
        description: str = "",
        family: str = "arterial",
    ) -> None:
        if not self._enabled:
            return

        def _upsert():
            client = self._get_client()
            payload = {
                "name": name,
                "params": params,
                "family": family,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            # `description` column added in migration 010, `family` in 011.
            # Include each conditionally so the call still works against a
            # pre-migration database, and retry stripping unknown columns.
            if description:
                payload["description"] = description
            try:
                client.table("policy_variants").upsert(
                    payload, on_conflict="name"
                ).execute()
            except Exception as e:
                msg = str(e)
                # Drop columns the database doesn't know about and retry.
                stripped = False
                for col in ("description", "family"):
                    if col in msg and col in payload:
                        payload.pop(col, None)
                        stripped = True
                if stripped:
                    client.table("policy_variants").upsert(
                        payload, on_conflict="name"
                    ).execute()
                else:
                    raise

        try:
            await asyncio.to_thread(_upsert)
        except Exception as e:
            print(f"[db] upsert_variant failed: {e}")
            raise

    async def delete_variant(self, name: str) -> None:
        if not self._enabled:
            return

        def _delete():
            client = self._get_client()
            client.table("policy_variants").delete().eq("name", name).execute()

        try:
            await asyncio.to_thread(_delete)
        except Exception as e:
            print(f"[db] delete_variant failed: {e}")
            raise

    # --------------------------------------------------------------- #
    # per-variant performance — runs that used the variant's params
    # --------------------------------------------------------------- #
    async def runs_for_variant(
        self,
        params: dict,
        limit: int = 50,
        key: str = "policy_params",
    ) -> list[dict]:
        """Return completed simulation_runs whose config[`key`] matches the
        given params dict, joined with their experiment_runs metrics (if
        part of a comparison). Uses Postgres JSONB containment.

        `key` is "policy_params" for arterial variants, "alinea_params" for
        highway/ALINEA variants.
        """
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            # JSONB containment via Supabase contains() — checks that
            # config[key] is a superset (exact match works too).
            runs_resp = (
                client.table("simulation_runs")
                .select("id,started_at,ended_at,policy_type,config,status,total_ticks")
                .eq("status", "completed")
                .contains("config", {key: params})
                .order("started_at", desc=True)
                .limit(limit)
                .execute()
            )
            runs = runs_resp.data or []
            if not runs:
                return []
            run_ids = [r["id"] for r in runs]
            metrics_resp = (
                client.table("experiment_runs")
                .select("run_id,clearance_s,avg_trip_time_s,completed_trips,avg_control_delay_s,throughput_veh_per_min")
                .in_("run_id", run_ids)
                .execute()
            )
            metrics_by_run = {m["run_id"]: m for m in (metrics_resp.data or [])}
            for r in runs:
                m = metrics_by_run.get(r["id"]) or {}
                r["clearance_s"] = m.get("clearance_s")
                r["avg_trip_time_s"] = m.get("avg_trip_time_s")
                r["completed_trips"] = m.get("completed_trips")
                r["avg_control_delay_s"] = m.get("avg_control_delay_s")
                r["throughput_veh_per_min"] = m.get("throughput_veh_per_min")
            return runs

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] runs_for_variant failed: {e}")
            return []

    async def list_recent_experiment_runs(self, limit: int = 30) -> list[dict]:
        """Pull recent comparison rows for the LLM suggester."""
        if not self._enabled:
            return []

        def _read():
            client = self._get_client()
            resp = (
                client.table("experiment_runs")
                .select("config,clearance_s,avg_trip_time_s,completed_trips,avg_control_delay_s,throughput_veh_per_min,status")
                .eq("status", "completed")
                .order("id", desc=True)
                .limit(limit)
                .execute()
            )
            return resp.data or []

        try:
            return await asyncio.to_thread(_read)
        except Exception as e:
            print(f"[db] list_recent_experiment_runs failed: {e}")
            return []


# Module-level singleton
db_service = DBService()

"""Simulation orchestration service — drives one of two modes:

  * mode == "sumo"  : the synthetic 3x2 arterial flow (TraCI + our policies)
  * mode == "carla" : CARLA TrafficManager on Town10HD; dashboard data from
                      live CARLA actors (no SUMO at all)

Both modes broadcast TickData on the same WebSocket so the dashboard widgets
don't need to care which engine is producing it.
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path
from uuid import uuid4

from shared.types import (
    PolicyType,
    SimulationConfig,
    SimulationInfo,
    SimulationStatus,
    TickData,
)

from ..ws.manager import ws_manager
from .db_service import db_service


class SimulationManager:
    def __init__(self):
        self._status = SimulationStatus.IDLE
        self._config: SimulationConfig | None = None
        self._run_id: str | None = None
        self._tick: int = 0
        self._sim_time: float = 0.0
        self._task: asyncio.Task | None = None
        self._traci_client = None
        self._policy = None
        self._tracker = None
        self._trip_tracker = None
        self._last_tick_data: TickData | None = None
        # Cycle-wrap detection for end-of-cycle DB writes.
        self._prev_phase_by_id: dict[str, int] = {}
        self._prev_phase_global: int = -1

    @property
    def is_running(self) -> bool:
        return self._status in (SimulationStatus.RUNNING, SimulationStatus.PAUSED)

    @property
    def status(self) -> SimulationStatus:
        return self._status

    @property
    def last_tick_data(self) -> TickData | None:
        return self._last_tick_data

    def get_info(self) -> SimulationInfo:
        return SimulationInfo(
            run_id=self._run_id,
            status=self._status,
            tick=self._tick,
            sim_time=self._sim_time,
            config=self._config,
        )

    # ------------------------------------------------------------------ #
    # Public entry — fans out to one of two mode-specific paths.
    # ------------------------------------------------------------------ #
    async def start(self, config: SimulationConfig) -> None:
        self._config = config
        self._run_id = str(uuid4())
        self._tick = 0
        self._sim_time = 0.0
        self._last_tick_data = None
        self._status = SimulationStatus.RUNNING
        self._prev_phase_by_id = {}
        self._prev_phase_global = -1

        await db_service.start_run(self._run_id, config)

        if config.mode == "carla":
            await self._start_carla(config)
        else:
            await self._start_sumo(config)

    # ------------------------------------------------------------------ #
    # SUMO mode — synthetic arterial, policy comparison work.
    # ------------------------------------------------------------------ #
    async def _start_sumo(self, config: SimulationConfig) -> None:
        from sumo_engine.traci_client import TraCIClient

        if config.network_type == "highway_metered":
            cfg_name = "race_highway.sumocfg" if config.race_mode else "simulation_highway.sumocfg"
            await asyncio.to_thread(
                self._regenerate_highway_route_file, config, "highway.rou.xml"
            )
        elif config.network_type == "combined":
            cfg_name = "race_combined.sumocfg" if config.race_mode else "simulation_combined.sumocfg"
            await asyncio.to_thread(
                self._regenerate_combined_route_file, config, "combined.rou.xml"
            )
        else:
            profile = config.demand_profile or "balanced"
            if config.race_mode:
                cfg_name = f"race_{profile}.sumocfg"
                await asyncio.to_thread(
                    self._regenerate_route_file, config, f"arterial_{profile}.rou.xml"
                )
            else:
                cfg_name = "simulation.sumocfg"
                await asyncio.to_thread(
                    self._regenerate_route_file, config, "arterial.rou.xml"
                )

        config_path = (
            Path(__file__).resolve().parents[3]
            / "packages" / "sumo-engine" / "configs" / cfg_name
        )

        self._traci_client = TraCIClient(
            config_file=config_path, gui=config.gui, seed=config.seed
        )

        self._init_policy(config.policy_type)

        from sumo_engine.control_delay import ControlDelayTracker
        from sumo_engine.trip_time import TripTimeTracker
        self._tracker = ControlDelayTracker()
        self._trip_tracker = TripTimeTracker()

        await asyncio.to_thread(self._traci_client.start)
        self._task = asyncio.create_task(self._sumo_tick_loop())

    @staticmethod
    def _regenerate_route_file(config: SimulationConfig, target_filename: str) -> None:
        """Rebuild the named route file from the requested demand profile,
        vehicle count, and dominant direction."""
        import importlib.util

        script_path = (
            Path(__file__).resolve().parents[3]
            / "scripts" / "generate_network.py"
        )
        spec = importlib.util.spec_from_file_location("generate_network", script_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load {script_path}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        profile = config.demand_profile
        ew, ns, turn = mod.PROFILES[profile]
        if profile == "asym" and config.dominant_direction == "NS":
            ew, ns = ns, ew

        xml = mod._build_route_xml(
            profile_name=profile,
            ew_share=ew,
            ns_share=ns,
            turn_share=turn,
            total_vehicles=config.total_vehicles,
            duration_s=3600,
            seed=config.seed,
        )
        (mod.NETWORK_DIR / target_filename).write_text(xml)

    @staticmethod
    def _regenerate_highway_route_file(config: SimulationConfig, target_filename: str) -> None:
        """Rebuild highway.rou.xml (highway + service road) from config."""
        import importlib.util

        script_path = (
            Path(__file__).resolve().parents[3]
            / "scripts" / "generate_highway.py"
        )
        spec = importlib.util.spec_from_file_location("generate_highway", script_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load {script_path}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        xml = mod._build_route_xml(
            total_vehicles=config.total_vehicles,
            duration_s=3600,
            seed=config.seed,
            dominant_direction=config.dominant_direction,
        )
        (mod.NETWORK_DIR / target_filename).write_text(xml)

    @staticmethod
    def _regenerate_combined_route_file(config: SimulationConfig, target_filename: str) -> None:
        """Rebuild combined.rou.xml (city+highway corridor) from config.

        Imports scripts/generate_combined.py the same way the other route
        regenerators do. The combined generator's _build_route_xml has a
        simpler signature than the arterial/highway ones — no demand
        profile or dominant direction (mix is hard-coded in SHARES)."""
        import importlib.util

        scripts_dir = Path(__file__).resolve().parents[3] / "scripts"
        # The combined generator imports its sibling modules (generate_highway,
        # generate_network) by bare name, so scripts/ must be on sys.path.
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))

        script_path = scripts_dir / "generate_combined.py"
        spec = importlib.util.spec_from_file_location("generate_combined", script_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load {script_path}")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        xml = mod._build_route_xml(
            total_vehicles=config.total_vehicles,
            duration_s=3600,
            seed=config.seed,
        )
        (mod.NETWORK_DIR / target_filename).write_text(xml)

    def _maybe_log_cycle_wrap(self, tick_data: TickData) -> None:
        """End-of-cycle DB write hook.

        Cycle wrap = `prev_phase > current_phase` (i.e., the last phase index
        of the cycle just rolled back to 0). Arterial's 12-phase cycle
        wraps 11 -> 0. `global_metrics` is anchored on B0.
        """
        if self._run_id is None:
            return

        for it in tick_data.intersections:
            prev = self._prev_phase_by_id.get(it.id, -1)
            if prev > it.phase_index and prev >= 0:
                db_service.enqueue_intersection_metric({
                    "run_id": self._run_id,
                    "tick": tick_data.tick,
                    "sim_time": tick_data.sim_time,
                    "intersection_id": it.id,
                    "queue_length_n": it.queue_lengths.N,
                    "queue_length_s": it.queue_lengths.S,
                    "queue_length_e": it.queue_lengths.E,
                    "queue_length_w": it.queue_lengths.W,
                    "total_vehicles": it.vehicle_count,
                    "avg_wait_s": it.avg_wait_s,
                    "phase_index": it.phase_index,
                    "phase_remaining_s": it.phase_remaining_s,
                })
            self._prev_phase_by_id[it.id] = it.phase_index

        anchor_id = "B0"
        anchor_phase = next(
            (i.phase_index for i in tick_data.intersections if i.id == anchor_id), None
        )
        if anchor_phase is not None:
            if self._prev_phase_global > anchor_phase and self._prev_phase_global >= 0:
                m = tick_data.metrics
                db_service.enqueue_global_metric({
                    "run_id": self._run_id,
                    "tick": tick_data.tick,
                    "sim_time": tick_data.sim_time,
                    "total_vehicles": m.total_vehicles,
                    "total_completed": m.total_completed,
                    "completed_trips": m.completed_trips,
                    "avg_delay_s": m.avg_delay_s,
                    "avg_trip_time_s": m.avg_trip_time_s,
                    "avg_control_delay_s": m.avg_control_delay_s,
                    "control_delay_samples": m.control_delay_samples,
                    "throughput_veh_per_min": m.throughput_veh_per_min,
                    "total_halting": m.total_halting,
                })
            self._prev_phase_global = anchor_phase

    def _init_policy(self, policy_type: PolicyType) -> None:
        # Highway / ramp-metered network has its own family of controllers.
        # Dispatch on policy_type first so the user can pick which one.
        # Legacy: policy_type == ACTUATED on a highway maps to RAMP_BINARY
        # (the original speed-threshold heuristic), so old saved configs
        # keep working without explicit migration.
        if self._config and self._config.network_type == "highway_metered":
            from shared.constants import METER_INFO
            import traci as traci_module
            if policy_type == PolicyType.RAMP_ALINEA:
                from adaptive_policy.alinea import AlineaRampController
                from shared.types import AlineaPolicyParams
                alinea_params = (
                    (self._config.alinea_params if self._config else None)
                    or AlineaPolicyParams()
                )
                self._policy = AlineaRampController(
                    traci_module=traci_module,
                    params=alinea_params,
                    meter_info=METER_INFO,
                )
                return
            if policy_type in (PolicyType.RAMP_BINARY, PolicyType.ACTUATED):
                from adaptive_policy.ramp_meter import RampMeterController
                self._policy = RampMeterController(
                    traci_module=traci_module,
                    meter_info=METER_INFO,
                )
                return
            # FIXED_TIME on highway = run the static TLS programs, no
            # adaptive metering.
            from adaptive_policy.fixed_time import FixedTimeController
            self._policy = FixedTimeController()
            return

        # Combined network: BOTH families of intersections coexist. Run the
        # appropriate arterial policy AND the appropriate ramp policy in
        # tandem via CompositePolicy. Each child controller already
        # ignores intersections outside its own meter_info / phase plan,
        # so composition is safe.
        if self._config and self._config.network_type == "combined":
            from shared.constants import METER_INFO
            from adaptive_policy.composite import CompositePolicy
            from adaptive_policy.fixed_time import FixedTimeController
            import traci as traci_module

            # Independent picks: ramp_policy_type, when set, drives the 4
            # meters; otherwise the legacy single-picker matrix routes
            # `policy_type` to whichever family it belongs to.
            ramp_pt = self._config.ramp_policy_type
            arterial_pt = policy_type if ramp_pt is not None else policy_type

            # Arterial half: ACTUATED uses the leftover-queue controller;
            # anything else falls back to static TLS programs on the grid.
            if arterial_pt == PolicyType.ACTUATED:
                from adaptive_policy.actuated import (
                    ActuatedController, default_arterial_plan,
                )
                from shared.types import ActuatedPolicyParams
                params = (self._config.policy_params if self._config else None) or ActuatedPolicyParams()
                plan = default_arterial_plan(params)
                arterial_policy = ActuatedController(params=params, phase_plan=plan)
            else:
                arterial_policy = FixedTimeController()

            # Ramp half: pick by ramp_policy_type if the user provided one,
            # otherwise fall back to the legacy single-picker behavior
            # (policy_type drives the ramps when it's a ramp_* value).
            effective_ramp_pt = ramp_pt if ramp_pt is not None else policy_type
            if effective_ramp_pt == PolicyType.RAMP_ALINEA:
                from adaptive_policy.alinea import AlineaRampController
                from shared.types import AlineaPolicyParams
                alinea_params = (
                    (self._config.alinea_params if self._config else None)
                    or AlineaPolicyParams()
                )
                ramp_policy = AlineaRampController(
                    traci_module=traci_module,
                    params=alinea_params,
                    meter_info=METER_INFO,
                )
            elif effective_ramp_pt == PolicyType.RAMP_BINARY:
                from adaptive_policy.ramp_meter import RampMeterController
                ramp_policy = RampMeterController(
                    traci_module=traci_module,
                    meter_info=METER_INFO,
                )
            else:
                # FIXED_TIME / ACTUATED — leave the meters on their static
                # 19s/1s programs (effectively "always green").
                ramp_policy = FixedTimeController()

            self._policy = CompositePolicy([arterial_policy, ramp_policy])
            return

        if policy_type == PolicyType.FIXED_TIME:
            from adaptive_policy.fixed_time import FixedTimeController
            self._policy = FixedTimeController()
        elif policy_type == PolicyType.ACTUATED:
            from adaptive_policy.actuated import (
                ActuatedController, default_arterial_plan,
            )
            from shared.types import ActuatedPolicyParams
            params = (self._config.policy_params if self._config else None) or ActuatedPolicyParams()
            plan = default_arterial_plan(params)
            self._policy = ActuatedController(params=params, phase_plan=plan)

    async def _sumo_tick_loop(self) -> None:
        """SUMO mode tick loop. Idles when paused; exits on stop / duration /
        race-empty."""
        tick_interval = 1.0 / (self._config.tick_rate or 10)

        from adaptive_policy.preemption import preemption_manager
        preemption_manager.reset()

        try:
            while self._status != SimulationStatus.STOPPED:
                if self._status == SimulationStatus.PAUSED:
                    await asyncio.sleep(0.1)
                    continue

                if self._config.duration_ticks and self._tick >= self._config.duration_ticks:
                    break

                if self._config.race_mode and self._tick > 10:
                    remaining = await asyncio.to_thread(
                        self._traci_client.get_remaining_vehicle_count
                    )
                    if remaining == 0:
                        print(f"Race finished at tick {self._tick}, sim_time {self._sim_time}s")
                        break

                self._sim_time = await asyncio.to_thread(self._traci_client.step)
                self._tick += 1

                if self._config.race_mode:
                    from sumo_engine.snapshot import extract_race_tick
                    sim_time, intersections = await asyncio.to_thread(
                        extract_race_tick,
                        self._tick,
                        self._trip_tracker,
                        self._tracker,
                    )
                    if self._policy:
                        decision = self._policy.decide(intersections, sim_time)
                        if decision.commands:
                            from sumo_engine.signals import apply_commands
                            await asyncio.to_thread(apply_commands, decision.commands)
                else:
                    from sumo_engine.snapshot import extract_tick_data
                    tick_data = await asyncio.to_thread(
                        extract_tick_data, self._tick, self._tracker, self._trip_tracker
                    )
                    self._last_tick_data = tick_data
                    self._maybe_log_cycle_wrap(tick_data)

                    # Build command list: policy commands + preemption overrides
                    policy_commands: list = []
                    if self._policy:
                        decision = self._policy.decide(
                            tick_data.intersections, tick_data.sim_time
                        )
                        policy_commands = decision.commands

                    ev_commands = preemption_manager.check_preemption(
                        tick_data.intersections, tick_data.emergency.active
                    )
                    # Preemption overrides policy for affected intersections
                    commands_map = {cmd.intersection_id: cmd for cmd in policy_commands}
                    commands_map.update({cmd.intersection_id: cmd for cmd in ev_commands})
                    all_commands = list(commands_map.values())
                    if all_commands:
                        from sumo_engine.signals import apply_commands
                        await asyncio.to_thread(apply_commands, all_commands)

                    await ws_manager.broadcast_json(tick_data.model_dump())
                    await asyncio.sleep(tick_interval)

            # After race ends, do one full extraction so /metrics/current returns final state.
            if self._config.race_mode and self._traci_client and self._traci_client.connected:
                try:
                    from sumo_engine.snapshot import extract_tick_data
                    tick_data = await asyncio.to_thread(
                        extract_tick_data, self._tick, self._tracker, self._trip_tracker
                    )
                    self._last_tick_data = tick_data
                except Exception:
                    pass

        except Exception as e:
            print(f"SUMO simulation error: {e}")
        finally:
            # Close TraCI BEFORE flipping status to STOPPED so the experiment
            # service's _wait_until_run_done doesn't start the next run while
            # the old TraCI close is still in flight (collides on 'default').
            if self._traci_client and self._traci_client.connected:
                try:
                    await asyncio.to_thread(self._traci_client.close)
                except Exception as close_err:
                    print(f"TraCI close error: {close_err}")
            from sumo_engine.emergency import clear_all as clear_ev_state
            clear_ev_state()
            self._traci_client = None
            self._policy = None
            self._tracker = None
            self._trip_tracker = None
            # Flush + finalize the DB row last, then flip status.
            await db_service.end_run(self._run_id, self._tick)
            if self._status != SimulationStatus.STOPPED:
                self._status = SimulationStatus.STOPPED

    # ------------------------------------------------------------------ #
    # CARLA mode — TrafficManager + dashboard fed from CARLA actors.
    # ------------------------------------------------------------------ #
    async def _start_carla(self, config: SimulationConfig) -> None:
        from .carla_service import carla_bridge

        result = await carla_bridge.ensure_connected()
        if not result.connected:
            self._status = SimulationStatus.STOPPED
            raise RuntimeError(
                f"CARLA server not reachable on localhost:2000 ({result.error or 'unknown'})."
            )

        spawned = await carla_bridge.spawn_traffic(config.carla_vehicle_count)
        print(f"[carla] spawned {spawned}/{config.carla_vehicle_count} TrafficManager vehicles")

        self._task = asyncio.create_task(self._carla_tick_loop())

    async def _carla_tick_loop(self) -> None:
        """Polls CARLA actor state ~10 Hz and broadcasts a TickData each tick.

        No SUMO / TraCI involvement. Stop is signalled via self._status.
        """
        from .carla_service import carla_bridge

        tick_interval = 0.1   # 10 Hz is plenty for the dashboard
        start_real = time.time()
        consecutive_errors = 0
        try:
            while self._status != SimulationStatus.STOPPED:
                if self._status == SimulationStatus.PAUSED:
                    await asyncio.sleep(tick_interval)
                    continue

                self._tick += 1
                self._sim_time = time.time() - start_real

                # Don't let a dead CARLA hang the tick loop — bound the snapshot
                # call and bail after a few consecutive failures so the
                # dashboard sees an honest stop instead of "failed to fetch".
                try:
                    tick_data = await asyncio.wait_for(
                        carla_bridge.snapshot(self._tick, self._sim_time),
                        timeout=2.0,
                    )
                    consecutive_errors = 0
                except (asyncio.TimeoutError, Exception) as snap_err:
                    consecutive_errors += 1
                    print(f"[carla] snapshot failed ({consecutive_errors}): {snap_err}")
                    tick_data = None
                    if consecutive_errors >= 5:
                        print("[carla] giving up — CARLA appears to have crashed")
                        break

                if tick_data is not None:
                    self._last_tick_data = tick_data
                    self._maybe_log_cycle_wrap(tick_data)
                    try:
                        await ws_manager.broadcast_json(tick_data.model_dump())
                    except Exception as e:
                        print(f"[carla] ws broadcast failed: {e}")

                await asyncio.sleep(tick_interval)
        except Exception as e:
            print(f"CARLA simulation error: {e}")
        finally:
            try:
                await carla_bridge.shutdown()
            except Exception as carla_err:
                print(f"CARLA shutdown error: {carla_err}")
            await db_service.end_run(self._run_id, self._tick)
            if self._status != SimulationStatus.STOPPED:
                self._status = SimulationStatus.STOPPED

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    async def stop(self) -> None:
        self._status = SimulationStatus.STOPPED

        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # end_run is called inside the tick loop's finally block when the task
        # is cancelled above, so we don't duplicate it here.

        # SUMO cleanup (no-op in CARLA mode)
        if self._traci_client and self._traci_client.connected:
            await asyncio.to_thread(self._traci_client.close)
        self._traci_client = None
        self._policy = None
        self._tracker = None
        self._trip_tracker = None

        # CARLA cleanup (no-op in SUMO mode — bridge.shutdown is idempotent)
        try:
            from .carla_service import carla_bridge
            await carla_bridge.shutdown()
        except Exception as e:
            print(f"CARLA shutdown error on stop: {e}")

    def pause(self) -> None:
        was_running = self._status == SimulationStatus.RUNNING
        self._status = SimulationStatus.PAUSED
        # In CARLA mode, also freeze the world (TM cars + traffic lights)
        # so it doesn't keep moving while the dashboard says "paused".
        # SUMO mode's tick loop already idles cleanly when status==PAUSED
        # because TraCI doesn't auto-step.
        if was_running and self._config and self._config.mode == "carla":
            from .carla_service import carla_bridge
            asyncio.create_task(carla_bridge.pause())

    def resume(self) -> None:
        if self._status != SimulationStatus.PAUSED:
            return
        self._status = SimulationStatus.RUNNING
        if self._config and self._config.mode == "carla":
            from .carla_service import carla_bridge
            asyncio.create_task(carla_bridge.resume())


sim_manager = SimulationManager()

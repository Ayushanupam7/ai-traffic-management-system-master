"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import ComparisonHistory from "@/components/Comparison/ComparisonHistory";
import ComparisonProgress from "@/components/Comparison/ComparisonProgress";
import ResultsTable from "@/components/Comparison/ResultsTable";
import RunBuilder, {
  type BuilderRow,
  DEFAULT_ROW,
} from "@/components/Comparison/RunBuilder";
import ComparisonCharts from "@/components/Lab/ComparisonCharts";
import { api } from "@/lib/api";
import { policiesForNetwork } from "@/lib/policies";
import type {
  ComparisonExperiment,
  ExperimentUpdateMessage,
  NetworkType,
  SimulationConfig,
} from "@/lib/types";
import { trafficWS } from "@/lib/ws";

let nextRowId = 1;
const mkRowId = () => `row-${nextRowId++}`;

function rowToConfig(row: BuilderRow, network: NetworkType): SimulationConfig {
  return {
    mode: "sumo",
    network_type: network,
    policy_type: row.policy,
    tick_rate: 1000,
    seed: 42, // overwritten by backend using the shared seed
    duration_ticks: row.mode === "time" ? row.duration_s : null,
    demand_profile: row.profile,
    total_vehicles: row.cars,
    dominant_direction: row.dominant,
    race_mode: row.mode === "race",
    gui: false,
    // Combined runs two controllers in tandem: policy_type drives the
    // arterial signals, ramp_policy_type drives the 4 ramp meters.
    ...(network === "combined"
      ? { ramp_policy_type: row.ramp_policy ?? "ramp_alinea" }
      : {}),
    // Variant params land in different keys per family; the row only ever
    // carries the one matching its selected policy.
    ...(row.policy_params ? { policy_params: row.policy_params } : {}),
    ...(row.alinea_params ? { alinea_params: row.alinea_params } : {}),
  };
}

export default function LabPage() {
  const [seed, setSeed] = useState(42);
  const [network, setNetwork] = useState<NetworkType>("arterial");
  const [rows, setRows] = useState<BuilderRow[]>([
    { ...DEFAULT_ROW(mkRowId()), policy: "fixed_time" },
    { ...DEFAULT_ROW(mkRowId()), policy: "actuated" },
  ]);
  const [experiment, setExperiment] = useState<ComparisonExperiment | null>(
    null
  );
  const [history, setHistory] = useState<ComparisonExperiment[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeId = experiment?.experiment_id ?? null;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const data = (await api.listComparisons()) as ComparisonExperiment[];
      setHistory(data);
    } catch (e) {
      console.warn("listComparisons failed", e);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // WebSocket subscription for experiment_update events.
  useEffect(() => {
    trafficWS.connect();
    const unsub = trafficWS.subscribe((raw) => {
      const msg = raw as Partial<ExperimentUpdateMessage>;
      if (msg?.type !== "experiment_update" || !msg.experiment) return;
      setExperiment((prev) => {
        if (prev && prev.experiment_id !== msg.experiment!.experiment_id) {
          return prev;
        }
        return msg.experiment!;
      });
      // Refresh history list when an experiment finishes.
      if (
        msg.status === "completed" ||
        msg.status === "cancelled" ||
        msg.status === "failed"
      ) {
        refreshHistory();
      }
    });
    return () => {
      unsub();
    };
  }, [refreshHistory]);

  // Polling fallback while an experiment is active.
  useEffect(() => {
    if (!activeId) return;
    if (!experiment) return;
    const terminal =
      experiment.status === "completed" ||
      experiment.status === "cancelled" ||
      experiment.status === "failed";
    if (terminal) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = (await api.getComparison(activeId)) as ComparisonExperiment;
        setExperiment(data);
      } catch (e) {
        console.warn("poll getComparison failed", e);
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeId, experiment]);

  const addRow = () =>
    setRows((rs) => [...rs, DEFAULT_ROW(mkRowId())]);
  const removeRow = (id: string) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const patchRow = (id: string, patch: Partial<BuilderRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Network is experiment-level. When it changes, coerce any row whose policy
  // isn't valid for the new network to that network's most-adaptive option and
  // drop a now-stale variant. fixed_time is valid everywhere, so a
  // fixed_time/actuated pair switched to Highway becomes fixed_time/ramp_alinea
  // (still two distinct, valid runs).
  const changeNetwork = (n: NetworkType) => {
    setNetwork(n);
    const valid = policiesForNetwork[n];
    setRows((rs) =>
      rs.map((r) =>
        valid.includes(r.policy)
          ? r
          : {
              ...r,
              policy: valid[valid.length - 1],
              variant_name: undefined,
              policy_params: undefined,
              alinea_params: undefined,
            }
      )
    );
  };

  const startComparison = async () => {
    setStarting(true);
    setError(null);
    try {
      const body = {
        name: `comparison-${new Date().toISOString().slice(11, 19)}`,
        seed,
        runs: rows.map((r) => rowToConfig(r, network)) as unknown as Record<
          string,
          unknown
        >[],
      };
      const exp = (await api.createComparison(body)) as ComparisonExperiment;
      setExperiment(exp);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to start comparison");
    } finally {
      setStarting(false);
    }
  };

  const cancelComparison = async () => {
    if (!activeId) return;
    try {
      const exp = (await api.cancelComparison(activeId)) as ComparisonExperiment;
      setExperiment(exp);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to cancel");
    }
  };

  const loadFromHistory = async (id: string) => {
    try {
      const exp = (await api.getComparison(id)) as ComparisonExperiment;
      setExperiment(exp);
    } catch (e) {
      console.warn("getComparison failed", e);
    }
  };

  const clearSelection = () => {
    setExperiment(null);
    setError(null);
  };

  const isActive =
    experiment &&
    (experiment.status === "running" || experiment.status === "pending");
  const showResults =
    experiment &&
    (experiment.status === "completed" ||
      experiment.status === "cancelled" ||
      experiment.status === "failed");

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-80 flex-shrink-0 border-r border-gray-800 p-4 space-y-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Past comparisons
        </h2>
        <ComparisonHistory
          items={history}
          activeId={activeId}
          onSelect={loadFromHistory}
        />
      </aside>

      <main className="flex-1 p-8 space-y-6 overflow-y-auto">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Simulation Lab</h1>
          <p className="text-xs text-gray-500 mt-1">
            Build comparison experiments, see results side-by-side, and revisit past runs.
          </p>
        </div>

        {!experiment && (
          <RunBuilder
            rows={rows}
            seed={seed}
            network={network}
            onSeedChange={setSeed}
            onNetworkChange={changeNetwork}
            onRowChange={patchRow}
            onAdd={addRow}
            onRemove={removeRow}
            onStart={startComparison}
            starting={starting}
            error={error}
          />
        )}

        {experiment && (
          <>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                ← Back to builder
              </button>
            </div>
            <ComparisonProgress
              experiment={experiment}
              onCancel={cancelComparison}
            />
            {isActive && (
              <p className="text-xs text-gray-500">
                Runs execute sequentially on the shared simulator. Results will
                appear below once complete.
              </p>
            )}
            {showResults && (
              <>
                <ComparisonCharts experiment={experiment} />
                <ResultsTable experiment={experiment} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

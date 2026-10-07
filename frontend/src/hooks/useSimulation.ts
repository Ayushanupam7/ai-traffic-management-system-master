/** Hook for simulation control actions. */

"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useTrafficStore } from "@/store/trafficStore";
import type { SimulationConfig } from "@/lib/types";

export function useSimulation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStatus = useTrafficStore((s) => s.setStatus);
  const reset = useTrafficStore((s) => s.reset);

  const startSimulation = async (cfg: Partial<SimulationConfig> = {}) => {
    setLoading(true);
    setError(null);
    try {
      await api.startSimulation(cfg as Record<string, unknown>);
      setStatus("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start simulation");
    } finally {
      setLoading(false);
    }
  };

  const stopSimulation = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.stopSimulation();
      setStatus("stopped");
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop simulation");
    } finally {
      setLoading(false);
    }
  };

  const pauseSimulation = async () => {
    try {
      await api.pauseSimulation();
      setStatus("paused");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pause");
    }
  };

  const resumeSimulation = async () => {
    try {
      await api.resumeSimulation();
      setStatus("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resume");
    }
  };

  return {
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
    loading,
    error,
  };
}

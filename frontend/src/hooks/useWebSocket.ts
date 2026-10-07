/** Hook for managing WebSocket connection and feeding data into Zustand store. */

"use client";

import { useEffect, useRef } from "react";
import { trafficWS } from "@/lib/ws";
import { useTrafficStore } from "@/store/trafficStore";
import { api } from "@/lib/api";
import type { SimulationInfo, TickData } from "@/lib/types";

export function useWebSocket() {
  const updateFromTick = useTrafficStore((s) => s.updateFromTick);
  const setWsConnected = useTrafficStore((s) => s.setWsConnected);
  const setStatus = useTrafficStore((s) => s.setStatus);
  const setMode = useTrafficStore((s) => s.setMode);
  const setNetwork = useTrafficStore((s) => s.setNetwork);
  const connected = useRef(false);

  useEffect(() => {
    if (connected.current) return;
    connected.current = true;

    // Seed status + mode from backend so the dashboard reflects an already-running
    // sim. Poll periodically so the GridMap layout swaps when the user starts/stops
    // a CARLA-mode run from the controls.
    const pollStatus = () => {
      api
        .getSimStatus()
        .then((info) => {
          const i = info as SimulationInfo;
          setStatus(i.status);
          // Only seed mode/network when a sim is actually live; otherwise the
          // poll would override the user's in-progress picks in SimControls.
          if (i.status === "running" || i.status === "paused") {
            if (i.config?.mode) setMode(i.config.mode);
            if (i.config?.network_type) setNetwork(i.config.network_type);
          }
        })
        .catch(() => { /* backend may still be booting; ignore */ });
    };
    pollStatus();
    const statusInterval = setInterval(pollStatus, 2000);

    trafficWS.connect();
    setWsConnected(true);

    const unsubscribe = trafficWS.subscribe((data) => {
      // Comparison progress messages share the same WS channel — ignore them
      // here so they don't get fed into the live-sim store.
      if ((data as { type?: string })?.type === "experiment_update") return;
      updateFromTick(data as TickData);
    });

    return () => {
      clearInterval(statusInterval);
      unsubscribe();
      trafficWS.disconnect();
      setWsConnected(false);
      connected.current = false;
    };
  }, [updateFromTick, setWsConnected, setStatus, setMode, setNetwork]);

  return { isConnected: trafficWS.isConnected };
}

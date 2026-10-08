"use client";

import { useEffect, useRef, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api, cameraStreamUrl } from "@/lib/api";
import { Car, Clock, Layers, Flame, Video, RotateCcw, Compass, ArrowUp, ArrowRight, ArrowDown, ArrowLeft } from "lucide-react";
import type { CameraApproach, CameraStatus } from "@/lib/types";

interface DirTargets {
  base: number;
  target: number;
  delta: number;
}

interface TargetsResponse {
  intersection_id: string;
  policy: string;
  directions: Record<"N" | "E" | "S" | "W", DirTargets>;
}

const DIR_ORDER = ["N", "E", "S", "W"] as const;
const DIR_NAMES: Record<string, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
};

interface Props {
  intersectionId: string;
  onSwitchToCamera: () => void;
}

export default function PanelLive({ intersectionId, onSwitchToCamera }: Props) {
  const intersections   = useTrafficStore((s) => s.intersections);
  const appendPolicyLog = useTrafficStore((s) => s.appendPolicyLog);
  const [targets, setTargets]       = useState<TargetsResponse | null>(null);
  const [carlaStatus, setCarlaStatus] = useState<CameraStatus | null>(null);
  const [camApproach, setCamApproach] = useState<CameraApproach>("N");
  const [reloadTick, setReloadTick]   = useState(0);
  const prevTargets = useRef<TargetsResponse | null>(null);

  const intersection = intersections.find((i) => i.id === intersectionId);

  useEffect(() => {
    let cancelled = false;
    api.getCameraStatus()
      .then((s) => { if (!cancelled) setCarlaStatus(s as CameraStatus); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!intersectionId) return;
    let cancelled = false;

    const fetchTargets = async () => {
      try {
        const res = (await api.getSignalTargets(intersectionId)) as TargetsResponse;
        if (cancelled) return;
        if (
          prevTargets.current &&
          prevTargets.current.policy !== "FixedTimeController"
        ) {
          const prev = prevTargets.current.directions;
          const changed = DIR_ORDER.some(
            (d) => Math.abs((res.directions[d]?.target ?? 0) - (prev[d]?.target ?? 0)) > 0.05
          );
          if (changed) {
            appendPolicyLog(intersectionId, {
              simTime: Date.now() / 1000,
              directions: Object.fromEntries(
                DIR_ORDER.map((d) => [d, res.directions[d]])
              ) as Record<"N" | "E" | "S" | "W", DirTargets>,
            });
          }
        }
        prevTargets.current = res;
        setTargets(res);
      } catch {
        // ignore
      }
    };

    fetchTargets();
    const interval = setInterval(fetchTargets, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [intersectionId, appendPolicyLog]);

  const themeMode       = useTrafficStore((s) => s.themeMode);
  const isDay           = themeMode === "day";

  if (!intersection) return (
    <div className={`text-xs p-4 text-center rounded-xl border ${
      isDay ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-gray-900/50 border-gray-800 text-gray-500"
    }`}>
      Loading intersection telemetry…
    </div>
  );

  const { queue_lengths: q, vehicle_count, avg_wait_s, signal_state } = intersection;
  const totalQueue  = q.N + q.S + q.E + q.W;
  const maxQueue    = Math.max(q.N, q.S, q.E, q.W, 1);
  const signalChars = signal_state.split("");
  const isAdaptive  = targets?.policy === "ActuatedController";
  const streamUrl   = cameraStreamUrl(intersectionId, camApproach);

  // Direction icons helper
  const dirIcons: Record<string, typeof ArrowUp> = {
    N: ArrowUp,
    E: ArrowRight,
    S: ArrowDown,
    W: ArrowLeft,
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* 3 Core Metric KPI Cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* Vehicles */}
        <div className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
          isDay
            ? "bg-gradient-to-b from-blue-50/60 to-slate-50 border-blue-200/60 shadow-xs"
            : "bg-gradient-to-b from-blue-950/20 to-gray-900 border-blue-900/40"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[9px] uppercase font-bold tracking-wider ${
              isDay ? "text-blue-700" : "text-blue-400"
            }`}>Vehicles</span>
            <Car className={`w-3.5 h-3.5 ${isDay ? "text-blue-600" : "text-blue-400"}`} />
          </div>
          <div className={`text-lg font-black font-mono mt-1 ${isDay ? "text-slate-900" : "text-white"}`}>
            {vehicle_count}
          </div>
          <div className={`text-[8.5px] font-medium mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
            In zone
          </div>
        </div>

        {/* Queued */}
        <div className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
          totalQueue > 15
            ? isDay
              ? "bg-gradient-to-b from-rose-50/60 to-slate-50 border-rose-300/80 shadow-xs"
              : "bg-gradient-to-b from-rose-950/30 to-gray-900 border-rose-800/50"
            : totalQueue > 5
            ? isDay
              ? "bg-gradient-to-b from-amber-50/60 to-slate-50 border-amber-300/70 shadow-xs"
              : "bg-gradient-to-b from-amber-950/25 to-gray-900 border-amber-800/40"
            : isDay
            ? "bg-gradient-to-b from-emerald-50/60 to-slate-50 border-emerald-200/60 shadow-xs"
            : "bg-gradient-to-b from-emerald-950/20 to-gray-900 border-emerald-900/40"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[9px] uppercase font-bold tracking-wider ${
              totalQueue > 15
                ? isDay ? "text-rose-700" : "text-rose-400"
                : totalQueue > 5
                ? isDay ? "text-amber-700" : "text-amber-400"
                : isDay ? "text-emerald-700" : "text-emerald-400"
            }`}>Queued</span>
            <Flame className={`w-3.5 h-3.5 ${
              totalQueue > 15
                ? "text-rose-500 animate-pulse"
                : totalQueue > 5
                ? "text-amber-500"
                : "text-emerald-500"
            }`} />
          </div>
          <div className={`text-lg font-black font-mono mt-1 ${
            totalQueue > 15
              ? "text-rose-600 dark:text-rose-400"
              : totalQueue > 5
              ? "text-amber-600 dark:text-amber-400"
              : isDay ? "text-slate-900" : "text-white"
          }`}>
            {totalQueue}
          </div>
          <div className={`text-[8.5px] font-medium mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
            {totalQueue > 15 ? "Heavy delay" : totalQueue > 5 ? "Moderate" : "Flowing"}
          </div>
        </div>

        {/* Avg Wait */}
        <div className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all ${
          isDay
            ? "bg-gradient-to-b from-purple-50/60 to-slate-50 border-purple-200/60 shadow-xs"
            : "bg-gradient-to-b from-purple-950/20 to-gray-900 border-purple-900/40"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[9px] uppercase font-bold tracking-wider ${
              isDay ? "text-purple-700" : "text-purple-400"
            }`}>Avg Wait</span>
            <Clock className={`w-3.5 h-3.5 ${isDay ? "text-purple-600" : "text-purple-400"}`} />
          </div>
          <div className={`text-lg font-black font-mono mt-1 ${isDay ? "text-slate-900" : "text-white"}`}>
            {avg_wait_s.toFixed(1)}s
          </div>
          <div className={`text-[8.5px] font-medium mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
            Per vehicle
          </div>
        </div>
      </div>

      {/* Camera preview snippet (when CARLA is connected) */}
      {carlaStatus?.connected && (
        <div className={`p-2.5 rounded-xl border ${
          isDay ? "bg-slate-50/70 border-slate-200 shadow-xs" : "bg-gray-900/60 border-gray-800"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-blue-500" />
              <span className={`text-[9.5px] uppercase tracking-wider font-bold ${
                isDay ? "text-slate-600" : "text-gray-400"
              }`}>Optical Telemetry Stream</span>
            </div>
            <button
              onClick={onSwitchToCamera}
              className="text-[9.5px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              Full Camera →
            </button>
          </div>
          <div className="flex gap-1 mb-2">
            {(["N", "E", "S", "W"] as CameraApproach[]).map((a) => (
              <button
                key={a}
                onClick={() => setCamApproach(a)}
                className={`flex-1 py-1 text-[9px] rounded-lg border font-bold transition-all ${
                  a === camApproach
                    ? isDay
                      ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                      : "bg-blue-600 border-blue-500 text-white"
                    : isDay
                      ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {a}-Approach
              </button>
            ))}
            <button
              onClick={() => setReloadTick((t) => t + 1)}
              className={`px-2 rounded-lg border text-xs transition-colors ${
                isDay
                  ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              title="Refresh stream"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>
          <div className="bg-black border border-slate-200 dark:border-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`${camApproach}-${reloadTick}`}
              src={streamUrl}
              alt={`${intersectionId} ${camApproach}`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Directional Queue HUD */}
      <div className={`p-3 rounded-xl border ${
        isDay ? "bg-slate-50/70 border-slate-200/90 shadow-xs" : "bg-gray-900/60 border-gray-800"
      }`}>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-blue-500" />
            <span className={`text-[9.5px] uppercase tracking-wider font-bold ${
              isDay ? "text-slate-600" : "text-gray-400"
            }`}>Directional Queue Burden</span>
          </div>
          <span className={`text-[9.5px] font-mono font-bold ${
            isDay ? "text-slate-500" : "text-gray-400"
          }`}>
            Max: {maxQueue} veh
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {DIR_ORDER.map((d) => {
            const count = q[d];
            const pct   = (count / maxQueue) * 100;
            const Icon = dirIcons[d] ?? ArrowUp;

            const isHeavy = count > 15;
            const isMod   = count > 5;

            return (
              <div key={d} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-mono ${
                      isDay ? "bg-slate-200 text-slate-700" : "bg-gray-800 text-gray-300"
                    }`}>
                      {d}
                    </span>
                    <span className={isDay ? "text-slate-700" : "text-gray-300"}>
                      {DIR_NAMES[d]} Approach
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                      isHeavy
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                        : isMod
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                    }`}>
                      {isHeavy ? "Congested" : isMod ? "Moderate" : "Clear"}
                    </span>
                    <span className={`font-mono font-black w-6 text-right ${
                      isHeavy
                        ? "text-rose-600 dark:text-rose-400"
                        : isMod
                        ? "text-amber-600 dark:text-amber-400"
                        : isDay ? "text-slate-800" : "text-gray-200"
                    }`}>
                      {count}
                    </span>
                  </div>
                </div>

                {/* Progress track */}
                <div className={`h-2 rounded-full overflow-hidden ${isDay ? "bg-slate-200/80" : "bg-gray-800"}`}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      background: isHeavy
                        ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                        : isMod
                        ? "linear-gradient(90deg, #10b981, #f59e0b)"
                        : "#10b981",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal State Real-Time Indicator */}
      <div className={`p-3 rounded-xl border ${
        isDay ? "bg-slate-50/70 border-slate-200/90 shadow-xs" : "bg-gray-900/60 border-gray-800"
      }`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[9.5px] uppercase tracking-wider font-bold ${
            isDay ? "text-slate-600" : "text-gray-400"
          }`}>Active Signal Aspects</span>
          <span className={`text-[9px] font-mono ${isDay ? "text-slate-500" : "text-gray-400"}`}>
            Phase {intersection.phase_index}
          </span>
        </div>

        {/* 4 Directions Signal Head Lights */}
        <div className="grid grid-cols-4 gap-2">
          {DIR_ORDER.map((d, idx) => {
            // Signal string has 12 chars: 3 aspects per approach (N, E, S, W)
            const approachChars = signalChars.slice(idx * 3, idx * 3 + 3);
            const isGreen  = approachChars.some((c) => c === "G" || c === "g");
            const isYellow = approachChars.some((c) => c === "y" || c === "Y");
            const isRed    = !isGreen && !isYellow;

            return (
              <div
                key={d}
                className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 ${
                  isDay ? "bg-white border-slate-200 shadow-xs" : "bg-gray-950 border-gray-800"
                }`}
              >
                <span className={`text-[10px] font-bold font-mono ${isDay ? "text-slate-700" : "text-gray-300"}`}>
                  {d}
                </span>

                {/* Vertical Traffic Light mini-housing */}
                <div className="w-5 py-1 px-0.5 rounded-lg bg-black border border-gray-800 flex flex-col items-center gap-1 shadow-inner">
                  {/* Red LED */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                      isRed
                        ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                        : "bg-red-950/40 opacity-40"
                    }`}
                  />
                  {/* Yellow LED */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                      isYellow
                        ? "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
                        : "bg-amber-950/40 opacity-40"
                    }`}
                  />
                  {/* Green LED */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-200 ${
                      isGreen
                        ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
                        : "bg-emerald-950/40 opacity-40"
                    }`}
                  />
                </div>

                <span className={`text-[8.5px] font-semibold ${
                  isGreen ? "text-emerald-600 dark:text-emerald-400 font-bold" :
                  isYellow ? "text-amber-600 dark:text-amber-400 font-bold" :
                  isDay ? "text-slate-400" : "text-gray-500"
                }`}>
                  {isGreen ? "GREEN" : isYellow ? "YELLOW" : "RED"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Adaptive Policy Feedback Banner */}
      {targets && isAdaptive && (
        <div className={`p-3 rounded-xl border ${
          isDay ? "bg-purple-50/70 border-purple-200 text-purple-900 shadow-xs" : "bg-[#18122a] border-[#2f2066]"
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[10px] font-bold ${
              isDay ? "text-purple-800" : "text-purple-300"
            }`}>Adaptive Dynamic Cycle Adjustment</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-200/60 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200">
              Actuated
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 mt-1">
            {DIR_ORDER.map((d) => {
              const dt = targets.directions[d].delta;
              return (
                <div
                  key={d}
                  className={`p-1.5 rounded-lg border text-center ${
                    Math.abs(dt) < 0.05
                      ? isDay ? "bg-white/80 border-purple-100 text-slate-500" : "bg-black/30 border-purple-900/30 text-gray-500"
                      : dt > 0
                      ? isDay ? "bg-emerald-100/70 border-emerald-300 text-emerald-800 font-bold" : "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 font-bold"
                      : isDay ? "bg-rose-100/70 border-rose-300 text-rose-800 font-bold" : "bg-rose-950/40 border-rose-800/60 text-rose-300 font-bold"
                  }`}
                >
                  <div className="text-[9px] font-bold">{d}</div>
                  <div className="text-[10.5px] font-mono leading-tight">
                    {dt > 0 ? "+" : ""}{dt.toFixed(1)}s
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal Targets Allocation Table */}
      {targets && (
        <div className={`p-3 rounded-xl border ${
          isDay ? "bg-slate-50/70 border-slate-200/90 shadow-xs" : "bg-gray-900/60 border-gray-800"
        }`}>
          <div className={`text-[9.5px] uppercase tracking-wider font-bold mb-2 ${
            isDay ? "text-slate-600" : "text-gray-400"
          }`}>
            Timing Targets Allocation
          </div>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className={`border-b ${isDay ? "border-slate-200 text-slate-500" : "border-gray-800 text-gray-400"}`}>
                <th className="text-left font-bold pb-1.5">Approach</th>
                <th className="text-right font-bold pb-1.5">Base Plan</th>
                <th className="text-right font-bold pb-1.5">Allocated</th>
                <th className="text-right font-bold pb-1.5">Offset (Δ)</th>
              </tr>
            </thead>
            <tbody>
              {DIR_ORDER.map((d) => {
                const row = targets.directions[d];
                return (
                  <tr key={d} className={`border-t ${isDay ? "border-slate-100" : "border-gray-800/60"}`}>
                    <td className={`py-1.5 font-bold flex items-center gap-1 ${isDay ? "text-slate-800" : "text-gray-200"}`}>
                      <span className="font-mono text-blue-600 dark:text-blue-400">{d}</span>
                      <span className="text-[9px] font-medium text-slate-500">({DIR_NAMES[d]})</span>
                    </td>
                    <td className={`py-1.5 text-right font-mono ${isDay ? "text-slate-500" : "text-gray-500"}`}>
                      {row.base.toFixed(1)}s
                    </td>
                    <td className={`py-1.5 text-right font-mono font-bold ${isDay ? "text-slate-900" : "text-gray-100"}`}>
                      {row.target.toFixed(1)}s
                    </td>
                    <td className={`py-1.5 text-right font-mono font-bold ${
                      row.delta > 0.05 ? "text-emerald-600 dark:text-emerald-400" :
                      row.delta < -0.05 ? "text-rose-600 dark:text-rose-400" : isDay ? "text-slate-400" : "text-gray-600"
                    }`}>
                      {row.delta > 0.05 ? "+" : ""}{row.delta.toFixed(1)}s
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

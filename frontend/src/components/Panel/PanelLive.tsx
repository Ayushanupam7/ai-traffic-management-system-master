"use client";

import { useEffect, useRef, useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import { api, cameraStreamUrl } from "@/lib/api";
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

  if (!intersection) return <p className="text-xs text-gray-500 p-3">Loading…</p>;

  const { queue_lengths: q, vehicle_count, avg_wait_s, signal_state } = intersection;
  const totalQueue  = q.N + q.S + q.E + q.W;
  const maxQueue    = Math.max(q.N, q.S, q.E, q.W, 1);
  const signalChars = signal_state.split("");
  const isAdaptive  = targets?.policy === "ActuatedController";
  const streamUrl   = cameraStreamUrl(intersectionId, camApproach);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Vehicles", value: vehicle_count, color: "text-gray-100" },
          { label: "Queued",   value: totalQueue,    color: totalQueue > 10 ? "text-amber-400" : "text-gray-100" },
          { label: "Avg wait", value: `${avg_wait_s.toFixed(1)}s`, color: "text-gray-100" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111827] border border-gray-800 rounded-lg p-2 text-center">
            <div className="text-[8px] text-gray-500 uppercase tracking-wider">{label}</div>
            <div className={`text-base font-bold leading-tight mt-0.5 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* Camera preview (only when CARLA connected) */}
      {carlaStatus?.connected && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] text-gray-600 uppercase tracking-widest">Camera preview</span>
            <button
              onClick={onSwitchToCamera}
              className="text-[9px] text-blue-500 hover:text-blue-400"
            >
              full view →
            </button>
          </div>
          <div className="flex gap-1 mb-1.5">
            {(["N", "E", "S", "W"] as CameraApproach[]).map((a) => (
              <button
                key={a}
                onClick={() => setCamApproach(a)}
                className={`flex-1 py-1 text-[9px] rounded border transition-colors ${
                  a === camApproach
                    ? "bg-[#1e3a5f] border-blue-600 text-blue-300"
                    : "bg-[#1f2937] border-gray-700 text-gray-500"
                }`}
              >
                {a}
              </button>
            ))}
            <button
              onClick={() => setReloadTick((t) => t + 1)}
              className="px-2 bg-[#1f2937] border border-gray-700 rounded text-gray-500 hover:text-gray-300 text-xs"
              title="Restart stream"
            >
              ⟳
            </button>
          </div>
          <div className="bg-black border border-gray-800 rounded-md overflow-hidden aspect-video flex items-center justify-center">
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

      {/* Queue bars */}
      <div>
        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Queue lengths</div>
        <div className="flex flex-col gap-2">
          {DIR_ORDER.map((d) => {
            const count = q[d];
            const pct   = (count / maxQueue) * 100;
            return (
              <div key={d} className="flex items-center gap-2">
                <span className={`text-[10px] w-3 ${count > 8 ? "text-amber-400" : "text-gray-400"}`}>{d}</span>
                <div className="flex-1 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      background: count > 8 ? "#f59e0b" : count > 0 ? "#3b82f6" : "#22c55e",
                    }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-mono w-5 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal state strip */}
      <div>
        <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Signal state</div>
        <div className="flex gap-0.5">
          {signalChars.map((ch, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono font-bold"
              style={{
                background:
                  ch === "G" || ch === "g" ? "#14532d" :
                  ch === "y"               ? "#713f12" : "#450a0a",
                color: "#fff",
              }}
            >
              {ch}
            </div>
          ))}
        </div>
      </div>

      {/* Policy summary */}
      {targets && isAdaptive && (
        <div className="bg-[#1a1332] border border-[#2e1e6b] rounded-lg p-3">
          <div className="text-[10px] font-semibold text-purple-300 mb-1">Adaptive · last adjustment</div>
          <div className="text-[10px] text-gray-400">
            {DIR_ORDER.map((d) => {
              const dt = targets.directions[d].delta;
              if (Math.abs(dt) < 0.05) return null;
              return (
                <span key={d} className={`mr-2 ${dt > 0 ? "text-green-400" : "text-red-400"}`}>
                  {d} {dt > 0 ? "+" : ""}{dt.toFixed(1)}s
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Signal targets table */}
      {targets && (
        <div>
          <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Signal targets</div>
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-gray-600">
                <th className="text-left font-normal pb-1">Dir</th>
                <th className="text-right font-normal pb-1">Base</th>
                <th className="text-right font-normal pb-1">Now</th>
                <th className="text-right font-normal pb-1">Δ</th>
              </tr>
            </thead>
            <tbody>
              {DIR_ORDER.map((d) => {
                const row = targets.directions[d];
                return (
                  <tr key={d} className="border-t border-gray-800">
                    <td className="py-1 text-gray-300 font-mono">{d}</td>
                    <td className="py-1 text-right text-gray-500 font-mono">{row.base.toFixed(1)}s</td>
                    <td className="py-1 text-right text-gray-200 font-mono">{row.target.toFixed(1)}s</td>
                    <td className={`py-1 text-right font-mono ${
                      row.delta > 0.05 ? "text-green-400" :
                      row.delta < -0.05 ? "text-red-400" : "text-gray-600"
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

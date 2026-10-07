"use client";

import { useEffect, useState } from "react";
import { api, cameraStreamUrl } from "@/lib/api";
import RegionEditor from "./RegionEditor";
import type {
  CameraApproach,
  CameraListResponse,
  CameraStatus,
  IntersectionCameras,
} from "@/lib/types";

const APPROACHES: CameraApproach[] = ["N", "E", "S", "W"];
const APPROACH_LABEL: Record<CameraApproach, string> = {
  N: "North", E: "East", S: "South", W: "West",
};

interface Props {
  intersectionId: string;
}

export default function PanelCameras({ intersectionId }: Props) {
  const [status,   setStatus]   = useState<CameraStatus | null>(null);
  const [list,     setList]     = useState<IntersectionCameras | null>(null);
  const [approach, setApproach] = useState<CameraApproach>("N");
  const [reloadTick, setReloadTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [visionOn, setVisionOn] = useState(false);

  useEffect(() => {
    api.getVision()
      .then((r) => setVisionOn(!!(r as { use_vision?: boolean }).use_vision))
      .catch(() => { /* CARLA may be off */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let prevConnected: boolean | null = null;

    const poll = async () => {
      try {
        const s = (await api.getCameraStatus()) as CameraStatus;
        if (cancelled) return;
        setStatus(s);
        // CARLA came back — bump the <img> key so the stream restarts.
        if (prevConnected === false && s.connected) {
          setReloadTick((t) => t + 1);
        }
        prevConnected = s.connected;
      } catch (e) {
        if (cancelled) return;
        setStatus({ connected: false, town: null, server_version: null,
          error: e instanceof Error ? e.message : "status fetch failed" });
        prevConnected = false;
      }
    };

    poll();
    const id = setInterval(poll, 3000);

    // Approach list is static for a given intersection — fetch once.
    api.listCameras()
      .then((l) => {
        if (cancelled) return;
        setList(
          (l as CameraListResponse).intersections.find(
            (i) => i.intersection_id === intersectionId,
          ) ?? null,
        );
      })
      .catch(() => { /* ignore */ });

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intersectionId]);

  if (status && !status.connected) {
    return (
      <div className="flex flex-col gap-2 text-xs text-gray-400">
        <p className="font-semibold text-gray-300">Camera Feed</p>
        <p>CARLA server not connected. Launch <code className="text-gray-400">CarlaUE4</code> and reload.</p>
        {status.error && <p className="text-[10px] text-gray-600 font-mono">{status.error}</p>}
      </div>
    );
  }

  const available = new Set(list?.cameras.map((c) => c.approach) ?? []);
  const streamUrl = cameraStreamUrl(intersectionId, approach);

  return (
    <div className="flex flex-col gap-3">
      {/* Approach selector */}
      <div className="flex gap-1.5">
        {APPROACHES.map((a) => {
          const enabled  = available.has(a);
          const isActive = a === approach;
          return (
            <button
              key={a}
              onClick={() => enabled && setApproach(a)}
              disabled={!enabled}
              className={`flex-1 py-1.5 text-[10px] rounded-md border transition-colors font-medium ${
                isActive
                  ? "bg-[#1e3a5f] border-blue-600 text-blue-200"
                  : "bg-[#1f2937] border-gray-700 text-gray-500 hover:text-gray-300"
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {APPROACH_LABEL[a]}
            </button>
          );
        })}
        <button
          onClick={() => setReloadTick((t) => t + 1)}
          className="px-2.5 bg-[#1f2937] border border-gray-700 rounded-md text-gray-500
                     hover:text-gray-200 text-xs transition-colors"
          title="Restart stream"
        >
          ⟳
        </button>
        {available.has(approach) && (
          <button
            onClick={() => setEditing((v) => !v)}
            className={`px-2.5 rounded-md border text-[10px] transition-colors ${
              editing
                ? "bg-[#1e3a5f] border-blue-600 text-blue-200"
                : "bg-[#1f2937] border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
            title="Draw lanes + violation lines"
          >
            Edit regions
          </button>
        )}
        {available.has(approach) && (
          <button
            onClick={async () => {
              try {
                const r = await api.setVision(!visionOn);
                setVisionOn(!!(r as { use_vision?: boolean }).use_vision);
                setReloadTick((t) => t + 1);
              } catch { /* ignore */ }
            }}
            className={`px-2.5 rounded-md border text-[10px] transition-colors ${
              visionOn
                ? "bg-[#10331f] border-green-700 text-green-300"
                : "bg-[#1f2937] border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
            title="Toggle YOLOv11m vision overlay + analytics"
          >
            Vision: {visionOn ? "on" : "off"}
          </button>
        )}
      </div>

      {/* Camera feed — or the region editor when "Edit regions" is on */}
      {editing && status?.connected && available.has(approach) ? (
        <RegionEditor
          key={`${intersectionId}-${approach}`}
          intersectionId={intersectionId}
          approach={approach}
          onClose={() => setEditing(false)}
        />
      ) : (
      <div className="bg-black border border-gray-800 rounded-lg overflow-hidden aspect-video
                      flex items-center justify-center">
        {status?.connected && available.has(approach) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${approach}-${reloadTick}`}
            src={streamUrl}
            alt={`${intersectionId} ${approach}`}
            className="w-full h-full object-cover"
            onError={() => {
              // Silent stream death (CARLA still "connected" but no frames).
              // Retry shortly so we don't tight-loop on a hard failure.
              window.setTimeout(() => setReloadTick((t) => t + 1), 2000);
            }}
          />
        ) : (
          <span className="text-xs text-gray-500">
            {status?.connected ? "No camera on this approach" : "Loading…"}
          </span>
        )}
      </div>
      )}

      {/* Footer: server info */}
      {status?.connected && (
        <p className="text-[9px] text-gray-700">
          {status.town ?? "Unknown town"} · CARLA {status.server_version ?? "?"}
        </p>
      )}
    </div>
  );
}

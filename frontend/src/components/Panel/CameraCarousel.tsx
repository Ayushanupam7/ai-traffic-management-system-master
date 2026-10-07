"use client";

import { useEffect, useState } from "react";

import { api, cameraStreamUrl } from "@/lib/api";
import type {
  CameraApproach,
  CameraListResponse,
  CameraStatus,
  IntersectionCameras,
} from "@/lib/types";

const ROTATION_MS = 4000;

// Right-panel filler when no intersection is selected and CARLA is up.
// Cycles through every calibrated intersection/approach in the list every
// few seconds so the demo never has a blank canvas.
export default function CameraCarousel() {
  const [carlaStatus, setCarlaStatus] = useState<CameraStatus | null>(null);
  const [cams, setCams]               = useState<IntersectionCameras[]>([]);
  const [idx, setIdx]                 = useState(0);

  // Probe CARLA + the calibrated camera list on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, list] = await Promise.all([
          api.getCameraStatus() as Promise<CameraStatus>,
          api.listCameras("summary") as Promise<CameraListResponse>,
        ]);
        if (cancelled) return;
        setCarlaStatus(s);
        setCams(list.intersections ?? []);
      } catch {
        if (!cancelled) setCarlaStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cycle index every ROTATION_MS.
  useEffect(() => {
    if (cams.length === 0) return;
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % cams.length);
    }, ROTATION_MS);
    return () => clearInterval(interval);
  }, [cams.length]);

  if (!carlaStatus?.connected || cams.length === 0) return null;

  const current = cams[idx];
  // Pick the first available approach (N preferred).
  const approach: CameraApproach =
    (current.cameras.find((c) => c.approach === "N")?.approach ??
     current.cameras[0]?.approach ?? "N");

  return (
    <div className="absolute top-3 right-3 w-[280px] z-10
                    bg-[#0d1117] border border-gray-800 rounded-lg overflow-hidden
                    shadow-xl">
      <div className="flex items-center justify-between px-2.5 py-1.5
                      border-b border-gray-800">
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          Live cameras
        </div>
        <div className="text-[9px] font-mono text-gray-600">
          {idx + 1}/{cams.length}
        </div>
      </div>
      <div className="relative">
        {/* Force MJPEG reconnect by re-keying when intersection or approach changes. */}
        <img
          key={`${current.intersection_id}-${approach}`}
          src={cameraStreamUrl(current.intersection_id, approach)}
          alt={`Camera at ${current.intersection_id}`}
          className="w-full block aspect-video object-cover bg-black"
        />
        <div className="absolute bottom-1 left-2 right-2 flex items-baseline justify-between
                        text-[10px] font-mono
                        bg-black/60 px-1.5 py-0.5 rounded">
          <span className="text-blue-300">{current.intersection_id}</span>
          <span className="text-gray-400">{approach}-approach</span>
        </div>
      </div>
      <div className="px-2.5 py-1 text-[9px] text-gray-600 font-mono border-t border-gray-800">
        Auto-cycling every {ROTATION_MS / 1000}s · click an intersection for details
      </div>
    </div>
  );
}

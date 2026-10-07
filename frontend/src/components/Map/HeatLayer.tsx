"use client";

import { useTrafficStore } from "@/store/trafficStore";
import type { QueueLengths } from "@/lib/types";

function queueToHeat(q: number): { fill: string; fillOpacity: number } {
  if (q <= 0)  return { fill: "#000000", fillOpacity: 0 };
  if (q <= 4)  return { fill: "#22c55e", fillOpacity: 0.08 };
  if (q <= 10) return { fill: "#eab308", fillOpacity: 0.14 };
  if (q <= 20) return { fill: "#f97316", fillOpacity: 0.22 };
  if (q <= 35) return { fill: "#ef4444", fillOpacity: 0.30 };
  return { fill: "#ef4444", fillOpacity: 0.42 };
}

interface Segment {
  x: number;
  y: number;
  w: number;
  h: number;
  queue: number;
}

export default function HeatLayer() {
  const intersections = useTrafficStore((s) => s.intersections);
  const byId = new Map(intersections.map((i) => [i.id, i]));
  const q = (id: string, dir: keyof QueueLengths): number =>
    byId.get(id)?.queue_lengths[dir] ?? 0;

  // Cross-street centres at x = 250 / 750 / 1250 (50 px wide).
  // Block windows: [0..225] | cross | [275..725] | cross | [775..1225] | cross | [1275..1500].
  const segments: Segment[] = [
    // ── Upper arterial (y=230, h=80) ──
    { x: 0,    y: 230, w: 250, h: 80, queue: q("A1", "W") },                 // H1
    { x: 250,  y: 230, w: 500, h: 80, queue: q("A1", "E") + q("B1", "W") },  // H2
    { x: 750,  y: 230, w: 500, h: 80, queue: q("B1", "E") + q("C1", "W") },  // H3
    { x: 1250, y: 230, w: 250, h: 80, queue: q("C1", "E") },                 // H4
    // ── Lower arterial (y=415, h=80) ──
    { x: 0,    y: 415, w: 250, h: 80, queue: q("A0", "W") },                 // H5
    { x: 250,  y: 415, w: 500, h: 80, queue: q("A0", "E") + q("B0", "W") },  // H6
    { x: 750,  y: 415, w: 500, h: 80, queue: q("B0", "E") + q("C0", "W") },  // H7
    { x: 1250, y: 415, w: 250, h: 80, queue: q("C0", "E") },                 // H8
    // ── Left cross street (x=225, w=50) ──
    { x: 225,  y: 0,   w: 50, h: 270, queue: q("A1", "N") },                 // V1
    { x: 225,  y: 270, w: 50, h: 185, queue: q("A1", "S") + q("A0", "N") }, // V2
    { x: 225,  y: 455, w: 50, h: 145, queue: q("A0", "S") },                // V3
    // ── Center cross street (x=725, w=50) ──
    { x: 725,  y: 0,   w: 50, h: 270, queue: q("B1", "N") },                 // V4
    { x: 725,  y: 270, w: 50, h: 185, queue: q("B1", "S") + q("B0", "N") }, // V5
    { x: 725,  y: 455, w: 50, h: 145, queue: q("B0", "S") },                // V6
    // ── Right cross street (x=1225, w=50) ──
    { x: 1225, y: 0,   w: 50, h: 270, queue: q("C1", "N") },                 // V7
    { x: 1225, y: 270, w: 50, h: 185, queue: q("C1", "S") + q("C0", "N") }, // V8
    { x: 1225, y: 455, w: 50, h: 145, queue: q("C0", "S") },                // V9
  ];

  return (
    <>
      {segments.map((seg, i) => {
        const { fill, fillOpacity } = queueToHeat(seg.queue);
        if (fillOpacity === 0) return null;
        return (
          <rect
            key={i}
            x={seg.x}
            y={seg.y}
            width={seg.w}
            height={seg.h}
            fill={fill}
            fillOpacity={fillOpacity}
          />
        );
      })}
    </>
  );
}

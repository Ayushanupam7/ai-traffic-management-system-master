"use client";

import { useTrafficStore } from "@/store/trafficStore";
import type { IntersectionCameras, IntersectionState } from "@/lib/types";
import IntersectionNode from "./IntersectionNode";

interface Props {
  junctions: IntersectionCameras[];
}

function makePlaceholder(id: string): IntersectionState {
  return {
    id,
    signal_state: "rrrrrrrr",
    phase_index: 0,
    phase_remaining_s: 0,
    queue_lengths: { N: 0, S: 0, E: 0, W: 0 },
    vehicle_count: 0,
    avg_wait_s: 0,
  };
}

const SVG_W = 900;
const SVG_H = 600;
const PAD   = 80;

export default function CarlaGrid({ junctions }: Props) {
  const intersections = useTrafficStore((s) => s.intersections);

  if (junctions.length === 0) {
    return (
      <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fill="#6b7280" fontSize={12}>
        No junctions mapped. Run scripts/inspect_carla_junctions.py with CARLA running.
      </text>
    );
  }

  const byId = new Map(intersections.map((i) => [i.id, i]));

  const xs   = junctions.map((j) => j.cx);
  const ys   = junctions.map((j) => j.cy);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);

  const toX = (cx: number) => PAD + ((cx - minX) / spanX) * (SVG_W - 2 * PAD);
  const toY = (cy: number) => PAD + ((cy - minY) / spanY) * (SVG_H - 2 * PAD);

  return (
    <>
      <rect width={SVG_W} height={SVG_H} fill="#0a0e16" />
      {junctions.map((j) => {
        const it = byId.get(j.intersection_id) ?? makePlaceholder(j.intersection_id);
        return (
          <IntersectionNode
            key={j.intersection_id}
            intersection={it}
            cx={toX(j.cx)}
            cy={toY(j.cy)}
          />
        );
      })}
    </>
  );
}

"use client";

import { useState } from "react";

import type { IntersectionState } from "@/lib/types";
import { useTrafficStore } from "@/store/trafficStore";

interface Props {
  intersection: IntersectionState;
  cx: number;
  cy: number;
}

function phaseToLabel(
  phaseIndex: number,
  intersectionId: string,
): { dir: string; sub: "G" | "y" | "r" } {
  const sub = phaseIndex % 3;
  const subKey = sub === 0 ? "G" : sub === 1 ? "y" : "r";

  // Highway meters (E1/E2/W1/W2) use a 2-phase cycle: 0 green / 1 red.
  if (intersectionId.startsWith("E") || intersectionId.startsWith("W")) {
    const dir = phaseIndex === 0 ? "Svc" : "Wait";
    return { dir, sub: phaseIndex === 0 ? "G" : "r" };
  }

  // Arterial 4-phase: 0-2=N, 3-5=E, 6-8=S, 9-11=W.
  const group = Math.floor(phaseIndex / 3) % 4;
  const dir   = ["N", "E", "S", "W"][group];
  return { dir, sub: subKey };
}

function phaseColor(sub: "G" | "y" | "r") {
  if (sub === "G") return "#22c55e";
  if (sub === "y") return "#eab308";
  return "#ef4444";
}

export default function IntersectionNode({ intersection, cx, cy }: Props) {
  const selectedId        = useTrafficStore((s) => s.selectedIntersection);
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const isSelected        = selectedId === intersection.id;
  const [hover, setHover] = useState(false);

  const { dir, sub } = phaseToLabel(intersection.phase_index, intersection.id);
  const remaining    = Math.max(0, Math.round(intersection.phase_remaining_s));
  const fill         = isSelected ? "#3b82f6" : phaseColor(sub);
  const glow         = isSelected ? "#3b82f6" : phaseColor(sub);
  const r            = isSelected ? 16 : 14;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    selectIntersection(isSelected ? null : intersection.id);
  }

  return (
    <g
      transform={`translate(${cx},${cy})`}
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ cursor: "pointer" }}
    >
      {/* Glow ring */}
      <circle r={r + 8} fill={glow} fillOpacity={isSelected ? 0.18 : 0.12} />
      {/* Selected pulse ring */}
      {isSelected && (
        <circle r={r + 14} fill="none" stroke="#93c5fd" strokeWidth={1.5} strokeOpacity={0.5} />
      )}
      {/* Main circle */}
      <circle
        r={r}
        fill={fill}
        fillOpacity={0.92}
        stroke={isSelected ? "#93c5fd" : "none"}
        strokeWidth={isSelected ? 2 : 0}
      />
      {/* ID */}
      <text
        y={-2}
        textAnchor="middle"
        fill="white"
        fontSize={9}
        fontFamily="monospace"
        fontWeight="bold"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {intersection.id}
      </text>
      {/* Active phase label */}
      <text
        y={9}
        textAnchor="middle"
        fill="rgba(255,255,255,0.75)"
        fontSize={7}
        fontFamily="monospace"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {dir}·{remaining}s
      </text>

      {/* Hover tooltip — anchored just above the puck. Suppressed when
          the intersection is the selected one (the right panel covers it). */}
      {hover && !isSelected && (
        <Tooltip intersection={intersection} radius={r} />
      )}
    </g>
  );
}

function Tooltip({
  intersection,
  radius,
}: {
  intersection: IntersectionState;
  radius: number;
}) {
  const q = intersection.queue_lengths;
  const wait = Math.round(intersection.avg_wait_s);
  const { dir, sub } = phaseToLabel(intersection.phase_index, intersection.id);
  const remaining = Math.max(0, Math.round(intersection.phase_remaining_s));

  // Fixed-size tooltip so we don't need to measure. 90 × 72 px above the puck.
  const W = 96, H = 72;
  const offset = radius + 10;   // gap between puck and tooltip
  const x = -W / 2;
  const y = -(offset + H);

  // Bar widths normalized — 24 vehicles ≈ full width.
  const bar = (n: number) => Math.max(2, Math.min(38, (n / 24) * 38));

  return (
    <g pointerEvents="none">
      {/* Pointer triangle */}
      <polygon
        points={`-5,${-offset} 5,${-offset} 0,${-offset + 6}`}
        fill="#0d1421"
        stroke="#374151"
        strokeWidth={0.6}
      />
      {/* Body */}
      <rect
        x={x} y={y}
        width={W} height={H}
        rx={3}
        fill="#0d1421"
        stroke="#374151"
        strokeWidth={0.8}
      />
      {/* Header row: id + phase */}
      <text
        x={x + 5} y={y + 11}
        fill="#d1d5db" fontSize={9} fontFamily="monospace" fontWeight="bold"
      >
        {intersection.id}
      </text>
      <text
        x={x + W - 5} y={y + 11}
        textAnchor="end"
        fill={phaseColor(sub)}
        fontSize={8} fontFamily="monospace"
      >
        {dir}·{remaining}s
      </text>
      {/* Avg wait */}
      <text x={x + 5} y={y + 22} fill="#9ca3af" fontSize={7} fontFamily="monospace">
        wait {wait}s
      </text>
      {/* Queue mini-bars */}
      {(["N","E","S","W"] as const).map((d, i) => {
        const rowY = y + 32 + i * 9;
        const w = bar(q[d]);
        return (
          <g key={d}>
            <text
              x={x + 5} y={rowY + 6}
              fill="#6b7280" fontSize={7} fontFamily="monospace"
            >
              {d}
            </text>
            <rect
              x={x + 16} y={rowY + 1}
              width={38} height={6}
              fill="#1f2937"
            />
            <rect
              x={x + 16} y={rowY + 1}
              width={w} height={6}
              fill={q[d] >= 20 ? "#ef4444" : q[d] >= 10 ? "#f97316" : q[d] >= 4 ? "#fbbf24" : "#22c55e"}
            />
            <text
              x={x + W - 5} y={rowY + 6}
              textAnchor="end"
              fill="#9ca3af" fontSize={7} fontFamily="monospace"
            >
              {q[d]}
            </text>
          </g>
        );
      })}
    </g>
  );
}

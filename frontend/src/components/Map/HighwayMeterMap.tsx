"use client";

import { useTrafficStore } from "@/store/trafficStore";
import type { IntersectionState, VehicleState } from "@/lib/types";
import IntersectionNode from "./IntersectionNode";

const METER_IDS = ["E1", "E2", "W1", "W2"] as const;

// SVG positions for the 4 meter junctions. The signal sits at the START of
// each tapered ramp — on the service road — so cars stop on the frontage,
// then accelerate down the full length of the ramp before merging.
const NODE_POS: Record<string, { cx: number; cy: number }> = {
  E1: { cx: 250, cy: 207 },
  E2: { cx: 560, cy: 207 },
  W1: { cx: 650, cy: 393 },
  W2: { cx: 350, cy: 393 },
};

// SUMO world → SVG mapping. After netconvert shift, world y ranges roughly
// 0 (W-svc) to 480 (E-svc); SVG y in the band layout 200..400.
//   hwy_E_in/out at world (0/3000, 440)   → svg y ≈ 217
//   hwy_W_in/out at world (0/3000, 40)    → svg y ≈ 383
// Merge-ramp cars (fallback path) will slide diagonally between bands.
const toSvgX = (wx: number) => wx * 0.3;
const toSvgY = (wy: number) => 400 - wy * 0.4167;

// Per-edge, per-lane y rows. SUMO lane 0 = rightmost in travel direction
// (= closest to the median). Spacing exaggerated for visual clarity.
//
// The *_accel edges are the 5-lane acceleration zones after each meter.
// Lane 0 is the merge lane (cars briefly here after entering from the ramp);
// lanes 1-4 are the through-traffic shifted from the upstream 4-lane segment.
// Visually they share the same 4 row positions — accel lane 0 and lane 1
// both render at the bottom row since they're physically next to each other.
const LANE_Y: Record<string, number[]> = {
  // E-bound highway (4 lanes). Lane 0 closer to median → larger svg y.
  hwy_E_s1:       [247, 239, 231, 223],
  hwy_E_s2:       [247, 239, 231, 223],
  hwy_E_s3:       [247, 239, 231, 223],
  // E-bound accel (5 lanes). Lane 0 = merge; lanes 1-4 = shifted through.
  hwy_E_s1_accel: [247, 247, 239, 231, 223],
  hwy_E_s2_accel: [247, 247, 239, 231, 223],
  // E-bound service road (2 lanes, just above E-hwy).
  svc_E_s1: [210, 200],
  svc_E_s2: [210, 200],
  svc_E_s3: [210, 200],
  // W-bound highway (4 lanes). Lane 0 closer to median → smaller svg y.
  hwy_W_s1:       [353, 361, 369, 377],
  hwy_W_s2:       [353, 361, 369, 377],
  hwy_W_s3:       [353, 361, 369, 377],
  // W-bound accel.
  hwy_W_s1_accel: [353, 353, 361, 369, 377],
  hwy_W_s2_accel: [353, 353, 361, 369, 377],
  // W-bound service road (just below W-hwy).
  svc_W_s1: [390, 400],
  svc_W_s2: [390, 400],
  svc_W_s3: [390, 400],
};

function vehicleToSvg(v: VehicleState): { x: number; y: number } {
  const i = v.lane_id.lastIndexOf("_");
  const edge = i >= 0 ? v.lane_id.slice(0, i) : "";
  const lane = i >= 0 ? parseInt(v.lane_id.slice(i + 1), 10) : 0;

  const x = toSvgX(v.x);
  const rows = LANE_Y[edge];
  if (rows) return { x, y: rows[lane] ?? rows[0] };
  // merge_* edges fall through here. Their SUMO endpoints span the gap
  // between svc and hwy in world coords, so the linear mapping naturally
  // places cars along the tapered diagonal.
  return { x, y: toSvgY(v.y) };
}

function VehicleDots({ vehicles }: { vehicles: VehicleState[] }) {
  if (vehicles.length > 1500) return null;
  return (
    <>
      {vehicles.map((v) => {
        const { x, y } = vehicleToSvg(v);
        return (
          <circle
            key={v.id}
            cx={x}
            cy={y}
            r={2.2}
            fill={String(v.type) === "emergency" ? "#ef4444" : "#3b82f6"}
            fillOpacity={0.78}
          />
        );
      })}
    </>
  );
}

function makePlaceholder(id: string): IntersectionState {
  return {
    id,
    signal_state: "rr",
    phase_index: 0,
    phase_remaining_s: 0,
    queue_lengths: { N: 0, S: 0, E: 0, W: 0 },
    vehicle_count: 0,
    avg_wait_s: 0,
  };
}

interface Props {
  showHeat?: boolean;
}

export default function HighwayMeterMap({ showHeat = true }: Props) {
  const intersections = useTrafficStore((s) => s.intersections);
  const vehicles      = useTrafficStore((s) => s.vehicles);

  const byId = new Map(intersections.map((i) => [i.id, i]));
  METER_IDS.forEach((id) => { if (!byId.has(id)) byId.set(id, makePlaceholder(id)); });

  // Service-road queue colors a faint overlay so the user sees where cars
  // are piling up when the meter restricts them. svc-E queue lives in
  // intersections.queue_lengths.W (for E-bound meters); svc-W queue in .E.
  const eSvcQueue = Math.max(
    byId.get("E1")?.queue_lengths.W ?? 0,
    byId.get("E2")?.queue_lengths.W ?? 0,
  );
  const wSvcQueue = Math.max(
    byId.get("W1")?.queue_lengths.E ?? 0,
    byId.get("W2")?.queue_lengths.E ?? 0,
  );
  const heatColor = (q: number) => {
    if (q <= 0)   return null;
    if (q <= 4)   return { fill: "#22c55e", op: 0.10 };
    if (q <= 10)  return { fill: "#eab308", op: 0.18 };
    if (q <= 20)  return { fill: "#f97316", op: 0.28 };
    if (q <= 35)  return { fill: "#ef4444", op: 0.36 };
    return            { fill: "#ef4444", op: 0.48 };
  };
  const eHeat = heatColor(eSvcQueue);
  const wHeat = heatColor(wSvcQueue);

  return (
    <>
      {/* Decorative background — city blocks above E-svc and below W-svc */}
      <rect x={0}   y={0}   width={900} height={180} fill="#0d1421" />
      <rect x={0}   y={420} width={900} height={180} fill="#0d1421" />
      {[
        [30,30,80,40],[140,40,55,35],[220,25,80,50],[330,35,60,35],
        [510,30,80,45],[620,40,55,30],[700,25,80,40],[810,35,60,40],
        [30,80,90,45],[150,90,60,40],[260,75,70,50],[360,85,55,35],
        [510,80,80,50],[640,90,60,35],[720,75,80,40],[820,85,55,40],
        [30,440,80,40],[140,450,55,35],[220,435,80,50],[330,445,60,35],
        [510,440,80,45],[620,450,55,30],[700,435,80,40],[810,445,60,40],
        [30,500,90,45],[150,510,60,40],[260,495,70,50],[360,505,55,35],
        [510,500,80,50],[640,510,60,35],[720,495,80,40],[820,505,55,40],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#0f1a2e" rx={2} />
      ))}

      {/* ── E-side: service road right above the E-bound highway ── */}
      <rect x={0} y={195} width={900} height={20} fill="#101b2e" />  {/* E-svc band */}
      <line x1={0} y1={205} x2={900} y2={205} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="14 10" />
      {/* shoulder strip between svc and hwy */}
      <rect x={0} y={215} width={900} height={5} fill="#1a2740" />
      <rect x={0} y={220} width={900} height={32} fill="#101b2e" />  {/* E-hwy band */}
      {/* E-hwy lane dashes (3 interior) */}
      {[228, 236, 244].map((y, i) => (
        <line key={`elE-${i}`} x1={0} y1={y} x2={900} y2={y}
              stroke="#1e3048" strokeWidth={1.0} strokeDasharray="16 12" />
      ))}

      {/* Median */}
      <rect x={0} y={270} width={900} height={55} fill="#1a2740" />

      {/* ── W-side: highway above, service road right below ── */}
      <rect x={0} y={345} width={900} height={32} fill="#101b2e" />  {/* W-hwy band */}
      {[357, 365, 373].map((y, i) => (
        <line key={`elW-${i}`} x1={0} y1={y} x2={900} y2={y}
              stroke="#1e3048" strokeWidth={1.0} strokeDasharray="16 12" />
      ))}
      <rect x={0} y={380} width={900} height={5} fill="#1a2740" />   {/* shoulder */}
      <rect x={0} y={385} width={900} height={20} fill="#101b2e" />  {/* W-svc band */}
      <line x1={0} y1={395} x2={900} y2={395} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="14 10" />

      {/* Heat tint over the service roads when queues build (shows meter effect) */}
      {showHeat && eHeat && (
        <rect x={0} y={195} width={900} height={20} fill={eHeat.fill} fillOpacity={eHeat.op} />
      )}
      {showHeat && wHeat && (
        <rect x={0} y={385} width={900} height={20} fill={wHeat.fill} fillOpacity={wHeat.op} />
      )}

      {/* Direction labels — moved up/down so they don't sit on car lanes */}
      <text x={150} y={188} fill="#3b4a6b" fontSize={10} fontFamily="monospace">↘ E-svc · 2 lanes · 40 km/h</text>
      <text x={150} y={264} fill="#3b4a6b" fontSize={11} fontFamily="monospace">▶▶ E-bound · 4 lanes · 100 km/h</text>
      <text x={150} y={340} fill="#3b4a6b" fontSize={11} fontFamily="monospace">◀◀ W-bound · 4 lanes · 100 km/h</text>
      <text x={150} y={418} fill="#3b4a6b" fontSize={10} fontFamily="monospace">↗ W-svc · 2 lanes · 40 km/h</text>

      {/* ── Tapered acceleration ramps ──
          Each ramp runs roughly parallel to the highway with a small slope,
          starting in the svc band upstream of the meter and ending in the
          highway's lane 0 (closest to median). */}
      {/* E1 ramp (svc → hwy at E1, x_meter=340) */}
      <line x1={250} y1={207} x2={340} y2={247} stroke="#111d2e" strokeWidth={6} strokeLinecap="round" />
      <line x1={250} y1={207} x2={340} y2={247} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="6 5" />
      {/* E2 ramp */}
      <line x1={560} y1={207} x2={650} y2={247} stroke="#111d2e" strokeWidth={6} strokeLinecap="round" />
      <line x1={560} y1={207} x2={650} y2={247} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="6 5" />
      {/* W1 ramp (cars W-bound, svc east of hwy) */}
      <line x1={650} y1={393} x2={560} y2={353} stroke="#111d2e" strokeWidth={6} strokeLinecap="round" />
      <line x1={650} y1={393} x2={560} y2={353} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="6 5" />
      {/* W2 ramp */}
      <line x1={350} y1={393} x2={260} y2={353} stroke="#111d2e" strokeWidth={6} strokeLinecap="round" />
      <line x1={350} y1={393} x2={260} y2={353} stroke="#1e3048" strokeWidth={1.0} strokeDasharray="6 5" />

      {/* Vehicle dots */}
      <VehicleDots vehicles={vehicles} />

      {/* Meter nodes — at the downstream end of each taper */}
      {METER_IDS.map((id) => {
        const pos = NODE_POS[id];
        const it  = byId.get(id)!;
        return <IntersectionNode key={id} intersection={it} cx={pos.cx} cy={pos.cy} />;
      })}
    </>
  );
}

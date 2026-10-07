"use client";

import { useTrafficStore } from "@/store/trafficStore";
import type { IntersectionState, VehicleState } from "@/lib/types";
import IntersectionNode from "./IntersectionNode";
import HeatLayer from "./HeatLayer";

// SUMO world → SVG mapping. After netconvert shift, world coordinates run:
//   x: 0 (west stub end) … 2400 (east stub end), A1/B1/C1 at 500/1200/1900
//   y: 0 (south stub end) … 1500 (north stub end), A0/A1 at 500/1000
// We pin A1 to SVG (250, 270) and C1 to SVG (1250, 270) so the corridor
// spans the full 1500-wide viewBox edge-to-edge.
const X_SLOPE = 1000 / 1400;        // (1250-250) / (1900-500)
const X_INTER = 250 - 500 * X_SLOPE;
const toSvgX = (wx: number) => wx * X_SLOPE + X_INTER;
const toSvgY = (wy: number) => 600 - wy * 0.4;   // A1 wy=1000 → 200; A0 wy=500 → 400

const SUMO_IDS = ["A1", "B1", "C1", "A0", "B0", "C0"] as const;

// Column x = 250 / 750 / 1250 (500 px apart). Row y = 270 / 455.
const NODE_POS: Record<string, { cx: number; cy: number }> = {
  A1: { cx: 250,  cy: 270 },
  B1: { cx: 750,  cy: 270 },
  C1: { cx: 1250, cy: 270 },
  A0: { cx: 250,  cy: 455 },
  B0: { cx: 750,  cy: 455 },
  C0: { cx: 1250, cy: 455 },
};

// ──────────────────────────────────────────────────────────────────
// Per-lane vehicle positioning. Cars on horizontal arterials get their
// y pinned to a lane-specific row; cars on vertical cross-streets get
// their x pinned. The along-the-road coordinate keeps using the linear
// world→SVG mapping so cars move naturally along their edge.
//
// SUMO edge IDs in this network:
//   Horizontal arterial: AaBb where a/b ∈ {0,1} and letters are A/B/C
//     A0B0, B0A0, B0C0, C0B0, A1B1, B1A1, B1C1, C1B1
//   Vertical cross-street: AaAb where rows differ
//     A0A1, A1A0, B0B1, B1B0, C0C1, C1C0
//   Boundary stubs: AaleftN / AarightN / topN / bottomN-style names
//     e.g. A0left0, C1right1, A0bottom0, A1top0
//
// SUMO convention: lane 0 is rightmost in travel direction (closest to median).
// ──────────────────────────────────────────────────────────────────

// Top arterial centre y=270, bottom y=455. Three lanes per direction.
// W-bound (north half of band) and E-bound (south half) get 3 distinct rows.
const TOP_E_BOUND_Y = [294, 286, 278];   // lane 0..2 — lane 0 closest to median (top)
const TOP_W_BOUND_Y = [246, 254, 262];   // lane 0..2 — lane 0 closest to median (bottom-of-W-half)
const BOT_E_BOUND_Y = [479, 471, 463];
const BOT_W_BOUND_Y = [431, 439, 447];

// Cross-street centres x=250/750/1250. 2 lanes per direction.
// N-bound (east half of band) and S-bound (west half) get 2 distinct columns.
function nBoundX(centreX: number) { return [centreX + 17, centreX + 8]; }   // lane 0, lane 1
function sBoundX(centreX: number) { return [centreX - 17, centreX - 8]; }

function classifyEdge(edge: string): "h" | "v" | null {
  // Horizontal arterial: 2 grid letters + 2 grid numbers swapping column
  // e.g. A0B0, C1B1. Match: letter-digit-letter-digit, letters differ.
  if (/^[A-C][01][A-C][01]$/.test(edge) && edge[1] === edge[3] && edge[0] !== edge[2]) {
    return "h";
  }
  // Vertical cross-street: letters same, digits differ
  if (/^[A-C][01][A-C][01]$/.test(edge) && edge[0] === edge[2] && edge[1] !== edge[3]) {
    return "v";
  }
  // Boundary stubs ending the arterials → horizontal
  if (/^[A-C][01](left|right)[01]$/.test(edge) || /^(left|right)[01][A-C][01]$/.test(edge)) {
    return "h";
  }
  // Boundary stubs ending the cross streets → vertical
  if (/^[A-C][01](top|bottom)[0-2]$/.test(edge) || /^(top|bottom)[0-2][A-C][01]$/.test(edge)) {
    return "v";
  }
  return null;
}

function isEastbound(edge: string): boolean {
  // Cars on edges that travel west→east. Detect by ordering of grid letters
  // or stub direction.
  if (/^[A-C][01][A-C][01]$/.test(edge)) return edge[0] < edge[2];        // e.g. A0B0
  if (/^[A-C][01]right[01]$/.test(edge)) return true;                      // C0 → right0
  if (/^left[01][A-C][01]$/.test(edge)) return true;                       // left0 → A0
  return false;
}

function isNorthbound(edge: string): boolean {
  if (/^[A-C][01][A-C][01]$/.test(edge)) return edge[1] < edge[3];        // A0A1 north
  if (/^[A-C][01]top[0-2]$/.test(edge)) return true;                       // A1 → top0
  if (/^bottom[0-2][A-C][01]$/.test(edge)) return true;                    // bottom0 → A0
  return false;
}

function vehicleToSvg(v: VehicleState): { x: number; y: number } {
  const i = v.lane_id.lastIndexOf("_");
  const edge = i >= 0 ? v.lane_id.slice(0, i) : v.lane_id;
  const lane = i >= 0 ? parseInt(v.lane_id.slice(i + 1), 10) : 0;

  // Internal junction edges (start with ':') and unknown edges fall back to
  // the linear world→SVG transform.
  if (edge.startsWith(":")) {
    return { x: toSvgX(v.x), y: toSvgY(v.y) };
  }

  const kind = classifyEdge(edge);
  const sx = toSvgX(v.x);
  const sy = toSvgY(v.y);

  if (kind === "h") {
    // Decide which arterial (top or bottom) by world y, then pick lane row
    // based on bound direction.
    const isTop = v.y > 750;        // top arterial centerline wy = 1000
    const eb = isEastbound(edge);
    const rows = isTop
      ? (eb ? TOP_E_BOUND_Y : TOP_W_BOUND_Y)
      : (eb ? BOT_E_BOUND_Y : BOT_W_BOUND_Y);
    return { x: sx, y: rows[Math.min(lane, rows.length - 1)] };
  }
  if (kind === "v") {
    // Decide which cross street by world x (round to nearest column centerline).
    // Column centres in world: A=500, B=1200, C=1900.
    const col = v.x < 850 ? 250 : v.x < 1550 ? 750 : 1250;
    const nb = isNorthbound(edge);
    const cols = nb ? nBoundX(col) : sBoundX(col);
    return { x: cols[Math.min(lane, cols.length - 1)], y: sy };
  }
  return { x: sx, y: sy };
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
            r={2.5}
            fill={String(v.type) === "emergency" ? "#ef4444" : "#3b82f6"}
            fillOpacity={0.78}
          />
        );
      })}
    </>
  );
}

interface Props {
  showHeat?: boolean;
}

export default function SumoGrid({ showHeat = true }: Props) {
  const intersections   = useTrafficStore((s) => s.intersections);
  const vehicles        = useTrafficStore((s) => s.vehicles);
  const activeEvRoutes  = useTrafficStore((s) => s.activeEvRoutes);

  const byId = new Map(intersections.map((i) => [i.id, i]));
  SUMO_IDS.forEach((id) => { if (!byId.has(id)) byId.set(id, makePlaceholder(id)); });

  // Column centres for cross streets (50 px wide).
  // Block x ranges between cross streets:
  //   left of A:   x = 0 … 225
  //   between A&B: x = 275 … 725
  //   between B&C: x = 775 … 1225
  //   right of C:  x = 1275 … 1500
  return (
    <>
      {/* City blocks — top row (y=0..230) and bottom row (y=495..600) */}
      <rect x={0}    y={0}   width={225} height={230} fill="#0d1421" />
      <rect x={275}  y={0}   width={450} height={230} fill="#0d1421" />
      <rect x={775}  y={0}   width={450} height={230} fill="#0d1421" />
      <rect x={1275} y={0}   width={225} height={230} fill="#0d1421" />
      <rect x={0}    y={495} width={225} height={105} fill="#0d1421" />
      <rect x={275}  y={495} width={450} height={105} fill="#0d1421" />
      <rect x={775}  y={495} width={450} height={105} fill="#0d1421" />
      <rect x={1275} y={495} width={225} height={105} fill="#0d1421" />
      {/* City blocks — between arterials (y=310..415) */}
      <rect x={0}    y={310} width={225} height={105} fill="#0d1421" />
      <rect x={275}  y={310} width={450} height={105} fill="#0d1421" />
      <rect x={775}  y={310} width={450} height={105} fill="#0d1421" />
      <rect x={1275} y={310} width={225} height={105} fill="#0d1421" />

      {/* Building footprints (decorative). Scattered across the four top
          city blocks and the bottom row. */}
      {[
        // Top-left block (0..225)
        [25,20,70,40],[110,30,55,28],[20,75,80,30],[105,80,70,32],[25,125,80,40],[120,125,55,30],[25,175,90,40],
        // Top-mid-left block (275..725)
        [290,20,90,35],[395,25,75,30],[490,30,65,35],[580,20,80,40],[660,25,55,30],
        [290,75,75,40],[380,80,90,32],[485,85,75,40],[580,75,85,35],[675,80,40,30],
        [290,135,85,45],[390,140,75,35],[480,135,90,40],[585,140,75,35],[680,140,35,40],
        // Top-mid-right block (775..1225)
        [790,20,75,40],[880,25,65,30],[955,30,90,32],[1060,20,75,38],[1145,25,70,32],
        [790,80,70,35],[875,80,90,30],[975,85,70,32],[1060,80,80,40],[1150,85,60,30],
        [790,140,90,42],[890,135,75,38],[975,140,85,35],[1070,140,70,36],[1150,140,65,40],
        // Top-right block (1275..1500)
        [1290,20,75,40],[1375,25,65,30],[1450,30,40,32],[1290,75,80,32],[1380,80,60,35],
        [1290,130,90,40],[1390,135,70,35],
      ].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill="#0f1a2e" rx={2} />
      ))}

      {/* Roads — horizontal arterials (3 lanes per direction). 80 px tall. */}
      <rect x={0} y={230} width={1500} height={80} fill="#111d2e" />
      <rect x={0} y={415} width={1500} height={80} fill="#111d2e" />

      {/* Roads — vertical cross streets (2 lanes per direction). 50 px wide. */}
      <rect x={225}  y={0} width={50} height={600} fill="#111d2e" />
      <rect x={725}  y={0} width={50} height={600} fill="#111d2e" />
      <rect x={1225} y={0} width={50} height={600} fill="#111d2e" />

      {/* Heatmap layer — overlaid on roads, under lane dashes */}
      {showHeat && <HeatLayer />}

      {/* Horizontal arterial lane markings — top arterial center y=270.
          Dashed at y=247, 258 (W-bound); double-stripe median at y=270;
          dashed at y=282, 293 (E-bound). Skip the 50 px-wide intersection
          windows centred on x = 250, 750, 1250. */}
      {[247, 258, 282, 293].map((y) => (
        <g key={`tdash-${y}`}>
          <line x1={0}    y1={y} x2={225}  y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={275}  y1={y} x2={725}  y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={775}  y1={y} x2={1225} y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={1275} y1={y} x2={1500} y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
        </g>
      ))}
      {[268.5, 271.5].map((y) => (
        <g key={`tmed-${y}`}>
          <line x1={0}    y1={y} x2={225}  y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={275}  y1={y} x2={725}  y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={775}  y1={y} x2={1225} y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={1275} y1={y} x2={1500} y2={y} stroke="#3a5a82" strokeWidth={1.0} />
        </g>
      ))}
      {/* Bottom arterial — center y=455. */}
      {[432, 443, 467, 478].map((y) => (
        <g key={`bdash-${y}`}>
          <line x1={0}    y1={y} x2={225}  y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={275}  y1={y} x2={725}  y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={775}  y1={y} x2={1225} y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={1275} y1={y} x2={1500} y2={y} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
        </g>
      ))}
      {[453.5, 456.5].map((y) => (
        <g key={`bmed-${y}`}>
          <line x1={0}    y1={y} x2={225}  y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={275}  y1={y} x2={725}  y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={775}  y1={y} x2={1225} y2={y} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={1275} y1={y} x2={1500} y2={y} stroke="#3a5a82" strokeWidth={1.0} />
        </g>
      ))}

      {/* Vertical cross-street lane markings — 2 lanes per direction.
          Centres x = 250 / 750 / 1250. Skip intersection windows at y=230..310 and y=415..495. */}
      {[
        [237, 250, 263, 0, 230], [237, 250, 263, 310, 415], [237, 250, 263, 495, 600],
        [737, 750, 763, 0, 230], [737, 750, 763, 310, 415], [737, 750, 763, 495, 600],
        [1237, 1250, 1263, 0, 230], [1237, 1250, 1263, 310, 415], [1237, 1250, 1263, 495, 600],
      ].map(([xL, xC, xR, y1, y2], i) => (
        <g key={`vert-${i}`}>
          <line x1={xL} y1={y1} x2={xL} y2={y2} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={xR} y1={y1} x2={xR} y2={y2} stroke="#1e3048" strokeWidth={1.2} strokeDasharray="18 12" />
          <line x1={xC - 1.5} y1={y1} x2={xC - 1.5} y2={y2} stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={xC + 1.5} y1={y1} x2={xC + 1.5} y2={y2} stroke="#3a5a82" strokeWidth={1.0} />
        </g>
      ))}

      {/* Emergency vehicle route lines */}
      {activeEvRoutes.map((route, ri) =>
        route.slice(0, -1).map((fromId, si) => {
          const toId = route[si + 1];
          const from = NODE_POS[fromId];
          const to   = NODE_POS[toId];
          if (!from || !to) return null;
          return (
            <line
              key={`ev-route-${ri}-${si}`}
              x1={from.cx} y1={from.cy}
              x2={to.cx}   y2={to.cy}
              stroke="#ef4444"
              strokeWidth={3}
              strokeDasharray="8 4"
              opacity={0.85}
            />
          );
        })
      )}

      {/* Vehicle dots */}
      <VehicleDots vehicles={vehicles} />

      {/* Intersection nodes */}
      {SUMO_IDS.map((id) => {
        const pos = NODE_POS[id];
        const it  = byId.get(id)!;
        return <IntersectionNode key={id} intersection={it} cx={pos.cx} cy={pos.cy} />;
      })}
    </>
  );
}

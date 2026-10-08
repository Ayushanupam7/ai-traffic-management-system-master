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

function VehicleDots({ vehicles, isDay }: { vehicles: VehicleState[]; isDay: boolean }) {
  if (vehicles.length > 1500) return null;
  return (
    <g id="vehicle-layer">
      {vehicles.map((v) => {
        const { x, y } = vehicleToSvg(v);
        const isEv = String(v.type) === "emergency" || v.id.toLowerCase().includes("emergency");
        if (isEv) {
          return (
            <g key={v.id}>
              {/* Emergency Beacon Glow */}
              <circle cx={x} cy={y} r={8} fill="#ef4444" fillOpacity={0.25} />
              <circle
                cx={x}
                cy={y}
                r={6}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
              <circle
                cx={x}
                cy={y}
                r={4}
                fill="#dc2626"
                stroke="#ffffff"
                strokeWidth={1.2}
              />
              <circle cx={x} cy={y} r={1.5} fill="#ffffff" />
            </g>
          );
        }
        return (
          <circle
            key={v.id}
            cx={x}
            cy={y}
            r={3.2}
            fill="#3b82f6"
            stroke={isDay ? "#ffffff" : "#0f172a"}
            strokeWidth={0.8}
            fillOpacity={0.95}
          />
        );
      })}
    </g>
  );
}

interface Props {
  showHeat?: boolean;
}

export default function SumoGrid({ showHeat = true }: Props) {
  const intersections  = useTrafficStore((s) => s.intersections);
  const vehicles       = useTrafficStore((s) => s.vehicles);
  const activeEvRoutes = useTrafficStore((s) => s.activeEvRoutes);
  const themeMode      = useTrafficStore((s) => s.themeMode);
  const isDay          = themeMode === "day";

  // Cartographic Theme Palette
  const blockFill       = isDay ? "#f8fafc" : "#0b1220";
  const blockStroke     = isDay ? "#e2e8f0" : "#16233b";
  const bldgFill        = isDay ? "#ffffff" : "#0f1a2e";
  const bldgStroke      = isDay ? "#cbd5e1" : "#1e2e4a";
  const parkFill        = isDay ? "#e6f8ee" : "#06231c";
  const parkStroke      = isDay ? "#bbf7d0" : "#0c4538";
  const treeFill        = isDay ? "#86efac" : "#105a45";
  const sidewalkFill    = isDay ? "#e2e8f0" : "#131f33";
  const curbStroke      = isDay ? "#cbd5e1" : "#1e2f4a";
  const roadFill        = isDay ? "#1e293b" : "#0c1524";
  const dashStroke      = isDay ? "#ffffff" : "#38bdf8";
  const medStroke       = isDay ? "#f59e0b" : "#fbbf24";
  const crosswalkStroke = isDay ? "rgba(255,255,255,0.88)" : "rgba(148,163,184,0.55)";
  const stopBarStroke   = isDay ? "rgba(255,255,255,0.95)" : "rgba(56,189,248,0.75)";

  const byId = new Map(intersections.map((i) => [i.id, i]));
  SUMO_IDS.forEach((id) => { if (!byId.has(id)) byId.set(id, makePlaceholder(id)); });

  // Cross street centres: 250, 750, 1250 (50 px road + 8 px sidewalks = 58 px total)
  return (
    <>
      <defs>
        <filter id="bldg-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity={isDay ? "0.07" : "0.35"} />
        </filter>
      </defs>

      {/* ── 1. City Blocks with Paved Borders ── */}
      {/* Top row (y=4..220) */}
      <rect x={4}    y={4}   width={213} height={218} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={283}  y={4}   width={434} height={218} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={783}  y={4}   width={434} height={218} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={1283} y={4}   width={213} height={218} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />

      {/* Middle row — between arterials (y=316..404) */}
      <rect x={4}    y={316} width={213} height={89} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={283}  y={316} width={434} height={89} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={783}  y={316} width={434} height={89} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={1283} y={316} width={213} height={89} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />

      {/* Bottom row (y=501..596) */}
      <rect x={4}    y={501} width={213} height={95} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={283}  y={501} width={434} height={95} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={783}  y={501} width={434} height={95} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />
      <rect x={1283} y={501} width={213} height={95} rx={8} fill={blockFill} stroke={blockStroke} strokeWidth={1.5} />

      {/* ── 2. Landscaped Urban Green Parks & Gardens ── */}
      {/* Central North Park */}
      <g id="urban-park-north">
        <rect x={300} y={20} width={180} height={85} rx={6} fill={parkFill} stroke={parkStroke} strokeWidth={1.2} />
        {/* Decorative Park Paths */}
        <line x1={300} y1={62} x2={480} y2={62} stroke={parkStroke} strokeWidth={1} strokeDasharray="4 3" />
        <line x1={390} y1={20} x2={390} y2={105} stroke={parkStroke} strokeWidth={1} strokeDasharray="4 3" />
        <circle cx={390} cy={62} r={8} fill={parkStroke} fillOpacity={0.6} />
        <circle cx={390} cy={62} r={4} fill={isDay ? "#60a5fa" : "#3b82f6"} />
        {/* Tree Canopies */}
        {[
          [320, 38], [340, 42], [360, 36], [420, 38], [445, 42], [465, 36],
          [320, 85], [345, 88], [365, 82], [420, 86], [445, 82], [465, 86],
        ].map(([tx, ty], i) => (
          <circle key={i} cx={tx} cy={ty} r={5.5} fill={treeFill} />
        ))}
      </g>

      {/* Central South Plaza & Gardens */}
      <g id="urban-park-south">
        <rect x={800} y={514} width={190} height={70} rx={6} fill={parkFill} stroke={parkStroke} strokeWidth={1.2} />
        <line x1={800} y1={549} x2={990} y2={549} stroke={parkStroke} strokeWidth={1} strokeDasharray="4 3" />
        {[
          [825, 532], [855, 532], [935, 532], [965, 532],
          [825, 566], [855, 566], [935, 566], [965, 566],
        ].map(([tx, ty], i) => (
          <circle key={i} cx={tx} cy={ty} r={5} fill={treeFill} />
        ))}
      </g>

      {/* ── 3. Architectural Building Footprints ── */}
      {[
        // Top-left block (0..225)
        [25,20,70,40],[110,30,55,28],[20,75,80,30],[105,80,70,32],[25,125,80,40],[120,125,55,30],[25,175,90,35],
        // Top-mid-left block (remaining buildings around park)
        [500,20,90,38],[605,25,95,35],
        [495,75,85,38],[595,75,105,38],
        [295,135,90,45],[395,140,85,40],[490,135,95,42],[595,140,105,40],
        // Top-mid-right block (775..1225)
        [795,20,80,40],[885,25,75,32],[970,30,95,32],[1075,20,80,38],[1165,25,45,32],
        [795,80,75,35],[880,80,95,30],[985,85,75,32],[1070,80,85,40],[1165,85,45,30],
        [795,140,95,42],[900,135,80,38],[990,140,90,35],[1090,140,75,36],[1175,140,35,40],
        // Top-right block (1275..1500)
        [1295,20,75,40],[1380,25,65,30],[1455,30,35,32],[1295,75,80,32],[1385,80,60,35],
        [1295,130,90,40],[1395,135,70,35],
        // Mid-left block (between arterials)
        [25,326,80,32],[115,326,75,32],[25,368,90,30],[125,368,65,30],
        // Mid-central block
        [295,326,95,32],[400,326,90,32],[500,326,95,32],[605,326,95,32],
        [295,368,90,30],[395,368,95,30],[500,368,90,30],[600,368,100,30],
        // Mid-east block
        [795,326,95,32],[900,326,90,32],[1000,326,95,32],[1105,326,95,32],
        [795,368,90,30],[895,368,95,30],[1000,368,90,30],[1100,368,100,30],
        // Mid-right block
        [1295,326,85,32],[1390,326,80,32],[1295,368,95,30],[1400,368,70,30],
        // Bottom blocks
        [25,515,80,35],[115,515,70,35],[25,560,90,30],[125,560,60,30],
        [295,515,95,35],[400,515,90,35],[500,515,95,35],[605,515,95,35],
        [295,560,90,30],[395,560,95,30],[500,560,90,30],[600,560,100,30],
        [1000,515,95,35],[1105,515,95,35],[1000,560,90,30],[1100,560,100,30],
        [1295,515,85,35],[1390,515,80,35],[1295,560,95,30],[1400,560,70,30],
      ].map(([x, y, w, h], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={bldgFill}
          stroke={bldgStroke}
          strokeWidth={1}
          rx={4}
          filter="url(#bldg-shadow)"
        />
      ))}

      {/* ── 4. Architectural Sidewalks / Curbs Layer ── */}
      {/* Horizontal arterial sidewalks (88 px tall, extending 4px north and south) */}
      <rect x={0} y={226} width={1500} height={88} fill={sidewalkFill} stroke={curbStroke} strokeWidth={1} />
      <rect x={0} y={411} width={1500} height={88} fill={sidewalkFill} stroke={curbStroke} strokeWidth={1} />

      {/* Vertical cross-street sidewalks (58 px wide, extending 4px west and east) */}
      <rect x={221}  y={0} width={58} height={600} fill={sidewalkFill} stroke={curbStroke} strokeWidth={1} />
      <rect x={721}  y={0} width={58} height={600} fill={sidewalkFill} stroke={curbStroke} strokeWidth={1} />
      <rect x={1221} y={0} width={58} height={600} fill={sidewalkFill} stroke={curbStroke} strokeWidth={1} />

      {/* ── 5. Road Asphalt Layer ── */}
      {/* Horizontal arterials (80 px tall) */}
      <rect x={0} y={230} width={1500} height={80} fill={roadFill} />
      <rect x={0} y={415} width={1500} height={80} fill={roadFill} />

      {/* Vertical cross streets (50 px wide) */}
      <rect x={225}  y={0} width={50} height={600} fill={roadFill} />
      <rect x={725}  y={0} width={50} height={600} fill={roadFill} />
      <rect x={1225} y={0} width={50} height={600} fill={roadFill} />

      {/* ── 6. Heatmap Layer (overlaid on road asphalt) ── */}
      {showHeat && <HeatLayer />}

      {/* ── 7. Pedestrian Crosswalks (Zebra Stripes) & Stop Bars ── */}
      {[
        { cx: 250, cy: 270 }, { cx: 750, cy: 270 }, { cx: 1250, cy: 270 },
        { cx: 250, cy: 455 }, { cx: 750, cy: 455 }, { cx: 1250, cy: 455 },
      ].map(({ cx, cy }, i) => (
        <g key={`crosswalk-${i}`}>
          {/* West & East Crosswalks across the 80px arterial */}
          <line x1={cx - 31} y1={cy - 38} x2={cx - 31} y2={cy + 38} stroke={crosswalkStroke} strokeWidth={3.5} strokeDasharray="4 3" />
          <line x1={cx + 31} y1={cy - 38} x2={cx + 31} y2={cy + 38} stroke={crosswalkStroke} strokeWidth={3.5} strokeDasharray="4 3" />
          {/* North & South Crosswalks across the 50px cross street */}
          <line x1={cx - 23} y1={cy - 44} x2={cx + 23} y2={cy - 44} stroke={crosswalkStroke} strokeWidth={3.5} strokeDasharray="4 3" />
          <line x1={cx - 23} y1={cy + 44} x2={cx + 23} y2={cy + 44} stroke={crosswalkStroke} strokeWidth={3.5} strokeDasharray="4 3" />

          {/* Stop Bars (Solid white lines before crosswalks) */}
          <line x1={cx - 37} y1={cy - 38} x2={cx - 37} y2={cy + 38} stroke={stopBarStroke} strokeWidth={1.8} />
          <line x1={cx + 37} y1={cy - 38} x2={cx + 37} y2={cy + 38} stroke={stopBarStroke} strokeWidth={1.8} />
          <line x1={cx - 23} y1={cy - 49} x2={cx + 23} y2={cy - 49} stroke={stopBarStroke} strokeWidth={1.8} />
          <line x1={cx - 23} y1={cy + 49} x2={cx + 23} y2={cy + 49} stroke={stopBarStroke} strokeWidth={1.8} />
        </g>
      ))}

      {/* ── 8. Arterial Lane Markings ── */}
      {/* Upper arterial — centre y=270 */}
      {[247, 258, 282, 293].map((y) => (
        <g key={`tdash-${y}`}>
          <line x1={0}    y1={y} x2={218}  y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={282}  y1={y} x2={718}  y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={782}  y1={y} x2={1218} y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={1282} y1={y} x2={1500} y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
        </g>
      ))}
      {[268.5, 271.5].map((y) => (
        <g key={`tmed-${y}`}>
          <line x1={0}    y1={y} x2={218}  y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={282}  y1={y} x2={718}  y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={782}  y1={y} x2={1218} y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={1282} y1={y} x2={1500} y2={y} stroke={medStroke} strokeWidth={1.2} />
        </g>
      ))}

      {/* Lower arterial — centre y=455 */}
      {[432, 443, 467, 478].map((y) => (
        <g key={`bdash-${y}`}>
          <line x1={0}    y1={y} x2={218}  y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={282}  y1={y} x2={718}  y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={782}  y1={y} x2={1218} y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={1282} y1={y} x2={1500} y2={y} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
        </g>
      ))}
      {[453.5, 456.5].map((y) => (
        <g key={`bmed-${y}`}>
          <line x1={0}    y1={y} x2={218}  y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={282}  y1={y} x2={718}  y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={782}  y1={y} x2={1218} y2={y} stroke={medStroke} strokeWidth={1.2} />
          <line x1={1282} y1={y} x2={1500} y2={y} stroke={medStroke} strokeWidth={1.2} />
        </g>
      ))}

      {/* ── 9. Vertical Cross-Street Lane Markings ── */}
      {[
        [237, 250, 263, 0, 222], [237, 250, 263, 318, 407], [237, 250, 263, 503, 600],
        [737, 750, 763, 0, 222], [737, 750, 763, 318, 407], [737, 750, 763, 503, 600],
        [1237, 1250, 1263, 0, 222], [1237, 1250, 1263, 318, 407], [1237, 1250, 1263, 503, 600],
      ].map(([xL, xC, xR, y1, y2], i) => (
        <g key={`vert-${i}`}>
          <line x1={xL} y1={y1} x2={xL} y2={y2} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={xR} y1={y1} x2={xR} y2={y2} stroke={dashStroke} strokeWidth={1.4} strokeDasharray="16 12" />
          <line x1={xC - 1.5} y1={y1} x2={xC - 1.5} y2={y2} stroke={medStroke} strokeWidth={1.2} />
          <line x1={xC + 1.5} y1={y1} x2={xC + 1.5} y2={y2} stroke={medStroke} strokeWidth={1.2} />
        </g>
      ))}

      {/* ── 10. Emergency Vehicle Priority Route Lines ── */}
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
              strokeWidth={3.5}
              strokeDasharray="8 4"
              opacity={0.9}
            />
          );
        })
      )}

      {/* ── 11. Vehicle Dots ── */}
      <VehicleDots vehicles={vehicles} isDay={isDay} />

      {/* ── 12. Intersection Nodes ── */}
      {SUMO_IDS.map((id) => {
        const pos = NODE_POS[id];
        const it  = byId.get(id)!;
        return <IntersectionNode key={id} intersection={it} cx={pos.cx} cy={pos.cy} />;
      })}
    </>
  );
}

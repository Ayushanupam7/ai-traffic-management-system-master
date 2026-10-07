"use client";

import { useTrafficStore } from "@/store/trafficStore";
import type { IntersectionState, VehicleState } from "@/lib/types";
import IntersectionNode from "./IntersectionNode";

// =====================================================================
// World coords (post-netconvert shift). World span ≈ 5700 × 1500.
// SVG viewBox is 2500 × 700 (set by StreetMap when network=combined).
// =====================================================================
const WORLD_W = 5700;
const WORLD_H = 1500;
const SVG_W   = 2500;
const SVG_H   = 700;
const SX      = SVG_W / WORLD_W;       // ≈ 0.439
const SY      = SVG_H / WORLD_H;       // ≈ 0.467
const wx = (x: number) => x * SX;
const wy = (y: number) => SVG_H - y * SY;

// Network landmarks (in SUMO world y, after netconvert shift).
const HWY_E_Y   = 1000;
const HWY_W_Y   =  500;
const HWY_X_OUT = 3000;
const GRID_LEFT = 3300;
const GRID_RIGHT= 5700;
const A_X       = 3800;
const B_X       = 4500;
const C_X       = 5200;

// Meter junction positions (matching the colinear-merge generator).
const E1_X = 1175, SVC_E1_X =  825;
const E2_X = 2175, SVC_E2_X = 1825;
const W1_X = 1825, SVC_W1_X = 2175;
const W2_X =  825, SVC_W2_X = 1175;

// =====================================================================
// Visual layout — band positions are hand-tuned for clarity (NOT a strict
// world-coord transform). Vehicles are still placed via wx/wy so they
// naturally land on the bands because the bands are centered at the same
// svg-y the transform produces for world y = HWY_E_Y / HWY_W_Y.
// =====================================================================
const E_BAND_CY   = wy(HWY_E_Y);   // ≈ 233 — E-bound corridor centerline
const W_BAND_CY   = wy(HWY_W_Y);   // ≈ 467 — W-bound corridor centerline
const BAND_H      = 50;             // tall enough to read svc + hwy as one stripe
const E_BAND_TOP  = E_BAND_CY - BAND_H / 2;   // 208
const W_BAND_TOP  = W_BAND_CY - BAND_H / 2;   // 442

// Cross-street geometry (only relevant in the grid portion).
const CROSS_W       = 36;
const CROSS_HALF    = CROSS_W / 2;
const COL_CENTRES   = [A_X, B_X, C_X];
const CROSS_X_LEFT  = (x: number) => wx(x) - CROSS_HALF;

// =====================================================================
// Heat thresholds — same gradient as HighwayMeterMap / SumoGrid.
// =====================================================================
function heatColor(q: number): { fill: string; op: number } | null {
  if (q <= 0)   return null;
  if (q <= 4)   return { fill: "#22c55e", op: 0.10 };
  if (q <= 10)  return { fill: "#eab308", op: 0.18 };
  if (q <= 20)  return { fill: "#f97316", op: 0.28 };
  if (q <= 35)  return { fill: "#ef4444", op: 0.36 };
  return            { fill: "#ef4444", op: 0.48 };
}

// =====================================================================
// Vehicle dots — uses world transform directly. Skips dots when
// crowded enough that the SVG would choke (matches HighwayMeterMap).
// =====================================================================
function VehicleDots({ vehicles }: { vehicles: VehicleState[] }) {
  if (vehicles.length > 1500) return null;
  return (
    <>
      {vehicles.map((v) => {
        if (v.x < -100 || v.x > WORLD_W + 100) return null;
        if (v.y < -100 || v.y > WORLD_H + 100) return null;
        return (
          <circle
            key={v.id}
            cx={wx(v.x)} cy={wy(v.y)}
            r={2.4}
            fill={String(v.type) === "emergency" ? "#ef4444" : "#3b82f6"}
            fillOpacity={0.78}
          />
        );
      })}
    </>
  );
}

// =====================================================================
// Placeholder for an intersection not yet in the snapshot (first render).
// =====================================================================
function makePlaceholder(id: string): IntersectionState {
  return {
    id,
    signal_state: "rr",
    phase_index: 0,
    phase_remaining_s: 0,
    queue_lengths: { N: 0, E: 0, S: 0, W: 0 },
    vehicle_count: 0,
    avg_wait_s: 0,
  };
}

// =====================================================================
// Component
// =====================================================================
interface Props {
  showHeat: boolean;
}

const ALL_INTERSECTIONS = [
  "A0", "A1", "B0", "B1", "C0", "C1",   // arterial 3×2
  "E1", "E2", "W1", "W2",               // ramp meters
];

export default function CombinedMap({ showHeat }: Props) {
  const intersections = useTrafficStore((s) => s.intersections);
  const vehicles      = useTrafficStore((s) => s.vehicles);

  const byId = new Map(intersections.map((i) => [i.id, i]));
  ALL_INTERSECTIONS.forEach((id) => {
    if (!byId.has(id)) byId.set(id, makePlaceholder(id));
  });
  const at = (id: string) => byId.get(id)!;

  // Highway-side queue tint (matches HighwayMeterMap's effect).
  const eSvcQueue = Math.max(
    byId.get("E1")?.queue_lengths.W ?? 0,
    byId.get("E2")?.queue_lengths.W ?? 0,
  );
  const wSvcQueue = Math.max(
    byId.get("W1")?.queue_lengths.E ?? 0,
    byId.get("W2")?.queue_lengths.E ?? 0,
  );
  const eHeat = heatColor(eSvcQueue);
  const wHeat = heatColor(wSvcQueue);

  // Grid-side queue tint — overlay a faint band on each approach.
  const gridQ = (id: string): number => {
    const q = byId.get(id)?.queue_lengths;
    if (!q) return 0;
    return Math.max(q.N, q.S, q.E, q.W);
  };

  // SVG x coords for the meter centers + their service-road counterparts.
  const E1_SX = wx(SVC_E1_X), E2_SX = wx(SVC_E2_X);
  const W1_SX = wx(SVC_W1_X), W2_SX = wx(SVC_W2_X);

  return (
    <>
      {/* =========================================================
          1. Background — city blocks above, between, and below the
             two corridors.  Two layers: large dark band, then
             scattered "building footprint" rects on top.
          ========================================================= */}

      {/* Sky region above E-band (y=0..E_BAND_TOP) */}
      <rect x={0} y={0} width={SVG_W} height={E_BAND_TOP} fill="#0d1421" />
      {/* Median region between E-band and W-band */}
      <rect x={0} y={E_BAND_TOP + BAND_H} width={SVG_W}
            height={W_BAND_TOP - (E_BAND_TOP + BAND_H)} fill="#0d1421" />
      {/* Below W-band */}
      <rect x={0} y={W_BAND_TOP + BAND_H} width={SVG_W}
            height={SVG_H - (W_BAND_TOP + BAND_H)} fill="#0d1421" />

      {/* Scattered building footprints. Hand-placed to feel city-like
          without being literal. */}
      {[
        // Above E-band (sky region)
        [40,30,90,38],[160,40,60,32],[260,25,80,42],[380,35,55,28],
        [490,30,90,42],[620,40,65,30],[740,25,75,38],[840,35,55,32],
        [960,30,85,40],[1080,40,60,28],[1190,25,80,42],[1310,35,55,32],
        [1430,30,90,40],[1560,40,60,30],[1670,25,75,38],[1790,35,55,32],
        [1910,30,85,40],[2030,40,60,30],[2140,25,80,42],[2260,35,55,32],
        [40,85,80,42],[140,95,60,32],[240,80,90,48],[360,90,55,30],
        [480,85,85,38],[600,95,60,32],[710,80,90,42],[830,90,55,32],
        [960,85,80,42],[1060,95,60,32],[1170,80,90,48],[1290,90,55,30],
        [1410,85,85,38],[1530,95,60,32],[1640,80,90,42],[1760,90,55,32],
        [1900,85,80,42],[2020,95,60,32],[2130,80,90,48],[2250,90,55,30],
        // Below W-band (south)
        [40,520,90,38],[160,530,60,32],[260,515,80,42],[380,525,55,28],
        [490,520,90,42],[620,530,65,30],[740,515,75,38],[840,525,55,32],
        [960,520,85,40],[1080,530,60,28],[1190,515,80,42],[1310,525,55,32],
        [1430,520,90,40],[1560,530,60,30],[1670,515,75,38],[1790,525,55,32],
        [1910,520,85,40],[2030,530,60,30],[2140,515,80,42],[2260,525,55,32],
        [40,580,80,42],[140,590,60,32],[240,575,90,48],[360,585,55,30],
        [480,580,85,38],[600,590,60,32],[710,575,90,42],[830,585,55,32],
        [960,580,80,42],[1060,590,60,32],[1170,575,90,48],[1290,585,55,30],
        [1410,580,85,38],[1530,590,60,32],[1640,575,90,42],[1760,585,55,32],
        [1900,580,80,42],[2020,590,60,32],[2130,575,90,48],[2250,585,55,30],
        // Median between the two corridors (skip x ranges around cross-streets)
        [40,310,80,40],[140,320,60,32],[240,305,80,42],[340,315,55,28],
        [440,310,80,40],[540,320,60,32],[640,305,80,42],[740,315,55,28],
        [840,310,80,40],[940,320,60,32],[1040,305,80,42],[1140,315,55,28],
        [1240,310,80,40],[1340,320,60,32],[1440,305,80,42],
        // Median east half — gaps for cross streets A, B, C
        [1750,310,80,40],[1880,310,80,40],[2050,310,80,40],
        [1750,375,80,42],[1880,375,80,42],[2050,375,80,42],
        [1430,375,90,38],[1540,385,60,30],
      ].map(([x, y, w, h], i) => (
        <rect key={`bld-${i}`} x={x} y={y} width={w} height={h}
              fill="#0f1a2e" rx={2} />
      ))}

      {/* =========================================================
          2. Cross-streets — vertical bands at A, B, C (grid only)
             Drawn BEFORE the horizontal corridors so the corridors
             paint over the intersection windows.
          ========================================================= */}
      {COL_CENTRES.map((col) => (
        <rect key={`cross-${col}`}
              x={CROSS_X_LEFT(col)} y={0}
              width={CROSS_W} height={SVG_H}
              fill="#111d2e" />
      ))}

      {/* =========================================================
          3. Corridor asphalt bands — single continuous E-bound and
             W-bound bands spanning the whole map. The freeway,
             feeder, and arterial all share one band per direction
             so the visual flow is seamless.
          ========================================================= */}
      {/* E-bound (north) */}
      <rect x={0} y={E_BAND_TOP} width={SVG_W} height={BAND_H} fill="#101b2e" />
      {/* W-bound (south) */}
      <rect x={0} y={W_BAND_TOP} width={SVG_W} height={BAND_H} fill="#101b2e" />

      {/* Shoulder strips inside each band — separates highway (4 lane) area
          from the arterial (3 lane) area subtly. */}
      <rect x={0} y={E_BAND_TOP + BAND_H - 4} width={SVG_W} height={2} fill="#1a2740" />
      <rect x={0} y={E_BAND_TOP + 2}          width={SVG_W} height={2} fill="#1a2740" />
      <rect x={0} y={W_BAND_TOP + BAND_H - 4} width={SVG_W} height={2} fill="#1a2740" />
      <rect x={0} y={W_BAND_TOP + 2}          width={SVG_W} height={2} fill="#1a2740" />

      {/* Median strip between the two directions — wide center, dim color */}
      <rect x={0} y={E_BAND_TOP + BAND_H} width={SVG_W}
            height={W_BAND_TOP - (E_BAND_TOP + BAND_H)} fill="#0d1421" />

      {/* =========================================================
          4. Heat overlays — match HighwayMeterMap (svc queue tint)
             and SumoGrid (per-approach intensity).
          ========================================================= */}
      {showHeat && eHeat && (
        <rect x={0} y={E_BAND_TOP} width={wx(HWY_X_OUT)} height={BAND_H}
              fill={eHeat.fill} fillOpacity={eHeat.op} />
      )}
      {showHeat && wHeat && (
        <rect x={0} y={W_BAND_TOP} width={wx(HWY_X_OUT)} height={BAND_H}
              fill={wHeat.fill} fillOpacity={wHeat.op} />
      )}
      {/* Grid-side approach heat — small tint blocks on either side of
          each grid intersection so heavy queues are visible. */}
      {showHeat && (
        <>
          {(["A0","B0","C0"] as const).map((id) => {
            const xC = id === "A0" ? A_X : id === "B0" ? B_X : C_X;
            const h = heatColor(gridQ(id));
            if (!h) return null;
            return (
              <rect key={`h-${id}`}
                    x={wx(xC) - 80} y={W_BAND_TOP}
                    width={160} height={BAND_H}
                    fill={h.fill} fillOpacity={h.op} />
            );
          })}
          {(["A1","B1","C1"] as const).map((id) => {
            const xC = id === "A1" ? A_X : id === "B1" ? B_X : C_X;
            const h = heatColor(gridQ(id));
            if (!h) return null;
            return (
              <rect key={`h-${id}`}
                    x={wx(xC) - 80} y={E_BAND_TOP}
                    width={160} height={BAND_H}
                    fill={h.fill} fillOpacity={h.op} />
            );
          })}
        </>
      )}

      {/* =========================================================
          5. Lane markings — 3 interior dashes per direction on the
             freeway / arterial bands.
          ========================================================= */}
      {[E_BAND_CY - 14, E_BAND_CY, E_BAND_CY + 14].map((y, i) => (
        <line key={`elE-${i}`} x1={0} y1={y} x2={SVG_W} y2={y}
              stroke="#1e3048" strokeWidth={1.0} strokeDasharray="16 12" />
      ))}
      {[W_BAND_CY - 14, W_BAND_CY, W_BAND_CY + 14].map((y, i) => (
        <line key={`elW-${i}`} x1={0} y1={y} x2={SVG_W} y2={y}
              stroke="#1e3048" strokeWidth={1.0} strokeDasharray="16 12" />
      ))}

      {/* Median accents on the ARTERIAL portion (east of the feeder).
          Two solid lines at ±1.5 px to mimic SumoGrid's double centerline. */}
      {([E_BAND_CY, W_BAND_CY] as const).map((cy, i) => (
        <g key={`med-${i}`}>
          <line x1={wx(GRID_LEFT)} y1={cy - 1.5} x2={SVG_W} y2={cy - 1.5}
                stroke="#3a5a82" strokeWidth={1.0} />
          <line x1={wx(GRID_LEFT)} y1={cy + 1.5} x2={SVG_W} y2={cy + 1.5}
                stroke="#3a5a82" strokeWidth={1.0} />
        </g>
      ))}

      {/* Cross-street lane markings — 2 outer dashes + paired median */}
      {COL_CENTRES.map((col) => {
        const xC = wx(col);
        return (
          <g key={`vdash-${col}`}>
            <line x1={xC - CROSS_HALF + 8} y1={0} x2={xC - CROSS_HALF + 8} y2={SVG_H}
                  stroke="#1e3048" strokeWidth={1.0} strokeDasharray="18 12" />
            <line x1={xC + CROSS_HALF - 8} y1={0} x2={xC + CROSS_HALF - 8} y2={SVG_H}
                  stroke="#1e3048" strokeWidth={1.0} strokeDasharray="18 12" />
            <line x1={xC - 1.5} y1={0} x2={xC - 1.5} y2={SVG_H}
                  stroke="#3a5a82" strokeWidth={1.0} />
            <line x1={xC + 1.5} y1={0} x2={xC + 1.5} y2={SVG_H}
                  stroke="#3a5a82" strokeWidth={1.0} />
          </g>
        );
      })}

      {/* =========================================================
          6. Merge ramps — 2-layer diagonals svc → hwy. Each ramp
             starts at the service-road junction (top edge of the
             E-band or bottom edge of the W-band) and angles to the
             highway lane (middle of the band).
          ========================================================= */}
      {[
        [E1_SX, E_BAND_TOP + 8,  wx(E1_X), E_BAND_CY + 10],   // E1 (svc top → hwy lane)
        [E2_SX, E_BAND_TOP + 8,  wx(E2_X), E_BAND_CY + 10],   // E2
        [W1_SX, W_BAND_TOP + BAND_H - 8, wx(W1_X), W_BAND_CY - 10], // W1
        [W2_SX, W_BAND_TOP + BAND_H - 8, wx(W2_X), W_BAND_CY - 10], // W2
      ].map(([x1, y1, x2, y2], i) => (
        <g key={`ramp-${i}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#111d2e" strokeWidth={6} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#1e3048" strokeWidth={1.0} strokeDasharray="6 5" />
        </g>
      ))}

      {/* =========================================================
          7. Direction labels — monospace, dim
          ========================================================= */}
      <text x={20}   y={E_BAND_TOP - 8}  fill="#3b4a6b" fontSize={11} fontFamily="monospace">
        ▶▶ E-bound freeway · 4 lanes · 100 km/h
      </text>
      <text x={1660} y={E_BAND_TOP - 8}  fill="#3b4a6b" fontSize={10} fontFamily="monospace">
        ▶ E-arterial · 3 lanes · 20 km/h
      </text>
      <text x={20}   y={W_BAND_TOP + BAND_H + 18} fill="#3b4a6b" fontSize={11} fontFamily="monospace">
        ◀◀ W-bound freeway · 4 lanes · 100 km/h
      </text>
      <text x={1660} y={W_BAND_TOP + BAND_H + 18} fill="#3b4a6b" fontSize={10} fontFamily="monospace">
        ◀ W-arterial · 3 lanes · 20 km/h
      </text>
      {/* Section markers */}
      <text x={wx(1500)}      y={20} textAnchor="middle"
            fill="#52606d" fontSize={10} fontFamily="monospace" letterSpacing={2}>
        FREEWAY CORRIDOR · 3 km · 4 lanes
      </text>
      <text x={wx((GRID_LEFT+GRID_RIGHT)/2)} y={20} textAnchor="middle"
            fill="#52606d" fontSize={10} fontFamily="monospace" letterSpacing={2}>
        3×2 ARTERIAL GRID
      </text>

      {/* =========================================================
          8. Vehicles
          ========================================================= */}
      <VehicleDots vehicles={vehicles} />

      {/* =========================================================
          9. Intersection nodes — 6 grid signals + 4 meters
          ========================================================= */}
      {/* Arterial 3×2 grid */}
      <IntersectionNode intersection={at("A1")} cx={wx(A_X)} cy={E_BAND_CY} />
      <IntersectionNode intersection={at("B1")} cx={wx(B_X)} cy={E_BAND_CY} />
      <IntersectionNode intersection={at("C1")} cx={wx(C_X)} cy={E_BAND_CY} />
      <IntersectionNode intersection={at("A0")} cx={wx(A_X)} cy={W_BAND_CY} />
      <IntersectionNode intersection={at("B0")} cx={wx(B_X)} cy={W_BAND_CY} />
      <IntersectionNode intersection={at("C0")} cx={wx(C_X)} cy={W_BAND_CY} />
      {/* Meters — sit on the service-road side of each merge */}
      <IntersectionNode intersection={at("E1")} cx={E1_SX} cy={E_BAND_TOP + 8} />
      <IntersectionNode intersection={at("E2")} cx={E2_SX} cy={E_BAND_TOP + 8} />
      <IntersectionNode intersection={at("W1")} cx={W1_SX} cy={W_BAND_TOP + BAND_H - 8} />
      <IntersectionNode intersection={at("W2")} cx={W2_SX} cy={W_BAND_TOP + BAND_H - 8} />
    </>
  );
}

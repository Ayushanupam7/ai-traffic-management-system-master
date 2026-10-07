"use client";

import { useEffect, useRef, useState } from "react";
import { api, cameraStreamUrl } from "@/lib/api";

type Pt = [number, number];
interface Lane { id: string; polygon: Pt[]; }
interface Line { id: string; points: [Pt, Pt]; }
type Mode = "lane" | "line";

interface Props {
  intersectionId: string;
  approach: "N" | "E" | "S" | "W";
  onClose: () => void;
}

/**
 * Draw lane polygons + red-light violation lines on top of a camera feed and
 * save them per (intersection, approach). Coordinates are stored in the camera's
 * native pixel space — the SVG viewBox is set to the frame's natural size, so
 * clicks map 1:1 to the pixels the vision analyzer's homography uses.
 *
 * Purely additive: this renders only when the user opens "Edit regions" in the
 * Cameras tab; it touches none of the existing camera-stream behaviour.
 */
export default function RegionEditor({ intersectionId, approach, onClose }: Props) {
  const [nativeW, setNativeW] = useState(640);
  const [nativeH, setNativeH] = useState(360);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<Mode>("lane");
  const [draft, setDraft] = useState<Pt[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load any previously-saved regions for this camera.
  useEffect(() => {
    let cancelled = false;
    api.getCameraRegions()
      .then((r) => {
        if (cancelled) return;
        const cam = (r as { regions?: Record<string, Record<string, { lanes?: Lane[]; forbidden_lines?: Line[] }>> })
          ?.regions?.[intersectionId]?.[approach];
        // Always reset to THIS camera's saved regions (empty if none) so a
        // previous camera's drawing never carries over to another camera.
        setLanes(cam?.lanes ?? []);
        setLines(cam?.forbidden_lines ?? []);
        setDraft([]);
      })
      .catch(() => { /* none yet */ });
    return () => { cancelled = true; };
  }, [intersectionId, approach]);

  // Convert a mouse event to native camera-pixel coords via the SVG CTM.
  const toNative = (e: React.MouseEvent): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const sp = svg.createSVGPoint();
    sp.x = e.clientX;
    sp.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = sp.matrixTransform(ctm.inverse());
    return [Math.round(p.x), Math.round(p.y)];
  };

  const onSvgClick = (e: React.MouseEvent) => {
    const p = toNative(e);
    if (!p) return;
    if (mode === "line") {
      const next: Pt[] = [...draft, p];
      if (next.length === 2) {
        setLines([...lines, { id: `line${lines.length + 1}`, points: [next[0], next[1]] }]);
        setDraft([]);
      } else {
        setDraft(next);
      }
    } else {
      setDraft([...draft, p]);
    }
  };

  const finishLane = () => {
    if (draft.length >= 3) setLanes([...lanes, { id: `lane${lanes.length + 1}`, polygon: draft }]);
    setDraft([]);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await api.saveCameraRegions({
        intersection_id: intersectionId,
        approach,
        lanes,
        forbidden_lines: lines,
      });
      setMsg("Saved");
    } catch {
      setMsg("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const btn = (active: boolean) =>
    `px-2 py-1 text-[10px] rounded-md border transition-colors ${
      active
        ? "bg-[#1e3a5f] border-blue-600 text-blue-200"
        : "bg-[#1f2937] border-gray-700 text-gray-400 hover:text-gray-200"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-gray-500 mr-1">Draw:</span>
        <button className={btn(mode === "lane")} onClick={() => { setMode("lane"); setDraft([]); }}>
          Lane (polygon)
        </button>
        <button className={btn(mode === "line")} onClick={() => { setMode("line"); setDraft([]); }}>
          Violation line
        </button>
        {mode === "lane" && (
          <button className={btn(false)} onClick={finishLane} disabled={draft.length < 3}>
            Close lane
          </button>
        )}
        <button className={btn(false)} onClick={() => setDraft(draft.slice(0, -1))} disabled={!draft.length}>
          Undo point
        </button>
        <button className={btn(false)} onClick={() => { setLanes([]); setLines([]); setDraft([]); }}>
          Clear all
        </button>
        <button className={btn(false)} onClick={onClose}>Done</button>
      </div>

      <div className="relative w-full bg-black border border-gray-800 rounded-lg overflow-hidden"
           style={{ aspectRatio: `${nativeW} / ${nativeH}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cameraStreamUrl(intersectionId, approach)}
          alt={`${intersectionId} ${approach}`}
          className="absolute inset-0 w-full h-full object-contain"
          onLoad={(e) => {
            const im = e.currentTarget;
            if (im.naturalWidth && im.naturalHeight) {
              setNativeW(im.naturalWidth);
              setNativeH(im.naturalHeight);
            }
          }}
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${nativeW} ${nativeH}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onClick={onSvgClick}
        >
          {lanes.map((l) => (
            <polygon key={l.id} points={l.polygon.map((p) => p.join(",")).join(" ")}
                     fill="rgba(80,80,255,0.18)" stroke="#6464ff" strokeWidth={2} />
          ))}
          {lines.map((l) => (
            <line key={l.id} x1={l.points[0][0]} y1={l.points[0][1]}
                  x2={l.points[1][0]} y2={l.points[1][1]} stroke="#ff3b3b" strokeWidth={3} />
          ))}
          {/* draft shape in progress */}
          {mode === "lane" && draft.length > 0 && (
            <polyline points={draft.map((p) => p.join(",")).join(" ")}
                      fill="none" stroke="#a5b4fc" strokeWidth={2} strokeDasharray="6 4" />
          )}
          {draft.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#fde047" />
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500
                     disabled:opacity-40 text-white font-medium"
        >
          {saving ? "Saving…" : "Save regions"}
        </button>
        <span className="text-[10px] text-gray-500">
          {lanes.length} lane(s), {lines.length} line(s)
          {msg ? ` · ${msg}` : ""}
        </span>
      </div>
    </div>
  );
}

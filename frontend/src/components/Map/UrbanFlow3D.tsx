"use client";

import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useTrafficStore } from "@/store/trafficStore";
import type { IntersectionState, VehicleState } from "@/lib/types";
import { api } from "@/lib/api";
import {
  Layers,
  Building,
  Navigation,
  Sun,
  Moon,
  Compass,
  AlertTriangle,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
  Zap,
  ChevronDown,
  ChevronUp,
  Sliders,
  ShieldAlert,
  Flame,
  Maximize2,
  Minimize2,
  Car,
  Crosshair,
  Video,
  X,
} from "lucide-react";

// ──────────────────────────────────────────────────────────────────
// CONSTANTS & COORDINATE SCALING
// SUMO World: X: 0..2400 (center 1200), Y: 0..1500 (center 750)
// Intersections:
//   A1: (500, 1000)   B1: (1200, 1000)   C1: (1900, 1000)
//   A0: (500, 500)    B0: (1200, 500)    C0: (1900, 500)
// ──────────────────────────────────────────────────────────────────
const WORLD_CX = 1200;
const WORLD_CY = 750;
const SCALE = 0.22; // 1 SUMO unit = 0.22 Three.js units

const toThreeX = (wx: number) => (wx - WORLD_CX) * SCALE;
const toThreeZ = (wy: number) => -(wy - WORLD_CY) * SCALE;

const INTERSECTIONS_INFO: Record<
  string,
  { wx: number; wy: number; x: number; z: number; name: string }
> = {
  A1: { wx: 500, wy: 1000, x: toThreeX(500), z: toThreeZ(1000), name: "A1 (West-North)" },
  B1: { wx: 1200, wy: 1000, x: toThreeX(1200), z: toThreeZ(1000), name: "B1 (Center-North)" },
  C1: { wx: 1900, wy: 1000, x: toThreeX(1900), z: toThreeZ(1000), name: "C1 (East-North)" },
  A0: { wx: 500, wy: 500, x: toThreeX(500), z: toThreeZ(500), name: "A0 (West-South)" },
  B0: { wx: 1200, wy: 500, x: toThreeX(1200), z: toThreeZ(500), name: "B0 (Chokepoint)" },
  C0: { wx: 1900, wy: 500, x: toThreeX(1900), z: toThreeZ(500), name: "C0 (East-South)" },
};

const ARTERIAL_WIDTH = 18;
const CROSS_STREET_WIDTH = 12;
const HALF_ROAD = ARTERIAL_WIDTH / 2;
const HALF_CROSS = CROSS_STREET_WIDTH / 2;

type CameraPreset = "perspective" | "isometric" | "topdown" | "chokepoint" | "ev";
type EvCamAngle = "chase" | "dash" | "drone";
type AmbienceMode = "cyber" | "sunset" | "daylight";

interface VisualizerSettings {
  showBuildings: boolean;
  showDetails: boolean;
  showVehicles: boolean;
  showHeadlights: boolean;
  showRoadAccess: boolean;
  showCongestion: boolean;
  showSpecialZones: boolean;
  showEvCorridor: boolean;
}

// ──────────────────────────────────────────────────────────────────
// SIGNAL ASPECT RESOLVER & 3D HEAD MATERIAL CONTROLLER
// ──────────────────────────────────────────────────────────────────
export type SignalAspect = "red" | "yellow" | "green";

export interface IntersectionSignalAspects {
  N: SignalAspect;
  E: SignalAspect;
  S: SignalAspect;
  W: SignalAspect;
  EW: SignalAspect;
  NS: SignalAspect;
}

export function getIntersectionAspects(inter: IntersectionState): IntersectionSignalAspects {
  const raw = (inter.signal_state || "").trim();
  const len = raw.length;

  const aspectFromChars = (chars: string): SignalAspect => {
    if (chars.includes("G") || chars.includes("g")) return "green";
    if (chars.includes("Y") || chars.includes("y") || chars.includes("u")) return "yellow";
    return "red";
  };

  let n: SignalAspect = "red";
  let e: SignalAspect = "red";
  let s: SignalAspect = "red";
  let w: SignalAspect = "red";

  if (len >= 18) {
    // 18-link arterial network: North (0..4), East (4..9), South (9..13), West (13..18)
    n = aspectFromChars(raw.slice(0, 4));
    e = aspectFromChars(raw.slice(4, 9));
    s = aspectFromChars(raw.slice(9, 13));
    w = aspectFromChars(raw.slice(13, 18));
  } else if (len >= 12) {
    n = aspectFromChars(raw.slice(0, 3));
    e = aspectFromChars(raw.slice(3, 6));
    s = aspectFromChars(raw.slice(6, 9));
    w = aspectFromChars(raw.slice(9, 12));
  } else if (len >= 8) {
    n = aspectFromChars(raw.slice(0, 2));
    e = aspectFromChars(raw.slice(2, 4));
    s = aspectFromChars(raw.slice(4, 6));
    w = aspectFromChars(raw.slice(6, 8));
  } else if (len >= 4) {
    n = aspectFromChars(raw.slice(0, 1));
    e = aspectFromChars(raw.slice(1, 2));
    s = aspectFromChars(raw.slice(2, 3));
    w = aspectFromChars(raw.slice(3, 4));
  } else {
    // 12-phase split-phase program (N -> E -> S -> W)
    const p = ((inter.phase_index % 12) + 12) % 12;
    if (p === 0) n = "green";
    else if (p === 1) n = "yellow";
    else if (p === 3) e = "green";
    else if (p === 4) e = "yellow";
    else if (p === 6) s = "green";
    else if (p === 7) s = "yellow";
    else if (p === 9) w = "green";
    else if (p === 10) w = "yellow";
  }

  // Combined EW and NS
  const ew: SignalAspect =
    e === "green" || w === "green" ? "green" :
    e === "yellow" || w === "yellow" ? "yellow" : "red";

  const ns: SignalAspect =
    n === "green" || s === "green" ? "green" :
    n === "yellow" || s === "yellow" ? "yellow" : "red";

  return { N: n, E: e, S: s, W: w, EW: ew, NS: ns };
}

export function applyAspectToHeadMats(
  mats: { red: THREE.MeshStandardMaterial[]; yellow: THREE.MeshStandardMaterial[]; green: THREE.MeshStandardMaterial[] } | undefined,
  aspect: SignalAspect
) {
  if (!mats) return;
  if (aspect === "green") {
    mats.green.forEach((m) => {
      m.color.setHex(0x10b981);
      m.emissive.setHex(0x10b981);
      m.emissiveIntensity = 3.6;
    });
    mats.yellow.forEach((m) => {
      m.color.setHex(0x2d1a04);
      m.emissive.setHex(0xf59e0b);
      m.emissiveIntensity = 0.05;
    });
    mats.red.forEach((m) => {
      m.color.setHex(0x2d0505);
      m.emissive.setHex(0xef4444);
      m.emissiveIntensity = 0.05;
    });
  } else if (aspect === "yellow") {
    mats.yellow.forEach((m) => {
      m.color.setHex(0xfbbf24);
      m.emissive.setHex(0xf59e0b);
      m.emissiveIntensity = 3.4;
    });
    mats.green.forEach((m) => {
      m.color.setHex(0x062810);
      m.emissive.setHex(0x10b981);
      m.emissiveIntensity = 0.05;
    });
    mats.red.forEach((m) => {
      m.color.setHex(0x2d0505);
      m.emissive.setHex(0xef4444);
      m.emissiveIntensity = 0.05;
    });
  } else {
    // Red
    mats.red.forEach((m) => {
      m.color.setHex(0xff3333);
      m.emissive.setHex(0xef4444);
      m.emissiveIntensity = 3.8;
    });
    mats.yellow.forEach((m) => {
      m.color.setHex(0x2d1a04);
      m.emissive.setHex(0xf59e0b);
      m.emissiveIntensity = 0.05;
    });
    mats.green.forEach((m) => {
      m.color.setHex(0x062810);
      m.emissive.setHex(0x10b981);
      m.emissiveIntensity = 0.05;
    });
  }
}

export default function UrbanFlow3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  // Store state
  const intersections = useTrafficStore((s) => s.intersections);
  const vehicles = useTrafficStore((s) => s.vehicles);
  const selectedIntersection = useTrafficStore((s) => s.selectedIntersection);
  const selectIntersection = useTrafficStore((s) => s.selectIntersection);
  const locateTrigger = useTrafficStore((s) => s.locateTrigger);
  const activeEvRoutes = useTrafficStore((s) => s.activeEvRoutes);
  const emergencyVehicles = useTrafficStore((s) => s.emergencyVehicles);
  const trackedEvId = useTrafficStore((s) => s.trackedEvId);
  const evCameraMode = useTrafficStore((s) => s.evCameraMode);
  const setTrackedEv = useTrafficStore((s) => s.setTrackedEv);
  const themeMode = useTrafficStore((s) => s.themeMode);
  const tick = useTrafficStore((s) => s.tick);

  const focusIntersection = useCallback((id: string) => {
    const info = INTERSECTIONS_INFO[id];
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!info || !camera || !controls) return;

    camera.position.set(info.x, 38, info.z + 55);
    controls.target.set(info.x, 0, info.z);
    controls.update();
  }, []);

  useEffect(() => {
    if (selectedIntersection) {
      focusIntersection(selectedIntersection);
    }
  }, [selectedIntersection, locateTrigger, focusIntersection]);

  // Local settings
  const [settings, setSettings] = useState<VisualizerSettings>({
    showBuildings: true,
    showDetails: true,
    showVehicles: true,
    showHeadlights: true,
    showRoadAccess: false,
    showCongestion: true,
    showSpecialZones: true,
    showEvCorridor: true,
  });

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("perspective");
  const [evCamAngle, setEvCamAngle] = useState<EvCamAngle>("chase");
  const [isSirenMuted, setIsSirenMuted] = useState<boolean>(true);
  const [ambience, setAmbience] = useState<AmbienceMode>("cyber");
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [showJuncList, setShowJuncList] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);

  // 3D Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Instanced Meshes for high-performance 60 FPS rendering across 5 vehicle types:
  // 1. Cars (Sedan/Coupe)
  const instancedCarsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedCabinsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedWheelsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedHeadlightsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedTaillightsRef = useRef<THREE.InstancedMesh | null>(null);

  // 2. Motorcycles
  const instancedMotosRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedMotoWheelsRef = useRef<THREE.InstancedMesh | null>(null);

  // 3. Buses
  const instancedBusesRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedBusGlassRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedBusWheelsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedBusSignsRef = useRef<THREE.InstancedMesh | null>(null);

  // 4. Trucks
  const instancedTruckCabsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedTruckCargoRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedTruckWheelsRef = useRef<THREE.InstancedMesh | null>(null);

  // 5. Auto-rickshaws (Tuk-Tuk 3-wheeler)
  const instancedRickshawBodyRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedRickshawCanopyRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedRickshawWheelsRef = useRef<THREE.InstancedMesh | null>(null);

  const dummyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const prevVehiclePosRef = useRef<Map<string, { x: number; z: number; rotY: number }>>(new Map());
  const vehicleLaneMapRef = useRef<Map<string, number>>(new Map());
  const vehicleKindMapRef = useRef<Map<string, "car" | "motorcycle" | "bus" | "truck" | "rickshaw">>(new Map());

  // Dedicated Emergency Vehicle actor
  const evGroupRef = useRef<THREE.Group | null>(null);
  const evStateRef = useRef<{ x: number; z: number; rotY: number; speed: number } | null>(null);

  // Groups
  const buildingGroupRef = useRef<THREE.Group | null>(null);
  const detailsGroupRef = useRef<THREE.Group | null>(null);
  const specialZonesGroupRef = useRef<THREE.Group | null>(null);
  const accessOverlayGroupRef = useRef<THREE.Group | null>(null);
  const congestionGroupRef = useRef<THREE.Group | null>(null);
  const evCorridorGroupRef = useRef<THREE.Group | null>(null);
  const stopBarsRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const trafficLightHeadsRef = useRef<
    Map<
      string,
      {
        red: THREE.MeshStandardMaterial[];
        yellow: THREE.MeshStandardMaterial[];
        green: THREE.MeshStandardMaterial[];
      }
    >
  >(new Map());
  const lightsRef = useRef<{ ambient: THREE.AmbientLight; dir: THREE.DirectionalLight; hemi: THREE.HemisphereLight } | null>(null);
  const groundMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const roadMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const curbMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const dashLineMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const wallMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const parkMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const roundaboutLawnMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const roundaboutApronMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const roundaboutCurbMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Active EV Vehicle resolution
  const activeEvVehicle = useMemo(() => {
    if (trackedEvId) {
      const found = vehicles.find((v) => v.id === trackedEvId);
      if (found) return found;
    }
    return vehicles.find(
      (v) => String(v.type) === "emergency" || v.id.toLowerCase().includes("emergency")
    );
  }, [vehicles, trackedEvId]);

  const isEvCamActive = Boolean(
    (evCameraMode && evCameraMode !== "none") ||
    (cameraPreset as string) === "ev" ||
    (activeEvVehicle && (cameraPreset as string) === "ev")
  );

  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const evCamAngleRef = useRef<EvCamAngle>(evCamAngle);
  const isEvCamActiveRef = useRef<boolean>(isEvCamActive);
  const themeModeRef = useRef<"day" | "night" | "sunset">(themeMode);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
  }, [cameraPreset]);
  useEffect(() => {
    evCamAngleRef.current = evCamAngle;
  }, [evCamAngle]);
  useEffect(() => {
    isEvCamActiveRef.current = isEvCamActive;
  }, [isEvCamActive]);
  useEffect(() => {
    themeModeRef.current = themeMode;
  }, [themeMode]);

  // Audio Siren Synth
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sirenOscRef = useRef<OscillatorNode | null>(null);

  // FPS tracking
  const frameCountRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(performance.now());

  // ──────────────────────────────────────────────────────────────────
  // AUDIO SIREN SYNTHESIZER
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isSirenMuted || !isEvCamActive || !activeEvVehicle) {
      if (sirenOscRef.current) {
        try {
          sirenOscRef.current.stop();
          sirenOscRef.current.disconnect();
        } catch { }
        sirenOscRef.current = null;
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.06, ctx.currentTime);

      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(650, now);
      for (let t = 0; t < 60; t += 1.2) {
        osc.frequency.linearRampToValueAtTime(920, now + t + 0.6);
        osc.frequency.linearRampToValueAtTime(650, now + t + 1.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      sirenOscRef.current = osc;
    } catch { }

    return () => {
      if (sirenOscRef.current) {
        try {
          sirenOscRef.current.stop();
          sirenOscRef.current.disconnect();
        } catch { }
        sirenOscRef.current = null;
      }
    };
  }, [isSirenMuted, isEvCamActive, activeEvVehicle]);

  // ──────────────────────────────────────────────────────────────────
  // INITIALIZE THREE.JS SCENE
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const isDay = themeModeRef.current === "day";

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDay ? 0xbfe0f7 : 0x0a0e17);
    scene.fog = new THREE.FogExp2(isDay ? 0xbfe0f7 : 0x0a0e17, isDay ? 0.0010 : 0.0022);
    sceneRef.current = scene;

    // 2. Camera: near = 0.1, far = 3000 to prevent any near-plane clipping when zooming close to vehicles
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
    camera.position.set(0, 140, 220);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDay ? 1.05 : 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Controls: optimal distance & polar limits so traffic is always visible from an elevated tactical angle
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.35; // ~76.6°: prevents camera from dropping down to flat asphalt level
    controls.minDistance = 14;              // Keeps camera at clear inspection distance so cars are always framed & visible
    controls.maxDistance = 600;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambient = new THREE.AmbientLight(isDay ? 0xffffff : 0x1e293b, isDay ? 1.7 : 1.3);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(
      isDay ? 0xbae6fd : 0x38bdf8,
      isDay ? 0x94a3b8 : 0x0f172a,
      isDay ? 1.1 : 0.7
    );
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(isDay ? 0xfffaed : 0x93c5fd, isDay ? 2.4 : 1.8);
    dir.position.set(isDay ? 120 : 100, isDay ? 240 : 220, isDay ? 100 : 120);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 10;
    dir.shadow.camera.far = 600;
    dir.shadow.camera.left = -220;
    dir.shadow.camera.right = 220;
    dir.shadow.camera.top = 220;
    dir.shadow.camera.bottom = -220;
    scene.add(dir);

    lightsRef.current = { ambient, dir, hemi };

    // 6. Layer Groups
    const buildingGroup = new THREE.Group();
    const detailsGroup = new THREE.Group();
    const specialZonesGroup = new THREE.Group();
    const accessOverlayGroup = new THREE.Group();
    const congestionGroup = new THREE.Group();
    const evCorridorGroup = new THREE.Group();

    scene.add(buildingGroup);
    scene.add(detailsGroup);
    scene.add(specialZonesGroup);
    scene.add(accessOverlayGroup);
    scene.add(congestionGroup);
    scene.add(evCorridorGroup);

    buildingGroupRef.current = buildingGroup;
    detailsGroupRef.current = detailsGroup;
    specialZonesGroupRef.current = specialZonesGroup;
    accessOverlayGroupRef.current = accessOverlayGroup;
    congestionGroupRef.current = congestionGroup;
    evCorridorGroupRef.current = evCorridorGroup;

    // ──────────────────────────────────────────────────────────────────
    // STATIC ROADS & ENVIRONMENT
    // ──────────────────────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(800, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0xe2e8f0 : 0x0c111a,
      roughness: 0.9,
    });
    groundMatRef.current = groundMat;
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(650, 65, 0x1f2937, 0x111827);
    gridHelper.position.y = -0.15;
    gridHelper.visible = !isDay;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const roadMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x1e2638 : 0x131a26,
      roughness: 0.6,
      metalness: 0.2,
    });
    roadMatRef.current = roadMat;

    const curbMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x94a3b8 : 0x1e293b,
      roughness: 0.8,
    });
    curbMatRef.current = curbMat;

    const zTop = toThreeZ(1000);
    const zBot = toThreeZ(500);
    const xA = toThreeX(500);
    const xB = toThreeX(1200);
    const xC = toThreeX(1900);

    // Architectural Road Curbs / Sidewalk Borders
    const artCurbGeo = new THREE.PlaneGeometry(542, ARTERIAL_WIDTH + 3.5);
    const artCurb1 = new THREE.Mesh(artCurbGeo, curbMat);
    artCurb1.rotation.x = -Math.PI / 2;
    artCurb1.position.set(0, -0.05, zTop);
    detailsGroup.add(artCurb1);

    const artCurb2 = new THREE.Mesh(artCurbGeo, curbMat);
    artCurb2.rotation.x = -Math.PI / 2;
    artCurb2.position.set(0, -0.05, zBot);
    detailsGroup.add(artCurb2);

    const crossCurbGeo = new THREE.PlaneGeometry(CROSS_STREET_WIDTH + 3.5, 352);
    [xA, xB, xC].forEach((cx) => {
      const crossCurb = new THREE.Mesh(crossCurbGeo, curbMat);
      crossCurb.rotation.x = -Math.PI / 2;
      crossCurb.position.set(cx, -0.04, 0);
      detailsGroup.add(crossCurb);
    });

    // Arterials
    const artGeo = new THREE.PlaneGeometry(540, ARTERIAL_WIDTH);
    const art1 = new THREE.Mesh(artGeo, roadMat);
    art1.rotation.x = -Math.PI / 2;
    art1.position.set(0, 0, zTop);
    art1.receiveShadow = true;
    scene.add(art1);

    const art2 = new THREE.Mesh(artGeo, roadMat);
    art2.rotation.x = -Math.PI / 2;
    art2.position.set(0, 0, zBot);
    art2.receiveShadow = true;
    scene.add(art2);

    // Cross-streets
    const crossGeo = new THREE.PlaneGeometry(CROSS_STREET_WIDTH, 350);
    [xA, xB, xC].forEach((cx) => {
      const cross = new THREE.Mesh(crossGeo, roadMat);
      cross.rotation.x = -Math.PI / 2;
      cross.position.set(cx, 0.02, 0);
      cross.receiveShadow = true;
      scene.add(cross);
    });

    // Markings & Stop Bars
    const medianMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const dashLineMat = new THREE.MeshBasicMaterial({ color: isDay ? 0xffffff : 0x94a3b8 });
    dashLineMatRef.current = dashLineMat;
    const crosswalkMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });

    // Double yellow medians (broken outside intersection boxes to keep center clear)
    const arterialMedianIntervals = [
      { start: -240, end: xA - HALF_CROSS - 3.8 },
      { start: xA + HALF_CROSS + 3.8, end: xB - HALF_CROSS - 3.8 },
      { start: xB + HALF_CROSS + 3.8, end: xC - HALF_CROSS - 3.8 },
      { start: xC + HALF_CROSS + 3.8, end: 240 },
    ];
    [-0.3, 0.3].forEach((offset) => {
      [zTop, zBot].forEach((zVal) => {
        arterialMedianIntervals.forEach(({ start, end }) => {
          const len = end - start;
          if (len > 0) {
            const medGeo = new THREE.PlaneGeometry(len, 0.22);
            const medMesh = new THREE.Mesh(medGeo, medianMat);
            medMesh.rotation.x = -Math.PI / 2;
            medMesh.position.set((start + end) / 2, 0.05, zVal + offset);
            detailsGroup.add(medMesh);
          }
        });
      });
    });

    // Dashed lines
    [-5.5, -2.8, 2.8, 5.5].forEach((offset) => {
      [zTop, zBot].forEach((zVal) => {
        for (let lx = -240; lx <= 240; lx += 10) {
          if ([xA, xB, xC].some((cx) => Math.abs(lx - cx) < HALF_CROSS + 3)) continue;
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.2), dashLineMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(lx, 0.05, zVal + offset);
          detailsGroup.add(dash);
        }
      });
    });

    // ──────────────────────────────────────────────────────────────────
    // REALISTIC 3D TRAFFIC LIGHT GANTRIES & DYNAMIC STOP BARS
    // ──────────────────────────────────────────────────────────────────
    const signalHousingMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.6,
    });
    const signalPoleMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.75,
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
    });

    // Materials for Center Circular Roundabout Island (Matching Image 2)
    const roundaboutLawnMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x16a34a : 0x0f5132,
      roughness: 0.85,
    });
    roundaboutLawnMatRef.current = roundaboutLawnMat;

    const roundaboutApronMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0xd1d5db : 0x334155,
      roughness: 0.7,
    });
    roundaboutApronMatRef.current = roundaboutApronMat;

    const roundaboutCurbMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x94a3b8 : 0x1e293b,
      roughness: 0.5,
      metalness: 0.1,
    });
    roundaboutCurbMatRef.current = roundaboutCurbMat;

    const shrubMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x15803d : 0x064e3b,
      roughness: 0.9,
    });

    const centerPedestalMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x64748b : 0x0f172a,
      roughness: 0.4,
      metalness: 0.2,
    });

    const treeFoliageMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x22c55e : 0x10b981,
      roughness: 0.7,
      flatShading: true,
    });

    // Shark teeth yield triangle shape (Matching Image 2)
    const sharkToothShape = new THREE.Shape();
    sharkToothShape.moveTo(0, 0.42);
    sharkToothShape.lineTo(0.22, -0.2);
    sharkToothShape.lineTo(-0.22, -0.2);
    sharkToothShape.closePath();
    const sharkToothGeo = new THREE.ShapeGeometry(sharkToothShape);
    const sharkToothMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    Object.entries(INTERSECTIONS_INFO).forEach(([id, info]) => {
      const { x: jx, z: jz } = info;

      // ──────────────────────────────────────────────────────────────────
      // 1. ZEBRA CROSSWALKS ON ALL 4 APPROACHES (Matching Image 1 & Image 2)
      // ──────────────────────────────────────────────────────────────────
      const crosswalkStripeW = new THREE.PlaneGeometry(1.8, 0.75);
      const crosswalkStripeN = new THREE.PlaneGeometry(0.75, 1.8);

      // West Crosswalk (across Arterial, in front of West approach)
      for (let zo = -HALF_ROAD + 0.9; zo <= HALF_ROAD - 0.9; zo += 1.5) {
        const stripe = new THREE.Mesh(crosswalkStripeW, crosswalkMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(jx - HALF_CROSS - 1.8, 0.06, jz + zo);
        detailsGroup.add(stripe);
      }

      // East Crosswalk (across Arterial, in front of East approach)
      for (let zo = -HALF_ROAD + 0.9; zo <= HALF_ROAD - 0.9; zo += 1.5) {
        const stripe = new THREE.Mesh(crosswalkStripeW, crosswalkMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(jx + HALF_CROSS + 1.8, 0.06, jz + zo);
        detailsGroup.add(stripe);
      }

      // North Crosswalk (across Cross-Street, in front of North approach)
      for (let xo = -HALF_CROSS + 0.9; xo <= HALF_CROSS - 0.9; xo += 1.5) {
        const stripe = new THREE.Mesh(crosswalkStripeN, crosswalkMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(jx + xo, 0.06, jz - HALF_ROAD - 1.8);
        detailsGroup.add(stripe);
      }

      // South Crosswalk (across Cross-Street, in front of South approach)
      for (let xo = -HALF_CROSS + 0.9; xo <= HALF_CROSS - 0.9; xo += 1.5) {
        const stripe = new THREE.Mesh(crosswalkStripeN, crosswalkMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(jx + xo, 0.06, jz + HALF_ROAD + 1.8);
        detailsGroup.add(stripe);
      }

      // ──────────────────────────────────────────────────────────────────
      // 2. STOP BARS ON ASPHALT (Behind the zebra crosswalks on the approach side)
      // ──────────────────────────────────────────────────────────────────
      // East-West Stop Bars
      const barEW_East = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, HALF_ROAD - 0.6),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      barEW_East.rotation.x = -Math.PI / 2;
      barEW_East.position.set(jx + HALF_CROSS + 3.2, 0.08, jz - HALF_ROAD / 2);
      detailsGroup.add(barEW_East);

      const barEW_West = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8, HALF_ROAD - 0.6),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      barEW_West.rotation.x = -Math.PI / 2;
      barEW_West.position.set(jx - HALF_CROSS - 3.2, 0.08, jz + HALF_ROAD / 2);
      detailsGroup.add(barEW_West);

      // North-South Stop Bars
      const barNS_North = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_CROSS - 0.6, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      barNS_North.rotation.x = -Math.PI / 2;
      barNS_North.position.set(jx - HALF_CROSS / 2, 0.08, jz - HALF_ROAD - 3.2);
      detailsGroup.add(barNS_North);

      const barNS_South = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_CROSS - 0.6, 0.8),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      barNS_South.rotation.x = -Math.PI / 2;
      barNS_South.position.set(jx + HALF_CROSS / 2, 0.08, jz + HALF_ROAD + 3.2);
      detailsGroup.add(barNS_South);

      stopBarsRef.current.set(`${id}_EW_E`, barEW_East);
      stopBarsRef.current.set(`${id}_EW_W`, barEW_West);
      stopBarsRef.current.set(`${id}_NS_N`, barNS_North);
      stopBarsRef.current.set(`${id}_NS_S`, barNS_South);

      // ──────────────────────────────────────────────────────────────────
      // 3. CENTER CIRCULAR ROUNDABOUT ISLAND & YIELD MARKINGS (Matching Image 2)
      // ──────────────────────────────────────────────────────────────────
      const roundaboutGroup = new THREE.Group();
      roundaboutGroup.position.set(jx, 0, jz);

      // 1. Asphalt circular base disc (smooth dark road surface under roundabout)
      const rAsphaltGeo = new THREE.CircleGeometry(6.6, 36);
      const rAsphaltMesh = new THREE.Mesh(rAsphaltGeo, roadMat);
      rAsphaltMesh.rotation.x = -Math.PI / 2;
      rAsphaltMesh.position.y = 0.025;
      rAsphaltMesh.receiveShadow = true;
      roundaboutGroup.add(rAsphaltMesh);

      // 2. Circular Dashed Lane Guide Marking (Outer circulating ring at radius 5.2)
      const dashCircRadius = 5.2;
      const numDashes = 22;
      const dashAngle = (Math.PI * 2) / numDashes;
      for (let d = 0; d < numDashes; d++) {
        const angle = d * dashAngle;
        const dashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), dashLineMat);
        dashMesh.rotation.x = -Math.PI / 2;
        dashMesh.rotation.z = -angle;
        dashMesh.position.set(
          Math.cos(angle) * dashCircRadius,
          0.052,
          Math.sin(angle) * dashCircRadius
        );
        roundaboutGroup.add(dashMesh);
      }

      // 3. Mountable Concrete Truck Apron (Inner paved collar ring, matching Image 2)
      const apronGeo = new THREE.RingGeometry(2.9, 3.8, 36);
      const apronMesh = new THREE.Mesh(apronGeo, roundaboutApronMat);
      apronMesh.rotation.x = -Math.PI / 2;
      apronMesh.position.y = 0.055;
      roundaboutGroup.add(apronMesh);

      // 4. Raised Outer Curb Rim (Cylinder curb wall, matching Image 2)
      const curbHeight = 0.26;
      const curbRimGeo = new THREE.CylinderGeometry(2.9, 2.95, curbHeight, 36);
      const curbRimMesh = new THREE.Mesh(curbRimGeo, roundaboutCurbMat);
      curbRimMesh.position.y = curbHeight / 2;
      curbRimMesh.castShadow = true;
      curbRimMesh.receiveShadow = true;
      roundaboutGroup.add(curbRimMesh);

      // 5. Lush Center Island Lawn Disk (Vibrant Green Grass, matching Image 2)
      const lawnGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.06, 36);
      const lawnMesh = new THREE.Mesh(lawnGeo, roundaboutLawnMat);
      lawnMesh.position.y = curbHeight + 0.03;
      lawnMesh.receiveShadow = true;
      roundaboutGroup.add(lawnMesh);

      // 6. Landscaped Garden / Inner Circular Bush & Modern Centerpiece
      const shrubRingGeo = new THREE.TorusGeometry(1.4, 0.22, 12, 28);
      const shrubRingMesh = new THREE.Mesh(shrubRingGeo, shrubMat);
      shrubRingMesh.rotation.x = Math.PI / 2;
      shrubRingMesh.position.y = curbHeight + 0.16;
      roundaboutGroup.add(shrubRingMesh);

      // Center decorative urban planter & stylized low-poly topiary tree
      const centerPedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.75, 0.35, 16),
        centerPedestalMat
      );
      centerPedestal.position.y = curbHeight + 0.22;
      roundaboutGroup.add(centerPedestal);

      const treeTopiary = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.85, 1),
        treeFoliageMat
      );
      treeTopiary.position.y = curbHeight + 0.85;
      treeTopiary.castShadow = true;
      roundaboutGroup.add(treeTopiary);

      detailsGroup.add(roundaboutGroup);

      // 7. Shark Teeth Yield Triangles at all 4 approaches (matching Image 2)
      // West approach (oncoming EB traffic at x = jx - HALF_CROSS - 0.7): pointing -X
      [1.8, 4.5, 7.2].forEach((zo) => {
        [-0.32, 0.32].forEach((laneO) => {
          const tooth = new THREE.Mesh(sharkToothGeo, sharkToothMat);
          tooth.rotation.x = -Math.PI / 2;
          tooth.rotation.z = Math.PI / 2;
          tooth.position.set(jx - HALF_CROSS - 0.7, 0.065, jz + zo + laneO);
          detailsGroup.add(tooth);
        });
      });

      // East approach (oncoming WB traffic at x = jx + HALF_CROSS + 0.7): pointing +X
      [-1.8, -4.5, -7.2].forEach((zo) => {
        [-0.32, 0.32].forEach((laneO) => {
          const tooth = new THREE.Mesh(sharkToothGeo, sharkToothMat);
          tooth.rotation.x = -Math.PI / 2;
          tooth.rotation.z = -Math.PI / 2;
          tooth.position.set(jx + HALF_CROSS + 0.7, 0.065, jz + zo + laneO);
          detailsGroup.add(tooth);
        });
      });

      // North approach (oncoming SB traffic at z = jz - HALF_ROAD - 0.7): pointing -Z
      [-1.6, -4.2].forEach((xo) => {
        [-0.32, 0.32].forEach((laneO) => {
          const tooth = new THREE.Mesh(sharkToothGeo, sharkToothMat);
          tooth.rotation.x = -Math.PI / 2;
          tooth.rotation.z = Math.PI;
          tooth.position.set(jx + xo + laneO, 0.065, jz - HALF_ROAD - 0.7);
          detailsGroup.add(tooth);
        });
      });

      // South approach (oncoming NB traffic at z = jz + HALF_ROAD + 0.7): pointing +Z
      [1.6, 4.2].forEach((xo) => {
        [-0.32, 0.32].forEach((laneO) => {
          const tooth = new THREE.Mesh(sharkToothGeo, sharkToothMat);
          tooth.rotation.x = -Math.PI / 2;
          tooth.rotation.z = 0;
          tooth.position.set(jx + xo + laneO, 0.065, jz + HALF_ROAD + 0.7);
          detailsGroup.add(tooth);
        });
      });

      // Arrays to collect materials for dynamic phase switching
      const ewRedMats: THREE.MeshStandardMaterial[] = [];
      const ewYellowMats: THREE.MeshStandardMaterial[] = [];
      const ewGreenMats: THREE.MeshStandardMaterial[] = [];

      const nsRedMats: THREE.MeshStandardMaterial[] = [];
      const nsYellowMats: THREE.MeshStandardMaterial[] = [];
      const nsGreenMats: THREE.MeshStandardMaterial[] = [];

      // Helper to build a 3-aspect LED signal head
      const createSignalHead = (rotationY: number) => {
        const headGroup = new THREE.Group();

        // Housing
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.38, 0.38), signalHousingMat);
        headGroup.add(housing);

        // Lenses
        const redMat = new THREE.MeshStandardMaterial({
          color: 0x3b0a0a,
          emissive: 0xef4444,
          emissiveIntensity: 0.1,
          roughness: 0.25,
        });
        const redLens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 16), redMat);
        redLens.rotation.x = Math.PI / 2;
        redLens.position.set(0, 0.42, 0.17);
        headGroup.add(redLens);

        const yellowMat = new THREE.MeshStandardMaterial({
          color: 0x3b270a,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.1,
          roughness: 0.25,
        });
        const yellowLens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 16), yellowMat);
        yellowLens.rotation.x = Math.PI / 2;
        yellowLens.position.set(0, 0, 0.17);
        headGroup.add(yellowLens);

        const greenMat = new THREE.MeshStandardMaterial({
          color: 0x0a3b18,
          emissive: 0x10b981,
          emissiveIntensity: 0.1,
          roughness: 0.25,
        });
        const greenLens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 16), greenMat);
        greenLens.rotation.x = Math.PI / 2;
        greenLens.position.set(0, -0.42, 0.17);
        headGroup.add(greenLens);

        // Sun visors over each lens
        [-0.42, 0, 0.42].forEach((vy) => {
          const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 12, 1, true, 0, Math.PI), visorMat);
          visor.rotation.x = -Math.PI / 2;
          visor.position.set(0, vy + 0.08, 0.18);
          headGroup.add(visor);
        });

        headGroup.rotation.y = rotationY;
        return { headGroup, redMat, yellowMat, greenMat };
      };

      // ── 4 CORNER TRAFFIC LIGHT POLES (Matching Image 1) ──
      // Pole 1: Northwest Corner
      const poleNW = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 7.5, 12), signalPoleMat);
      poleNW.position.set(jx - HALF_CROSS - 2.0, 3.75, jz - HALF_ROAD - 2.0);
      detailsGroup.add(poleNW);

      const armNW = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 5.0, 8), signalPoleMat);
      armNW.rotation.z = Math.PI / 2;
      armNW.position.set(jx - HALF_CROSS + 0.5, 6.8, jz - HALF_ROAD - 2.0);
      detailsGroup.add(armNW);

      const sigEW1 = createSignalHead(-Math.PI / 2); // Facing oncoming Eastbound
      sigEW1.headGroup.position.set(jx - HALF_CROSS + 1.5, 6.2, jz - HALF_ROAD - 2.0);
      detailsGroup.add(sigEW1.headGroup);
      ewRedMats.push(sigEW1.redMat);
      ewYellowMats.push(sigEW1.yellowMat);
      ewGreenMats.push(sigEW1.greenMat);

      const sigNS1 = createSignalHead(Math.PI); // Facing oncoming Southbound
      sigNS1.headGroup.position.set(jx - HALF_CROSS - 2.0, 5.2, jz - HALF_ROAD + 0.8);
      detailsGroup.add(sigNS1.headGroup);
      nsRedMats.push(sigNS1.redMat);
      nsYellowMats.push(sigNS1.yellowMat);
      nsGreenMats.push(sigNS1.greenMat);

      // Pole 2: Northeast Corner
      const poleNE = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 7.5, 12), signalPoleMat);
      poleNE.position.set(jx + HALF_CROSS + 2.0, 3.75, jz - HALF_ROAD - 2.0);
      detailsGroup.add(poleNE);

      const armNE = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 5.0, 8), signalPoleMat);
      armNE.rotation.z = Math.PI / 2;
      armNE.position.set(jx + HALF_CROSS - 0.5, 6.8, jz - HALF_ROAD - 2.0);
      detailsGroup.add(armNE);

      const sigEW2 = createSignalHead(Math.PI / 2); // Facing oncoming Westbound
      sigEW2.headGroup.position.set(jx + HALF_CROSS - 1.5, 6.2, jz - HALF_ROAD - 2.0);
      detailsGroup.add(sigEW2.headGroup);
      ewRedMats.push(sigEW2.redMat);
      ewYellowMats.push(sigEW2.yellowMat);
      ewGreenMats.push(sigEW2.greenMat);

      // Pole 3: Southwest Corner
      const poleSW = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 7.5, 12), signalPoleMat);
      poleSW.position.set(jx - HALF_CROSS - 2.0, 3.75, jz + HALF_ROAD + 2.0);
      detailsGroup.add(poleSW);

      const armSW = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 5.0, 8), signalPoleMat);
      armSW.rotation.x = Math.PI / 2;
      armSW.position.set(jx - HALF_CROSS - 2.0, 6.8, jz + HALF_ROAD - 0.5);
      detailsGroup.add(armSW);

      const sigNS2 = createSignalHead(0); // Facing oncoming Northbound
      sigNS2.headGroup.position.set(jx - HALF_CROSS - 2.0, 6.2, jz + HALF_ROAD - 1.5);
      detailsGroup.add(sigNS2.headGroup);
      nsRedMats.push(sigNS2.redMat);
      nsYellowMats.push(sigNS2.yellowMat);
      nsGreenMats.push(sigNS2.greenMat);

      // Pole 4: Southeast Corner
      const poleSE = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 7.5, 12), signalPoleMat);
      poleSE.position.set(jx + HALF_CROSS + 2.0, 3.75, jz + HALF_ROAD + 2.0);
      detailsGroup.add(poleSE);

      const armSE = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 5.0, 8), signalPoleMat);
      armSE.rotation.z = Math.PI / 2;
      armSE.position.set(jx + HALF_CROSS - 0.5, 6.8, jz + HALF_ROAD + 2.0);
      detailsGroup.add(armSE);

      // Store in ref for dynamic lighting
      trafficLightHeadsRef.current.set(`${id}_EW`, {
        red: ewRedMats,
        yellow: ewYellowMats,
        green: ewGreenMats,
      });
      trafficLightHeadsRef.current.set(`${id}_NS`, {
        red: nsRedMats,
        yellow: nsYellowMats,
        green: nsGreenMats,
      });
      trafficLightHeadsRef.current.set(`${id}_W`, {
        red: [sigEW1.redMat],
        yellow: [sigEW1.yellowMat],
        green: [sigEW1.greenMat],
      });
      trafficLightHeadsRef.current.set(`${id}_N`, {
        red: [sigNS1.redMat],
        yellow: [sigNS1.yellowMat],
        green: [sigNS1.greenMat],
      });
      trafficLightHeadsRef.current.set(`${id}_E`, {
        red: [sigEW2.redMat],
        yellow: [sigEW2.yellowMat],
        green: [sigEW2.greenMat],
      });
      trafficLightHeadsRef.current.set(`${id}_S`, {
        red: [sigNS2.redMat],
        yellow: [sigNS2.yellowMat],
        green: [sigNS2.greenMat],
      });
    });

    // ──────────────────────────────────────────────────────────────────
    // 3D BUILDINGS & PARK ZONES
    // ──────────────────────────────────────────────────────────────────
    const blockRegions = [
      { minX: -240, maxX: xA - HALF_CROSS - 3, minZ: -160, maxZ: zTop - HALF_ROAD - 3 },
      { minX: xA + HALF_CROSS + 3, maxX: xB - HALF_CROSS - 3, minZ: -160, maxZ: zTop - HALF_ROAD - 3 },
      { minX: xB + HALF_CROSS + 3, maxX: xC - HALF_CROSS - 3, minZ: -160, maxZ: zTop - HALF_ROAD - 3 },
      { minX: xC + HALF_CROSS + 3, maxX: 240, minZ: -160, maxZ: zTop - HALF_ROAD - 3 },
      { minX: -240, maxX: xA - HALF_CROSS - 3, minZ: zTop + HALF_ROAD + 3, maxZ: zBot - HALF_ROAD - 3 },
      { minX: xA + HALF_CROSS + 3, maxX: xB - HALF_CROSS - 3, minZ: zTop + HALF_ROAD + 3, maxZ: zBot - HALF_ROAD - 3 },
      { minX: xB + HALF_CROSS + 3, maxX: xC - HALF_CROSS - 3, minZ: zTop + HALF_ROAD + 3, maxZ: zBot - HALF_ROAD - 3 },
      { minX: xC + HALF_CROSS + 3, maxX: 240, minZ: zTop + HALF_ROAD + 3, maxZ: zBot - HALF_ROAD - 3 },
      { minX: -240, maxX: xA - HALF_CROSS - 3, minZ: zBot + HALF_ROAD + 3, maxZ: 160 },
      { minX: xA + HALF_CROSS + 3, maxX: xB - HALF_CROSS - 3, minZ: zBot + HALF_ROAD + 3, maxZ: 160 },
      { minX: xB + HALF_CROSS + 3, maxX: xC - HALF_CROSS - 3, minZ: zBot + HALF_ROAD + 3, maxZ: 160 },
      { minX: xC + HALF_CROSS + 3, maxX: 240, minZ: zBot + HALF_ROAD + 3, maxZ: 160 },
    ];

    const wallMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0xd1d5db : 0x1e293b,
      roughness: 0.35,
      metalness: 0.25,
    });
    wallMatRef.current = wallMat;

    const parkMat = new THREE.MeshStandardMaterial({
      color: isDay ? 0x22c55e : 0x14532d,
      roughness: 0.9,
    });
    parkMatRef.current = parkMat;

    blockRegions.forEach((b, blockIdx) => {
      const bw = b.maxX - b.minX;
      const bz = b.maxZ - b.minZ;
      if (bw <= 0 || bz <= 0) return;

      if (blockIdx === 5) {
        // Emerald Park
        const park = new THREE.Mesh(
          new THREE.PlaneGeometry(bw - 2, bz - 2),
          parkMat
        );
        park.rotation.x = -Math.PI / 2;
        park.position.set((b.minX + b.maxX) / 2, 0.45, (b.minZ + b.maxZ) / 2);
        specialZonesGroup.add(park);
        return;
      }

      const cols = Math.max(2, Math.floor(bw / 18));
      const rows = Math.max(1, Math.floor(bz / 18));
      const cellW = bw / cols;
      const cellZ = bz / rows;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = b.minX + c * cellW + cellW / 2;
          const pz = b.minZ + r * cellZ + cellZ / 2;
          const w = cellW - 4;
          const d = cellZ - 4;
          const height = Math.max(14, Math.min(65, 45 + Math.sin(px * 0.05 + pz * 0.08) * 20));

          const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallMat);
          bMesh.position.set(px, height / 2 + 0.4, pz);
          bMesh.castShadow = true;
          bMesh.receiveShadow = true;
          buildingGroup.add(bMesh);
        }
      }
    });

    // ──────────────────────────────────────────────────────────────────
    // HIGH-PERFORMANCE 60 FPS INSTANCED MESHES ACROSS 5 VEHICLE TYPES:
    // 1. Car  2. Motorcycle  3. Bus  4. Truck  5. Auto-rickshaw
    // ──────────────────────────────────────────────────────────────────
    const infiniteSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);

    // Shared Automotive Materials
    const carWheelMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.2,
    });
    const carHeadlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const carTaillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // ──────────────────────── 1. CAR (Sedan / Coupe) ────────────────────────
    const carBodyGeo = new THREE.BoxGeometry(1.08, 0.38, 2.30);
    carBodyGeo.translate(0, 0.34, 0);

    const carCabinGeo = new THREE.BoxGeometry(0.92, 0.32, 1.30);
    carCabinGeo.translate(0, 0.65, -0.10);

    const wheelBase = new THREE.CylinderGeometry(0.20, 0.20, 0.14, 12);
    wheelBase.rotateZ(Math.PI / 2);
    const carWheelsGeo = BufferGeometryUtils.mergeGeometries([
      wheelBase.clone().translate(-0.56, 0.20, 0.70),
      wheelBase.clone().translate(0.56, 0.20, 0.70),
      wheelBase.clone().translate(-0.56, 0.20, -0.70),
      wheelBase.clone().translate(0.56, 0.20, -0.70),
    ])!;

    const hlBase = new THREE.BoxGeometry(0.20, 0.08, 0.06);
    const carHeadlightsGeo = BufferGeometryUtils.mergeGeometries([
      hlBase.clone().translate(-0.36, 0.38, 1.16),
      hlBase.clone().translate(0.36, 0.38, 1.16),
    ])!;

    const tlBase = new THREE.BoxGeometry(0.20, 0.08, 0.06);
    const carTaillightsGeo = BufferGeometryUtils.mergeGeometries([
      tlBase.clone().translate(-0.36, 0.38, -1.16),
      tlBase.clone().translate(0.36, 0.38, -1.16),
    ])!;

    const carBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.55 });
    const carCabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.85 });

    carBodyGeo.boundingSphere = infiniteSphere;
    carCabinGeo.boundingSphere = infiniteSphere;
    carWheelsGeo.boundingSphere = infiniteSphere;
    carHeadlightsGeo.boundingSphere = infiniteSphere;
    carTaillightsGeo.boundingSphere = infiniteSphere;

    const instancedCars = new THREE.InstancedMesh(carBodyGeo, carBodyMat, 1000);
    const instancedCabins = new THREE.InstancedMesh(carCabinGeo, carCabinMat, 1000);
    const instancedWheels = new THREE.InstancedMesh(carWheelsGeo, carWheelMat, 1000);
    const instancedHeadlights = new THREE.InstancedMesh(carHeadlightsGeo, carHeadlightMat, 1000);
    const instancedTaillights = new THREE.InstancedMesh(carTaillightsGeo, carTaillightMat, 1000);

    // ──────────────────────── 2. MOTORCYCLE (Two-Wheeler) ────────────────────
    const motoFrame = new THREE.BoxGeometry(0.24, 0.34, 0.95).translate(0, 0.40, 0);
    const motoBars = new THREE.BoxGeometry(0.58, 0.05, 0.06).translate(0, 0.64, 0.36);
    const motoFork = new THREE.BoxGeometry(0.12, 0.36, 0.12).translate(0, 0.44, 0.44);
    const motoSeat = new THREE.BoxGeometry(0.20, 0.16, 0.36).translate(0, 0.54, -0.12);
    const motoTorso = new THREE.BoxGeometry(0.28, 0.36, 0.26).translate(0, 0.76, -0.06);
    const motoHelmet = new THREE.SphereGeometry(0.13, 8, 8).translate(0, 0.98, -0.02);
    const motoBodyGeo = BufferGeometryUtils.mergeGeometries([
      motoFrame, motoBars, motoFork, motoSeat, motoTorso, motoHelmet
    ])!;
    motoBodyGeo.boundingSphere = infiniteSphere;

    const motoWheelBase = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12).rotateZ(Math.PI / 2);
    const motoWheelsGeo = BufferGeometryUtils.mergeGeometries([
      motoWheelBase.clone().translate(0, 0.18, 0.50),
      motoWheelBase.clone().translate(0, 0.18, -0.48),
    ])!;
    motoWheelsGeo.boundingSphere = infiniteSphere;

    const motoBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 });
    const instancedMotos = new THREE.InstancedMesh(motoBodyGeo, motoBodyMat, 500);
    const instancedMotoWheels = new THREE.InstancedMesh(motoWheelsGeo, carWheelMat, 500);

    // ──────────────────────── 3. BUS (City Transit Coach) ───────────────────
    const busChassis = new THREE.BoxGeometry(1.42, 1.25, 5.20).translate(0, 0.92, 0);
    const busRoof = new THREE.BoxGeometry(1.36, 0.12, 5.10).translate(0, 1.58, 0);
    const busBumperF = new THREE.BoxGeometry(1.44, 0.28, 0.12).translate(0, 0.32, 2.62);
    const busBumperR = new THREE.BoxGeometry(1.44, 0.28, 0.12).translate(0, 0.32, -2.62);
    const busBodyGeo = BufferGeometryUtils.mergeGeometries([
      busChassis, busRoof, busBumperF, busBumperR
    ])!;
    busBodyGeo.boundingSphere = infiniteSphere;

    const busGlassGeo = new THREE.BoxGeometry(1.46, 0.45, 4.85);
    busGlassGeo.translate(0, 1.18, -0.05);
    busGlassGeo.boundingSphere = infiniteSphere;

    const busSignsGeo = new THREE.BoxGeometry(0.85, 0.16, 0.06);
    busSignsGeo.translate(0, 1.45, 2.62);
    busSignsGeo.boundingSphere = infiniteSphere;

    const heavyWheelBase = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 14).rotateZ(Math.PI / 2);
    const busWheelsGeo = BufferGeometryUtils.mergeGeometries([
      heavyWheelBase.clone().translate(-0.72, 0.26, 1.75),
      heavyWheelBase.clone().translate(0.72, 0.26, 1.75),
      heavyWheelBase.clone().translate(-0.72, 0.26, -1.25),
      heavyWheelBase.clone().translate(0.72, 0.26, -1.25),
      heavyWheelBase.clone().translate(-0.72, 0.26, -1.95),
      heavyWheelBase.clone().translate(0.72, 0.26, -1.95),
    ])!;
    busWheelsGeo.boundingSphere = infiniteSphere;

    const busBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.45 });
    const busGlassMat = new THREE.MeshStandardMaterial({ color: 0x07111e, roughness: 0.1, metalness: 0.9 });
    const busSignMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    const instancedBuses = new THREE.InstancedMesh(busBodyGeo, busBodyMat, 300);
    const instancedBusGlass = new THREE.InstancedMesh(busGlassGeo, busGlassMat, 300);
    const instancedBusWheels = new THREE.InstancedMesh(busWheelsGeo, carWheelMat, 300);
    const instancedBusSigns = new THREE.InstancedMesh(busSignsGeo, busSignMat, 300);

    // ──────────────────────── 4. TRUCK (Heavy Cargo Hauler) ──────────────────
    const truckCab = new THREE.BoxGeometry(1.44, 1.18, 1.45).translate(0, 0.90, 1.55);
    const truckGrille = new THREE.BoxGeometry(1.36, 0.45, 0.12).translate(0, 0.42, 2.29);
    const truckWindshield = new THREE.BoxGeometry(1.38, 0.40, 0.12).translate(0, 1.15, 2.22);
    const stackL = new THREE.CylinderGeometry(0.06, 0.06, 1.1).translate(-0.73, 1.25, 0.92);
    const stackR = new THREE.CylinderGeometry(0.06, 0.06, 1.1).translate(0.73, 1.25, 0.92);
    const truckCabGeo = BufferGeometryUtils.mergeGeometries([
      truckCab, truckGrille, truckWindshield, stackL, stackR
    ])!;
    truckCabGeo.boundingSphere = infiniteSphere;

    const truckCargoGeo = new THREE.BoxGeometry(1.46, 1.42, 3.20);
    truckCargoGeo.translate(0, 1.05, -0.80);
    truckCargoGeo.boundingSphere = infiniteSphere;

    const truckWheelsGeo = BufferGeometryUtils.mergeGeometries([
      heavyWheelBase.clone().translate(-0.72, 0.26, 1.55),
      heavyWheelBase.clone().translate(0.72, 0.26, 1.55),
      heavyWheelBase.clone().translate(-0.72, 0.26, -1.30),
      heavyWheelBase.clone().translate(0.72, 0.26, -1.30),
      heavyWheelBase.clone().translate(-0.72, 0.26, -2.10),
      heavyWheelBase.clone().translate(0.72, 0.26, -2.10),
    ])!;
    truckWheelsGeo.boundingSphere = infiniteSphere;

    const truckCabMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 });
    const truckCargoMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });

    const instancedTruckCabs = new THREE.InstancedMesh(truckCabGeo, truckCabMat, 300);
    const instancedTruckCargo = new THREE.InstancedMesh(truckCargoGeo, truckCargoMat, 300);
    const instancedTruckWheels = new THREE.InstancedMesh(truckWheelsGeo, carWheelMat, 300);

    // ──────────────────────── 5. AUTO-RICKSHAW (Tuk-Tuk 3-Wheeler) ───────────
    const rTub = new THREE.BoxGeometry(0.88, 0.48, 1.70).translate(0, 0.36, -0.05);
    const rCowl = new THREE.BoxGeometry(0.62, 0.44, 0.45).translate(0, 0.38, 0.85);
    const rBar = new THREE.BoxGeometry(0.48, 0.06, 0.08).translate(0, 0.58, 0.48);
    const rPillarF = new THREE.BoxGeometry(0.78, 0.44, 0.08).translate(0, 0.76, 0.45);
    const rPillarR = new THREE.BoxGeometry(0.86, 0.44, 0.08).translate(0, 0.76, -0.85);
    const rickshawBodyGeo = BufferGeometryUtils.mergeGeometries([
      rTub, rCowl, rBar, rPillarF, rPillarR
    ])!;
    rickshawBodyGeo.boundingSphere = infiniteSphere;

    // Iconic curved canopy roof
    const rRoof = new THREE.BoxGeometry(0.92, 0.20, 1.48).translate(0, 0.98, -0.15);
    const rVisor = new THREE.BoxGeometry(0.72, 0.16, 0.22).translate(0, 0.88, 0.62);
    const rickshawCanopyGeo = BufferGeometryUtils.mergeGeometries([rRoof, rVisor])!;
    rickshawCanopyGeo.boundingSphere = infiniteSphere;

    // 3 authentic wheels (1 front centered, 2 rear)
    const smallWheelBase = new THREE.CylinderGeometry(0.17, 0.17, 0.10, 12).rotateZ(Math.PI / 2);
    const rickshawWheelsGeo = BufferGeometryUtils.mergeGeometries([
      smallWheelBase.clone().translate(0, 0.17, 0.75), // Single centered front wheel
      smallWheelBase.clone().translate(-0.46, 0.17, -0.52), // Rear left
      smallWheelBase.clone().translate(0.46, 0.17, -0.52), // Rear right
    ])!;
    rickshawWheelsGeo.boundingSphere = infiniteSphere;

    const rickshawBodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 });
    const rickshawCanopyMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24, // Iconic Bright Golden Yellow Tuk-Tuk Roof
      roughness: 0.25,
      metalness: 0.2,
    });

    const instancedRickshawBody = new THREE.InstancedMesh(rickshawBodyGeo, rickshawBodyMat, 500);
    const instancedRickshawCanopy = new THREE.InstancedMesh(rickshawCanopyGeo, rickshawCanopyMat, 500);
    const instancedRickshawWheels = new THREE.InstancedMesh(rickshawWheelsGeo, carWheelMat, 500);

    // Disable frustum culling for all instanced meshes so vehicles never clip at close zoom
    const allMeshes = [
      instancedCars, instancedCabins, instancedWheels, instancedHeadlights, instancedTaillights,
      instancedMotos, instancedMotoWheels,
      instancedBuses, instancedBusGlass, instancedBusWheels, instancedBusSigns,
      instancedTruckCabs, instancedTruckCargo, instancedTruckWheels,
      instancedRickshawBody, instancedRickshawCanopy, instancedRickshawWheels,
    ];

    allMeshes.forEach((mesh) => {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    });

    instancedCarsRef.current = instancedCars;
    instancedCabinsRef.current = instancedCabins;
    instancedWheelsRef.current = instancedWheels;
    instancedHeadlightsRef.current = instancedHeadlights;
    instancedTaillightsRef.current = instancedTaillights;

    instancedMotosRef.current = instancedMotos;
    instancedMotoWheelsRef.current = instancedMotoWheels;

    instancedBusesRef.current = instancedBuses;
    instancedBusGlassRef.current = instancedBusGlass;
    instancedBusWheelsRef.current = instancedBusWheels;
    instancedBusSignsRef.current = instancedBusSigns;

    instancedTruckCabsRef.current = instancedTruckCabs;
    instancedTruckCargoRef.current = instancedTruckCargo;
    instancedTruckWheelsRef.current = instancedTruckWheels;

    instancedRickshawBodyRef.current = instancedRickshawBody;
    instancedRickshawCanopyRef.current = instancedRickshawCanopy;
    instancedRickshawWheelsRef.current = instancedRickshawWheels;

    // Dedicated Detailed Emergency Vehicle Actor
    const evGroup = new THREE.Group();

    // EV Body & Chassis
    const evChassis = new THREE.Mesh(
      new THREE.BoxGeometry(1.24, 0.48, 2.65),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.4 })
    );
    evChassis.position.y = 0.40;
    evGroup.add(evChassis);

    // EV Side Chevron Decal
    const evDecalL = new THREE.Mesh(
      new THREE.PlaneGeometry(1.80, 0.20),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    evDecalL.position.set(-0.625, 0.40, 0);
    evDecalL.rotation.y = -Math.PI / 2;
    evGroup.add(evDecalL);

    const evDecalR = new THREE.Mesh(
      new THREE.PlaneGeometry(1.80, 0.20),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    evDecalR.position.set(0.625, 0.40, 0);
    evDecalR.rotation.y = Math.PI / 2;
    evGroup.add(evDecalR);

    // EV Cabin
    const evCabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.10, 0.50, 1.70),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 })
    );
    evCabin.position.set(0, 0.82, -0.12);
    evGroup.add(evCabin);

    // EV 4 Detailed Wheels with Rims
    [-0.62, 0.62].forEach((wx) => {
      [-0.78, 0.78].forEach((wz) => {
        const evWheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.15, 12),
          new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 })
        );
        evWheel.rotation.z = Math.PI / 2;
        evWheel.position.set(wx, 0.22, wz);
        evGroup.add(evWheel);

        const hubcap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.155, 10),
          new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
        );
        hubcap.rotation.z = Math.PI / 2;
        hubcap.position.set(wx, 0.22, wz);
        evGroup.add(hubcap);
      });
    });

    // EV Heavy Grille Guard / Push Bumper
    const pushBumper = new THREE.Mesh(
      new THREE.BoxGeometry(1.10, 0.25, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.8, roughness: 0.3 })
    );
    pushBumper.position.set(0, 0.35, 1.36);
    evGroup.add(pushBumper);

    // Flashing Strobe Bar on Roof
    const strobe = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.15, 0.30),
      new THREE.MeshBasicMaterial({ color: 0xef4444 })
    );
    strobe.position.set(0, 1.12, -0.12);
    evGroup.add(strobe);

    const evLight = new THREE.PointLight(0xef4444, 4.0, 30);
    evLight.position.set(0, 1.25, -0.12);
    evGroup.add(evLight);

    // Forward Headlight Beam
    const evHeadlight = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
    );
    evHeadlight.rotation.x = -Math.PI / 2.05;
    evHeadlight.position.set(0, 0.25, 4.5);
    evGroup.add(evHeadlight);

    evGroup.visible = false;
    evGroup.frustumCulled = false;
    evGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.frustumCulled = false;
      }
    });
    scene.add(evGroup);
    evGroupRef.current = evGroup;

    // ──────────────────────────────────────────────────────────────────
    // ANIMATION & CAMERA LOOP (HONORS TARGET FRAMERATE)
    // ──────────────────────────────────────────────────────────────────
    let animId: number;
    let lastRenderTime = performance.now();
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const targetFps = useTrafficStore.getState().targetFps || 60;
      const now = performance.now();
      if (targetFps > 0 && targetFps < 120) {
        const interval = 1000 / targetFps;
        if (now - lastRenderTime < interval - 1.5) {
          return;
        }
      }
      lastRenderTime = now;

      const elapsed = clock.getElapsedTime();

      // DYNAMIC EV CAMERA TRACKING
      const evState = evStateRef.current;
      const isEvActive = (isEvCamActiveRef.current || cameraPresetRef.current === "ev") && evState;

      if (isEvActive && evGroupRef.current?.visible) {
        const { x: ex, z: ez, rotY } = evState;
        const currentAngle = evCamAngleRef.current;

        if (currentAngle === "chase") {
          // Dynamic Chase Cam: glides behind the vehicle
          const dist = 14;
          const targetCamX = ex - Math.sin(rotY) * dist;
          const targetCamZ = ez - Math.cos(rotY) * dist;
          const targetCamY = 5.2;

          camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.1);
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.1);
          camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.1);

          controls.target.x = THREE.MathUtils.lerp(controls.target.x, ex + Math.sin(rotY) * 16, 0.15);
          controls.target.y = THREE.MathUtils.lerp(controls.target.y, 1.2, 0.15);
          controls.target.z = THREE.MathUtils.lerp(controls.target.z, ez + Math.cos(rotY) * 16, 0.15);
        } else if (currentAngle === "dash") {
          // Hood Dashcam
          camera.position.set(ex + Math.sin(rotY) * 0.9, 0.75, ez + Math.cos(rotY) * 0.9);
          controls.target.set(ex + Math.sin(rotY) * 25, 0.6, ez + Math.cos(rotY) * 25);
        } else if (currentAngle === "drone") {
          // Overhead Drone View
          camera.position.x = THREE.MathUtils.lerp(camera.position.x, ex, 0.1);
          camera.position.y = THREE.MathUtils.lerp(camera.position.y, 55, 0.1);
          camera.position.z = THREE.MathUtils.lerp(camera.position.z, ez + 20, 0.1);
          controls.target.set(ex, 0, ez);
        }
      } else {
        controls.update();
      }

      // Flash emergency light
      if (evLight) {
        evLight.color.setHex(Math.sin(elapsed * 12) > 0 ? 0xef4444 : 0x3b82f6);
      }

      // FPS calculation
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current)));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: MouseEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      let hovered = false;
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        for (const info of Object.values(INTERSECTIONS_INFO)) {
          if (Math.hypot(hit.x - info.x, hit.z - info.z) < 24) {
            hovered = true;
            break;
          }
        }
      }
      renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
    };

    const onPointerUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      // If dragged more than 6px, it was an orbit pan/rotation, not a click
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        for (const [id, info] of Object.entries(INTERSECTIONS_INFO)) {
          const dist = Math.hypot(hit.x - info.x, hit.z - info.z);
          // 26 units radius covers the full junction crossroad
          if (dist < 26) {
            selectIntersection(id);
            break;
          }
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [selectIntersection]);

  // ──────────────────────────────────────────────────────────────────
  // ULTRA-FAST 60-FPS VEHICLE UPDATES (5 DISTINCT VEHICLE TYPES)
  // 1. Car  2. Motorcycle  3. Bus  4. Truck  5. Auto-rickshaw
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const instancedCars = instancedCarsRef.current;
    const instancedCabins = instancedCabinsRef.current;
    const instancedWheels = instancedWheelsRef.current;
    const instancedHeadlights = instancedHeadlightsRef.current;
    const instancedTaillights = instancedTaillightsRef.current;

    const instancedMotos = instancedMotosRef.current;
    const instancedMotoWheels = instancedMotoWheelsRef.current;

    const instancedBuses = instancedBusesRef.current;
    const instancedBusGlass = instancedBusGlassRef.current;
    const instancedBusWheels = instancedBusWheelsRef.current;
    const instancedBusSigns = instancedBusSignsRef.current;

    const instancedTruckCabs = instancedTruckCabsRef.current;
    const instancedTruckCargo = instancedTruckCargoRef.current;
    const instancedTruckWheels = instancedTruckWheelsRef.current;

    const instancedRickshawBody = instancedRickshawBodyRef.current;
    const instancedRickshawCanopy = instancedRickshawCanopyRef.current;
    const instancedRickshawWheels = instancedRickshawWheelsRef.current;

    const dummy = dummyRef.current;
    const prevMap = prevVehiclePosRef.current;
    const evGroup = evGroupRef.current;

    if (!instancedCars || !vehicles) return;

    let foundEv: VehicleState | null = null;

    // Palettes for each distinct vehicle type
    // 1. Cars (sleek metallic automotive finishes)
    const carColors = [
      new THREE.Color(0xf8fafc), // Pearl White Metallic
      new THREE.Color(0x18181b), // Obsidian Black
      new THREE.Color(0x334155), // Graphite Gray
      new THREE.Color(0x94a3b8), // Nardo Silver Gray
      new THREE.Color(0xb91c1c), // Crimson Red Metallic
      new THREE.Color(0x881337), // Deep Velvet Burgundy
      new THREE.Color(0x0284c7), // Electric Riviera Blue
      new THREE.Color(0x1e3a8a), // Midnight Sapphire Blue
      new THREE.Color(0x047857), // British Racing Green
      new THREE.Color(0xd97706), // Tuscan Amber Gold
      new THREE.Color(0x4f46e5), // Royal Indigo
    ];

    // 2. Motorcycles (vibrant sport finishes)
    const motoColors = [
      new THREE.Color(0x16a34a), // Kawasaki Lime Green
      new THREE.Color(0xdc2626), // Ducati Racing Scarlet
      new THREE.Color(0x2563eb), // Yamaha Racing Blue
      new THREE.Color(0xea580c), // KTM Solar Orange
      new THREE.Color(0x18181b), // Stealth Matte Black
      new THREE.Color(0xf8fafc), // Pearl White
      new THREE.Color(0xfacc15), // Cyber Neon Yellow
    ];

    // 3. Buses (public transit fleet liveries)
    const busColors = [
      new THREE.Color(0x059669), // Rapid Emerald Transit
      new THREE.Color(0x0284c7), // Metro Royal Cyan
      new THREE.Color(0xbe123c), // Rapid Express Crimson
      new THREE.Color(0xd97706), // Citylink Amber Gold
      new THREE.Color(0x4338ca), // Intercity Indigo
    ];

    // 4. Trucks (industrial freight fleet finishes)
    const truckColors = [
      new THREE.Color(0xf8fafc), // Arctic Logistics White
      new THREE.Color(0x334155), // Freight Steel Slate
      new THREE.Color(0x1e293b), // Maritime Deep Navy
      new THREE.Color(0xb45309), // Industrial Desert Bronze
      new THREE.Color(0x3f6212), // Cargo Forest Khaki
      new THREE.Color(0x78716c), // Heavy Granite Stone
    ];

    // 5. Auto-rickshaws (iconic 3-wheeler liveries with golden-yellow canopy)
    const rickshawColors = [
      new THREE.Color(0x15803d), // Classic CNG Emerald Green (Yellow Canopy)
      new THREE.Color(0x18181b), // Classic Jet Black (Yellow Canopy)
      new THREE.Color(0x1e3a8a), // Royal Navy Auto (Yellow Canopy)
      new THREE.Color(0x881337), // Crimson Maroon Auto (Yellow Canopy)
      new THREE.Color(0x166534), // Forest Green Auto (Yellow Canopy)
    ];

    // ──────────────────────────────────────────────────────────────────
    // 1. CLASSIFY ROAD, DIRECTION, LANES & VEHICLE KIND
    // ──────────────────────────────────────────────────────────────────
    type VisualVehicleKind = "car" | "motorcycle" | "bus" | "truck" | "rickshaw";

    interface VehicleCandidate {
      v: VehicleState;
      id: string;
      isEv: boolean;
      kind: VisualVehicleKind;
      road: "arterial" | "cross" | "junction";
      dir: "EB" | "WB" | "SB" | "NB" | "turning";
      juncId: string;
      laneIndex: number;
      tx: number;
      tz: number;
      rotY: number;
    }

    const candidates: VehicleCandidate[] = [];
    const maxCars = Math.min(vehicles.length, 1400);

    const vehicleLaneMap = vehicleLaneMapRef.current;
    if (vehicleLaneMap.size > 2000) {
      const activeIds = new Set(vehicles.map((v) => v.id));
      vehicleLaneMap.forEach((_, id) => {
        if (!activeIds.has(id)) vehicleLaneMap.delete(id);
      });
    }

    const vehicleKindMap = vehicleKindMapRef.current;
    if (vehicleKindMap.size > 2000) {
      const activeIds = new Set(vehicles.map((v) => v.id));
      vehicleKindMap.forEach((_, id) => {
        if (!activeIds.has(id)) vehicleKindMap.delete(id);
      });
    }

    // Determine and cache the visual vehicle kind across all 5 types
    const getVehicleKind = (v: VehicleState): VisualVehicleKind => {
      const t = String(v.type || "").toLowerCase();
      const id = v.id.toLowerCase();

      if (t === "motorcycle" || t === "moto" || id.includes("moto") || id.includes("bike")) return "motorcycle";
      if (t === "bus" || id.includes("bus")) return "bus";
      if (t === "truck" || id.includes("truck") || id.includes("lorry")) return "truck";
      if (t === "rickshaw" || t === "autorickshaw" || t === "auto" || id.includes("rickshaw") || id.includes("auto") || id.includes("tuktuk")) return "rickshaw";

      const cached = vehicleKindMap.get(v.id);
      if (cached) return cached;

      // Realistic diverse urban traffic mix:
      // ~48% Car, ~20% Motorcycle, ~16% Auto-rickshaw, ~8% Bus, ~8% Truck
      let hash = 0;
      for (let c = 0; c < v.id.length; c++) {
        hash = ((hash << 5) - hash + v.id.charCodeAt(c)) | 0;
      }
      const numMatch = v.id.match(/\d+/);
      const seed = numMatch ? parseInt(numMatch[0], 10) : Math.abs(hash);
      const mod = (Math.abs(seed) * 19 + 7) % 100;

      let kind: VisualVehicleKind = "car";
      if (mod < 48) kind = "car";
      else if (mod < 68) kind = "motorcycle";
      else if (mod < 84) kind = "rickshaw";
      else if (mod < 92) kind = "bus";
      else kind = "truck";

      vehicleKindMap.set(v.id, kind);
      return kind;
    };

    // Distribute vehicles across all available lanes so traffic uses all 3 lanes on arterials (and 2 lanes on cross streets)
    const getVehicleLane = (v: VehicleState, maxLanes: number): number => {
      if (v.lane_id) {
        const i = v.lane_id.lastIndexOf("_");
        if (i >= 0) {
          const parsed = parseInt(v.lane_id.slice(i + 1), 10);
          if (!isNaN(parsed) && parsed > 0 && parsed < maxLanes) {
            vehicleLaneMap.set(v.id, parsed);
            return parsed;
          }
        }
      }

      const cached = vehicleLaneMap.get(v.id);
      if (cached !== undefined && cached < maxLanes) {
        return cached;
      }

      let hash = 0;
      for (let c = 0; c < v.id.length; c++) {
        hash = ((hash << 5) - hash + v.id.charCodeAt(c)) | 0;
      }
      const numMatch = v.id.match(/\d+/);
      const seed = numMatch ? parseInt(numMatch[0], 10) : Math.abs(hash);
      const assigned = Math.abs(seed) % maxLanes;
      vehicleLaneMap.set(v.id, assigned);
      return assigned;
    };

    for (let i = 0; i < maxCars; i++) {
      const v = vehicles[i];
      const isEv = String(v.type) === "emergency" || v.id.toLowerCase().includes("emergency");
      const kind = getVehicleKind(v);

      let tx = toThreeX(v.x);
      let tz = toThreeZ(v.y);

      // Find nearest intersection
      let nearestJuncId = "B0";
      let minJuncDist = Infinity;
      for (const [id, info] of Object.entries(INTERSECTIONS_INFO)) {
        const d = Math.hypot(tx - info.x, tz - info.z);
        if (d < minJuncDist) {
          minJuncDist = d;
          nearestJuncId = id;
        }
      }
      const junc = INTERSECTIONS_INFO[nearestJuncId];
      const jx = junc.x;
      const jz = junc.z;
      const dx = tx - jx;
      const dz = tz - jz;

      let road: "arterial" | "cross" | "junction" = "junction";
      let dir: "EB" | "WB" | "SB" | "NB" | "turning" = "turning";
      let laneIndex = 0;
      let rotY = 0;

      // Distance to intersection center
      let distToCenter = Math.hypot(dx, dz);

      // Classify whether on Arterial (horizontal) or Cross-Street (vertical)
      const isArterialLikely = Math.abs(dz) <= HALF_ROAD + 2.5 && (Math.abs(dx) > HALF_CROSS + 1.2 || Math.abs(dz) >= Math.abs(dx) * 0.75);

      if (isArterialLikely) {
        if (tz >= jz) {
          // Eastbound (heading +X on South side of arterial, 3 lanes)
          dir = "EB";
          laneIndex = isEv ? 0 : getVehicleLane(v, 3);
          const ebLanes = [jz + 1.8, jz + 4.5, jz + 7.2];

          // Align SUMO approach coordinates so cars arrive smoothly at the 3D stop bar
          if (dx < 0 && dx > -45) {
            const t = Math.min(1, Math.max(0, (dx + 45) / (45 - 2.3)));
            tx -= t * 6.91; // Smoothly shifts SUMO stop line (-2.3) to 3D stop line (-9.2)
          }

          const curDx = tx - jx;
          // Smooth curved arc around center roundabout circular island only inside circulating area
          if (Math.abs(curDx) < 6.4) {
            const flare = Math.cos((curDx / 6.4) * (Math.PI / 2));
            if (laneIndex === 0) tz = jz + 1.8 + flare * 3.3; // Reaches jz + 5.1 at center
            else if (laneIndex === 1) tz = jz + 4.5 + flare * 1.6;
            else tz = jz + 7.2 + flare * 0.5;
          } else {
            tz = ebLanes[laneIndex];
          }
        } else {
          // Westbound (heading -X on North side of arterial, 3 lanes)
          dir = "WB";
          laneIndex = isEv ? 0 : getVehicleLane(v, 3);
          const wbLanes = [jz - 1.8, jz - 4.5, jz - 7.2];

          // Align SUMO approach coordinates so cars arrive smoothly at the 3D stop bar
          if (dx > 0 && dx < 45) {
            const t = Math.min(1, Math.max(0, (45 - dx) / (45 - 2.3)));
            tx += t * 6.91;
          }

          const curDx = tx - jx;
          if (Math.abs(curDx) < 6.4) {
            const flare = Math.cos((curDx / 6.4) * (Math.PI / 2));
            if (laneIndex === 0) tz = jz - 1.8 - flare * 3.3; // Reaches jz - 5.1 at center
            else if (laneIndex === 1) tz = jz - 4.5 - flare * 1.6;
            else tz = jz - 7.2 - flare * 0.5;
          } else {
            tz = wbLanes[laneIndex];
          }
        }
        road = Math.hypot(tx - jx, tz - jz) < 6.4 ? "junction" : "arterial";
      } else if (Math.abs(dx) <= HALF_CROSS + 2.5) {
        if (tx <= jx) {
          // Southbound (heading +Z on West side of cross-street, 2 lanes)
          dir = "SB";
          laneIndex = isEv ? 0 : getVehicleLane(v, 2);
          const sbLanes = [jx - 1.6, jx - 4.2];

          // Align SUMO approach coordinates so cars arrive smoothly at the 3D stop bar
          if (dz < 0 && dz > -45) {
            const t = Math.min(1, Math.max(0, (dz + 45) / (45 - 3.0)));
            tz -= t * 9.20;
          }

          const curDz = tz - jz;
          if (Math.abs(curDz) < 6.4) {
            const flare = Math.cos((curDz / 6.4) * (Math.PI / 2));
            if (laneIndex === 0) tx = jx - 1.6 - flare * 3.4; // Reaches jx - 5.0 at center
            else tx = jx - 4.2 - flare * 1.5;
          } else {
            tx = sbLanes[laneIndex];
          }
        } else {
          // Northbound (heading -Z on East side of cross-street, 2 lanes)
          dir = "NB";
          laneIndex = isEv ? 0 : getVehicleLane(v, 2);
          const nbLanes = [jx + 1.6, jx + 4.2];

          // Align SUMO approach coordinates so cars arrive smoothly at the 3D stop bar
          if (dz > 0 && dz < 45) {
            const t = Math.min(1, Math.max(0, (45 - dz) / (45 - 3.0)));
            tz += t * 9.20;
          }

          const curDz = tz - jz;
          if (Math.abs(curDz) < 6.4) {
            const flare = Math.cos((curDz / 6.4) * (Math.PI / 2));
            if (laneIndex === 0) tx = jx + 1.6 + flare * 3.4; // Reaches jx + 5.0 at center
            else tx = jx + 4.2 + flare * 1.5;
          } else {
            tx = nbLanes[laneIndex];
          }
        }
        road = Math.hypot(tx - jx, tz - jz) < 6.4 ? "junction" : "cross";
      }

      // ── GUARANTEED CENTER CIRCULAR ISLAND EXCLUSION BARRIER ──
      // Physical barrier: vehicle body can NEVER intersect or penetrate the center circular island!
      const currentDist = Math.hypot(tx - jx, tz - jz);
      const R_ISLAND_BARRIER = 4.75;
      if (currentDist < R_ISLAND_BARRIER) {
        const pushRatio = R_ISLAND_BARRIER / Math.max(currentDist, 0.01);
        tx = jx + (tx - jx) * pushRatio;
        tz = jz + (tz - jz) * pushRatio;
      }

      // ── ACCURATE DIRECTIONAL HEADING ──
      const prev = prevMap.get(v.id);
      if (prev) {
        const pdx = tx - prev.x;
        const pdz = tz - prev.z;
        if (Math.hypot(pdx, pdz) > 0.03) {
          rotY = Math.atan2(pdx, pdz);
        } else {
          rotY = prev.rotY;
        }
      } else {
        if (dir === "EB") rotY = Math.PI / 2;
        else if (dir === "WB") rotY = -Math.PI / 2;
        else if (dir === "SB") rotY = 0;
        else if (dir === "NB") rotY = Math.PI;
        else rotY = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
      }

      candidates.push({ v, id: v.id, isEv, kind, road, dir, juncId: nearestJuncId, laneIndex, tx, tz, rotY });
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. RED LIGHT STOPPING BEFORE ZEBRA CROSSWALKS & STOP BARS
    // Vehicles approaching on RED or YELLOW halt firmly behind the stop bar.
    // They NEVER enter the intersection or roundabout on red.
    // ──────────────────────────────────────────────────────────────────
    const signalAspects = new Map<string, IntersectionSignalAspects>();
    if (intersections && intersections.length > 0) {
      intersections.forEach((inter) => {
        signalAspects.set(inter.id, getIntersectionAspects(inter));
      });
    }

    const ebLaneOffsets = [1.8, 4.5, 7.2];
    const wbLaneOffsets = [-1.8, -4.5, -7.2];
    const sbLaneOffsets = [-1.6, -4.2];
    const nbLaneOffsets = [1.6, 4.2];

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.isEv) continue; // Emergency vehicles preempt

      const junc = INTERSECTIONS_INFO[c.juncId];
      if (!junc) continue;
      const aspects = signalAspects.get(c.juncId);
      if (!aspects) continue;

      const jx = junc.x;
      const jz = junc.z;

      // Stop bars are positioned at 3.2m before junction crosswalk edge
      if (c.dir === "EB") {
        const isRedOrYellow = aspects.W !== "green";
        const stopLineX = jx - HALF_CROSS - 3.2; // ~ jx - 9.2
        if (isRedOrYellow && c.tx < jx + 1.0) {
          c.tx = Math.min(c.tx, stopLineX);
          c.tz = jz + (ebLaneOffsets[c.laneIndex] ?? 4.5);
          c.rotY = Math.PI / 2;
        }
      } else if (c.dir === "WB") {
        const isRedOrYellow = aspects.E !== "green";
        const stopLineX = jx + HALF_CROSS + 3.2; // ~ jx + 9.2
        if (isRedOrYellow && c.tx > jx - 1.0) {
          c.tx = Math.max(c.tx, stopLineX);
          c.tz = jz + (wbLaneOffsets[c.laneIndex] ?? -4.5);
          c.rotY = -Math.PI / 2;
        }
      } else if (c.dir === "SB") {
        const isRedOrYellow = aspects.N !== "green";
        const stopLineZ = jz - HALF_ROAD - 3.2; // ~ jz - 12.2
        if (isRedOrYellow && c.tz < jz + 1.0) {
          c.tz = Math.min(c.tz, stopLineZ);
          c.tx = jx + (sbLaneOffsets[c.laneIndex] ?? -1.6);
          c.rotY = 0;
        }
      } else if (c.dir === "NB") {
        const isRedOrYellow = aspects.S !== "green";
        const stopLineZ = jz + HALF_ROAD + 3.2; // ~ jz + 12.2
        if (isRedOrYellow && c.tz > jz - 1.0) {
          c.tz = Math.max(c.tz, stopLineZ);
          c.tx = jx + (nbLaneOffsets[c.laneIndex] ?? 1.6);
          c.rotY = Math.PI;
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // 3. PURE MULTI-LANE QUEUING BEHIND STOP BARS
    // Vehicles queue in straight parallel columns across all 3 lanes on
    // arterials (2 lanes on cross streets) with safe bumper-to-bumper gap.
    // ──────────────────────────────────────────────────────────────────
    const getVehicleLength = (k: VisualVehicleKind): number => {
      if (k === "motorcycle") return 1.8;
      if (k === "rickshaw") return 2.4;
      if (k === "car") return 3.2;
      if (k === "truck") return 4.8;
      if (k === "bus") return 5.2;
      return 3.2;
    };

    const laneGroups = new Map<string, VehicleCandidate[]>();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const junc = INTERSECTIONS_INFO[c.juncId];
      if (!junc) continue;

      let isApproach = false;
      if (c.dir === "EB" && c.tx <= junc.x - HALF_CROSS - 1.0) isApproach = true;
      else if (c.dir === "WB" && c.tx >= junc.x + HALF_CROSS + 1.0) isApproach = true;
      else if (c.dir === "SB" && c.tz <= junc.z - HALF_ROAD - 1.0) isApproach = true;
      else if (c.dir === "NB" && c.tz >= junc.z + HALF_ROAD + 1.0) isApproach = true;

      if (!isApproach) continue;

      const key = `${c.juncId}_${c.dir}_${c.laneIndex}`;
      let group = laneGroups.get(key);
      if (!group) {
        group = [];
        laneGroups.set(key, group);
      }
      group.push(c);
    }

    laneGroups.forEach((cars, key) => {
      if (cars.length <= 1) return;
      const isEB = key.includes("_EB_");
      const isWB = key.includes("_WB_");
      const isSB = key.includes("_SB_");
      const isNB = key.includes("_NB_");

      if (isEB) {
        // Eastbound (+X): lead car has highest tx
        cars.sort((a, b) => b.tx - a.tx);
        for (let k = 1; k < cars.length; k++) {
          const lead = cars[k - 1];
          const curr = cars[k];
          const minGap = (getVehicleLength(lead.kind) + getVehicleLength(curr.kind)) / 2;
          if (curr.tx > lead.tx - minGap) {
            curr.tx = lead.tx - minGap;
          }
          const junc = INTERSECTIONS_INFO[curr.juncId];
          if (junc) curr.tz = junc.z + (ebLaneOffsets[curr.laneIndex] ?? 4.5);
          curr.rotY = Math.PI / 2;
        }
      } else if (isWB) {
        // Westbound (-X): lead car has lowest tx
        cars.sort((a, b) => a.tx - b.tx);
        for (let k = 1; k < cars.length; k++) {
          const lead = cars[k - 1];
          const curr = cars[k];
          const minGap = (getVehicleLength(lead.kind) + getVehicleLength(curr.kind)) / 2;
          if (curr.tx < lead.tx + minGap) {
            curr.tx = lead.tx + minGap;
          }
          const junc = INTERSECTIONS_INFO[curr.juncId];
          if (junc) curr.tz = junc.z + (wbLaneOffsets[curr.laneIndex] ?? -4.5);
          curr.rotY = -Math.PI / 2;
        }
      } else if (isSB) {
        // Southbound (+Z): lead car has highest tz
        cars.sort((a, b) => b.tz - a.tz);
        for (let k = 1; k < cars.length; k++) {
          const lead = cars[k - 1];
          const curr = cars[k];
          const minGap = (getVehicleLength(lead.kind) + getVehicleLength(curr.kind)) / 2;
          if (curr.tz > lead.tz - minGap) {
            curr.tz = lead.tz - minGap;
          }
          const junc = INTERSECTIONS_INFO[curr.juncId];
          if (junc) curr.tx = junc.x + (sbLaneOffsets[curr.laneIndex] ?? -1.6);
          curr.rotY = 0;
        }
      } else if (isNB) {
        // Northbound (-Z): lead car has lowest tz
        cars.sort((a, b) => a.tz - b.tz);
        for (let k = 1; k < cars.length; k++) {
          const lead = cars[k - 1];
          const curr = cars[k];
          const minGap = (getVehicleLength(lead.kind) + getVehicleLength(curr.kind)) / 2;
          if (curr.tz < lead.tz + minGap) {
            curr.tz = lead.tz + minGap;
          }
          const junc = INTERSECTIONS_INFO[curr.juncId];
          if (junc) curr.tx = junc.x + (nbLaneOffsets[curr.laneIndex] ?? 1.6);
          curr.rotY = Math.PI;
        }
      }
    });

    // ──────────────────────────────────────────────────────────────────
    // 4. ROUNDABOUT ENTRANCE YIELDING & ANTI-GRIDLOCK ("DON'T BLOCK THE BOX")
    // Authorized vehicles on GREEN yield to circulating traffic and wait
    // if the roundabout circulating space is congested.
    // ──────────────────────────────────────────────────────────────────
    const circulatingCounts = new Map<string, number>();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const junc = INTERSECTIONS_INFO[c.juncId];
      if (!junc) continue;
      const d = Math.hypot(c.tx - junc.x, c.tz - junc.z);
      if (d < 6.4) {
        circulatingCounts.set(c.juncId, (circulatingCounts.get(c.juncId) || 0) + 1);
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.isEv) continue;
      const junc = INTERSECTIONS_INFO[c.juncId];
      if (!junc) continue;

      const dCenter = Math.hypot(c.tx - junc.x, c.tz - junc.z);
      const isApproachingEntrance = dCenter >= 6.2 && dCenter <= 9.8;
      if (!isApproachingEntrance) continue;

      const inRoundabout = circulatingCounts.get(c.juncId) || 0;
      let mustYield = inRoundabout >= 3; // Anti-gridlock: do not flood roundabout

      if (!mustYield) {
        for (let j = 0; j < candidates.length; j++) {
          if (i === j) continue;
          const other = candidates[j];
          if (other.juncId !== c.juncId) continue;
          const otherD = Math.hypot(other.tx - junc.x, other.tz - junc.z);
          if (other.isEv || (otherD < 6.4 && Math.hypot(c.tx - other.tx, c.tz - other.tz) < 5.0)) {
            mustYield = true;
            break;
          }
        }
      }

      if (mustYield) {
        if (c.dir === "EB") c.tx = Math.min(c.tx, junc.x - HALF_CROSS - 0.7);
        else if (c.dir === "WB") c.tx = Math.max(c.tx, junc.x + HALF_CROSS + 0.7);
        else if (c.dir === "SB") c.tz = Math.min(c.tz, junc.z - HALF_ROAD - 0.7);
        else if (c.dir === "NB") c.tz = Math.max(c.tz, junc.z + HALF_ROAD + 0.7);
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // 5. PAIRWISE CONFLICT RESOLUTION FOR CIRCULATING VEHICLES
    // Prevents overlaps for active vehicles circulating inside the roundabout
    // ──────────────────────────────────────────────────────────────────
    const MIN_CAR_DIST = 3.2;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < candidates.length; i++) {
        const c1 = candidates[i];
        const junc = INTERSECTIONS_INFO[c1.juncId];
        if (!junc) continue;
        const d1 = Math.hypot(c1.tx - junc.x, c1.tz - junc.z);
        if (d1 > 6.4) continue;

        for (let j = i + 1; j < candidates.length; j++) {
          const c2 = candidates[j];
          if (c2.juncId !== c1.juncId) continue;
          const d2 = Math.hypot(c2.tx - junc.x, c2.tz - junc.z);
          if (d2 > 6.4) continue;

          const dist = Math.hypot(c1.tx - c2.tx, c1.tz - c2.tz);
          if (dist < MIN_CAR_DIST) {
            let p1 = 0;
            let p2 = 0;
            if (c1.isEv) p1 += 100;
            if (c2.isEv) p2 += 100;
            if (d1 < d2) p1 += 5; else p2 += 5;

            const primary = p1 >= p2 ? c1 : c2;
            const yielding = p1 >= p2 ? c2 : c1;

            const diffX = yielding.tx - primary.tx;
            const diffZ = yielding.tz - primary.tz;
            const currentSep = Math.hypot(diffX, diffZ) || 0.001;
            const pushAmt = (MIN_CAR_DIST - currentSep);

            yielding.tx += (diffX / currentSep) * pushAmt;
            yielding.tz += (diffZ / currentSep) * pushAmt;

            const yd = Math.hypot(yielding.tx - junc.x, yielding.tz - junc.z);
            if (yd < 4.75) {
              const ys = 4.75 / Math.max(yd, 0.01);
              yielding.tx = junc.x + (yielding.tx - junc.x) * ys;
              yielding.tz = junc.z + (yielding.tz - junc.z) * ys;
            }
          }
        }
      }
    }

    // Priority clearance for emergency vehicles
    for (let i = 0; i < candidates.length; i++) {
      const ev = candidates[i];
      if (!ev.isEv) continue;
      for (let j = 0; j < candidates.length; j++) {
        if (i === j) continue;
        const other = candidates[j];
        const dist = Math.hypot(other.tx - ev.tx, other.tz - ev.tz);
        if (dist < 4.5) {
          if (ev.dir === "EB") other.tx += 2.2;
          else if (ev.dir === "WB") other.tx -= 2.2;
          else if (ev.dir === "SB") other.tz += 2.2;
          else if (ev.dir === "NB") other.tz -= 2.2;
        }
      }
    }

    // Persist finalized positions for smooth frame-to-frame headings
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      prevMap.set(c.id, { x: c.tx, z: c.tz, rotY: c.rotY });
    }

    // ──────────────────────────────────────────────────────────────────
    // 6. RENDER 5 VEHICLE TYPES TO INSTANCED MESHES (60 FPS)
    // ──────────────────────────────────────────────────────────────────
    let carCount = 0;
    let motoCount = 0;
    let busCount = 0;
    let truckCount = 0;
    let rickshawCount = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { v, id, isEv, kind, tx, tz, rotY } = candidates[i];

      if (isEv) {
        foundEv = v;
        if (evGroup) {
          evGroup.visible = true;
          evGroup.position.set(tx, 0.08, tz);
          evGroup.rotation.y = rotY;
          evStateRef.current = { x: tx, z: tz, rotY, speed: v.speed };
        }
      } else if (settings.showVehicles) {
        dummy.position.set(tx, 0.08, tz);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();

        let hash = 0;
        for (let c = 0; c < id.length; c++) hash = ((hash << 5) - hash + id.charCodeAt(c)) | 0;
        const colorIdx = Math.abs(hash);

        if (kind === "car" && carCount < 1000) {
          instancedCars?.setMatrixAt(carCount, dummy.matrix);
          instancedCabins?.setMatrixAt(carCount, dummy.matrix);
          instancedWheels?.setMatrixAt(carCount, dummy.matrix);
          instancedHeadlights?.setMatrixAt(carCount, dummy.matrix);
          instancedTaillights?.setMatrixAt(carCount, dummy.matrix);
          instancedCars?.setColorAt(carCount, carColors[colorIdx % carColors.length]);
          carCount++;
        } else if (kind === "motorcycle" && motoCount < 500) {
          instancedMotos?.setMatrixAt(motoCount, dummy.matrix);
          instancedMotoWheels?.setMatrixAt(motoCount, dummy.matrix);
          instancedMotos?.setColorAt(motoCount, motoColors[colorIdx % motoColors.length]);
          motoCount++;
        } else if (kind === "bus" && busCount < 300) {
          instancedBuses?.setMatrixAt(busCount, dummy.matrix);
          instancedBusGlass?.setMatrixAt(busCount, dummy.matrix);
          instancedBusWheels?.setMatrixAt(busCount, dummy.matrix);
          instancedBusSigns?.setMatrixAt(busCount, dummy.matrix);
          instancedBuses?.setColorAt(busCount, busColors[colorIdx % busColors.length]);
          busCount++;
        } else if (kind === "truck" && truckCount < 300) {
          instancedTruckCabs?.setMatrixAt(truckCount, dummy.matrix);
          instancedTruckCargo?.setMatrixAt(truckCount, dummy.matrix);
          instancedTruckWheels?.setMatrixAt(truckCount, dummy.matrix);
          instancedTruckCabs?.setColorAt(truckCount, truckColors[colorIdx % truckColors.length]);
          instancedTruckCargo?.setColorAt(truckCount, truckColors[(colorIdx + 2) % truckColors.length]);
          truckCount++;
        } else if (kind === "rickshaw" && rickshawCount < 500) {
          instancedRickshawBody?.setMatrixAt(rickshawCount, dummy.matrix);
          instancedRickshawCanopy?.setMatrixAt(rickshawCount, dummy.matrix);
          instancedRickshawWheels?.setMatrixAt(rickshawCount, dummy.matrix);
          instancedRickshawBody?.setColorAt(rickshawCount, rickshawColors[colorIdx % rickshawColors.length]);
          rickshawCount++;
        }
      }
    }

    if (!foundEv && evGroup) {
      evGroup.visible = false;
      evStateRef.current = null;
    }

    // Update Counts & Buffer Flags across all 5 vehicle groups
    // 1. Cars
    if (instancedCars) {
      instancedCars.count = carCount;
      instancedCars.instanceMatrix.needsUpdate = true;
      if (instancedCars.instanceColor) instancedCars.instanceColor.needsUpdate = true;
    }
    if (instancedCabins) {
      instancedCabins.count = carCount;
      instancedCabins.instanceMatrix.needsUpdate = true;
    }
    if (instancedWheels) {
      instancedWheels.count = carCount;
      instancedWheels.instanceMatrix.needsUpdate = true;
    }
    if (instancedHeadlights) {
      instancedHeadlights.count = carCount;
      instancedHeadlights.instanceMatrix.needsUpdate = true;
    }
    if (instancedTaillights) {
      instancedTaillights.count = carCount;
      instancedTaillights.instanceMatrix.needsUpdate = true;
    }

    // 2. Motorcycles
    if (instancedMotos) {
      instancedMotos.count = motoCount;
      instancedMotos.instanceMatrix.needsUpdate = true;
      if (instancedMotos.instanceColor) instancedMotos.instanceColor.needsUpdate = true;
    }
    if (instancedMotoWheels) {
      instancedMotoWheels.count = motoCount;
      instancedMotoWheels.instanceMatrix.needsUpdate = true;
    }

    // 3. Buses
    if (instancedBuses) {
      instancedBuses.count = busCount;
      instancedBuses.instanceMatrix.needsUpdate = true;
      if (instancedBuses.instanceColor) instancedBuses.instanceColor.needsUpdate = true;
    }
    if (instancedBusGlass) {
      instancedBusGlass.count = busCount;
      instancedBusGlass.instanceMatrix.needsUpdate = true;
    }
    if (instancedBusWheels) {
      instancedBusWheels.count = busCount;
      instancedBusWheels.instanceMatrix.needsUpdate = true;
    }
    if (instancedBusSigns) {
      instancedBusSigns.count = busCount;
      instancedBusSigns.instanceMatrix.needsUpdate = true;
    }

    // 4. Trucks
    if (instancedTruckCabs) {
      instancedTruckCabs.count = truckCount;
      instancedTruckCabs.instanceMatrix.needsUpdate = true;
      if (instancedTruckCabs.instanceColor) instancedTruckCabs.instanceColor.needsUpdate = true;
    }
    if (instancedTruckCargo) {
      instancedTruckCargo.count = truckCount;
      instancedTruckCargo.instanceMatrix.needsUpdate = true;
      if (instancedTruckCargo.instanceColor) instancedTruckCargo.instanceColor.needsUpdate = true;
    }
    if (instancedTruckWheels) {
      instancedTruckWheels.count = truckCount;
      instancedTruckWheels.instanceMatrix.needsUpdate = true;
    }

    // 5. Auto-rickshaws
    if (instancedRickshawBody) {
      instancedRickshawBody.count = rickshawCount;
      instancedRickshawBody.instanceMatrix.needsUpdate = true;
      if (instancedRickshawBody.instanceColor) instancedRickshawBody.instanceColor.needsUpdate = true;
    }
    if (instancedRickshawCanopy) {
      instancedRickshawCanopy.count = rickshawCount;
      instancedRickshawCanopy.instanceMatrix.needsUpdate = true;
    }
    if (instancedRickshawWheels) {
      instancedRickshawWheels.count = rickshawCount;
      instancedRickshawWheels.instanceMatrix.needsUpdate = true;
    }
  }, [vehicles, settings.showVehicles, intersections]);

  // ──────────────────────────────────────────────────────────────────
  // UPDATE REALISTIC TRAFFIC LIGHT HEADS & DYNAMIC STOP BARS
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!intersections || intersections.length === 0) return;

    const stopBars = stopBarsRef.current;
    const signalHeads = trafficLightHeadsRef.current;

    const aspectColorMap: Record<SignalAspect, number> = {
      green: 0x22c55e,
      yellow: 0xf59e0b,
      red: 0xef4444,
    };

    intersections.forEach((inter: IntersectionState) => {
      const aspects = getIntersectionAspects(inter);

      // 1. Update 3D Gantry Traffic Light Heads (Directional approaches & groups)
      applyAspectToHeadMats(signalHeads.get(`${inter.id}_W`), aspects.W);
      applyAspectToHeadMats(signalHeads.get(`${inter.id}_E`), aspects.E);
      applyAspectToHeadMats(signalHeads.get(`${inter.id}_N`), aspects.N);
      applyAspectToHeadMats(signalHeads.get(`${inter.id}_S`), aspects.S);

      applyAspectToHeadMats(signalHeads.get(`${inter.id}_EW`), aspects.EW);
      applyAspectToHeadMats(signalHeads.get(`${inter.id}_NS`), aspects.NS);

      // 2. Update Stop Bars on Asphalt to match active approach aspects
      const barEWE = stopBars.get(`${inter.id}_EW_E`);
      const barEWW = stopBars.get(`${inter.id}_EW_W`);
      const barNSN = stopBars.get(`${inter.id}_NS_N`);
      const barNSS = stopBars.get(`${inter.id}_NS_S`);

      if (barEWE && barEWE.material instanceof THREE.MeshBasicMaterial) {
        barEWE.material.color.setHex(aspectColorMap[aspects.E]);
      }
      if (barEWW && barEWW.material instanceof THREE.MeshBasicMaterial) {
        barEWW.material.color.setHex(aspectColorMap[aspects.W]);
      }
      if (barNSN && barNSN.material instanceof THREE.MeshBasicMaterial) {
        barNSN.material.color.setHex(aspectColorMap[aspects.N]);
      }
      if (barNSS && barNSS.material instanceof THREE.MeshBasicMaterial) {
        barNSS.material.color.setHex(aspectColorMap[aspects.S]);
      }
    });
  }, [intersections]);

  // ──────────────────────────────────────────────────────────────────
  // DYNAMIC DAY / NIGHT THEME LIGHTING & MATERIALS
  // ──────────────────────────────────────────────────────────────────
  const applyThemeMode = useCallback((mode: "day" | "night" | "sunset") => {
    const scene = sceneRef.current;
    const lights = lightsRef.current;
    const renderer = rendererRef.current;
    if (!scene || !lights) return;

    const isDay = mode === "day";

    if (isDay) {
      // Natural daylight sky & warm sunlight
      scene.background = new THREE.Color(0xbfe0f7);
      if (scene.fog) {
        scene.fog.color.setHex(0xbfe0f7);
        (scene.fog as THREE.FogExp2).density = 0.0010;
      }
      lights.ambient.color.setHex(0xffffff);
      lights.ambient.intensity = 1.7;
      lights.dir.color.setHex(0xfffaed);
      lights.dir.intensity = 2.4;
      lights.dir.position.set(120, 240, 100);
      lights.hemi.color.setHex(0xbae6fd);
      lights.hemi.groundColor.setHex(0x94a3b8);
      lights.hemi.intensity = 1.1;

      if (groundMatRef.current) groundMatRef.current.color.setHex(0xe2e8f0);
      if (roadMatRef.current) roadMatRef.current.color.setHex(0x1e2638);
      if (curbMatRef.current) curbMatRef.current.color.setHex(0x94a3b8);
      if (dashLineMatRef.current) dashLineMatRef.current.color.setHex(0xffffff);
      if (gridHelperRef.current) gridHelperRef.current.visible = false;
      if (wallMatRef.current) wallMatRef.current.color.setHex(0xd1d5db);
      if (parkMatRef.current) parkMatRef.current.color.setHex(0x22c55e);
      if (roundaboutLawnMatRef.current) roundaboutLawnMatRef.current.color.setHex(0x16a34a);
      if (roundaboutApronMatRef.current) roundaboutApronMatRef.current.color.setHex(0xd1d5db);
      if (roundaboutCurbMatRef.current) roundaboutCurbMatRef.current.color.setHex(0x94a3b8);
      if (renderer) renderer.toneMappingExposure = 1.05;
    } else {
      // Cyber midnight & moonlight
      scene.background = new THREE.Color(0x0a0e17);
      if (scene.fog) {
        scene.fog.color.setHex(0x0a0e17);
        (scene.fog as THREE.FogExp2).density = 0.0022;
      }
      lights.ambient.color.setHex(0x1e293b);
      lights.ambient.intensity = 1.3;
      lights.dir.color.setHex(0x93c5fd);
      lights.dir.intensity = 1.8;
      lights.dir.position.set(100, 220, 120);
      lights.hemi.color.setHex(0x38bdf8);
      lights.hemi.groundColor.setHex(0x0f172a);
      lights.hemi.intensity = 0.7;

      if (groundMatRef.current) groundMatRef.current.color.setHex(0x0c111a);
      if (roadMatRef.current) roadMatRef.current.color.setHex(0x131a26);
      if (curbMatRef.current) curbMatRef.current.color.setHex(0x1e293b);
      if (dashLineMatRef.current) dashLineMatRef.current.color.setHex(0x94a3b8);
      if (gridHelperRef.current) gridHelperRef.current.visible = true;
      if (wallMatRef.current) wallMatRef.current.color.setHex(0x1e293b);
      if (parkMatRef.current) parkMatRef.current.color.setHex(0x14532d);
      if (roundaboutLawnMatRef.current) roundaboutLawnMatRef.current.color.setHex(0x0f5132);
      if (roundaboutApronMatRef.current) roundaboutApronMatRef.current.color.setHex(0x334155);
      if (roundaboutCurbMatRef.current) roundaboutCurbMatRef.current.color.setHex(0x1e293b);
      if (renderer) renderer.toneMappingExposure = 1.2;
    }
  }, []);

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode, applyThemeMode]);

  // ──────────────────────────────────────────────────────────────────
  // CAMERA PRESETS
  // ──────────────────────────────────────────────────────────────────
  const setCameraView = (mode: CameraPreset) => {
    setCameraPreset(mode);
    cameraPresetRef.current = mode;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (mode === "perspective") {
      setTrackedEv(null, "none");
      camera.position.set(0, 140, 220);
      controls.target.set(0, 0, 0);
    } else if (mode === "isometric") {
      setTrackedEv(null, "none");
      camera.position.set(200, 220, 200);
      controls.target.set(0, 0, 0);
    } else if (mode === "topdown") {
      setTrackedEv(null, "none");
      camera.position.set(0, 320, 0);
      controls.target.set(0, 0, 0);
    } else if (mode === "chokepoint") {
      setTrackedEv(null, "none");
      const b0 = INTERSECTIONS_INFO.B0;
      camera.position.set(b0.x, 38, b0.z + 55);
      controls.target.set(b0.x, 0, b0.z);
    } else if (mode === "ev") {
      if (activeEvVehicle) {
        setTrackedEv(activeEvVehicle.id, evCamAngleRef.current);
      }
    }
    controls.update();
    // Guarantee active theme is never reset on view switch
    applyThemeMode(themeModeRef.current);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-200 dark:bg-[#0a0e17] select-none font-sans">
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 🚨 SLEEK STREAMLINED EMERGENCY VEHICLE DISPATCH HUD */}
      {isEvCamActive && (
        <div className="absolute top-3 left-4 md:left-14 z-30 flex items-center animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
          <div className="h-11 px-3 rounded-full bg-white/95 dark:bg-[#0c101c]/95 border border-red-500/40 dark:border-red-500/50 backdrop-blur-xl shadow-xl shadow-red-500/10 flex items-center gap-2 text-xs whitespace-nowrap flex-nowrap select-none">
            {/* Live Beacon Badge */}
            <div className="h-7 px-2.5 rounded-full bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 font-bold font-mono text-[11px] whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 leading-none">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="whitespace-nowrap">LIVE EV-01</span>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-gray-800 flex-shrink-0" />

            {/* Speed Gauge */}
            <div className="h-7 px-2.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-mono whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 leading-none">
              <span className="text-[10px] text-emerald-600/70 dark:text-emerald-500/70 font-semibold whitespace-nowrap">SPD</span>
              <span className="text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                {activeEvVehicle ? `${Math.round(activeEvVehicle.speed * 3.6)} km/h` : "48 km/h"}
              </span>
            </div>

            {/* Green Wave Corridor Status */}
            <div className="hidden sm:flex h-7 px-2.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-[11px] font-mono text-blue-700 dark:text-blue-400 font-bold whitespace-nowrap flex-shrink-0 items-center gap-1.5 leading-none">
              <Zap className="w-3 h-3 text-amber-500 animate-pulse flex-shrink-0" />
              <span className="whitespace-nowrap">GREEN WAVE</span>
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-gray-800 flex-shrink-0" />

            {/* Clean Segmented Camera Angle Switcher */}
            <div className="h-7 p-0.5 rounded-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 flex items-center gap-0.5 text-[11px] whitespace-nowrap flex-shrink-0">
              {(
                [
                  ["chase", "Chase", Car],
                  ["dash", "Dash", Crosshair],
                  ["drone", "Drone", Video],
                ] as const
              ).map(([mode, label, IconComponent]) => (
                <button
                  key={mode}
                  onClick={() => {
                    setEvCamAngle(mode);
                    setCameraPreset("ev");
                  }}
                  className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all ${evCamAngle === mode
                    ? "bg-red-600 text-white shadow-sm shadow-red-500/25 font-semibold"
                    : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                >
                  <IconComponent className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-slate-200 dark:bg-gray-800 flex-shrink-0" />

            {/* Siren Audio Toggle */}
            <button
              onClick={() => setIsSirenMuted(!isSirenMuted)}
              title={isSirenMuted ? "Unmute Siren Audio" : "Mute Siren Audio"}
              className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs transition-all ${!isSirenMuted
                ? "text-red-600 dark:text-red-400 bg-red-100/70 dark:bg-red-950/50 hover:bg-red-200/70"
                : "text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800"
                }`}
            >
              {!isSirenMuted ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {/* Exit EV Cam */}
            <button
              onClick={() => {
                setTrackedEv(null, "none");
                setCameraPreset("perspective");
              }}
              title="Exit Emergency Vehicle Tracking"
              className="h-7 px-2.5 rounded-full flex items-center gap-1 bg-slate-100 hover:bg-slate-200 dark:bg-gray-800/80 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-200 text-[11px] font-medium whitespace-nowrap flex-shrink-0 transition-all"
            >
              <X className="w-3 h-3 text-slate-500 dark:text-gray-400 flex-shrink-0" />
              <span className="whitespace-nowrap">Exit</span>
            </button>
          </div>
        </div>
      )}

      {/* TOP-RIGHT DIRECT INTERSECTION SELECTOR PILLS (Clickable easily, hidden when 0, shown when module runs) */}
      {intersections.length > 0 && (
        <div
          className={`absolute z-50 transition-all duration-300 flex items-center gap-1.5 p-1 rounded-2xl bg-white/95 dark:bg-[#090d16]/90 border border-slate-200 dark:border-gray-800 backdrop-blur-md shadow-xl text-xs pointer-events-auto select-none ${
            isEvCamActive ? "top-16" : "top-3"
          } ${selectedIntersection ? "right-4 sm:right-[420px] max-w-[calc(100vw-440px)] overflow-x-auto" : "right-4"}`}
        >
          <div className="flex items-center gap-1 px-2 text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            <Radio className="w-3 h-3 text-blue-500 animate-pulse" />
            <span className="hidden sm:inline">Junctions</span>
          </div>

          {(["A1", "B1", "C1", "A0", "B0", "C0"] as const).map((id) => {
            const isSelected = selectedIntersection === id;
            const live = intersections.find((i) => i.id === id);
            const isGreen = live?.signal_state.slice(0, 4).includes("G");
            const q = live
              ? live.queue_lengths.N + live.queue_lengths.S + live.queue_lengths.E + live.queue_lengths.W
              : 0;

            return (
              <button
                key={id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSelected) {
                    selectIntersection(null);
                  } else {
                    selectIntersection(id);
                    focusIntersection(id);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer active:scale-95 pointer-events-auto ${
                  isSelected
                    ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 scale-105"
                    : "bg-slate-100 dark:bg-gray-800/80 hover:bg-slate-200 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-200 border-slate-200 dark:border-gray-700 hover:border-blue-400"
                }`}
                title={`Junction ${id} (Queued: ${q}) — Click to locate on 3D map & inspect`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isGreen ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-red-500 shadow-[0_0_6px_#ef4444]"
                  }`}
                />
                <span>{id}</span>
                <span
                  className={`text-[10px] px-1 py-0.2 rounded font-mono ${
                    isSelected
                      ? "bg-blue-700 text-white"
                      : "bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-gray-300"
                  }`}
                >
                  {q}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* LEFT COMPACT FLOATING TOOLBAR */}
      <div className="absolute top-14 left-4 z-20 flex flex-col gap-1 p-1 rounded-xl bg-white/90 dark:bg-[#090d16]/90 border border-slate-200 dark:border-gray-800 backdrop-blur-md shadow-xl transition-colors">
        {/* Visual Settings Drawer */}
        <button
          onClick={() => setShowDrawer(!showDrawer)}
          title="Layers & Settings"
          className={`p-2 rounded-lg transition-all ${showDrawer
            ? "bg-blue-600 text-white"
            : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* 3D Perspective */}
        <button
          onClick={() => setCameraView("perspective")}
          title="3D City View"
          className={`p-2 rounded-lg transition-all ${cameraPreset === "perspective"
            ? "bg-blue-600 text-white"
            : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}
        >
          <Building className="w-4 h-4" />
        </button>

        {/* 2D Top-Down */}
        <button
          onClick={() => setCameraView("topdown")}
          title="Top-Down Tactical View"
          className={`p-2 rounded-lg transition-all ${cameraPreset === "topdown"
            ? "bg-blue-600 text-white"
            : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* Isometric 45° */}
        <button
          onClick={() => setCameraView("isometric")}
          title="Isometric View"
          className={`p-2 rounded-lg transition-all ${cameraPreset === "isometric"
            ? "bg-blue-600 text-white"
            : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}
        >
          <Navigation className="w-4 h-4" />
        </button>

        {/* Focus B0 */}
        <button
          onClick={() => setCameraView("chokepoint")}
          title="Focus Chokepoint (B0)"
          className={`p-2 rounded-lg transition-all ${cameraPreset === "chokepoint"
            ? "bg-amber-600 text-white"
            : "text-slate-600 dark:text-gray-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-gray-800"
            }`}
        >
          <AlertTriangle className="w-4 h-4" />
        </button>

        {/* 🚨 EV Camera Toggle */}
        <button
          onClick={() => {
            if (activeEvVehicle) {
              setCameraView("ev");
            } else {
              setCameraPreset("ev");
            }
          }}
          title={activeEvVehicle ? "Track Emergency Vehicle" : "Emergency Camera Mode"}
          className={`p-2 rounded-lg transition-all ${isEvCamActive ? "bg-red-600 text-white animate-pulse" : "text-red-500 dark:text-red-400 hover:text-white hover:bg-red-600/60"
            }`}
        >
          <ShieldAlert className="w-4 h-4" />
        </button>
      </div>

      {/* LEFT DRAWER: Visualizer Settings */}
      {showDrawer && (
        <div className="absolute top-16 left-16 z-30 w-72 p-4 rounded-2xl bg-white/95 dark:bg-[#090d16]/95 border border-slate-200 dark:border-gray-700 backdrop-blur-xl shadow-2xl flex flex-col gap-3 text-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-gray-800">
            <span className="font-semibold text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              Layers & Graphics
            </span>
            <button onClick={() => setShowDrawer(false)} className="text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-300 font-bold">
              ✕
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-gray-300">3D Buildings</span>
            <input
              type="checkbox"
              checked={settings.showBuildings}
              onChange={(e) => setSettings({ ...settings, showBuildings: e.target.checked })}
              className="cursor-pointer accent-blue-600 w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-gray-300">Traffic Lanes & Markings</span>
            <input
              type="checkbox"
              checked={settings.showDetails}
              onChange={(e) => setSettings({ ...settings, showDetails: e.target.checked })}
              className="cursor-pointer accent-blue-600 w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-gray-300">Vehicle Models</span>
            <input
              type="checkbox"
              checked={settings.showVehicles}
              onChange={(e) => setSettings({ ...settings, showVehicles: e.target.checked })}
              className="cursor-pointer accent-blue-600 w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-gray-300">Parks & Green Zones</span>
            <input
              type="checkbox"
              checked={settings.showSpecialZones}
              onChange={(e) => setSettings({ ...settings, showSpecialZones: e.target.checked })}
              className="cursor-pointer accent-blue-600 w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-gray-800">
            <span className="text-emerald-600 dark:text-emerald-300 font-medium">Highlight Road Access</span>
            <input
              type="checkbox"
              checked={settings.showRoadAccess}
              onChange={(e) => setSettings({ ...settings, showRoadAccess: e.target.checked })}
              className="cursor-pointer accent-emerald-500 w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-amber-600 dark:text-amber-300 font-medium">Emergency Corridor Laser</span>
            <input
              type="checkbox"
              checked={settings.showEvCorridor}
              onChange={(e) => setSettings({ ...settings, showEvCorridor: e.target.checked })}
              className="cursor-pointer accent-amber-500 w-4 h-4"
            />
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT CAMERA BAR */}
      <div className="absolute bottom-3 left-4 z-20 flex items-center gap-1 p-1 rounded-xl bg-white/90 dark:bg-[#090d16]/85 border border-slate-200 dark:border-gray-800 backdrop-blur-md shadow-xl text-xs">
        <span className="text-slate-500 dark:text-gray-400 font-medium px-2 text-[11px]">View:</span>
        {(
          [
            ["perspective", "3D City"],
            ["isometric", "Iso 45°"],
            ["topdown", "2D Tactical"],
            ["chokepoint", "B0 Choke"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCameraView(key)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${cameraPreset === key && !isEvCamActive
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
              : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-800"
              }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setCameraView("perspective")}
          title="Reset Camera"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* BOTTOM-RIGHT CONGESTION LEGEND */}
      <div className="absolute bottom-3 right-4 z-20 flex items-center gap-2.5 bg-white/90 dark:bg-[#090d16]/85 border border-slate-200 dark:border-gray-800 rounded-xl px-3 py-1 backdrop-blur-md shadow-xl text-[10px]">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-slate-600 dark:text-gray-400 font-medium">Clear</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-slate-600 dark:text-gray-400 font-medium">Moderate</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-slate-600 dark:text-gray-400 font-medium">Congested</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-slate-600 dark:text-gray-400 font-medium">Priority Corridor</span>
        </div>
      </div>
    </div>
  );
}

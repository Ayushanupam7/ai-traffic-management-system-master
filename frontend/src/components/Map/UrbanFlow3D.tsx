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

  // Instanced Meshes for high-performance 60 FPS rendering
  const instancedCarsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedCabinsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedWheelsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedHeadlightsRef = useRef<THREE.InstancedMesh | null>(null);
  const instancedTaillightsRef = useRef<THREE.InstancedMesh | null>(null);
  const dummyRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const prevVehiclePosRef = useRef<Map<string, { x: number; z: number; rotY: number }>>(new Map());

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
  const lightsRef = useRef<{ ambient: THREE.AmbientLight; dir: THREE.DirectionalLight; hemi: THREE.HemisphereLight } | null>(null);
  const groundMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const roadMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const curbMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const dashLineMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const wallMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const parkMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

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

    // Double yellow medians
    [-0.3, 0.3].forEach((offset) => {
      [zTop, zBot].forEach((zVal) => {
        const medGeo = new THREE.PlaneGeometry(530, 0.22);
        const medMesh = new THREE.Mesh(medGeo, medianMat);
        medMesh.rotation.x = -Math.PI / 2;
        medMesh.position.set(0, 0.05, zVal + offset);
        detailsGroup.add(medMesh);
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

    // Stop Bars and Intersections
    Object.entries(INTERSECTIONS_INFO).forEach(([id, info]) => {
      const { x: jx, z: jz } = info;

      // Stop bars (Dynamic Green / Red based on signal state)
      const barEW = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, HALF_ROAD - 0.5),
        new THREE.MeshBasicMaterial({ color: 0x22c55e })
      );
      barEW.rotation.x = -Math.PI / 2;
      barEW.position.set(jx + HALF_CROSS + 0.5, 0.08, jz - HALF_ROAD / 2);
      detailsGroup.add(barEW);

      const barNS = new THREE.Mesh(
        new THREE.PlaneGeometry(HALF_CROSS - 0.5, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      barNS.rotation.x = -Math.PI / 2;
      barNS.position.set(jx - HALF_CROSS / 2, 0.08, jz - HALF_ROAD - 0.5);
      detailsGroup.add(barNS);

      stopBarsRef.current.set(`${id}_EW`, barEW);
      stopBarsRef.current.set(`${id}_NS`, barNS);

      // Traffic Signal Poles
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
      );
      pole.position.set(jx - HALF_CROSS - 2, 3.5, jz - HALF_ROAD - 2);
      detailsGroup.add(pole);

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 5, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155 })
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(jx - HALF_CROSS, 6.8, jz - HALF_ROAD - 2);
      detailsGroup.add(arm);
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
    // HIGH-PERFORMANCE INSTANCED MESHES FOR REGULAR CARS (60 FPS)
    // ──────────────────────────────────────────────────────────────────
    const MAX_INSTANCES = 1500;

    // 1. Aerodynamic Streamlined Body / Chassis
    // Sized proportionate to the 3D road lane geometry (each lane is ~3 units wide)
    const carBodyGeo = new THREE.BoxGeometry(1.08, 0.38, 2.30);
    carBodyGeo.translate(0, 0.34, 0);

    // 2. Tinted Aerodynamic Cabin
    const carCabinGeo = new THREE.BoxGeometry(0.92, 0.32, 1.30);
    carCabinGeo.translate(0, 0.65, -0.10);

    // 3. 4 Realistic Wheels with Rubber Tires
    const wheelBase = new THREE.CylinderGeometry(0.20, 0.20, 0.14, 12);
    wheelBase.rotateZ(Math.PI / 2);

    const wFL = wheelBase.clone().translate(-0.56, 0.20, 0.70);
    const wFR = wheelBase.clone().translate(0.56, 0.20, 0.70);
    const wRL = wheelBase.clone().translate(-0.56, 0.20, -0.70);
    const wRR = wheelBase.clone().translate(0.56, 0.20, -0.70);
    const carWheelsGeo = BufferGeometryUtils.mergeGeometries([wFL, wFR, wRL, wRR]);

    // 4. Front Xenon Headlights
    const hlBase = new THREE.BoxGeometry(0.20, 0.08, 0.06);
    const hlL = hlBase.clone().translate(-0.36, 0.38, 1.16);
    const hlR = hlBase.clone().translate(0.36, 0.38, 1.16);
    const carHeadlightsGeo = BufferGeometryUtils.mergeGeometries([hlL, hlR]);

    // 5. Rear Crimson Tail Lights
    const tlBase = new THREE.BoxGeometry(0.20, 0.08, 0.06);
    const tlL = tlBase.clone().translate(-0.36, 0.38, -1.16);
    const tlR = tlBase.clone().translate(0.36, 0.38, -1.16);
    const carTaillightsGeo = BufferGeometryUtils.mergeGeometries([tlL, tlR]);

    // Automotive Materials with Realistic Specularity
    const carBodyMat = new THREE.MeshStandardMaterial({
      roughness: 0.25,
      metalness: 0.55,
    });
    const carCabinMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.1,
      metalness: 0.85,
    });
    const carWheelMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.85,
      metalness: 0.2,
    });
    const carHeadlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const carTaillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // Ensure instanced geometries never get culled when zooming in or panning around the city
    const infiniteSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 10000);
    carBodyGeo.boundingSphere = infiniteSphere;
    carCabinGeo.boundingSphere = infiniteSphere;
    if (carWheelsGeo) carWheelsGeo.boundingSphere = infiniteSphere;
    if (carHeadlightsGeo) carHeadlightsGeo.boundingSphere = infiniteSphere;
    if (carTaillightsGeo) carTaillightsGeo.boundingSphere = infiniteSphere;

    const instancedCars = new THREE.InstancedMesh(carBodyGeo, carBodyMat, MAX_INSTANCES);
    const instancedCabins = new THREE.InstancedMesh(carCabinGeo, carCabinMat, MAX_INSTANCES);
    const instancedWheels = new THREE.InstancedMesh(carWheelsGeo, carWheelMat, MAX_INSTANCES);
    const instancedHeadlights = new THREE.InstancedMesh(carHeadlightsGeo, carHeadlightMat, MAX_INSTANCES);
    const instancedTaillights = new THREE.InstancedMesh(carTaillightsGeo, carTaillightMat, MAX_INSTANCES);

    // CRITICAL: Disable frustum culling so Three.js never hides vehicles at close zoom or off-center camera angles
    instancedCars.frustumCulled = false;
    instancedCabins.frustumCulled = false;
    instancedWheels.frustumCulled = false;
    instancedHeadlights.frustumCulled = false;
    instancedTaillights.frustumCulled = false;

    instancedCars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedCabins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedWheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedHeadlights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instancedTaillights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    scene.add(instancedCars);
    scene.add(instancedCabins);
    scene.add(instancedWheels);
    scene.add(instancedHeadlights);
    scene.add(instancedTaillights);

    instancedCarsRef.current = instancedCars;
    instancedCabinsRef.current = instancedCabins;
    instancedWheelsRef.current = instancedWheels;
    instancedHeadlightsRef.current = instancedHeadlights;
    instancedTaillightsRef.current = instancedTaillights;

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
  // ULTRA-FAST 60-FPS VEHICLE UPDATES (InstancedMesh)
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const instancedCars = instancedCarsRef.current;
    const instancedCabins = instancedCabinsRef.current;
    const instancedWheels = instancedWheelsRef.current;
    const instancedHeadlights = instancedHeadlightsRef.current;
    const instancedTaillights = instancedTaillightsRef.current;
    const dummy = dummyRef.current;
    const prevMap = prevVehiclePosRef.current;
    const evGroup = evGroupRef.current;

    if (!instancedCars || !instancedCabins || !vehicles) return;

    let regularCarCount = 0;
    let foundEv: VehicleState | null = null;

    // Realistic diverse automotive finishes
    const carColors = [
      new THREE.Color(0xf8fafc), // Pearl White Metallic
      new THREE.Color(0x18181b), // Obsidian / Jet Black
      new THREE.Color(0x334155), // Charcoal / Graphite
      new THREE.Color(0x94a3b8), // Nardo Silver Gray
      new THREE.Color(0xb91c1c), // Crimson Red Metallic
      new THREE.Color(0x881337), // Deep Velvet Burgundy
      new THREE.Color(0x0284c7), // Electric Riviera Blue
      new THREE.Color(0x1e3a8a), // Midnight Sapphire Blue
      new THREE.Color(0x047857), // British Racing Green
      new THREE.Color(0xd97706), // Tuscan Amber Gold
      new THREE.Color(0xea580c), // Sunset Orange
      new THREE.Color(0xfacc15), // Urban Taxi Yellow
      new THREE.Color(0x4f46e5), // Royal Indigo
      new THREE.Color(0x64748b), // Steel Slate
      new THREE.Color(0xc084fc), // Amethyst Violet
    ];

    // 1. Gather all vehicle candidates and calculate movement headings
    interface VehicleCandidate {
      v: VehicleState;
      id: string;
      isEv: boolean;
      tx: number;
      tz: number;
      rotY: number;
    }

    const candidates: VehicleCandidate[] = [];
    const maxCars = Math.min(vehicles.length, 1400);

    for (let i = 0; i < maxCars; i++) {
      const v = vehicles[i];
      const isEv = String(v.type) === "emergency" || v.id.toLowerCase().includes("emergency");

      const tx = toThreeX(v.x);
      const tz = toThreeZ(v.y);

      // Check heading from previous position
      let prev = prevMap.get(v.id);
      let rotY = 0;
      if (prev) {
        const dx = tx - prev.x;
        const dz = tz - prev.z;
        if (Math.hypot(dx, dz) > 0.04) {
          rotY = Math.atan2(dx, dz);
        } else {
          rotY = prev.rotY;
        }
      }
      prevMap.set(v.id, { x: tx, z: tz, rotY });
      candidates.push({ v, id: v.id, isEv, tx, tz, rotY });
    }

    // ──────────────────────────────────────────────────────────────────
    // SAFE FOLLOWING DISTANCE & VISUAL COLLISION PREVENTION
    // Ensures clean bumper-to-bumper queue gaps & prevents vehicle overlap.
    // ──────────────────────────────────────────────────────────────────
    const MIN_FOLLOW_DIST = 2.70; // Center-to-center safe distance matching new car length
    const EV_CLEARANCE = 4.0;     // Priority clearance corridor for emergency vehicle

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        for (let j = i + 1; j < candidates.length; j++) {
          const b = candidates[j];
          const dx = b.tx - a.tx;
          const dz = b.tz - a.tz;
          if (Math.abs(dx) > 3.8 || Math.abs(dz) > 3.8) continue;

          const distSq = dx * dx + dz * dz;
          const reqDist = a.isEv || b.isEv ? EV_CLEARANCE : MIN_FOLLOW_DIST;

          if (distSq < reqDist * reqDist) {
            let dist = Math.sqrt(distSq);
            let nx: number;
            let nz: number;
            if (dist < 0.001) {
              nx = Math.sin(b.rotY || 0);
              nz = Math.cos(b.rotY || 0);
              dist = 0.001;
            } else {
              nx = dx / dist;
              nz = dz / dist;
            }
            const overlap = reqDist - dist;

            if (a.isEv) {
              // Priority corridor: push vehicle B clear of emergency vehicle
              b.tx += nx * overlap;
              b.tz += nz * overlap;
            } else if (b.isEv) {
              // Priority corridor: push vehicle A clear of emergency vehicle
              a.tx -= nx * overlap;
              a.tz -= nz * overlap;
            } else {
              // Longitudinal following alignment
              const fwdAx = Math.sin(a.rotY);
              const fwdAz = Math.cos(a.rotY);
              const dotA = nx * fwdAx + nz * fwdAz;

              if (dotA > 0.40) {
                // Car A is facing Car B: Car A is behind Car B in queue
                // Push trailing Car A back along its heading vector
                a.tx -= fwdAx * overlap;
                a.tz -= fwdAz * overlap;
              } else if (dotA < -0.40) {
                // Car B is facing Car A: Car B is behind Car A in queue
                const fwdBx = Math.sin(b.rotY);
                const fwdBz = Math.cos(b.rotY);
                b.tx -= fwdBx * overlap;
                b.tz -= fwdBz * overlap;
              } else {
                // Lateral or turning convergence: separate equally
                const half = overlap * 0.5;
                a.tx -= nx * half;
                a.tz -= nz * half;
                b.tx += nx * half;
                b.tz += nz * half;
              }
            }
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // RENDER CANDIDATES TO INSTANCED MATRICES
    // ──────────────────────────────────────────────────────────────────
    for (let i = 0; i < candidates.length && regularCarCount < 1400; i++) {
      const { v, id, isEv, tx, tz, rotY } = candidates[i];

      if (isEv) {
        foundEv = v;
        if (evGroup) {
          evGroup.visible = true;
          evGroup.position.set(tx, 0.08, tz);
          evGroup.rotation.y = rotY;
          evStateRef.current = { x: tx, z: tz, rotY, speed: v.speed };
        }
      } else if (settings.showVehicles) {
        // High-performance shared transform matrix for car body, cabin, wheels & lights
        dummy.position.set(tx, 0.08, tz);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();

        instancedCars.setMatrixAt(regularCarCount, dummy.matrix);
        instancedCabins.setMatrixAt(regularCarCount, dummy.matrix);
        if (instancedWheels) instancedWheels.setMatrixAt(regularCarCount, dummy.matrix);
        if (instancedHeadlights) instancedHeadlights.setMatrixAt(regularCarCount, dummy.matrix);
        if (instancedTaillights) instancedTaillights.setMatrixAt(regularCarCount, dummy.matrix);

        // Assign realistic diverse color via full ID string hashing
        let hash = 0;
        for (let c = 0; c < id.length; c++) {
          hash = ((hash << 5) - hash + id.charCodeAt(c)) | 0;
        }
        const color = carColors[Math.abs(hash) % carColors.length];
        instancedCars.setColorAt(regularCarCount, color);

        regularCarCount++;
      }
    }

    if (!foundEv && evGroup) {
      evGroup.visible = false;
      evStateRef.current = null;
    }

    instancedCars.count = regularCarCount;
    instancedCabins.count = regularCarCount;
    if (instancedWheels) instancedWheels.count = regularCarCount;
    if (instancedHeadlights) instancedHeadlights.count = regularCarCount;
    if (instancedTaillights) instancedTaillights.count = regularCarCount;

    instancedCars.instanceMatrix.needsUpdate = true;
    instancedCabins.instanceMatrix.needsUpdate = true;
    if (instancedWheels) instancedWheels.instanceMatrix.needsUpdate = true;
    if (instancedHeadlights) instancedHeadlights.instanceMatrix.needsUpdate = true;
    if (instancedTaillights) instancedTaillights.instanceMatrix.needsUpdate = true;
    if (instancedCars.instanceColor) instancedCars.instanceColor.needsUpdate = true;
  }, [vehicles, settings.showVehicles]);

  // ──────────────────────────────────────────────────────────────────
  // UPDATE INTERSECTION STOP BARS
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!intersections || intersections.length === 0) return;
    intersections.forEach((inter: IntersectionState) => {
      const isEWGreen =
        inter.phase_index === 0 ||
        inter.signal_state.slice(0, 4).includes("G") ||
        inter.signal_state.slice(0, 4).includes("g");

      const barEW = stopBarsRef.current.get(`${inter.id}_EW`);
      const barNS = stopBarsRef.current.get(`${inter.id}_NS`);

      if (barEW && barEW.material instanceof THREE.MeshBasicMaterial) {
        barEW.material.color.setHex(isEWGreen ? 0x22c55e : 0xef4444);
      }
      if (barNS && barNS.material instanceof THREE.MeshBasicMaterial) {
        barNS.material.color.setHex(!isEWGreen ? 0x22c55e : 0xef4444);
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

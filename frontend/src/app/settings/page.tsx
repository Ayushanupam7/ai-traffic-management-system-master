"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTrafficStore } from "@/store/trafficStore";
import { API_BASE } from "@/lib/api";
import {
  User,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Sunset,
  Box,
  Compass,
  Cpu,
  Server,
  Sliders,
  Gauge,
  Bell,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Info,
  Layers,
  Zap,
  Activity,
  ArrowRight,
  Send,
  Code2,
} from "lucide-react";

export default function SettingsPage() {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const setThemeMode = useTrafficStore((s) => s.setThemeMode);
  const viewMode = useTrafficStore((s) => s.viewMode);
  const setViewMode = useTrafficStore((s) => s.setViewMode);
  const network = useTrafficStore((s) => s.network);
  const setNetwork = useTrafficStore((s) => s.setNetwork);
  const wsConnected = useTrafficStore((s) => s.wsConnected);
  const userName = useTrafficStore((s) => s.userName);
  const setUserName = useTrafficStore((s) => s.setUserName);
  const targetFps = useTrafficStore((s) => s.targetFps);
  const setTargetFps = useTrafficStore((s) => s.setTargetFps);

  // Creator Info
  const creatorName = "Ayush Anupam";
  const creatorEmail = "ayushanupamofficial7@gmail.com";
  const [copied, setCopied] = useState(false);

  // Preference states (stored in localStorage)
  const [profileNameInput, setProfileNameInput] = useState(userName || "User");
  const [framerateInput, setFramerateInput] = useState(targetFps || 60);
  const [apiUrl, setApiUrl] = useState(API_BASE);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [tickSpeedMs, setTickSpeedMs] = useState(1000);
  const [showFps, setShowFps] = useState(true);
  const [highDpi, setHighDpi] = useState(true);
  const [densityOverlay, setDensityOverlay] = useState(true);

  // Diagnostics state
  const [pingStatus, setPingStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [savedNotification, setSavedNotification] = useState(false);

  // Keep inputs in sync
  useEffect(() => {
    setProfileNameInput(userName || "User");
  }, [userName]);

  useEffect(() => {
    setFramerateInput(targetFps || 60);
  }, [targetFps]);

  // Load persisted preferences
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedApi = localStorage.getItem("marg_api_url");
      if (storedApi) setApiUrl(storedApi);
      const storedSound = localStorage.getItem("marg_sound_alerts");
      if (storedSound !== null) setSoundAlerts(storedSound === "true");
      const storedTick = localStorage.getItem("marg_tick_speed");
      if (storedTick) setTickSpeedMs(Number(storedTick));
      const storedFps = localStorage.getItem("marg_target_fps");
      if (storedFps) {
        setTargetFps(Number(storedFps));
        setFramerateInput(Number(storedFps));
      }
    }
  }, [setTargetFps]);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(creatorEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestConnection = async () => {
    setPingStatus("testing");
    const startTime = performance.now();
    try {
      const res = await fetch(`${apiUrl}/sim/status`, { method: "GET" });
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        setPingLatency(latency);
        setPingStatus("success");
      } else {
        setPingStatus("error");
      }
    } catch {
      setPingStatus("error");
    }
  };

  const handleSavePreferences = () => {
    const cleanUser = profileNameInput.trim() || "User";
    setUserName(cleanUser);
    setProfileNameInput(cleanUser);
    setTargetFps(framerateInput);
    if (typeof window !== "undefined") {
      localStorage.setItem("marg_user_name", cleanUser);
      localStorage.setItem("marg_target_fps", String(framerateInput));
      localStorage.setItem("marg_api_url", apiUrl);
      localStorage.setItem("marg_sound_alerts", String(soundAlerts));
      localStorage.setItem("marg_tick_speed", String(tickSpeedMs));
    }
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2500);
  };

  const handleResetDefaults = () => {
    setThemeMode("night");
    setViewMode("3d");
    setNetwork("arterial");
    setSoundAlerts(true);
    setAutoReconnect(true);
    setTickSpeedMs(1000);
    setShowFps(true);
    setHighDpi(true);
    setDensityOverlay(true);
    setApiUrl(API_BASE);
    setUserName("User");
    setProfileNameInput("User");
    setTargetFps(60);
    setFramerateInput(60);
    if (typeof window !== "undefined") {
      localStorage.setItem("marg_user_name", "User");
      localStorage.setItem("marg_target_fps", "60");
      localStorage.removeItem("marg_api_url");
      localStorage.removeItem("marg_sound_alerts");
      localStorage.removeItem("marg_tick_speed");
    }
    setSavedNotification(true);
    setTimeout(() => setSavedNotification(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#070b12] text-slate-900 dark:text-gray-100 p-4 md:p-8 transition-colors duration-250">
      <div className="max-w-5xl mx-auto space-y-8 pb-16">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <SettingsIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  System Settings & Preferences
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    मार्ग दृष्टि v1.0
                  </span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                  Configure simulation parameters, telemetry display, backend interfaces, and system credits.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-200/80 dark:bg-gray-800/80 hover:bg-slate-300 dark:hover:bg-gray-700 text-slate-800 dark:text-gray-200 transition-all shadow-sm"
            >
              Back to Dashboard
            </Link>
            <button
              onClick={handleSavePreferences}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/25 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* Saved Toast Banner */}
        {savedNotification && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-200">
            <Check className="w-4 h-4 text-emerald-500" />
            <span>Preferences successfully updated and applied!</span>
          </div>
        )}

        {/* CREATOR & DEVELOPER SPOTLIGHT CARD */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-indigo-50/40 to-blue-50/60 dark:from-[#0d1322] dark:via-[#0f172a] dark:to-[#131b2e] border border-blue-200/80 dark:border-indigo-900/60 p-6 md:p-8 shadow-xl shadow-blue-500/5">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start md:items-center gap-5">
              {/* Creator Avatar / Badge */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-xl shadow-orange-500/25 flex-shrink-0 border-2 border-white/20">
                AA
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {creatorName}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Lead Creator & AI Architect
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                    Marg Dhristhi
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-gray-300 max-w-xl leading-relaxed">
                  Creator and developer of <span className="font-semibold text-slate-900 dark:text-white">Marg Dhristhi (मार्ग दृष्टि)</span> — an autonomous next-generation AI traffic management, computer vision, and real-time flow orchestration platform.
                </p>

                {/* Email and Contact Pills */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-black/30 border border-slate-200 dark:border-gray-800 text-xs text-slate-700 dark:text-gray-300 font-mono">
                    <Mail className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <span className="select-all font-medium">{creatorEmail}</span>
                  </div>

                  <button
                    onClick={handleCopyEmail}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                      copied
                        ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                        : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied Email!" : "Copy Email"}</span>
                  </button>

                  <a
                    href={`mailto:${creatorEmail}?subject=Marg%20Dhristhi%20Traffic%20Management%20Inquiry`}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 transition-all duration-200"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Email</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Badge summary */}
            <div className="flex md:flex-col items-center md:items-end justify-between w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 border-slate-200/80 dark:border-gray-800 gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Verified System Author</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 dark:text-gray-500">
                <Code2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Full-Stack AI & Robotics</span>
              </div>
            </div>
          </div>
        </div>

        {/* OPERATOR / USER PROFILE CARD (CUSTOMIZABLE) */}
        <div className="rounded-3xl bg-white dark:bg-[#0c111c] border border-slate-200/90 dark:border-gray-800 p-6 md:p-7 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Operator Profile
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Customizable
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">
                  Set your custom operator name for live telemetry, simulation runs, and navigation (Default: &quot;User&quot;)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-xs font-mono">
              <span className="text-slate-400 dark:text-gray-500">Active:</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{userName || "User"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 block">
                Your Display Name
              </label>
              <input
                type="text"
                value={profileNameInput}
                onChange={(e) => setProfileNameInput(e.target.value)}
                placeholder="Enter name (e.g. User, Traffic Officer)"
                maxLength={30}
                className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl bg-slate-50 dark:bg-gray-900/80 border border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-[11px] text-slate-500 dark:text-gray-400">
                Any operator can change this to their preferred name anytime. Developer attribution remains permanently credited in the spotlight above.
              </p>
            </div>

            <div className="flex items-end gap-2 pb-0.5">
              <button
                type="button"
                onClick={() => {
                  const clean = profileNameInput.trim() || "User";
                  setUserName(clean);
                  setProfileNameInput(clean);
                  setSavedNotification(true);
                  setTimeout(() => setSavedNotification(false), 2500);
                }}
                className="flex-1 px-4 py-2.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Check className="w-4 h-4" />
                Apply Name
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserName("User");
                  setProfileNameInput("User");
                  setSavedNotification(true);
                  setTimeout(() => setSavedNotification(false), 2500);
                }}
                className="px-3.5 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-all"
                title="Reset name to default 'User'"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* SETTINGS SECTIONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 1. APPEARANCE & VIEW MODE */}
          <div className="rounded-3xl bg-white dark:bg-[#0c111c] border border-slate-200/90 dark:border-gray-800 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Theme & Visual Experience</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">Color palette and 3D rendering perspective</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 block mb-2">
                  System Theme Mode
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setThemeMode("night")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-semibold transition-all ${
                      themeMode === "night"
                        ? "bg-indigo-950/60 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20"
                        : "bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>Cyber Night (Dark)</span>
                  </button>

                  <button
                    onClick={() => setThemeMode("day")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-semibold transition-all ${
                      themeMode === "day"
                        ? "bg-amber-100 border-amber-400 text-amber-800 shadow-sm shadow-amber-500/20"
                        : "bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>Natural Day (Light)</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 block mb-2">
                  Default Map Camera Mode
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => setViewMode("3d")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-semibold transition-all ${
                      viewMode === "3d"
                        ? "bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/20"
                        : "bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                    }`}
                  >
                    <Box className="w-4 h-4" />
                    <span>3D Urban (WebGL Three.js)</span>
                  </button>

                  <button
                    onClick={() => setViewMode("2d")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl border text-xs font-semibold transition-all ${
                      viewMode === "2d"
                        ? "bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/20"
                        : "bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                    }`}
                  >
                    <Compass className="w-4 h-4" />
                    <span>2D Tactical Canvas</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-gray-800/80 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    High-DPI 3D Mesh Smoothing
                  </span>
                  <input
                    type="checkbox"
                    checked={highDpi}
                    onChange={(e) => setHighDpi(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    Show Traffic Density Heatmap Overlays
                  </span>
                  <input
                    type="checkbox"
                    checked={densityOverlay}
                    onChange={(e) => setDensityOverlay(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    Display Real-Time FPS & Performance Overlay
                  </span>
                  <input
                    type="checkbox"
                    checked={showFps}
                    onChange={(e) => setShowFps(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 2. SIMULATION & ENGINE SETTINGS */}
          <div className="rounded-3xl bg-white dark:bg-[#0c111c] border border-slate-200/90 dark:border-gray-800 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Simulation Defaults & Performance</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">Network topology, target framerate (FPS), and engine tick speed</p>
              </div>
            </div>

            <div className="space-y-5 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 block mb-2">
                  Active Network Topology
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["arterial", "highway_metered", "combined"] as const).map((net) => (
                    <button
                      key={net}
                      onClick={() => setNetwork(net)}
                      className={`px-3 py-2 rounded-xl border text-xs font-medium capitalize text-left transition-all ${
                        network === net
                          ? "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300 font-bold"
                          : "bg-slate-50 dark:bg-gray-900/60 border-slate-200 dark:border-gray-800 text-slate-600 dark:text-gray-400 hover:bg-slate-100"
                      }`}
                    >
                      {net === "arterial" ? "Arterial 3×2" : net === "highway_metered" ? "Highway Metered" : "Combined"}
                    </button>
                  ))}
                </div>
              </div>

              {/* TARGET SIMULATION FRAMERATE (FPS) CONTROL */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-gray-900/50 border border-slate-200/80 dark:border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div>
                      <label className="text-xs font-bold text-slate-800 dark:text-gray-200 block">
                        Target Framerate: {framerateInput} FPS
                      </label>
                      <span className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">
                        {(1000 / framerateInput).toFixed(1)}ms per frame
                      </span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    framerateInput <= 30
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      : framerateInput <= 60
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                      : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30"
                  }`}>
                    {framerateInput <= 30 ? "Eco (Low Battery)" : framerateInput <= 60 ? "Smooth (Standard)" : "High Refresh"}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-4 gap-2">
                  {[30, 60, 90, 120].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setFramerateInput(preset);
                        setTargetFps(preset);
                      }}
                      className={`py-1.5 px-2 rounded-xl border text-xs font-semibold transition-all ${
                        framerateInput === preset
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20"
                          : "bg-white dark:bg-gray-800/80 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {preset} FPS
                    </button>
                  ))}
                </div>

                {/* Framerate Slider */}
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="5"
                  value={framerateInput}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setFramerateInput(val);
                    setTargetFps(val);
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-gray-500 font-mono">
                  <span>15 FPS</span>
                  <span>30 FPS</span>
                  <span>60 FPS</span>
                  <span>90 FPS</span>
                  <span>120 FPS</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-tight">
                  Throttles 3D WebGL and 2D Tactical simulation visual rendering. Conserves GPU and laptop battery at lower FPS; maximizes smoothness at 60–120 FPS.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-gray-300">
                    Engine Tick Interval: {tickSpeedMs}ms
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-gray-400 font-mono">
                    {(1000 / tickSpeedMs).toFixed(1)} ticks/sec
                  </span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="2000"
                  step="100"
                  value={tickSpeedMs}
                  onChange={(e) => setTickSpeedMs(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-gray-500 font-mono mt-1">
                  <span>Fast (200ms)</span>
                  <span>Normal (1000ms)</span>
                  <span>Slow (2000ms)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-gray-800/80 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    Emergency Vehicle Priority Audio Chime
                  </span>
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => setSoundAlerts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    Auto-reconnect WebSocket on TraCI Engine Restart
                  </span>
                  <input
                    type="checkbox"
                    checked={autoReconnect}
                    onChange={(e) => setAutoReconnect(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* 3. BACKEND & API CONNECTIVITY */}
          <div className="rounded-3xl bg-white dark:bg-[#0c111c] border border-slate-200/90 dark:border-gray-800 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Backend & TraCI Bridge</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">FastAPI backend connection and WebSocket diagnostics</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 block mb-1.5">
                  FastAPI REST Base Endpoint
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="http://localhost:8000/api"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 text-xs font-mono text-slate-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={pingStatus === "testing"}
                    className="px-3.5 py-2 rounded-xl bg-slate-200/90 dark:bg-gray-800 hover:bg-slate-300 dark:hover:bg-gray-700 text-xs font-semibold text-slate-800 dark:text-gray-200 transition-all flex items-center gap-1.5 flex-shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pingStatus === "testing" ? "animate-spin" : ""}`} />
                    <span>Ping</span>
                  </button>
                </div>
              </div>

              {/* Ping Result */}
              {pingStatus !== "idle" && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
                    pingStatus === "success"
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                      : pingStatus === "testing"
                      ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        pingStatus === "success"
                          ? "bg-emerald-500"
                          : pingStatus === "testing"
                          ? "bg-blue-500 animate-ping"
                          : "bg-rose-500"
                      }`}
                    />
                    <span className="font-medium">
                      {pingStatus === "testing"
                        ? "Testing connection..."
                        : pingStatus === "success"
                        ? "Backend reachable & responding normally"
                        : "Cannot connect to backend endpoint"}
                    </span>
                  </div>
                  {pingLatency !== null && pingStatus === "success" && (
                    <span className="font-mono text-[11px] font-bold">{pingLatency} ms</span>
                  )}
                </div>
              )}

              {/* WebSocket Telemetry Status */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs font-semibold text-slate-800 dark:text-gray-200">
                      WebSocket Telemetry Link
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-gray-400 font-mono">
                      ws://localhost:8000/ws
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsConnected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-rose-500"
                    }`}
                  />
                  <span className={wsConnected ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {wsConnected ? "ESTABLISHED" : "DISCONNECTED"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. SYSTEM INFORMATION & ABOUT */}
          <div className="rounded-3xl bg-white dark:bg-[#0c111c] border border-slate-200/90 dark:border-gray-800 p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">About Marg Dhristhi</h2>
                <p className="text-xs text-slate-500 dark:text-gray-400">Autonomous system architecture & specifications</p>
              </div>
            </div>

            <div className="space-y-3 pt-1 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800">
                <span className="text-slate-500 dark:text-gray-400">Platform</span>
                <span className="font-semibold text-slate-800 dark:text-gray-200">Marg Dhristhi (मार्ग दृष्टि)</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800">
                <span className="text-slate-500 dark:text-gray-400">Lead Creator</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{creatorName}</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800">
                <span className="text-slate-500 dark:text-gray-400">Contact Email</span>
                <a
                  href={`mailto:${creatorEmail}`}
                  className="font-mono text-slate-700 dark:text-gray-300 hover:text-blue-500 underline"
                >
                  {creatorEmail}
                </a>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800">
                <span className="text-slate-500 dark:text-gray-400">Micro-simulation</span>
                <span className="font-mono text-slate-700 dark:text-gray-300">Eclipse SUMO 1.26 + TraCI</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-gray-800">
                <span className="text-slate-500 dark:text-gray-400">Vision Inference</span>
                <span className="font-mono text-slate-700 dark:text-gray-300">YOLOv11m (mAP50 0.949)</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500 dark:text-gray-400">Frontend Stack</span>
                <span className="font-mono text-slate-700 dark:text-gray-300">Next.js 14 · Three.js · TailwindCSS</span>
              </div>
            </div>

            {/* Quick Actions at bottom */}
            <div className="pt-2 border-t border-slate-100 dark:border-gray-800 flex items-center justify-between">
              <button
                onClick={handleResetDefaults}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium"
              >
                Reset to Factory Defaults
              </button>

              <Link
                href="/lab"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                <span>Open Simulation Lab</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>

        {/* FOOTER CREDITS */}
        <div className="pt-6 border-t border-slate-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>
              Marg Dhristhi &copy; {new Date().getFullYear()} — Designed & Engineered by{" "}
              <strong className="text-slate-800 dark:text-gray-200 font-semibold">{creatorName}</strong>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href={`mailto:${creatorEmail}`}
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{creatorEmail}</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

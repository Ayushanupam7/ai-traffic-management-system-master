"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import {
  Sun,
  Moon,
  Box,
  Compass,
  Activity,
  Sparkles,
  SlidersHorizontal,
  User,
  Pencil,
  Check,
  ChevronDown,
  Settings as SettingsIcon,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";

const TABS = [
  { label: "Dashboard", href: "/" },
  { label: "Policy Studio", href: "/policy" },
  { label: "Simulation Lab", href: "/lab" },
  { label: "Settings", href: "/settings" },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function TopNav() {
  const pathname = usePathname();
  const status = useTrafficStore((s) => s.status);
  const simTime = useTrafficStore((s) => s.simTime);
  const tick = useTrafficStore((s) => s.tick);
  const network = useTrafficStore((s) => s.network);
  const vehicles = useTrafficStore((s) => s.vehicles);
  const wsConnected = useTrafficStore((s) => s.wsConnected);
  const themeMode = useTrafficStore((s) => s.themeMode);
  const setThemeMode = useTrafficStore((s) => s.setThemeMode);
  const viewMode = useTrafficStore((s) => s.viewMode);
  const setViewMode = useTrafficStore((s) => s.setViewMode);
  const userName = useTrafficStore((s) => s.userName);
  const setUserName = useTrafficStore((s) => s.setUserName);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(userName || "User");
  const [savedBadge, setSavedBadge] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync stored username on client load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("marg_user_name");
      if (stored) {
        setUserName(stored);
        setTempName(stored);
      }
    }
  }, [setUserName]);

  // Keep tempName in sync if userName updates elsewhere
  useEffect(() => {
    setTempName(userName || "User");
  }, [userName]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setIsEditing(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const userInitials = (userName || "User")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "U";

  const handleSaveUserName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = tempName.trim() || "User";
    setUserName(cleanName);
    setTempName(cleanName);
    setIsEditing(false);
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  const handleResetToDefault = () => {
    setUserName("User");
    setTempName("User");
    setIsEditing(false);
    setSavedBadge(true);
    setTimeout(() => setSavedBadge(false), 2000);
  };

  const isDay = themeMode === "day";

  // Sync theme mode to documentElement class & attribute for Tailwind dark: variants
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (isDay) {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "day");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "night");
    }
  }, [isDay]);

  const statusColor =
    status === "running"
      ? "bg-emerald-500 shadow-[0_0_10px_#10b981]"
      : status === "paused"
      ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]"
      : "bg-slate-400 dark:bg-gray-500";

  const statusText =
    status === "running"
      ? `Live · ${formatTime(simTime)} (T-${tick})`
      : status === "paused"
      ? `Paused · ${formatTime(simTime)}`
      : "Engine Idle";

  return (
    <header className="h-14 flex-shrink-0 bg-white/95 dark:bg-[#070b13]/95 border-b border-slate-200/90 dark:border-gray-800/80 flex items-center justify-between px-3 md:px-5 z-40 select-none shadow-sm dark:shadow-md backdrop-blur-md transition-colors duration-250">
      
      {/* LEFT: Master Brand + Tabs */}
      <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-indigo-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-orange-500/25 group-hover:scale-105 transition-transform flex-shrink-0">
            म
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[14px] font-black text-slate-900 dark:text-gray-100 tracking-tight whitespace-nowrap">
                Marg Dhristhi
              </span>
              <span className="whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                मार्ग दृष्टि
              </span>
            </div>
            <span className="text-[9px] text-slate-500 dark:text-gray-400 font-medium tracking-tight whitespace-nowrap mt-0.5">
              Intelligent Traffic Orchestrator
            </span>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-100/90 dark:bg-[#0f1624] p-1 rounded-xl border border-slate-200/80 dark:border-gray-800/80 shadow-inner">
          {TABS.map(({ label, href }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                    : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-100 hover:bg-slate-200/60 dark:hover:bg-gray-800/60"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* CENTER: Minimalist Live Status Pill */}
      <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100/90 dark:bg-[#0e1523] border border-slate-200/80 dark:border-gray-800 text-[11px] font-mono whitespace-nowrap shadow-sm select-none">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <span className="font-semibold text-slate-700 dark:text-gray-300 whitespace-nowrap">
          {status === "running"
            ? `Live · ${formatTime(simTime)}`
            : status === "paused"
            ? `Paused · ${formatTime(simTime)}`
            : "Engine Idle"}
        </span>
        {status === "running" && (
          <>
            <span className="text-slate-300 dark:text-gray-700">|</span>
            <span className="text-slate-500 dark:text-gray-400 font-medium whitespace-nowrap">
              {vehicles.length} veh
            </span>
          </>
        )}
      </div>

      {/* RIGHT: View Mode, Theme Switcher, Online Badge & Creator Chip */}
      <div className="flex items-center gap-2 flex-shrink-0">
        
        {/* 3D Urban vs 2D Tactical View Switcher (visible on arterial) */}
        {network === "arterial" && (
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-[#0f1624] border border-slate-200 dark:border-gray-800 text-[11px]">
            <button
              onClick={() => setViewMode("3d")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                viewMode === "3d"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200"
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">3D Urban</span>
            </button>
            <button
              onClick={() => setViewMode("2d")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                viewMode === "2d"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200"
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">2D Tactical</span>
            </button>
          </div>
        )}

        {/* ☀️ Day / 🌙 Night Mode Toggle */}
        <button
          onClick={() => setThemeMode(isDay ? "night" : "day")}
          title={`Switch to ${isDay ? "Cyber Night Mode" : "Natural Daylight Mode"}`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold shadow-sm transition-all duration-200 ${
            isDay
              ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100 shadow-amber-500/5"
              : "bg-indigo-950/40 border-indigo-800/60 text-indigo-300 hover:bg-indigo-900/50 shadow-indigo-500/10"
          }`}
        >
          {isDay ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-mono hidden sm:inline">Day</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-mono hidden sm:inline">Night</span>
            </>
          )}
        </button>

        {/* WebSocket Health Badge */}
        <div
          title={wsConnected ? "TraCI WebSocket Connected" : "WebSocket Disconnected"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[10px] font-mono font-bold ${
            wsConnected
              ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              wsConnected ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse" : "bg-rose-500"
            }`}
          />
          <span className="tracking-wider">{wsConnected ? "ONLINE" : "OFFLINE"}</span>
        </div>

        {/* Interactive User Profile & Developer Attribution Chip */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            title={`Active Operator: ${userName || "User"} • Click to edit your name or view developer credits`}
            className="flex items-center gap-2 pl-1 pr-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200/80 dark:bg-[#0f1624] dark:hover:bg-gray-800 border border-slate-200 dark:border-gray-800 transition-all group shadow-sm hover:scale-[1.02] cursor-pointer"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm">
              {userInitials}
            </div>
            <div className="flex flex-col text-left leading-none">
              <span className="text-[10px] font-bold text-slate-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors max-w-[85px] truncate">
                {userName || "User"}
              </span>
              <span className="text-[8px] text-slate-500 dark:text-gray-400 flex items-center gap-0.5">
                Operator <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </span>
            </div>
          </button>

          {/* User Profile Popover / Dropdown */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white dark:bg-[#0c121e] border border-slate-200 dark:border-gray-800 shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3">
              {/* SECTION 1: Active User (Editable) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                    <User className="w-3 h-3 text-blue-500" />
                    <span>Your Profile</span>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                      Edit Name
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <form onSubmit={handleSaveUserName} className="space-y-2 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 dark:text-gray-400 font-medium">
                        Display Name (Default: User)
                      </label>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        placeholder="Enter name (e.g. User)"
                        autoFocus
                        maxLength={30}
                        className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-gray-900 border border-slate-300 dark:border-gray-700 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        type="button"
                        onClick={handleResetToDefault}
                        className="px-2 py-1 text-[10px] font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800"
                      >
                        Reset to &quot;User&quot;
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTempName(userName || "User");
                          setIsEditing(false);
                        }}
                        className="px-2 py-1 text-[10px] font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1 text-[10px] font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1 shadow-sm shadow-blue-500/20"
                      >
                        <Check className="w-2.5 h-2.5" />
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-gray-900/60 border border-slate-200/80 dark:border-gray-800">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-indigo-600 text-white text-xs font-black flex items-center justify-center shadow-sm">
                      {userInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {userName || "User"}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-gray-400">
                        Active Traffic Operator
                      </div>
                    </div>
                    {savedBadge && (
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 2: Permanent Developer Attribution (Uneditable) */}
              <div className="pt-2 border-t border-slate-200/80 dark:border-gray-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500">
                  <ShieldCheck className="w-3 h-3 text-amber-500" />
                  <span>Developer & Creator</span>
                </div>
                <div className="flex items-center gap-2.5 p-2 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-500 via-orange-600 to-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm">
                    AA
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                      Ayush Anupam
                    </div>
                    <div className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                      Lead Creator & AI Architect
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Settings Shortcut */}
              <div className="pt-1 border-t border-slate-200/80 dark:border-gray-800/80">
                <Link
                  href="/settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-800/80 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <SettingsIcon className="w-3.5 h-3.5 text-slate-500" />
                    Open System Settings
                  </span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                    &rarr;
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}

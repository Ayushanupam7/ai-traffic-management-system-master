"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTrafficStore } from "@/store/trafficStore";

const TABS = [
  { label: "Dashboard", href: "/" },
  { label: "Policy", href: "/policy" },
  { label: "Lab", href: "/lab" },
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
  const mode = useTrafficStore((s) => s.mode);
  const wsConnected = useTrafficStore((s) => s.wsConnected);

  const statusColor =
    status === "running" ? "bg-green-500 shadow-[0_0_6px_#22c55e]" :
    status === "paused"  ? "bg-yellow-500" :
    "bg-gray-600";

  const statusText =
    status === "running" ? `Running · ${formatTime(simTime)}` :
    status === "paused"  ? `Paused · ${formatTime(simTime)}` :
    "Idle";

  return (
    <nav className="h-11 flex-shrink-0 bg-[#0d1117] border-b border-gray-800 flex items-center px-4 gap-3">
      <span className="text-[13px] font-bold text-blue-400 font-mono tracking-wide mr-2">
        TRaffic
      </span>

      <div className="flex h-full">
        {TABS.map(({ label, href }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 flex items-center text-xs border-b-2 transition-colors ${
                active
                  ? "text-gray-100 border-blue-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2 bg-[#111827] border border-gray-800 rounded-full px-3 py-1">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
          <span className="text-[11px] text-gray-400">{statusText}</span>
        </div>
        <div className="bg-[#1f2937] rounded px-2 py-1 text-[10px] text-gray-500 font-mono">
          {mode.toUpperCase()}
        </div>
        <div
          title={wsConnected ? "WebSocket connected" : "WebSocket disconnected"}
          className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-gray-600"}`}
        />
      </div>
    </nav>
  );
}

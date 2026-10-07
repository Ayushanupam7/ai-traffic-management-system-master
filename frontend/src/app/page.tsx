"use client";

import { useWebSocket } from "@/hooks/useWebSocket";
import { useTrafficStore } from "@/store/trafficStore";
import StreetMap         from "@/components/Map/StreetMap";
import IntersectionPanel from "@/components/Panel/IntersectionPanel";
import CameraCarousel    from "@/components/Panel/CameraCarousel";
import MetricsPanel      from "@/components/Metrics/MetricsPanel";
import MetricsTimeline   from "@/components/Metrics/MetricsTimeline";
import SimControls       from "@/components/Simulation/SimControls";
import SystemSummary     from "@/components/Simulation/SystemSummary";
import ChatWidget        from "@/components/Chat/ChatWidget";
import EmergencyPanel    from "@/components/Emergency/EmergencyPanel";

export default function Dashboard() {
  useWebSocket();
  // We hide the camera carousel as soon as the user picks an intersection
  // (their IntersectionPanel slides in over the same right-side space).
  const selected = useTrafficStore((s) => s.selectedIntersection);

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* Left Sidebar */}
      <aside
        className="w-64 flex-shrink-0 bg-[#0d1117] border-r border-gray-800
                   flex flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          <SystemSummary />
          <SimControls />
          <div className="border-t border-gray-800" />
          <EmergencyPanel />
          <div className="border-t border-gray-800" />
          <MetricsPanel />
        </div>
      </aside>

      {/* Map Area — column: map on top, timeline at the bottom */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <StreetMap />
          {!selected && <CameraCarousel />}
          <IntersectionPanel />
          <ChatWidget />
        </div>
        <MetricsTimeline />
      </main>

    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

import { useTrafficStore } from "@/store/trafficStore";
import type { PolicyType } from "@/lib/types";

// Mirror of SimControls' ACTIVE_VARIANT_KEY — keep them in sync.
const ACTIVE_VARIANT_KEY = "traffic.activeVariantName";

const NETWORK_LABEL: Record<string, string> = {
  arterial:        "Arterial 3×2",
  highway_metered: "Highway",
  combined:        "Combined",
};
const POLICY_LABEL: Record<PolicyType, string> = {
  fixed_time:  "Fixed Time",
  actuated:    "Adaptive",
  ramp_binary: "Ramp · Binary",
  ramp_alinea: "Ramp · ALINEA",
};

// Always-on at the top of the sidebar. Shows what the system is set up to
// run (when idle) or what's actually running (when running). Gives the
// demo audience one-glance context for what they're looking at.
export default function SystemSummary() {
  const status            = useTrafficStore((s) => s.status);
  const network           = useTrafficStore((s) => s.network);
  const lastStartedConfig = useTrafficStore((s) => s.lastStartedConfig);

  // Read active variant from localStorage. Re-poll on focus + storage
  // events so changes in /policy reflect here too.
  const [activeVariant, setActiveVariant] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      setActiveVariant(localStorage.getItem(ACTIVE_VARIANT_KEY) ?? "");
    read();
    window.addEventListener("focus", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("focus", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const running = status === "running" || status === "paused";

  // When running we display what we actually started with; when idle we
  // display the current pickers (network from the store).
  const cfg = running ? lastStartedConfig : null;
  const effectiveNetwork = (cfg?.network_type ?? network) as string;
  const arterialPolicy   = (cfg?.policy_type ?? "") as PolicyType | "";
  const rampPolicy       = (cfg?.ramp_policy_type ?? "") as PolicyType | "";

  // Build the "Policy" line. Combined shows two policies separated by '+'.
  let policyText = "—";
  if (running && arterialPolicy) {
    if (effectiveNetwork === "combined" && rampPolicy) {
      policyText = `${POLICY_LABEL[arterialPolicy] ?? arterialPolicy} + ${POLICY_LABEL[rampPolicy] ?? rampPolicy}`;
    } else {
      policyText = POLICY_LABEL[arterialPolicy] ?? arterialPolicy;
    }
  }

  const cars = cfg?.total_vehicles;
  const variantText = activeVariant || "defaults";

  return (
    <div className="bg-[#0d1421] border border-gray-800 rounded-md p-2.5 font-mono text-[11px] leading-tight">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] uppercase tracking-widest text-gray-500">
          {running ? "Running" : "Configured"}
        </span>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === "running"
              ? "bg-green-500 shadow-[0_0_6px_#22c55e]"
              : status === "paused"
              ? "bg-yellow-500"
              : "bg-gray-700"
          }`}
        />
      </div>
      <Row k="Network" v={NETWORK_LABEL[effectiveNetwork] ?? effectiveNetwork} />
      <Row k="Policy"  v={policyText} />
      <Row
        k="Variant"
        v={
          cars != null
            ? `${variantText} · ${cars} cars`
            : variantText
        }
      />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex">
      <span className="w-[58px] text-gray-600">{k}</span>
      <span className="text-gray-300 truncate">{v}</span>
    </div>
  );
}

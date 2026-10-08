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
    <div className="bg-slate-50 dark:bg-[#0c121d] border border-slate-200 dark:border-gray-800/90 rounded-xl p-3 font-mono text-[11px] leading-tight transition-colors">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200 dark:border-gray-800/80">
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-700 dark:text-gray-300">
          {running ? "● Active Runtime Engine" : "○ Configured Setup"}
        </span>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            status === "running"
              ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
              : status === "paused"
              ? "bg-amber-500 shadow-[0_0_6px_#f59e0b]"
              : "bg-slate-300 dark:bg-gray-700"
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
    <div className="flex items-center py-1">
      <span className="w-16 text-slate-500 dark:text-gray-400 text-[10px] font-sans font-semibold uppercase tracking-wider">{k}</span>
      <span className="text-slate-900 dark:text-gray-100 font-mono font-bold text-xs truncate flex-1">{v}</span>
    </div>
  );
}

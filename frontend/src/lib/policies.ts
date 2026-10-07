/**
 * Shared policy/network option maps.
 *
 * Single source of truth for the network → valid-policy cascade and the
 * human-readable policy labels. Both the Dashboard (`SimControls`) and the
 * Simulation Lab (`RunBuilder`) import these so the two surfaces never drift
 * out of sync when networks or policies are added.
 */

import type { NetworkType, PolicyType } from "@/lib/types";

export const POLICY_LABELS: Record<PolicyType, string> = {
  fixed_time:  "Fixed Time",
  actuated:    "Adaptive",
  ramp_binary: "Ramp · Binary",
  ramp_alinea: "Ramp · ALINEA",
};

// Each network exposes its own valid policy menu. On combined this is the
// arterial (signal) picker only — the ramp meters use COMBINED_RAMP_OPTIONS.
export const policiesForNetwork: Record<NetworkType, PolicyType[]> = {
  arterial:        ["fixed_time", "actuated"],
  highway_metered: ["fixed_time", "ramp_binary", "ramp_alinea"],
  combined:        ["fixed_time", "actuated"],
};

// Ramp-meter menu for the combined network's second picker
// (fixed_time = static / always green = "No metering").
export const COMBINED_RAMP_OPTIONS: PolicyType[] = [
  "fixed_time",
  "ramp_binary",
  "ramp_alinea",
];

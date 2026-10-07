"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

import { useTrafficStore, type MetricsHistoryRow } from "@/store/trafficStore";

type HistoryKey = Exclude<keyof MetricsHistoryRow, "tick" | "sim_time">;

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: "white" | "green" | "amber" | "blue";
  span2?: boolean;
  // Optional sparkline + trend. When historyKey is set we read the last N
  // rows from the store and render a 60-tick sparkline + an up/down arrow.
  historyKey?: HistoryKey;
  // Which direction counts as "better" for the trend arrow color.
  lowerIsBetter?: boolean;
}

const colorMap = {
  white: "text-gray-100",
  green: "text-green-400",
  amber: "text-amber-400",
  blue:  "text-blue-400",
};

// Trend = mean of last 10 ticks vs mean of the 11..30-tick window. Returns
// a signed % change (positive = went up). Null if not enough samples.
function trendPct(history: MetricsHistoryRow[], key: HistoryKey): number | null {
  if (history.length < 12) return null;
  const recent = history.slice(-10);
  const prev   = history.slice(-30, -10);
  if (prev.length < 5) return null;
  const mean = (xs: MetricsHistoryRow[]) =>
    xs.reduce((s, r) => s + (r[key] as number), 0) / xs.length;
  const r = mean(recent);
  const p = mean(prev);
  if (p === 0) return null;
  return ((r - p) / Math.abs(p)) * 100;
}

function TrendArrow({
  history,
  historyKey,
  lowerIsBetter,
}: {
  history: MetricsHistoryRow[];
  historyKey: HistoryKey;
  lowerIsBetter: boolean;
}) {
  const t = trendPct(history, historyKey);
  if (t == null || Math.abs(t) < 5) return null;
  const goingUp = t > 0;
  const improved = lowerIsBetter ? !goingUp : goingUp;
  const color = improved ? "text-green-400" : "text-red-400";
  const arrow = goingUp ? "▲" : "▼";
  return (
    <span className={`text-[9px] font-mono ml-1 ${color}`}>
      {arrow}{Math.abs(t).toFixed(0)}%
    </span>
  );
}

function Sparkline({
  history,
  historyKey,
  color,
}: {
  history: MetricsHistoryRow[];
  historyKey: HistoryKey;
  color: string;
}) {
  const data = history.slice(-60).map((r, i) => ({ i, v: r[historyKey] as number }));
  if (data.length < 2) return <div className="h-[18px]" />;
  return (
    <div className="h-[18px] -mx-1 mt-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.1}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricCard({
  label, value, unit, color = "white", span2,
  historyKey, lowerIsBetter = true,
}: MetricCardProps) {
  const history = useTrafficStore((s) => s.metricsHistory);
  // Per-color sparkline tone — matches the value color so the eye groups
  // them visually.
  const sparkColor =
    color === "green" ? "#34d399" :
    color === "amber" ? "#fbbf24" :
    color === "blue"  ? "#60a5fa" :
                        "#9ca3af";

  return (
    <div
      className={`bg-[#111827] border border-gray-800 rounded-lg p-2.5 ${
        span2 ? "col-span-2" : ""
      }`}
    >
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-bold mt-1 leading-none ${colorMap[color]} flex items-baseline`}>
        <span>{value}</span>
        {unit && <span className="text-[10px] text-gray-500 font-normal ml-1">{unit}</span>}
        {historyKey && (
          <TrendArrow
            history={history}
            historyKey={historyKey}
            lowerIsBetter={lowerIsBetter}
          />
        )}
      </div>
      {historyKey && <Sparkline history={history} historyKey={historyKey} color={sparkColor} />}
    </div>
  );
}

export default function MetricsPanel() {
  const metrics = useTrafficStore((s) => s.metrics);
  const tick    = useTrafficStore((s) => s.tick);
  const simTime = useTrafficStore((s) => s.simTime);
  const status  = useTrafficStore((s) => s.status);

  const idle = status === "idle" || status === "stopped";
  const fmt  = (v: number, d = 1) => (idle ? "—" : v.toFixed(d));
  const fmtI = (v: number)        => (idle ? "—" : v.toString());

  return (
    <div>
      <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-2">Live Metrics</div>
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard label="Sim Time" value={idle ? "—" : Math.round(simTime)} unit={idle ? undefined : "s"} />
        <MetricCard label="Tick"     value={fmtI(tick)} />
        <MetricCard
          label="Vehicles"
          value={fmtI(metrics.total_vehicles)}
          historyKey="total_vehicles"
          lowerIsBetter={false}  // more vehicles = network is busy, not bad
        />
        <MetricCard
          label="Completed"
          value={fmtI(metrics.total_completed)}
          color="green"
          historyKey="total_completed"
          lowerIsBetter={false}
        />
        <MetricCard
          label="Throughput"
          value={fmt(metrics.throughput_veh_per_min)}
          unit="v/m"
          color="green"
          historyKey="throughput_veh_per_min"
          lowerIsBetter={false}
        />
        <MetricCard
          label="Halting"
          value={fmtI(metrics.total_halting)}
          color={metrics.total_halting > 0 && !idle ? "amber" : "white"}
          historyKey="total_halting"
          lowerIsBetter={true}
        />
        <MetricCard
          label="Avg Delay"
          value={fmt(metrics.avg_delay_s)}
          unit="s"
          historyKey="avg_delay_s"
          lowerIsBetter={true}
        />
        <MetricCard
          label="Ctrl Delay"
          value={fmt(metrics.avg_control_delay_s)}
          unit="s"
          historyKey="avg_control_delay_s"
          lowerIsBetter={true}
        />
        <MetricCard
          label="Avg Trip Time"
          value={fmt(metrics.avg_trip_time_s)}
          unit="s"
          color="blue"
          span2
          historyKey="avg_trip_time_s"
          lowerIsBetter={true}
        />
      </div>
    </div>
  );
}

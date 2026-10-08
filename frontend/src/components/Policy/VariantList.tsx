"use client";

import { useTrafficStore } from "@/store/trafficStore";
import { Plus, CheckCircle2, FileEdit } from "lucide-react";
import type { PolicyVariant } from "@/lib/types";

interface Props {
  variants: PolicyVariant[];
  selectedName: string;
  activeName: string;
  onSelect: (name: string) => void;
  onNew: () => void;
}

export default function VariantList({
  variants,
  selectedName,
  activeName,
  onSelect,
  onNew,
}: Props) {
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className={`text-[10px] font-bold uppercase tracking-wider ${
          isDay ? "text-slate-500" : "text-gray-400"
        }`}>
          Configuration Variants ({variants.length})
        </h2>
        <button
          type="button"
          onClick={onNew}
          className="text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-2.5 py-1 flex items-center gap-1 shadow-sm transition-all"
          title="Start a new draft from defaults"
        >
          <Plus className="w-3 h-3" />
          <span>New</span>
        </button>
      </div>

      {/* Draft row */}
      <button
        type="button"
        onClick={() => onSelect("")}
        className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
          selectedName === ""
            ? isDay
              ? "border-blue-600 bg-blue-50/70 text-blue-900 shadow-sm shadow-blue-500/10 font-bold"
              : "border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm font-bold"
            : isDay
              ? "border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700"
              : "border-gray-800 hover:border-gray-700 bg-gray-900/40 text-gray-300"
        }`}
      >
        <div className="flex items-center gap-2">
          <FileEdit className={`w-3.5 h-3.5 ${selectedName === "" ? "text-blue-500" : "text-slate-400"}`} />
          <span className="font-mono">— Draft Working Set —</span>
        </div>
        <div className={`text-[10.5px] mt-1 font-normal ${
          isDay ? "text-slate-500" : "text-gray-400"
        }`}>
          Unsaved buffer · reset to system defaults
        </div>
      </button>

      {variants.length === 0 && (
        <div className={`text-xs p-3 rounded-xl border text-center ${
          isDay ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-gray-900/30 border-gray-800 text-gray-500"
        }`}>
          No saved custom variants yet. Tune parameters on the right and click <strong className="text-blue-500">Save as…</strong> to save a variant.
        </div>
      )}

      <div className="space-y-1.5">
        {variants.map((v) => {
          const isSelected = selectedName === v.name;
          const isActive = activeName === v.name;

          return (
            <button
              key={v.name}
              type="button"
              onClick={() => onSelect(v.name)}
              className={`w-full text-left p-3 rounded-xl border text-xs transition-all ${
                isSelected
                  ? isDay
                    ? "border-blue-600 bg-blue-50/80 text-blue-900 shadow-sm shadow-blue-500/10 font-bold"
                    : "border-blue-500 bg-blue-950/40 text-blue-200 shadow-sm font-bold"
                  : isDay
                    ? "border-slate-200/90 bg-white hover:bg-slate-50 text-slate-800 shadow-xs"
                    : "border-gray-800 hover:border-gray-700 bg-gray-900/40 text-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-mono font-bold truncate">{v.name}</div>
                {isActive && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-md flex-shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>Active</span>
                  </span>
                )}
              </div>
              {v.description && (
                <div className={`text-[10.5px] mt-1 font-normal line-clamp-2 ${
                  isDay ? "text-slate-500" : "text-gray-400"
                }`}>
                  {v.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

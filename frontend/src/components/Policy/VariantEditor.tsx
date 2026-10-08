"use client";

import { useState } from "react";
import { useTrafficStore } from "@/store/trafficStore";
import SchemaParamPanel from "@/components/Policy/SchemaParamPanel";
import { Save, RotateCcw, Trash2, CheckCircle2, BookmarkPlus } from "lucide-react";
import type { ParamFieldDef } from "@/lib/types";

interface Props {
  name: string;                  // "" = unsaved draft
  description: string;
  params: Record<string, number>;
  fields: ParamFieldDef[];       // arterial or highway schema
  familyLabel: string;           // shown next to the variant name
  isActive: boolean;
  loading: boolean;
  onParamsChange: (p: Record<string, number>) => void;
  onDescriptionChange: (d: string) => void;
  onSave: (name: string, description: string) => Promise<void> | void;
  onDelete: (name: string) => Promise<void> | void;
  onSetActive: (name: string) => void;
  onResetToDefaults: () => void;
}

export default function VariantEditor({
  name,
  description,
  params,
  fields,
  familyLabel,
  isActive,
  loading,
  onParamsChange,
  onDescriptionChange,
  onSave,
  onDelete,
  onSetActive,
  onResetToDefaults,
}: Props) {
  const [saveAsName, setSaveAsName] = useState("");
  const themeMode = useTrafficStore((s) => s.themeMode);
  const isDay = themeMode === "day";

  const updateField = (key: string, value: number) =>
    onParamsChange({ ...params, [key]: value });

  const isSaved = name !== "";
  const canSaveExisting = isSaved;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header — Name + Description Card */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h1 className={`font-mono text-xl font-bold tracking-tight ${
              isDay ? "text-slate-900" : "text-white"
            }`}>
              {isSaved ? name : "— Working Draft —"}
            </h1>
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-lg border ${
              isDay
                ? "bg-blue-50 border-blue-200 text-blue-700 font-bold"
                : "bg-blue-950/60 border-blue-800 text-blue-300 font-bold"
            }`}>
              {familyLabel}
            </span>
          </div>

          {isSaved && (
            <button
              type="button"
              onClick={() => onSetActive(isActive ? "" : name)}
              className={`text-xs font-semibold rounded-xl px-3 py-1.5 border flex items-center gap-1.5 transition-all shadow-xs ${
                isActive
                  ? "bg-emerald-600 border-emerald-600 text-white font-bold"
                  : isDay
                  ? "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
              }`}
              title="When active, the dashboard's simulation runs use this variant's parameters"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isActive ? "Active on Dashboard" : "Set as Active Policy"}</span>
            </button>
          )}
        </div>

        <textarea
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add an operational description (e.g., Heavy EW rush hour bias with tighter dynamic redistribution)..."
          className={`w-full rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none border resize-none ${
            isDay
              ? "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 shadow-xs"
              : "bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-500 focus:bg-gray-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          }`}
        />
      </div>

      {/* Tuning fields container */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-gray-800">
          <div>
            <h3 className={`text-xs uppercase font-bold tracking-wider ${
              isDay ? "text-slate-700" : "text-gray-300"
            }`}>
              Algorithm Control Parameters
            </h3>
            <p className={`text-[11px] mt-0.5 ${isDay ? "text-slate-500" : "text-gray-400"}`}>
              Direct coefficient & timing adjustments for signal phase allocation
            </p>
          </div>
          <button
            type="button"
            onClick={onResetToDefaults}
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all ${
              isDay
                ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                : "bg-gray-800 hover:bg-gray-750 text-gray-300 border-gray-700"
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore Defaults</span>
          </button>
        </div>

        <SchemaParamPanel fields={fields} params={params} onChange={updateField} />
      </div>

      {/* Action Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
        isDay ? "bg-white border-slate-200/90 shadow-sm" : "bg-[#0c1017]/90 border-gray-800 shadow-lg"
      }`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(name, description)}
            disabled={loading || !canSaveExisting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl px-4 py-2 flex items-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all"
            title={canSaveExisting ? "Save modifications to this variant" : "Use 'Save as…' to create a named variant"}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Changes</span>
          </button>

          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="New variant name..."
              className={`rounded-xl px-3 py-2 text-xs font-mono border transition-all outline-none w-48 ${
                isDay
                  ? "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                  : "bg-gray-900 border-gray-700 text-gray-100 placeholder-gray-500 focus:bg-gray-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              }`}
            />
            <button
              type="button"
              onClick={async () => {
                const n = saveAsName.trim();
                if (!n) return;
                await onSave(n, description);
                setSaveAsName("");
              }}
              disabled={loading || !saveAsName.trim()}
              className={`text-xs font-bold rounded-xl px-3 py-2 border flex items-center gap-1.5 transition-all shadow-xs ${
                isDay
                  ? "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800 disabled:opacity-40"
                  : "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200 disabled:opacity-40"
              }`}
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-blue-500" />
              <span>Save As…</span>
            </button>
          </div>
        </div>

        {isSaved && (
          <button
            type="button"
            onClick={() => onDelete(name)}
            disabled={loading}
            className={`text-xs font-semibold rounded-xl px-3 py-2 border flex items-center gap-1.5 transition-all ${
              isDay
                ? "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                : "bg-rose-950/40 hover:bg-rose-900/60 border-rose-800 text-rose-300"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Variant</span>
          </button>
        )}
      </div>
    </div>
  );
}

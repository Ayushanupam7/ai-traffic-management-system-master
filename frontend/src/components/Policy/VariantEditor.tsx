"use client";

import { useState } from "react";
import SchemaParamPanel from "@/components/Policy/SchemaParamPanel";
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

  const updateField = (key: string, value: number) =>
    onParamsChange({ ...params, [key]: value });

  const isSaved = name !== "";
  const canSaveExisting = isSaved;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header — name + description */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="font-mono text-lg text-gray-200">
            {isSaved ? name : "— draft —"}
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-500 bg-gray-900 border border-gray-800 rounded px-2 py-0.5">
            {familyLabel}
          </span>
          {isSaved && (
            <button
              type="button"
              onClick={() => onSetActive(isActive ? "" : name)}
              className={`text-[10px] rounded px-2 py-0.5 border ${
                isActive
                  ? "bg-green-900/40 border-green-700 text-green-300"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
              title="When active, the dashboard's Start button uses this variant's params"
            >
              {isActive ? "● Active on dashboard" : "Set as active"}
            </button>
          )}
        </div>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Description (e.g. EW-heavy for rush hour, experimental tight redistribution)"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 resize-none"
        />
      </div>

      {/* Tuning fields — schema driven so arterial and highway families
          share the same renderer. */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-lg p-4">
        <SchemaParamPanel fields={fields} params={params} onChange={updateField} />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => onSave(name, description)}
          disabled={loading || !canSaveExisting}
          className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded px-3 py-1.5"
          title={canSaveExisting ? "Overwrite this variant" : "Use Save as… to create a new variant"}
        >
          Save
        </button>

        <div className="flex gap-1">
          <input
            type="text"
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            placeholder="new name"
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono w-40"
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
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded px-3 py-1.5"
          >
            Save as…
          </button>
        </div>

        <button
          type="button"
          onClick={onResetToDefaults}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded px-3 py-1.5"
        >
          Reset to defaults
        </button>

        {isSaved && (
          <button
            type="button"
            onClick={() => onDelete(name)}
            disabled={loading}
            className="ml-auto bg-red-900/60 hover:bg-red-800 text-red-200 text-xs rounded px-3 py-1.5"
          >
            Delete
          </button>
        )}
      </div>

      {/* Tip */}
      <p className="text-[11px] text-gray-600">
        Tip: a variant is just a named parameter set. Set one as <span className="text-green-400">active</span> to
        have the dashboard&apos;s Start button apply it automatically.
      </p>
    </div>
  );
}

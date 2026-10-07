"use client";

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
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Variants
        </h2>
        <button
          type="button"
          onClick={onNew}
          className="text-[10px] bg-blue-700 hover:bg-blue-600 text-white rounded px-2 py-0.5"
          title="Start a new draft from defaults"
        >
          + New
        </button>
      </div>

      {/* Draft row */}
      <button
        type="button"
        onClick={() => onSelect("")}
        className={`w-full text-left p-2 rounded border text-xs transition-colors ${
          selectedName === ""
            ? "border-blue-600 bg-blue-950/30"
            : "border-gray-800 hover:border-gray-700 bg-gray-900/40"
        }`}
      >
        <div className="font-mono text-gray-300">— draft —</div>
        <div className="text-[10px] text-gray-500">
          unsaved, starts from defaults
        </div>
      </button>

      {variants.length === 0 && (
        <div className="text-[10px] text-gray-600 px-1 py-2">
          No saved variants yet. Edit the draft on the right, then Save it as a
          named variant.
        </div>
      )}

      {variants.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onSelect(v.name)}
          className={`w-full text-left p-2 rounded border text-xs transition-colors ${
            selectedName === v.name
              ? "border-blue-600 bg-blue-950/30"
              : "border-gray-800 hover:border-gray-700 bg-gray-900/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="font-mono text-gray-200 truncate">{v.name}</div>
            {activeName === v.name && (
              <span className="text-[9px] text-green-400 ml-2 flex-shrink-0">
                ● active
              </span>
            )}
          </div>
          {v.description && (
            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
              {v.description}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
